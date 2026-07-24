export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { addClient, removeClient, broadcastHeroUpdate } from "@/features/heroes/server/events";
import { runAllMonitors, runMonitorAndScrape } from "@/features/monitor";

let cycleCount = 0;
let lastScrapeTime = 0;
const SCRAPE_COOLDOWN = 2 * 60 * 60 * 1000; // 2 hours between auto-scrapes
const CHECK_INTERVAL = 5 * 60 * 1000; // 5 min between checks

export async function GET(req: NextRequest) {
  const stream = new ReadableStream({
    async start(controller) {
      addClient(controller);

      const send = (data: object) => {
        try {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {}
      };

      send({ type: "connected" });

      const runCycle = async () => {
        cycleCount++;
        try {
          // 轻量检查（外部 API 对比，不做 DB 全量查询）
          const checks = await runAllMonitors();
          send({ type: "check", cycle: cycleCount, results: checks });

          const changed = checks.filter((c) => c.changed);
          if (changed.length > 0) {
            const now = Date.now();
            const canScrape = now - lastScrapeTime > SCRAPE_COOLDOWN;

            if (canScrape) {
              lastScrapeTime = now;
              const modules = changed.map((c) => c.module);
              send({ type: "scrape-triggered", modules });

              const events = await runMonitorAndScrape(modules);
              send({ type: "scrape-result", events });

              const heroUpdates = events.filter((e) => e.module === "heroes" && e.action === "scrape-done");
              if (heroUpdates.length > 0) {
                broadcastHeroUpdate(heroUpdates.map((e) => ({ heroId: 0, name: e.detail })));
              }
            } else {
              send({ type: "scrape-deferred", reason: "cooldown", modules: changed.map((c) => c.module) });
            }
          }
        } catch (e: any) {
          send({ type: "error", message: e.message });
        }
      };

      setTimeout(runCycle, 5000);
      const interval = setInterval(runCycle, CHECK_INTERVAL);

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
