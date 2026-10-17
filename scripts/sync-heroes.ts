import { createRequire } from "node:module";

const { loadEnvConfig } = createRequire(import.meta.url)("@next/env") as typeof import("@next/env");
async function main(): Promise<void> {
  loadEnvConfig(process.cwd());
  process.env.APP_ROLE = "job";
  const { resourceGovernor } = await import("@/lib/resource-governor");
  const { runExclusiveTask } = await import("@/features/cron/task-lock");
  const [{ syncHeroes }, { prisma }, { redis }] = await Promise.all([
    import("@/features/heroes/server/sync"),
    import("@/lib/db"),
    import("@/lib/redis"),
  ]);
  const stop = () => resourceGovernor.stop();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    const completed = await resourceGovernor.run("hero-sync:manual", () => runExclusiveTask("hero-pipeline", 2 * 60 * 60 * 1000, async () => {
      const result = await syncHeroes();
      console.log(`[sync-heroes] ${result.inserted} inserted, ${result.updated} updated`);
    }));
    if (!completed) throw new Error("Another hero sync owns the task lease; retry after it finishes");
  } finally {
    resourceGovernor.stop();
    redis?.disconnect();
    await prisma.$disconnect();
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
}

void main().catch((error: unknown) => {
  console.error("[sync-heroes] Failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
