import { NextRequest } from "next/server";
import { addClient, removeClient, broadcastHeroUpdate } from "@/lib/sse/heroes";
import { runAllMonitors, runMonitorAndScrape } from "@/lib/monitor";

let cycleCount = 0;

export async function GET(req: NextRequest) {
  const stream = new ReadableStream({
    async start(controller) {
      addClient(controller);

      const send = (data: object) => {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      send({ type: "connected", modules: ["news", "heroes", "skins"] });

      // Run full cycle: check → detect changes → scrape → broadcast
      const runCycle = async () => {
        cycleCount++;
        // 1. Check all modules (lightweight, no scraping)
        const checks = await runAllMonitors();
        send({ type: "monitor-check", cycle: cycleCount, results: checks });

        // 2. For any changed module, trigger the scraper
        const changed = checks.filter((c) => c.changed);
        if (changed.length > 0) {
          send({ type: "scrape-triggered", modules: changed.map((c) => c.module) });

          const events = await runMonitorAndScrape();
          send({ type: "scrape-result", events });

          // Broadcast hero updates if heroes changed
          const heroUpdates = events.filter((e) => e.module === "heroes" && e.action === "scrape-done");
          if (heroUpdates.length > 0) {
            const changes = heroUpdates.map((e) => ({ heroId: 0, name: e.detail }));
            broadcastHeroUpdate(changes);
          }
        } else {
          send({ type: "monitor-idle", cycle: cycleCount });
        }
      };

      // Initial cycle after 5s
      setTimeout(runCycle, 5000);

      // Periodic check every 60s
      const interval = setInterval(runCycle, 60000);

      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        removeClient(controller);
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
