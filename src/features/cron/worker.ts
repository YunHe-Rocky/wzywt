import "@/features/cron/load-env";
import cron, { type ScheduledTask } from "node-cron";
import { syncHeroes } from "@/features/heroes/server/sync";
import { downloadAllImages } from "@/features/heroes/server/download-images";
import { runQueuedHeroSync } from "@/features/heroes/server/sync-jobs";
import { runMonitorCycle, runQueuedMonitorCycle } from "@/features/monitor/cycle";
import { runExclusiveTask } from "@/features/cron/task-lock";
import { recordCronHeartbeat } from "@/features/cron/heartbeat";
import { lockExpiredTournaments } from "@/features/tournaments/server/lockExpiredTournaments";
import { processPendingMediaCleanup } from "@/features/media/server/storage-cleanup";
import { prisma } from "@/lib/db";
import { getMediaStorage } from "@/lib/storage";

const HERO_SYNC_STAMP_KEY = "cron:hero_sync:last_success";
const HERO_SYNC_RECENT_MS = 6 * 60 * 60 * 1000;

function logError(scope: string, error: unknown): void {
  console.error(`[${scope}]`, error instanceof Error ? error.message : error);
}

async function wasHeroSyncRecent(): Promise<boolean> {
  const row = await prisma.kvCache.findUnique({ where: { key: HERO_SYNC_STAMP_KEY } });
  if (!row) return false;
  const timestamp = Number(row.value);
  return Number.isFinite(timestamp) && Date.now() - timestamp < HERO_SYNC_RECENT_MS;
}

async function recordHeroSyncSuccess(): Promise<void> {
  await prisma.kvCache.upsert({
    where: { key: HERO_SYNC_STAMP_KEY },
    create: { key: HERO_SYNC_STAMP_KEY, value: String(Date.now()) },
    update: { value: String(Date.now()) },
  });
}

async function runHeroSync(label: string, skipWhenRecent = false): Promise<void> {
  try {
    await runExclusiveTask("hero-pipeline", 2 * 60 * 60 * 1000, async () => {
      if (skipWhenRecent && await wasHeroSyncRecent()) {
        console.log(`[hero-sync] skip ${label}: a successful sync ran within 6 hours`);
        return;
      }

      console.log(`[hero-sync] Starting ${label} sync...`);
      const result = await syncHeroes();
      console.log(`[hero-sync] ${label}: ${result.inserted} inserted, ${result.updated} updated`);
      const images = await downloadAllImages();
      console.log(`[hero-sync] ${label}: ${images.heroes} hero + ${images.skins} skin images refreshed`);
      await recordHeroSyncSuccess();
    });
  } catch (error) {
    logError(`hero-sync:${label}`, error);
  }
}

export { runMonitorCycle } from "@/features/monitor/cycle";

export async function runDeadlineCheck(): Promise<void> {
  try {
    await runExclusiveTask("deadline-check", 2 * 60 * 1000, async () => {
      const locked = await lockExpiredTournaments();
      locked.forEach((tournament) => {
        console.log(
          `[deadline] Tournament ${tournament.id} (${tournament.name}): ${tournament.playerCount} players, `
          + `${tournament.removedTemporaryPlayers} temporary removed, locked`,
        );
      });
    });
  } catch (error) {
    logError("deadline", error);
  }
}

async function runMediaCleanup(): Promise<void> {
  await runExclusiveTask("media-cleanup", 4 * 60 * 1000, async () => {
    const result = await processPendingMediaCleanup(getMediaStorage());
    if (result.processed > 0 || result.failed > 0) {
      console.log(`[media-cleanup] processed=${result.processed} failed=${result.failed}`);
    }
  });
}

export interface CronWorker {
  stop(): Promise<void>;
}

export function startCronWorker(): CronWorker {
  console.log("[cron] Starting cron jobs...");
  const inFlight = new Set<Promise<void>>();
  let stopping = false;
  const track = (scope: string, operation: () => Promise<unknown>): Promise<void> => {
    const task = operation()
      .then(() => undefined)
      .catch((error) => logError(scope, error))
      .finally(() => inFlight.delete(task));
    inFlight.add(task);
    return task;
  };
  const schedule = (scope: string, operation: () => Promise<unknown>) => {
    if (!stopping) void track(scope, operation);
  };
  const tasks: ScheduledTask[] = [
    cron.schedule("0 6 * * *", () => schedule("hero-sync:daily", () => runHeroSync("daily"))),
    cron.schedule("*/3 * * * *", () => schedule("monitor", runMonitorCycle)),
    cron.schedule("*/10 * * * * *", () => schedule("monitor:queued", runQueuedMonitorCycle)),
    cron.schedule("* * * * *", () => schedule("deadline", runDeadlineCheck)),
    cron.schedule("*/10 * * * * *", () => schedule("hero-sync:queued", runQueuedHeroSync)),
    cron.schedule("*/30 * * * * *", () => schedule("heartbeat", recordCronHeartbeat)),
    cron.schedule("*/5 * * * *", () => schedule("media-cleanup", runMediaCleanup)),
  ];

  void track("heartbeat:initial", recordCronHeartbeat);
  const initialMonitor = track("monitor:initial", runMonitorCycle);
  const initialSyncTimer = setTimeout(
    () => schedule("hero-sync:initial", async () => {
      await initialMonitor;
      await runHeroSync("initial", true);
    }),
    5_000,
  );
  console.log("[cron] All cron jobs registered");

  return {
    async stop() {
      stopping = true;
      clearTimeout(initialSyncTimer);
      tasks.forEach((task) => task.stop());
      const draining = Promise.allSettled([...inFlight]);
      let drained = false;
      await Promise.race([
        draining.then(() => { drained = true; }),
        new Promise<void>((resolve) => setTimeout(resolve, 300_000)),
      ]);
      if (!drained) console.error(`[cron] forced shutdown with ${inFlight.size} task(s) still active`);
      await prisma.$disconnect();
    },
  };
}
