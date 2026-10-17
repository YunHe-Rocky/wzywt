import { prisma } from "@/lib/db";
import { writeFileSync, renameSync } from "node:fs";
import { runtimeBootId, runtimeLog } from "@/lib/runtime-log";

export const CRON_HEARTBEAT_KEY = "cron:worker:heartbeat";
export const CRON_HEARTBEAT_MAX_AGE_MS = 90_000;

export interface CronHeartbeat {
  version: 1;
  releaseId: string;
  timestamp: number;
}

export function parseCronHeartbeat(value: string): CronHeartbeat | null {
  try {
    const parsed = JSON.parse(value) as Partial<CronHeartbeat>;
    if (
      parsed.version !== 1
      || typeof parsed.releaseId !== "string"
      || !Number.isSafeInteger(parsed.timestamp)
    ) return null;
    return parsed as CronHeartbeat;
  } catch {
    return null;
  }
}

export function recordLocalCronHeartbeat(): CronHeartbeat {
  const heartbeat: CronHeartbeat = {
    version: 1,
    releaseId: process.env.APP_RELEASE_ID?.trim() || "development",
    timestamp: Date.now(),
  };
  // Independent liveness: database failure changes readiness, not process life.
  const file = process.env.APP_HEARTBEAT_FILE;
  if (file) {
    try {
      const temporary = `${file}.${process.pid}.tmp`;
      writeFileSync(temporary, JSON.stringify({ ...heartbeat, pid: process.pid, bootId: runtimeBootId }), { mode: 0o600 });
      renameSync(temporary, file);
    } catch (error) { runtimeLog("process.heartbeat_write_failed", { error }, "error"); }
  }
  return heartbeat;
}

export async function recordCronHeartbeat(): Promise<void> {
  const heartbeat = recordLocalCronHeartbeat();
  await prisma.kvCache.upsert({
    where: { key: CRON_HEARTBEAT_KEY },
    create: { key: CRON_HEARTBEAT_KEY, value: JSON.stringify(heartbeat) },
    update: { value: JSON.stringify(heartbeat) },
  });
}
