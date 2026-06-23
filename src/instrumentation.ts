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

    // Run once on startup
    console.log("[hero-sync] Running initial sync...");
    try {
      const result = await syncHeroes();
      console.log(`[hero-sync] Initial sync: ${result.inserted} inserted, ${result.updated} updated`);
    } catch (err) {
      console.error("[hero-sync] Initial sync failed:", err);
    }
  }
}
