import cron from "node-cron";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Delay initial sync to let the server finish starting
  setTimeout(async () => {
    try {
      const { syncHeroes } = await import("./lib/hero-sync");
      console.log("[hero-sync] Running initial sync...");
      const result = await syncHeroes();
      console.log(`[hero-sync] Initial sync: ${result.inserted} inserted, ${result.updated} updated`);

      // Daily hero sync at 06:00
      cron.schedule("0 6 * * *", async () => {
        console.log("[hero-sync] Starting daily sync...");
        try {
          const result = await syncHeroes();
          console.log(`[hero-sync] Done: ${result.inserted} inserted, ${result.updated} updated`);
        } catch (err) {
          console.error("[hero-sync] Failed:", err);
        }
      });
    } catch (err) {
      console.error("[hero-sync] Setup failed:", err);
    }
  }, 5000);

  // Deadline checker every minute
  try {
    cron.schedule("* * * * *", async () => {
      try {
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
      } catch (err) {
        // Silently retry next minute
      }
    });
  } catch (err) {
    console.error("[deadline] Cron setup failed:", err);
  }
}
