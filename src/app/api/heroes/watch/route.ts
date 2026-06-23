import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

const HEROLIST_URL = "https://pvp.qq.com/web201605/js/herolist.json";

const clients: ReadableStreamController<Uint8Array>[] = [];

function broadcast(data: object) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (let i = clients.length - 1; i >= 0; i--) {
    try { clients[i].enqueue(new TextEncoder().encode(msg)); } catch { clients.splice(i, 1); }
  }
}

async function checkChanges() {
  try {
    const res = await fetch(HEROLIST_URL, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return [];
    const official: { ename: number; cname: string; title: string; hero_type: number; hero_type2?: number }[] = await res.json();

    const dbHeroes = await prisma.hero.findMany({
      select: { heroId: true, name: true, title: true, heroType: true, heroType2: true },
    });
    const dbMap = new Map(dbHeroes.map((h) => [h.heroId, h]));

    const changes: { heroId: number; name: string }[] = [];
    for (const h of official) {
      const db = dbMap.get(h.ename);
      if (!db) {
        console.log(`[watch] New hero: ${h.ename} ${h.cname}`);
        continue;
      }
      // Check for any change in official data
      if (db.name !== h.cname || db.title !== h.title || db.heroType !== h.hero_type || db.heroType2 !== (h.hero_type2 ?? 0)) {
        await prisma.hero.update({
          where: { heroId: h.ename },
          data: {
            name: h.cname,
            title: h.title,
            heroType: h.hero_type,
            heroType2: h.hero_type2 ?? 0,
          },
        });
        changes.push({ heroId: h.ename, name: h.cname });
      }
    }
    return changes;
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const stream = new ReadableStream({
    async start(controller) {
      clients.push(controller);

      controller.enqueue(new TextEncoder().encode("data: {\"type\":\"connected\"}\n\n"));

      const interval = setInterval(async () => {
        const changes = await checkChanges();
        if (changes.length > 0) {
          broadcast({ type: "heroes-updated", changes });
        }
      }, 60000); // Check every 60s

      // Initial check after 5s
      setTimeout(async () => {
        const changes = await checkChanges();
        if (changes.length > 0) {
          broadcast({ type: "heroes-updated", changes });
        }
      }, 5000);

      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        const idx = clients.indexOf(controller);
        if (idx >= 0) clients.splice(idx, 1);
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
