import cron from "node-cron";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { syncHeroes } = await import("./lib/hero-sync");

    cron.schedule("0 6 * * *", async () => {
      console.log("[hero-sync] Starting daily sync...");
      try {
        const result = await syncHeroes();
        console.log(`[hero-sync] Done: ${result.inserted} inserted, ${result.updated} updated`);
      } catch (err) {
        console.error("[hero-sync] Failed:", err);
      }
    });

    // Initial hero sync on startup
    console.log("[hero-sync] Running initial sync...");
    try {
      const result = await syncHeroes();
      console.log(`[hero-sync] Initial sync: ${result.inserted} inserted, ${result.updated} updated`);
    } catch (err) {
      console.error("[hero-sync] Initial sync failed:", err);
    }

    // Check tournament deadlines every minute
    cron.schedule("* * * * *", async () => {
      const { prisma: db } = await import("./lib/db");
      const now = new Date();

      const expired = await db.tournament.findMany({
        where: { status: "recruiting", deadline: { lte: now } },
        include: { _count: { select: { players: { where: { isSpectator: false } } } } },
      });

      for (const t of expired) {
        console.log(`[deadline] Tournament ${t.id} (${t.name}): ${t._count.players} players, auto-locking`);
        await db.tournament.update({ where: { id: t.id }, data: { status: "locked" } });
      }
    });
  }
}
