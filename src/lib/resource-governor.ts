import { randomUUID } from "node:crypto";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { AdaptiveResourcePolicy, AdmissionBucket, type ResourceDecision, type PressureLevel, type RequestLane } from "@/core/resource-policy";
import { memoryCapacity, effectiveCpuCount } from "./resource-sample";
import { installRuntimeConsole, runtimeLog } from "./runtime-log";
import { acquireResourceLease } from "./resource-lease";
import { resourceWorkContext as workContext, assertResourceWorkAllowed } from "./resource-context";
import { readResourceSettings, resourceMemoryBudget } from "@/core/resource-settings";

type Role = "web" | "cron" | "job";
interface ResourceGovernorRuntime {
  capacity?: typeof memoryCapacity;
  memory?: () => ReturnType<typeof process.memoryUsage>;
  now?: () => number;
  terminate?: () => void;
}
interface PeerSample {
  version: 1; role: Role; releaseId: string; timestamp: number; pid: number;
  level: PressureLevel; demand: number; memoryRatio: number;
  activeJobs: number; queuedJobs: number; internalConcurrency: number; rss: number;
}
function setting(name: string, fallback: number, min = 1, max = 1_000_000): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`Invalid ${name}`);
  return value;
}
function aborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error("Resource work aborted");
}
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  aborted(signal);
  return new Promise((resolve, reject) => {
    const finish = () => { signal?.removeEventListener("abort", onAbort); resolve(); };
    const timer = setTimeout(finish, ms);
    const onAbort = () => { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); reject(signal?.reason || new Error("Resource work aborted")); };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export class ResourceGovernor {
  get enabled(): boolean { return process.env.RESOURCE_GOVERNOR_ENABLED !== "0"; }
  private readonly policy = new AdaptiveResourcePolicy(
    setting("RESOURCE_RECOVERY_SECONDS", 30, 0, 600) * 1_000,
    Math.floor(setting("RESOURCE_INTERNAL_CONCURRENCY", 4, 1, 16)),
  );
  private readonly bucket = new AdmissionBucket();
  private readonly root = new AbortController();
  private readonly reclaimers = new Map<() => unknown | Promise<unknown>, string>();
  private readonly subscriptions = new Map<(reason: string) => void, boolean>();
  private readonly subscriptionBucket = new AdmissionBucket();
  private readonly queued = new Map<string, Promise<unknown>>();
  private readonly order: string[] = [];
  private readonly lag = monitorEventLoopDelay({ resolution: 20 });
  private readonly rps = setting("RESOURCE_EXTERNAL_RPS", 30, 1, 10_000);
  private readonly burst = setting("RESOURCE_EXTERNAL_BURST", 30, 1, 10_000);
  private role: Role = "web";
  private timer: ReturnType<typeof setInterval> | null = null;
  private peer: PeerSample | null = null;
  private startedAt = 0;
  private sampledAt = 0;
  private lastCpu = process.cpuUsage();
  private demand = 0;
  private arrivals = 0;
  private rejected = 0;
  private active = 0;
  private externalActive = 0;
  private externalWeight = 0;
  private subscriptionActive = 0;
  private bridgeBusy = false;
  private bridgeHealthy = false;
  private bridgeWarnedAt = 0;
  private lastLogAt = 0;
  private memoryRatio = 0;
  private criticalSince = 0;
  private recycling = false;
  private drainSince: number | null = null;
  private lastReclaimAt = 0;
  private reclaimInFlight: Promise<void> | null = null;
  private sampledMemory: { rss: number; heapUsed: number; external: number; arrayBuffers: number; budgetBytes: number } | null = null;
  private decision: ResourceDecision = { level: "normal", reason: "starting", externalScale: 1,
    internalConcurrency: 1, internalDelayMs: 0, reclaimIdle: false };

  constructor(private readonly runtime: ResourceGovernorRuntime = {}) {}

  start(role: Role): void {
    if (this.startedAt || !this.enabled) return;
    readResourceSettings(process.env);
    this.role = role === "cron" && process.env.APP_ROLE === "job" ? "job" : role;
    process.env.APP_ROLE = this.role;
    installRuntimeConsole();
    this.startedAt = (this.runtime.now || Date.now)();
    this.lag.enable();
    runtimeLog("process.started", { role, memory: process.memoryUsage(), capacity: memoryCapacity(),
      pm2Home: process.env.PM2_HOME || null, governor: true });
    const hooks = globalThis as unknown as { runtimeResourceHooksInstalled?: boolean };
    if (!hooks.runtimeResourceHooksInstalled) {
      hooks.runtimeResourceHooksInstalled = true;
      process.once("uncaughtExceptionMonitor", (error, origin) => runtimeLog("process.fatal", { error, origin }, "error"));
      process.once("exit", code => runtimeLog("process.exited", { code, uptimeSeconds: process.uptime(), memory: process.memoryUsage() }, code ? "error" : "info"));
    }
    this.refresh();
    this.timer = setInterval(() => { this.refresh(); void this.coordinate(); }, 5_000);
    this.timer.unref();
    void this.coordinate();
  }

  private refresh(): void {
    if (!this.enabled) return;
    const now = (this.runtime.now || Date.now)();
    if (now - this.sampledAt < 1_000) return;
    const capacity = (this.runtime.capacity || memoryCapacity)();
    const roleBudget = setting(this.role === "web" ? "RESOURCE_WEB_MEMORY_MB" : "RESOURCE_CRON_MEMORY_MB", 0, 0, 1_048_576);
    const budget = resourceMemoryBudget(capacity.total, this.role === "web" ? "web" : "cron",
      roleBudget, process.env.APP_RUNTIME).softBytes;
    const memory = (this.runtime.memory || process.memoryUsage)();
    this.sampledMemory = { rss: memory.rss, heapUsed: memory.heapUsed, external: memory.external, arrayBuffers: memory.arrayBuffers, budgetBytes: budget };
    this.memoryRatio = Math.max(memory.rss / budget, capacity.used / capacity.total,
      1 - capacity.hostAvailable / capacity.hostTotal);
    const elapsed = this.sampledAt ? now - this.sampledAt : 5_000;
    const cpu = process.cpuUsage(this.lastCpu);
    this.lastCpu = process.cpuUsage();
    const lagMs = Number(this.lag.percentile(95)) / 1e6;
    this.lag.reset();
    if (now - this.lastLogAt >= 5_000) {
      this.demand = Math.max(
        this.arrivals / Math.max(1, (now - (this.lastLogAt || this.startedAt)) / 1_000) / this.rps,
        this.externalWeight / setting("RESOURCE_EXTERNAL_CONCURRENCY", 32, 1, 2_048),
      );
    }
    const peerFresh = this.peer !== null && now - this.peer.timestamp >= 0 && now - this.peer.timestamp < 20_000;
    const previous = this.decision.level;
    this.decision = this.policy.evaluate({ memoryRatio: this.memoryRatio,
      cpuRatio: (cpu.user + cpu.system) / Math.max(1, elapsed * 1_000 * effectiveCpuCount()),
      eventLoopLagMs: Number.isFinite(lagMs) ? lagMs : 0,
      externalDemand: this.role === "web" ? this.demand : (peerFresh ? this.peer!.demand : 0),
      peerCritical: peerFresh && this.peer!.level === "critical" && this.peer!.memoryRatio >= 0.94,
      coordinationHealthy: now - this.startedAt < 20_000 || (this.bridgeHealthy && peerFresh),
    }, now);
    const recycleSeconds = setting("RESOURCE_RECYCLE_SECONDS", 180, 0, 3_600);
    const ownPressure = memory.rss / budget >= 0.94;
    if (this.decision.level === "critical" && ownPressure) this.criticalSince ||= now;
    else this.criticalSince = 0;
    if (recycleSeconds && this.criticalSince && now - this.criticalSince >= recycleSeconds * 1_000
      && this.drainSince === null) {
      this.drainSince = now;
      runtimeLog("process.drain_started", { ...this.snapshot(), reason: "sustained-own-memory-pressure" }, "warn");
      this.retireSubscriptions("recycling", 0);
    }
    this.sampledAt = now;
    if (this.drainSince !== null && !this.recycling && ((!this.active && !this.externalActive)
      || now - this.drainSince >= setting("RESOURCE_DRAIN_SECONDS", 30, 1, 300) * 1_000)) {
      this.recycling = true;
      runtimeLog("process.recycle_requested", { ...this.snapshot(), reason: "sustained-own-memory-pressure", memory,
        budgetBytes: budget, drainTimedOut: Boolean(this.active || this.externalActive) }, "warn");
      // SIGTERM starts the runtime's graceful shutdown. Supervisors enforce its
      // final deadline; remaining operations are never reported as completed.
      if (this.runtime.terminate) this.runtime.terminate();
      else process.kill(process.pid, "SIGTERM");
    }
    this.retireSubscriptions(this.isDraining() ? "recycling" : "pressure", this.subscriptionLimit());
    if (this.decision.reclaimIdle && (previous !== this.decision.level
      || now - this.lastReclaimAt >= setting("RESOURCE_RECLAIM_SECONDS", 15, 5, 600) * 1_000)) void this.reclaimIdle();
    if (previous !== this.decision.level) runtimeLog("resource.pressure_changed", {
      from: previous, ...this.snapshot(), memory, capacity, budgetBytes: budget,
    }, this.decision.level === "critical" ? "error" : "info");
    if (now - this.lastLogAt >= setting("RESOURCE_LOG_SECONDS", 30, 5, 600) * 1_000) {
      runtimeLog("resource.sample", { ...this.snapshot(), memory, capacity, budgetBytes: budget,
        eventLoopLagMs: lagMs, arrivals: this.arrivals, rejected: this.rejected });
      this.lastLogAt = now; this.arrivals = 0; this.rejected = 0;
    }
  }

  private async coordinate(): Promise<void> {
    if (this.bridgeBusy || this.root.signal.aborted || !process.env.DATABASE_URL) return;
    this.bridgeBusy = true;
    try {
      const { prisma } = await import("./db");
      const releaseId = process.env.APP_RELEASE_ID || "development";
      const own: PeerSample = { version: 1, role: this.role, releaseId, timestamp: Date.now(), pid: process.pid,
        level: this.decision.level, demand: this.demand, memoryRatio: this.memoryRatio,
        activeJobs: this.active, queuedJobs: this.queued.size, internalConcurrency: this.decision.internalConcurrency,
        rss: process.memoryUsage.rss() };
      const key = `runtime:resource:${this.role}`;
      if (this.role !== "job") await prisma.kvCache.upsert({ where: { key }, create: { key, value: JSON.stringify(own) }, update: { value: JSON.stringify(own) } });
      const row = await prisma.kvCache.findUnique({ where: { key: `runtime:resource:${this.role === "web" ? "cron" : "web"}` } });
      const peer: unknown = row ? JSON.parse(row.value) : null;
      if (peer && typeof peer === "object" && "version" in peer && peer.version === 1
        && "releaseId" in peer && peer.releaseId === releaseId && "timestamp" in peer && typeof peer.timestamp === "number" && Number.isSafeInteger(peer.timestamp)
        && "demand" in peer && typeof peer.demand === "number" && Number.isFinite(peer.demand)
        && "memoryRatio" in peer && typeof peer.memoryRatio === "number" && Number.isFinite(peer.memoryRatio)
        && "role" in peer && peer.role === (this.role === "web" ? "cron" : "web") && "level" in peer
        && ["normal", "warm", "hot", "critical"].includes(String(peer.level))) {
        const candidate = peer as PeerSample;
        const count = (value: number) => Number.isSafeInteger(value) && value >= 0 ? value : 0;
        this.peer = { version: 1, role: candidate.role, releaseId, timestamp: candidate.timestamp,
          pid: count(candidate.pid), level: candidate.level, demand: Math.max(0, candidate.demand),
          memoryRatio: Math.max(0, candidate.memoryRatio), activeJobs: count(candidate.activeJobs),
          queuedJobs: count(candidate.queuedJobs), internalConcurrency: count(candidate.internalConcurrency), rss: count(candidate.rss) };
      }
      else this.peer = null;
      if (!this.bridgeHealthy) runtimeLog("resource.coordination_restored");
      this.bridgeHealthy = true;
    } catch (error) {
      this.bridgeHealthy = false;
      if (Date.now() - this.bridgeWarnedAt > 60_000) {
        runtimeLog("resource.coordination_unavailable", { error, fallback: "local-conservative" }, "warn");
        this.bridgeWarnedAt = Date.now();
      }
    } finally { this.bridgeBusy = false; }
  }

  admit(cost = 1, lane: RequestLane = "ordinary"): { allowed: boolean; retryAfterSeconds: number; level: string } {
    this.start("web");
    if (!this.enabled) return { allowed: true, retryAfterSeconds: 0, level: "disabled" };
    if (lane === "ordinary") this.arrivals++;
    this.refresh();
    if (this.isDraining()) return { allowed: false, retryAfterSeconds: 5, level: "draining" };
    const subscription = lane === "subscription";
    const rate = subscription ? Math.max(0.1, setting("RESOURCE_SUBSCRIPTION_CONCURRENCY", 8, 1, 100) / 10 * this.decision.externalScale)
      : Math.max(1, this.rps * this.decision.externalScale);
    const bucket = subscription ? this.subscriptionBucket : this.bucket;
    const allowed = (!subscription || this.subscriptionLimit() > 0)
      && bucket.take(Date.now(), rate, Math.max(cost, (subscription ? 8 : this.burst) * this.decision.externalScale), cost);
    if (!allowed) this.rejected++;
    return { allowed, retryAfterSeconds: Math.max(1, Math.ceil(cost / rate)), level: this.decision.level };
  }

  snapshot() {
    const { level: pressure, ...decision } = this.decision;
    return { ...decision, pressure, activeJobs: this.active, queuedJobs: this.queued.size,
      activeRequests: this.externalActive,
      ordinaryRequests: this.externalActive - this.subscriptionActive,
      subscriptionRequests: this.subscriptionActive,
      subscriptionLimit: this.subscriptionLimit(),
      activeRequestWeight: this.externalWeight,
      draining: this.isDraining(), drainStartedAt: this.drainSince,
      memory: this.sampledMemory, peer: this.peer,
      externalDemand: this.demand, coordinationHealthy: this.bridgeHealthy && this.peer !== null
        && Date.now() - this.peer.timestamp >= 0 && Date.now() - this.peer.timestamp < 20_000,
      peerAgeMs: this.peer ? Math.max(0, Date.now() - this.peer.timestamp) : null };
  }
  isDraining(): boolean { return this.drainSince !== null || this.root.signal.aborted; }
  private subscriptionLimit(): number {
    return this.isDraining() || this.decision.level === "critical" ? 0
      : Math.max(1, Math.floor(setting("RESOURCE_SUBSCRIPTION_CONCURRENCY", 8, 1, 100) * this.decision.externalScale));
  }
  acquireRequest(cost = 1, lane: RequestLane = "ordinary"): (() => void) | null {
    this.start("web"); this.refresh();
    const subscription = lane === "subscription";
    const maximum = Math.max(1, Math.floor(setting("RESOURCE_EXTERNAL_CONCURRENCY", 32, 1, 2_048) * this.decision.externalScale));
    if (this.enabled && (this.isDraining() || (subscription ? this.subscriptionActive >= this.subscriptionLimit()
      : this.externalWeight + cost > maximum))) { this.rejected++; return null; }
    this.externalActive++;
    if (subscription) this.subscriptionActive++; else this.externalWeight += cost;
    let released = false;
    return () => { if (!released) {
      released = true; this.externalActive--;
      if (subscription) this.subscriptionActive--; else this.externalWeight -= cost;
    } };
  }
  onSubscriptionRetire(callback: (reason: string) => void): () => void {
    this.subscriptions.set(callback, false);
    if (this.enabled) this.retireSubscriptions(this.isDraining() ? "recycling" : "pressure", this.subscriptionLimit());
    return () => { this.subscriptions.delete(callback); };
  }
  private retireSubscriptions(reason: string, maximum: number): void {
    let excess = Math.max(0, this.subscriptionActive - maximum);
    for (const [callback, retiring] of this.subscriptions) {
      if (retiring) { excess--; continue; }
      if (excess-- <= 0) break;
      this.subscriptions.set(callback, true);
      try { callback(reason); } catch (error) { runtimeLog("resource.subscription_retire_failed", { error }, "warn"); }
    }
  }
  onReclaim(callback: () => unknown | Promise<unknown>, name = "derived-cache"): () => void {
    this.reclaimers.set(callback, name); return () => { this.reclaimers.delete(callback); };
  }
  async reclaimIdle(): Promise<void> {
    if (this.reclaimInFlight) return this.reclaimInFlight;
    this.lastReclaimAt = Date.now();
    const operation = Promise.resolve().then(async () => {
      for (const [reclaim, name] of this.reclaimers) {
        const before = process.memoryUsage(), started = Date.now();
        try {
          const result = await reclaim();
          const after = process.memoryUsage();
          runtimeLog("resource.reclaim_completed", { reclaimer: name, result, durationMs: Date.now() - started,
            before, after, rssDeltaBytes: after.rss - before.rss, heapDeltaBytes: after.heapUsed - before.heapUsed });
        } catch (error) { runtimeLog("resource.reclaim_failed", { reclaimer: name, error }, "warn"); }
      }
    });
    this.reclaimInFlight = operation;
    try { await operation; } finally { if (this.reclaimInFlight === operation) this.reclaimInFlight = null; }
  }
  concurrency(): number { this.refresh(); return Math.max(1, this.decision.internalConcurrency); }

  async checkpoint(phase?: string): Promise<void> {
    if (!this.enabled) return;
    this.start(process.env.APP_ROLE === "web" ? "web" : "cron");
    const context = workContext.getStore();
    if (context && phase && (phase !== context.phase || Date.now() - (context.phaseAt || 0) > 30_000)) {
      context.phase = phase; context.phaseAt = Date.now();
      runtimeLog("task.phase", { phase, ...this.snapshot(), memory: process.memoryUsage() });
    }
    const signal = context?.signal || this.root.signal;
    const since = Date.now();
    const maxWait = setting("RESOURCE_INTERNAL_MAX_WAIT_SECONDS", 900, 1, 7_200) * 1_000;
    let paused = false;
    do {
      aborted(signal); assertResourceWorkAllowed(); this.refresh();
      if (this.decision.internalConcurrency > 0) break;
      if (!paused) { runtimeLog("task.paused", { taskId: context?.id, task: context?.name, phase, ...this.snapshot() }, "warn"); paused = true; }
      if (Date.now() - since > maxWait) throw new Error("RESOURCE_PRESSURE_TIMEOUT");
      await delay(1_000, signal);
    } while (true);
    if (paused) runtimeLog("task.resumed", { taskId: context?.id, phase, waitedMs: Date.now() - since });
    if (this.decision.internalDelayMs) await delay(this.decision.internalDelayMs, signal);
  }

  run<T>(name: string, operation: () => Promise<T>): Promise<T> {
    if (this.isDraining()) return Promise.reject(new Error("PROCESS_DRAINING"));
    if (!this.enabled || workContext.getStore()) return operation();
    this.start("cron");
    const key = name.replace(/:(?:initial|daily)$/, "");
    const existing = this.queued.get(key);
    if (existing) return existing as Promise<T>;
    if (this.queued.size >= setting("RESOURCE_INTERNAL_QUEUE_LIMIT", 32, 1, 256)) {
      runtimeLog("task.queue_full", { task: key, ...this.snapshot() }, "warn");
      return Promise.reject(new Error("RESOURCE_QUEUE_FULL"));
    }
    this.order.push(key);
    const id = randomUUID();
    const queuedAt = Date.now();
    runtimeLog("task.queued", { taskId: id, task: key, ...this.snapshot() });
    const promise = (async () => {
      // Yield once so the map owns this promise before synchronous completion.
      await Promise.resolve();
      const signal = this.root.signal;
      try {
        while (this.active || this.order[0] !== key) {
          aborted(signal);
          if (Date.now() - queuedAt > setting("RESOURCE_INTERNAL_MAX_WAIT_SECONDS", 900, 1, 7_200) * 1_000) throw new Error("RESOURCE_QUEUE_TIMEOUT");
          await delay(250, signal);
        }
        await this.checkpoint("admission");
        let lease: Awaited<ReturnType<typeof acquireResourceLease>> = null;
        if (process.env.DATABASE_URL) {
          const { prisma } = await import("./db");
          while (!lease) {
            aborted(signal);
            if (Date.now() - queuedAt > setting("RESOURCE_INTERNAL_MAX_WAIT_SECONDS", 900, 1, 7_200) * 1_000) throw new Error("RESOURCE_SHARED_QUEUE_TIMEOUT");
            lease = await acquireResourceLease(prisma.kvCache, signal);
            if (!lease) await delay(1_000, signal);
          }
        }
        this.order.shift();
        this.active++;
        const started = Date.now();
        runtimeLog("task.started", { ...this.snapshot(), taskId: id, task: key, waitedMs: started - queuedAt, memory: process.memoryUsage() });
        try {
          const result = await workContext.run({ id, name: key, signal: lease?.signal || signal,
            assertLease: () => lease?.assert() }, async () => {
            await this.checkpoint("start");
            return operation();
          });
          aborted(lease?.signal || signal);
          runtimeLog("task.completed", { taskId: id, task: key, durationMs: Date.now() - started, memory: process.memoryUsage() });
          return result;
        } finally {
          this.active--;
          if (lease) await lease.release().catch(error => runtimeLog("resource.lease_release_failed", { taskId: id, error }, "warn"));
        }
      } catch (error) {
        runtimeLog("task.failed", { taskId: id, task: key, durationMs: Date.now() - queuedAt, error, memory: process.memoryUsage() }, "error");
        throw error;
      } finally {
        this.queued.delete(key);
        const position = this.order.indexOf(key);
        if (position >= 0) this.order.splice(position, 1);
      }
    })();
    this.queued.set(key, promise);
    return promise;
  }

  stop(): void {
    this.root.abort(new Error("PROCESS_SHUTDOWN"));
    this.retireSubscriptions("shutdown", 0);
    if (this.timer) clearInterval(this.timer);
    this.lag.disable();
    runtimeLog("process.stopping", { ...this.snapshot(), memory: process.memoryUsage() });
  }
}

const globals = globalThis as unknown as { resourceGovernor?: ResourceGovernor };
export const resourceGovernor = globals.resourceGovernor ??= new ResourceGovernor();
export const resourceCheckpoint = (phase?: string) => resourceGovernor.checkpoint(phase);
export function resourceTaskSignal(): AbortSignal | undefined { return workContext.getStore()?.signal; }
