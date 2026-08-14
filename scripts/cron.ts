import type { CronWorker } from "@/features/cron/worker";

let worker: CronWorker | null = null;
let stopping = false;

async function bootstrap(): Promise<void> {
  const { startCronWorker } = await import("@/features/cron/worker");
  worker = startCronWorker();
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.log(`[cron] Received ${signal}, stopping...`);
  try {
    await worker?.stop();
    process.exit(0);
  } catch (error) {
    console.error("[cron] shutdown failed", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

void bootstrap().catch((error) => {
  console.error("[cron] bootstrap failed", error instanceof Error ? error.message : error);
  process.exit(1);
});
