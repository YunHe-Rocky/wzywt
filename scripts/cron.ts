import cron from "node-cron";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("[cron] Starting cron jobs...");

  // Initial hero sync (delayed 5s to let DB connect)
  setTimeout(async () => {
    try {
      const { syncHeroes } = await import("../src/lib/heroes/sync");
      console.log("[hero-sync] Running initial sync...");
      const result = await syncHeroes();
      console.log(`[hero-sync] Initial sync: ${result.inserted} inserted, ${result.updated} updated`);
    } catch (err) {
      console.error("[hero-sync] Initial sync failed:", err);
    }
  }, 5000);

  // Daily hero sync at 06:00
  cron.schedule("0 6 * * *", async () => {
    console.log("[hero-sync] Starting daily sync...");
    try {
      const { syncHeroes: sync } = await import("../src/lib/heroes/sync");
      const result = await sync();
      console.log(`[hero-sync] Done: ${result.inserted} inserted, ${result.updated} updated`);
    } catch (err) {
      console.error("[hero-sync] Failed:", err);
    }
  });

  // Deadline checker every minute
  cron.schedule("* * * * *", async () => {
    try {
      const now = new Date();
      const expired = await prisma.tournament.findMany({
        where: { status: "recruiting", deadline: { lte: now } },
        include: { _count: { select: { players: { where: { isSpectator: false } } } } },
      });
      for (const t of expired) {
        console.log(`[deadline] Tournament ${t.id} (${t.name}): ${t._count.players} players, auto-locking`);
        await prisma.tournament.update({ where: { id: t.id }, data: { status: "locked" } });
      }
    } catch {
      // Silently retry next minute
    }
  });

  console.log("[cron] All cron jobs registered");
}

main().catch((err) => {
  console.error("[cron] Fatal error:", err);
  process.exit(1);
});
