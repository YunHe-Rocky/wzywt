/** Pure policy. Runtime adapters supply host/cgroup and cross-process samples. */
export type PressureLevel = "normal" | "warm" | "hot" | "critical";
export interface ResourceSample {
  memoryRatio: number;
  cpuRatio: number;
  eventLoopLagMs: number;
  externalDemand: number;
  peerCritical: boolean;
  coordinationHealthy: boolean;
}
export interface ResourceDecision {
  level: PressureLevel;
  reason: string;
  externalScale: number;
  internalConcurrency: number;
  internalDelayMs: number;
  reclaimIdle: boolean;
}
const RANK: Record<PressureLevel, number> = { normal: 0, warm: 1, hot: 2, critical: 3 };

export type RequestLane = "ordinary" | "subscription";
export function externalRequestLane(path: string, method = "GET"): RequestLane {
  return /^(GET|HEAD)$/.test(method) && path === "/api/heroes/watch" ? "subscription" : "ordinary";
}

export function externalRequestCost(path: string, method = "GET", contentType = ""): number {
  return /\/(uploads?|recognize|recognitions|split|screenshots)(\/|$)/.test(path)
    || (!/^(GET|HEAD|OPTIONS)$/.test(method) && contentType.toLowerCase().startsWith("multipart/form-data")) ? 4 : 1;
}

export class AdaptiveResourcePolicy {
  private level: PressureLevel = "normal";
  private recoverySince: number | null = null;
  constructor(private readonly recoveryMs = 30_000, private readonly maxConcurrency = 4) {}

  evaluate(sample: ResourceSample, now: number): ResourceDecision {
    let target: PressureLevel = "normal";
    let reason = "capacity-available";
    if (sample.memoryRatio >= 0.94 || sample.peerCritical) {
      target = "critical"; reason = "memory-critical";
    } else if (sample.memoryRatio >= 0.84 || sample.eventLoopLagMs >= 250 || sample.cpuRatio >= 0.95) {
      target = "hot"; reason = "resource-pressure";
    } else if (sample.memoryRatio >= 0.70 || sample.eventLoopLagMs >= 80 || sample.cpuRatio >= 0.75) {
      target = "warm"; reason = "resource-pressure";
    }
    if (!sample.coordinationHealthy && RANK[target] < RANK.warm) {
      target = "warm"; reason = "coordination-unavailable";
    }
    const externalBusy = sample.externalDemand >= 0.5;
    if (externalBusy && target === "normal") reason = "external-priority";
    if (RANK[target] >= RANK[this.level]) {
      this.level = target;
      this.recoverySince = null;
    } else {
      this.recoverySince ??= now;
      if (now - this.recoverySince >= this.recoveryMs) {
        this.level = (["normal", "warm", "hot", "critical"] as const)[RANK[this.level] - 1];
        this.recoverySince = now;
      } else reason = "recovery-cooldown";
    }
    const settings = {
      normal: [1, this.maxConcurrency, 0],
      warm: [0.65, Math.min(2, this.maxConcurrency), 100],
      hot: [0.25, 1, 500],
      critical: [0.05, 0, 1_000],
    }[this.level];
    return {
      level: this.level, reason, externalScale: settings[0],
      internalConcurrency: externalBusy ? Math.min(2, settings[1]) : settings[1],
      internalDelayMs: externalBusy ? Math.max(100, settings[2]) : settings[2],
      reclaimIdle: RANK[this.level] >= RANK.warm,
    };
  }
}

/** A bounded bucket shared by all dynamic external requests in one Web process. */
export class AdmissionBucket {
  private tokens = 0;
  private at: number | null = null;
  take(now: number, rate: number, burst: number, cost = 1): boolean {
    if (this.at === null) this.tokens = burst;
    else this.tokens = Math.min(burst, this.tokens + Math.max(0, now - this.at) * rate / 1_000);
    this.at = now;
    if (cost > this.tokens) return false;
    this.tokens -= cost;
    return true;
  }
}
