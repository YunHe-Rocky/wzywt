import { loadEnvConfig } from "@next/env";

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());
  const [{ syncHeroes }, { prisma }] = await Promise.all([
    import("@/features/heroes/server/sync"),
    import("@/lib/db"),
  ]);
  try {
    const result = await syncHeroes();
    console.log(`[sync-heroes] ${result.inserted} inserted, ${result.updated} updated`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error("[sync-heroes] Failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
