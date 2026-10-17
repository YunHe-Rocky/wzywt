import { availableParallelism } from "node:os";
import { resolve } from "node:path";
import { Worker } from "node:worker_threads";
import type { Player, SplitResult } from "@/core/team-balancing";
import { readResourceSettings } from "@/core/resource-settings";
import { resourceGovernor } from "@/lib/resource-governor";
import { runtimeLog } from "@/lib/runtime-log";

export type SplitExecutionErrorCode = "SPLIT_BUSY" | "SPLIT_TIMEOUT" | "SPLIT_UNAVAILABLE";

export class SplitExecutionError extends Error {
  constructor(public readonly code: SplitExecutionErrorCode, message: string) {
    super(message);
    this.name = "SplitExecutionError";
  }
}

interface SplitJob {
  id: number;
  players: Player[];
  resolve: (result: SplitResult | null) => void;
  reject: (error: SplitExecutionError) => void;
  timer: ReturnType<typeof setTimeout>;
  slot: WorkerSlot | null;
  settled: boolean;
}

interface WorkerSlot {
  worker: Worker;
  job: SplitJob | null;
  alive: boolean;
  idleSince: number;
}

interface WorkerResponse {
  id: number;
  result?: SplitResult | null;
  error?: string;
}

const defaultConcurrency = Math.max(1, Math.min(2, availableParallelism() - 1));
const workerPath = resolve(process.cwd(), ".runtime-workers", "workers", "team-balancing-worker.js");

export class TeamBalancingPool {
  private readonly slots: WorkerSlot[] = [];
  private readonly queue: SplitJob[] = [];
  private readonly terminating = new Map<WorkerSlot, Promise<void>>();
  private readonly settings = readResourceSettings(process.env);
  private readonly workerConcurrency = this.settings.SPLIT_WORKER_CONCURRENCY || defaultConcurrency;
  private readonly unregister: () => void;
  private readonly idleTimer: ReturnType<typeof setInterval>;
  private replacementTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private nextJobId = 1;

  constructor() {
    this.unregister = resourceGovernor.onReclaim(() => this.reclaimIdle(), "split-workers");
    this.idleTimer = setInterval(() => { void this.reclaimIdle(false); }, Math.min(5_000, this.settings.SPLIT_WORKER_IDLE_SECONDS * 1_000));
    this.idleTimer.unref();
  }

  run(players: Player[]): Promise<SplitResult | null> {
    if (this.closed || resourceGovernor.isDraining()) return Promise.reject(new SplitExecutionError("SPLIT_UNAVAILABLE", "team-balancing is draining"));
    const hasIdleWorker = this.slots.some((slot) => slot.alive && slot.job === null);
    if (!hasIdleWorker && this.queue.length >= this.settings.SPLIT_WORKER_QUEUE_LIMIT) {
      return Promise.reject(new SplitExecutionError("SPLIT_BUSY", "team-balancing queue is full"));
    }

    return new Promise((resolveJob, rejectJob) => {
      const job: SplitJob = {
        id: this.nextJobId++,
        players,
        resolve: resolveJob,
        reject: rejectJob,
        timer: setTimeout(() => undefined, 0),
        slot: null,
        settled: false,
      };
      clearTimeout(job.timer);
      job.timer = setTimeout(() => this.expire(job), this.settings.SPLIT_WORKER_TIMEOUT_MS);
      this.queue.push(job);
      this.dispatch();
    });
  }

  private spawn(): void {
    const slot: WorkerSlot = { worker: new Worker(workerPath, { resourceLimits: {
      maxOldGenerationSizeMb: this.settings.SPLIT_WORKER_HEAP_MB, stackSizeMb: 4,
    } }), job: null, alive: true, idleSince: Date.now() };
    slot.worker.on("message", (message: WorkerResponse) => this.complete(slot, message));
    slot.worker.on("error", (error) => this.failSlot(slot, error));
    slot.worker.on("exit", (code) => {
      if (slot.alive) this.failSlot(slot, new Error(`team-balancing worker exited with code ${code}`));
    });
    slot.worker.unref();
    this.slots.push(slot);
  }

  private dispatch(): void {
    if (this.closed) return;
    const busy = this.slots.filter(slot => slot.job !== null).length;
    const needed = Math.min(this.workerConcurrency, busy + this.queue.length);
    // A retiring thread keeps its slot until terminate() resolves. No temporary
    // double pool is created during timeout, pressure reclaim or lazy restart.
    while (!this.replacementTimer && this.slots.length < needed
      && this.slots.length + this.terminating.size < this.workerConcurrency) this.spawn();
    for (const slot of this.slots) {
      if (!slot.alive || slot.job || this.queue.length === 0) continue;
      const job = this.queue.shift()!;
      if (job.settled) continue;
      slot.job = job;
      job.slot = slot;
      slot.worker.postMessage({ id: job.id, players: job.players });
    }
  }

