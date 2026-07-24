import { syncHeroes } from "@/features/heroes/server/sync";
import { prisma } from "@/lib/db";

async function main(): Promise<void> {
  const result = await syncHeroes();
  console.log(`[sync-heroes] ${result.inserted} inserted, ${result.updated} updated`);
}

main()
  .catch((error: unknown) => {
    console.error("[sync-heroes] Failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

