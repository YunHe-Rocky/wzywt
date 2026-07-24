import cron, { type ScheduledTask } from "node-cron";
import { execFileSync } from "node:child_process";
import { freemem } from "node:os";
import { syncHeroes } from "@/features/heroes/server/sync";
import { downloadAllImages } from "@/features/heroes/server/download-images";
import { runAllMonitors, runMonitorAndScrape } from "@/features/monitor";
import { lockExpiredTournaments } from "@/features/tournaments/server/lockExpiredTournaments";
import { prisma } from "@/lib/db";

const LOW_MEMORY_THRESHOLD_MB = 150;

function logError(scope: string, error: unknown): void {
  console.error(`[${scope}]`, error instanceof Error ? error.message : error);
}

async function runHeroSync(label: string): Promise<void> {
  try {
    console.log(`[hero-sync] Starting ${label} sync...`);
    const result = await syncHeroes();
    console.log(`[hero-sync] ${label}: ${result.inserted} inserted, ${result.updated} updated`);
    const images = await downloadAllImages();
    console.log(`[hero-sync] ${label}: ${images.heroes} hero + ${images.skins} skin images refreshed`);
  } catch (error) {
    logError(`hero-sync:${label}`, error);
  }
}

export async function runMonitorCycle(): Promise<void> {
  try {
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

    if (changed.some((item) => item.module === "heroes" || item.module === "skins")) {
      try {
        const result = await downloadAllImages();
        console.log(`[monitor] Images: ${result.heroes} hero + ${result.skins} skins downloaded`);
      } catch (error) {
        logError("monitor:images", error);
      }
    }
  } catch (error) {
    logError("monitor", error);
  }
}

export async function runDeadlineCheck(): Promise<void> {
  try {
    const locked = await lockExpiredTournaments();
    locked.forEach((tournament) => {
      console.log(
        `[deadline] Tournament ${tournament.id} (${tournament.name}): ${tournament.playerCount} players, `
        + `${tournament.removedTemporaryPlayers} temporary removed, locked`,
      );
    });
  } catch (error) {
    logError("deadline", error);
  }
}

export function releasePageCacheWhenMemoryIsLow(): void {
  const beforeMB = Math.floor(freemem() / 1024 / 1024);
  if (beforeMB >= LOW_MEMORY_THRESHOLD_MB || process.platform !== "linux") return;

  try {
    console.log(`[memory] Low memory: ${beforeMB}MB free, dropping page cache...`);
    execFileSync("/bin/sh", ["-c", "sync && echo 1 > /proc/sys/vm/drop_caches 2>/dev/null || true"], {
      timeout: 5_000,
      stdio: "ignore",
    });
    const afterMB = Math.floor(freemem() / 1024 / 1024);
    console.log(`[memory] ${beforeMB}MB -> ${afterMB}MB free`);
  } catch (error) {
    logError("memory", error);
  }
}

export interface CronWorker {
  stop(): Promise<void>;
}

export function startCronWorker(): CronWorker {
  console.log("[cron] Starting cron jobs...");
  const tasks: ScheduledTask[] = [
    cron.schedule("0 6 * * *", () => runHeroSync("daily")),
    cron.schedule("*/3 * * * *", runMonitorCycle),
    cron.schedule("*/30 * * * *", releasePageCacheWhenMemoryIsLow),
    cron.schedule("* * * * *", runDeadlineCheck),
  ];

  const initialSyncTimer = setTimeout(() => void runHeroSync("initial"), 5_000);
  void runMonitorCycle();
  console.log("[cron] All cron jobs registered");

  return {
    async stop() {
      clearTimeout(initialSyncTimer);
      tasks.forEach((task) => task.stop());
      await prisma.$disconnect();
    },
  };
}
