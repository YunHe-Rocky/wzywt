import cron, { type ScheduledTask } from "node-cron";
import { syncHeroes } from "@/features/heroes/server/sync";
import { downloadAllImages } from "@/features/heroes/server/download-images";
import { runAllMonitors, runMonitorAndScrape } from "@/features/monitor";
import { runExclusiveTask } from "@/features/cron/task-lock";
import { lockExpiredTournaments } from "@/features/tournaments/server/lockExpiredTournaments";
import { prisma } from "@/lib/db";

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

export async function runMonitorCycle(): Promise<void> {
  try {
    await runExclusiveTask("hero-pipeline", 30 * 60 * 1000, async () => {
      const results = await runAllMonitors();
      const changed = results.filter((result) => result.changed);
      if (changed.length === 0) return;

      console.log(
        `[monitor] Changes detected: ${changed.map((item) => `${item.module}:${item.detail}`).join(", ")}`,
      );
      const events = await runMonitorAndScrape(changed.map((item) => item.module));
      events.forEach((event) => {
        console.log(`[monitor] ${event.module} ${event.action}: ${event.detail}`);
      });
      if (events.some((event) =>
        ["heroes", "skins", "skills"].includes(event.module) && event.action === "scrape-done")) {
        await recordHeroSyncSuccess();
      }

      if (changed.some((item) => item.module === "heroes" || item.module === "skins")) {
        try {
          const result = await downloadAllImages();
          console.log(`[monitor] Images: ${result.heroes} hero + ${result.skins} skins downloaded`);
        } catch (error) {
          logError("monitor:images", error);
        }
      }
    });
  } catch (error) {
    logError("monitor", error);
  }
}

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

export interface CronWorker {
  stop(): Promise<void>;
}

export function startCronWorker(): CronWorker {
  console.log("[cron] Starting cron jobs...");
  const tasks: ScheduledTask[] = [
    cron.schedule("0 6 * * *", () => void runHeroSync("daily")),
    cron.schedule("*/3 * * * *", () => void runMonitorCycle()),
    cron.schedule("* * * * *", () => void runDeadlineCheck()),
  ];

  const initialMonitor = runMonitorCycle();
  const initialSyncTimer = setTimeout(
    () => void initialMonitor.then(() => runHeroSync("initial", true)),
    5_000,
  );
  console.log("[cron] All cron jobs registered");

  return {
    async stop() {
      clearTimeout(initialSyncTimer);
      tasks.forEach((task) => task.stop());
      await prisma.$disconnect();
    },
  };
}
