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

  // Hourly hero check: lightweight monitor → full sync if changed
  async function hourlyCheck() {
    try {
      const { runAllMonitors, runMonitorAndScrape } = await import("../src/lib/monitor");
      const results = await runAllMonitors();
      const changed = results.filter(r => r.changed);
      if (changed.length > 0) {
        console.log(`[hero-monitor] Changes detected: ${changed.map(c => `${c.module}:${c.detail}`).join(", ")}`);
        const events = await runMonitorAndScrape(changed.map(c => c.module));
        for (const e of events) {
          console.log(`[hero-monitor] ${e.module} ${e.action}: ${e.detail}`);
        }
        // Also download images if heroes/skins changed
        if (changed.some(c => c.module === "heroes" || c.module === "skins")) {
          try {
            const { downloadAllImages } = await import("../src/lib/heroes/download-images");
            const imgResult = await downloadAllImages();
            console.log(`[hero-monitor] Images: ${imgResult.heroes} hero + ${imgResult.skins} skins downloaded`);
          } catch (e) { console.error("[hero-monitor] Image download failed:", e); }
        }
      }
    } catch (err) {
      console.error("[hero-monitor] Hourly check failed:", err);
    }
  }

  // Daily full sync at 06:00 (unconditional, no monitor needed)
  cron.schedule("0 6 * * *", async () => {
    console.log("[hero-sync] Starting daily full sync...");
    try {
      const { syncHeroes: sync } = await import("../src/lib/heroes/sync");
      const result = await sync();
      console.log(`[hero-sync] Done: ${result.inserted} inserted, ${result.updated} updated`);
    } catch (err) {
      console.error("[hero-sync] Failed:", err);
    }
  });

  // Monitor every 3 minutes (lightweight: 1 JSON fetch + DB compare, only syncs if changes detected)
  hourlyCheck(); // Run on startup
  cron.schedule("*/3 * * * *", hourlyCheck);

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
