import { prisma } from "@/lib/db";

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

export async function recordCronHeartbeat(): Promise<void> {
  const heartbeat: CronHeartbeat = {
    version: 1,
    releaseId: process.env.APP_RELEASE_ID?.trim() || "development",
    timestamp: Date.now(),
  };
  await prisma.kvCache.upsert({
    where: { key: CRON_HEARTBEAT_KEY },
    create: { key: CRON_HEARTBEAT_KEY, value: JSON.stringify(heartbeat) },
    update: { value: JSON.stringify(heartbeat) },
  });
}
