import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { runExclusiveTask } from "@/features/cron/task-lock";
import {
  runAllMonitors,
  runMonitorAndScrape,
  type MonitorEvent,
  type MonitorResult,
} from "@/features/monitor";
import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/service-error";

export const MONITOR_SNAPSHOT_KEY = "cron:monitor:last_cycle";
export const MONITOR_REQUEST_KEY = "cron:monitor:manual_request";
const STALE_MONITOR_REQUEST_MS = 30 * 60 * 1000;

export interface MonitorSnapshot {
  version: 1;
  sequence: number;
  completedAt: string;
  results: MonitorResult[];
  events: MonitorEvent[];
}

export interface MonitorCycleOutcome {
  executed: boolean;
  snapshot: MonitorSnapshot | null;
}

export interface MonitorRequest {
  version: 1;
  jobId: string;
  requestedBy: number;
  phase: "queued" | "running" | "done" | "error";
  updatedAt: string;
  message: string;
  sequence?: number;
}

export function parseMonitorSnapshot(value: string): MonitorSnapshot | null {
  try {
    const parsed = JSON.parse(value) as Partial<MonitorSnapshot>;
    if (
      parsed.version !== 1
      || !Number.isSafeInteger(parsed.sequence)
      || typeof parsed.completedAt !== "string"
      || !Array.isArray(parsed.results)
      || !Array.isArray(parsed.events)
    ) return null;
    return parsed as MonitorSnapshot;
  } catch {
    return null;
  }
}

function parseMonitorRequest(value: string): MonitorRequest | null {
  try {
    const parsed = JSON.parse(value) as Partial<MonitorRequest>;
    if (
      parsed.version !== 1
      || typeof parsed.jobId !== "string"
      || !Number.isSafeInteger(parsed.requestedBy)
      || !["queued", "running", "done", "error"].includes(parsed.phase ?? "")
      || typeof parsed.updatedAt !== "string"
      || typeof parsed.message !== "string"
    ) return null;
    return parsed as MonitorRequest;
  } catch {
    return null;
  }
}

function isActiveRequest(request: MonitorRequest | null): boolean {
  if (!request || !["queued", "running"].includes(request.phase)) return false;
  if (request.phase === "queued") return true;
  const updatedAt = Date.parse(request.updatedAt);
  return Number.isFinite(updatedAt) && Date.now() - updatedAt < STALE_MONITOR_REQUEST_MS;
}

export async function readLatestMonitorSnapshot(): Promise<MonitorSnapshot | null> {
  const row = await prisma.kvCache.findUnique({ where: { key: MONITOR_SNAPSHOT_KEY } });
  return row ? parseMonitorSnapshot(row.value) : null;
}

async function writeMonitorRequest(request: MonitorRequest): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await prisma.kvCache.findUnique({ where: { key: MONITOR_REQUEST_KEY } });
    const current = row ? parseMonitorRequest(row.value) : null;
    if (!row || current?.jobId !== request.jobId) return false;
    const updated = await prisma.kvCache.updateMany({
      where: { key: MONITOR_REQUEST_KEY, value: row.value },
      data: { value: JSON.stringify(request) },
    });
    if (updated.count === 1) return true;
  }
  return false;
}

export async function queueMonitorCycle(requestedBy: number): Promise<MonitorRequest> {
  try {
    return await prisma.$transaction(async (tx) => {
      const row = await tx.kvCache.findUnique({ where: { key: MONITOR_REQUEST_KEY } });
      if (isActiveRequest(row ? parseMonitorRequest(row.value) : null)) {
        throw new ServiceError("CONFLICT", "监控任务已在队列或运行中");
      }
      const request: MonitorRequest = {
        version: 1,
        jobId: randomUUID(),
        requestedBy,
        phase: "queued",
        updatedAt: new Date().toISOString(),
        message: "监控检查已进入队列",
      };
      await tx.kvCache.upsert({
        where: { key: MONITOR_REQUEST_KEY },
        create: { key: MONITOR_REQUEST_KEY, value: JSON.stringify(request) },
        update: { value: JSON.stringify(request) },
      });
      return request;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      throw new ServiceError("CONFLICT", "监控任务并发入队，请重试");
    }
    throw error;
  }
}

async function executeMonitorCycle(): Promise<MonitorSnapshot> {
  const results = await runAllMonitors();
  const changed = results.filter((result) => result.ok && result.changed);
  const events = await runMonitorAndScrape(changed.map((result) => result.module));
  if (events.some((event) =>
    ["heroes", "skins", "skills"].includes(event.module) && event.action === "scrape-done")) {
    await prisma.kvCache.upsert({
      where: { key: "cron:hero_sync:last_success" },
      create: { key: "cron:hero_sync:last_success", value: String(Date.now()) },
      update: { value: String(Date.now()) },
    });
  }
  const snapshot: MonitorSnapshot = {
    version: 1,
    sequence: Date.now(),
    completedAt: new Date().toISOString(),
    results,
    events,
  };
  await prisma.kvCache.upsert({
    where: { key: MONITOR_SNAPSHOT_KEY },
    create: { key: MONITOR_SNAPSHOT_KEY, value: JSON.stringify(snapshot) },
    update: { value: JSON.stringify(snapshot) },
  });
  return snapshot;
}

export async function runMonitorCycle(): Promise<MonitorCycleOutcome> {
  let snapshot: MonitorSnapshot | null = null;
  const executed = await runExclusiveTask("hero-pipeline", 30 * 60 * 1000, async () => {
    snapshot = await executeMonitorCycle();
  });
  return { executed, snapshot };
}

export async function runQueuedMonitorCycle(): Promise<boolean> {
  const row = await prisma.kvCache.findUnique({ where: { key: MONITOR_REQUEST_KEY } });
  const candidate = row ? parseMonitorRequest(row.value) : null;
  if (!candidate || candidate.phase !== "queued") return false;

  return runExclusiveTask("hero-pipeline", 30 * 60 * 1000, async () => {
    const latestRow = await prisma.kvCache.findUnique({ where: { key: MONITOR_REQUEST_KEY } });
    const latest = latestRow ? parseMonitorRequest(latestRow.value) : null;
    if (!latest || latest.jobId !== candidate.jobId || latest.phase !== "queued") return;

    const base = { ...latest, updatedAt: new Date().toISOString() };
    const claimed = await writeMonitorRequest({ ...base, phase: "running", message: "正在执行监控检查" });
    if (!claimed) return;
    try {
      const snapshot = await executeMonitorCycle();
      await writeMonitorRequest({
        ...base,
        phase: "done",
        updatedAt: new Date().toISOString(),
        message: "监控检查完成",
        sequence: snapshot.sequence,
      });
    } catch (error) {
      await writeMonitorRequest({
        ...base,
        phase: "error",
        updatedAt: new Date().toISOString(),
        message: error instanceof Error ? `监控检查失败：${error.message}` : "监控检查失败",
      }).catch(() => false);
      throw error;
    }
  });
}
