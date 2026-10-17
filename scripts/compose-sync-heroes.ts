import "@/features/cron/load-env";
import { runExclusiveTask } from "@/features/cron/task-lock";
import { downloadAllImages } from "@/features/heroes/server/download-images";
import { syncHeroes } from "@/features/heroes/server/sync";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { resourceGovernor } from "@/lib/resource-governor";

const SUCCESS_KEY = "cron:hero_sync:last_success";
let stopping = false;

// Finish the current phase and release the lease before exiting. A signal must
// not disconnect clients while the active phase is still writing to the DB.
const requestStop = () => { stopping = true; resourceGovernor.stop(); };
process.once("SIGINT", requestStop);
process.once("SIGTERM", requestStop);

function assertRunning(): void {
  if (stopping) throw new Error("Synchronization interrupted; no further phase was started");
}

async function main(): Promise<void> {
  process.env.APP_ROLE = "job";
  try {
    const completed = await resourceGovernor.run("hero-sync:manual", () => runExclusiveTask("hero-pipeline", 2 * 60 * 60 * 1000, async (lease) => {
      assertRunning();
      const result = await syncHeroes();
      console.log(`[sync-heroes] ${result.inserted} inserted, ${result.updated} updated`);
      assertRunning();
      await lease.assertOwnership();
      const images = await downloadAllImages();
      console.log(`[sync-heroes] ${images.heroes} hero + ${images.skins} skin images refreshed`);
      assertRunning();
      await lease.assertOwnership();
      await prisma.kvCache.upsert({
        where: { key: SUCCESS_KEY },
        create: { key: SUCCESS_KEY, value: String(Date.now()) },
        update: { value: String(Date.now()) },
      });
    }));
    if (!completed) throw new Error("Another hero sync owns the task lease; retry after it finishes");
  } finally {
    resourceGovernor.stop();
    // disconnect() also stops ioredis reconnect timers if Redis is unavailable.
    redis?.disconnect();
    await prisma.$disconnect();
    process.off("SIGINT", requestStop);
    process.off("SIGTERM", requestStop);
  }
}

void main().catch((error: unknown) => {
  console.error("[sync-heroes] Failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
