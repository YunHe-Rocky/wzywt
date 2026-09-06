import { availableParallelism } from "node:os";
import { resolve } from "node:path";
import { Worker } from "node:worker_threads";
import type { Player, SplitResult } from "@/core/team-balancing";

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
}

interface WorkerResponse {
  id: number;
  result?: SplitResult | null;
  error?: string;
}

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

const defaultConcurrency = Math.max(1, Math.min(2, availableParallelism() - 1));
const workerConcurrency = boundedInteger(process.env.SPLIT_WORKER_CONCURRENCY, defaultConcurrency, 1, 4);
const maximumQueue = boundedInteger(process.env.SPLIT_WORKER_QUEUE_LIMIT, 8, 1, 32);
const executionTimeoutMs = boundedInteger(process.env.SPLIT_WORKER_TIMEOUT_MS, 8_000, 500, 30_000);
const workerPath = resolve(process.cwd(), ".runtime-workers", "workers", "team-balancing-worker.js");

class TeamBalancingPool {
  private readonly slots: WorkerSlot[] = [];
  private readonly queue: SplitJob[] = [];
  private pendingSpawns = 0;
  private nextJobId = 1;

  constructor() {
    for (let index = 0; index < workerConcurrency; index++) this.spawn();
  }

  run(players: Player[]): Promise<SplitResult | null> {
    const hasIdleWorker = this.slots.some((slot) => slot.alive && slot.job === null);
    if (!hasIdleWorker && this.queue.length >= maximumQueue) {
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
      job.timer = setTimeout(() => this.expire(job), executionTimeoutMs);
      this.queue.push(job);
      this.dispatch();
    });
  }

  private spawn(): void {
    const slot: WorkerSlot = { worker: new Worker(workerPath), job: null, alive: true };
    slot.worker.on("message", (message: WorkerResponse) => this.complete(slot, message));
    slot.worker.on("error", (error) => this.failSlot(slot, error));
    slot.worker.on("exit", (code) => {
      if (slot.alive) this.failSlot(slot, new Error(`team-balancing worker exited with code ${code}`));
    });
    slot.worker.unref();
    this.slots.push(slot);
  }

  private dispatch(): void {
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
      this.replace(slot);
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
    this.replace(slot);
    this.dispatch();
  }

  private replace(slot: WorkerSlot): void {
    if (!slot.alive) return;
    slot.alive = false;
    const index = this.slots.indexOf(slot);
    if (index >= 0) this.slots.splice(index, 1);
    void slot.worker.terminate();
    this.scheduleReplacement();
  }

  private scheduleReplacement(): void {
    if (this.slots.length + this.pendingSpawns >= workerConcurrency) return;
    this.pendingSpawns++;
    const timer = setTimeout(() => {
      this.pendingSpawns--;
      this.spawn();
      this.dispatch();
    }, 100);
    timer.unref();
  }
}

const globalPool = globalThis as typeof globalThis & { __wzywtTeamBalancingPool?: TeamBalancingPool };

export function runTeamSplit(players: Player[]): Promise<SplitResult | null> {
  const pool = globalPool.__wzywtTeamBalancingPool ??= new TeamBalancingPool();
  return pool.run(players);
}