  private complete(slot: WorkerSlot, message: WorkerResponse): void {
    const job = slot.job;
    if (!job || job.id !== message.id || job.settled) return;
    slot.job = null;
    slot.idleSince = Date.now();
    job.slot = null;
    job.settled = true;
    clearTimeout(job.timer);
    if (message.error) job.reject(new SplitExecutionError("SPLIT_UNAVAILABLE", message.error));
    else job.resolve(message.result ?? null);
    this.dispatch();
  }

  private expire(job: SplitJob): void {
    if (job.settled) return;
    job.settled = true;
    const queuedIndex = this.queue.indexOf(job);
    if (queuedIndex >= 0) this.queue.splice(queuedIndex, 1);
    const slot = job.slot;
    if (slot) {
      slot.job = null;
      void this.retire(slot);
    }
    job.reject(new SplitExecutionError("SPLIT_TIMEOUT", "team-balancing execution timed out"));
    this.dispatch();
  }

  private failSlot(slot: WorkerSlot, error: Error): void {
    if (!slot.alive) return;
    const job = slot.job;
    slot.job = null;
    if (job && !job.settled) {
      job.settled = true;
      job.slot = null;
      clearTimeout(job.timer);
      job.reject(new SplitExecutionError("SPLIT_UNAVAILABLE", error.message));
    }
    void this.retire(slot);
    this.dispatch();
  }

  private retire(slot: WorkerSlot): Promise<void> {
    if (!slot.alive) return Promise.resolve();
    slot.alive = false;
    const index = this.slots.indexOf(slot);
    if (index >= 0) this.slots.splice(index, 1);
    let exited = false;
    const onExit = () => {
      if (exited) return;
      exited = true;
      this.terminating.delete(slot);
      if (!this.closed && this.queue.length && !this.replacementTimer) {
        this.replacementTimer = setTimeout(() => { this.replacementTimer = null; this.dispatch(); }, 100);
        this.replacementTimer.unref();
      }
    };
    slot.worker.once("exit", onExit);
    const operation = Promise.resolve().then(() => slot.worker.terminate()).then(onExit).catch(error => {
      // Preserve its capacity reservation until an actual exit is observed.
      runtimeLog("worker.terminate_failed", { worker: "team-balancing", capacityRetained: true, error }, "warn");
    });
    this.terminating.set(slot, operation);
    return operation;
  }

  async reclaimIdle(pressure = true): Promise<{ workersRetired: number; activeWorkers: number }> {
    const now = Date.now();
    const idle = this.slots.filter(slot => !slot.job && (pressure
      || now - slot.idleSince >= this.settings.SPLIT_WORKER_IDLE_SECONDS * 1_000));
    // Never interrupt a job or shrink the pool while accepted work is queued.
    if (this.queue.length) return { workersRetired: 0, activeWorkers: this.slots.length };
    await Promise.all(idle.map(slot => this.retire(slot)));
    const retired = idle.filter(slot => !this.terminating.has(slot)).length;
    if (retired) runtimeLog("worker.idle_reclaimed", { worker: "team-balancing", workersRetired: retired, pressure });
    return { workersRetired: retired, activeWorkers: this.slots.filter(slot => slot.job).length };
  }

  async close(): Promise<void> {
    this.closed = true; this.unregister(); clearInterval(this.idleTimer);
    if (this.replacementTimer) clearTimeout(this.replacementTimer);
    for (const job of [...this.queue, ...this.slots.flatMap(slot => slot.job ? [slot.job] : [])]) {
      if (job.settled) continue;
      job.settled = true; clearTimeout(job.timer);
      job.reject(new SplitExecutionError("SPLIT_UNAVAILABLE", "team-balancing pool closed"));
    }
    this.queue.length = 0;
    await Promise.all([...this.slots].map(slot => this.retire(slot)));
    await Promise.all(this.terminating.values());
  }
}

const globalPool = globalThis as typeof globalThis & { __wzywtTeamBalancingPool?: TeamBalancingPool };

export function runTeamSplit(players: Player[]): Promise<SplitResult | null> {
  const pool = globalPool.__wzywtTeamBalancingPool ??= new TeamBalancingPool();
  return pool.run(players);
}
