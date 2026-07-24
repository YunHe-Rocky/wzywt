import { startCronWorker } from "@/features/cron/worker";

const worker = startCronWorker();
let stopping = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.log(`[cron] Received ${signal}, stopping...`);
  await worker.stop();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
