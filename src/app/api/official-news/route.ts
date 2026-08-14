export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchGicpNews, GICP_CHANNELS } from "@/lib/gicp";

const CACHE_KEY = "official_news";
const CACHE_TTL = 3600000; // 1 hour

export async function GET() {
  let staleItems: unknown[] = [];
  try {
    const cacheRow = await prisma.kvCache.findUnique({ where: { key: CACHE_KEY } });

    if (cacheRow) {
      try {
        const cached = JSON.parse(cacheRow.value) as { timestamp?: unknown; items?: unknown };
        if (Array.isArray(cached.items)) staleItems = cached.items;
        if (typeof cached.timestamp === "number" && Date.now() - cached.timestamp < CACHE_TTL) {
          return NextResponse.json(staleItems);
        }
      } catch {
        console.warn("[official-news] ignored malformed cache entry");
      }
    }
  } catch (error) {
    console.warn("[official-news] cache read failed", error instanceof Error ? error.message : error);
  }

  try {
    // Fetch from both announcement and news channels
    const [announcements, news] = await Promise.all([
      fetchGicpNews(GICP_CHANNELS.announcement, 5),
      fetchGicpNews(GICP_CHANNELS.news, 5),
    ]);

    // Merge, deduplicate, sort by date desc
    const seen = new Set<string>();
    const merged = [...announcements, ...news]
      .filter((item) => {
        if (seen.has(item.title)) return false;
        seen.add(item.title);
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10);

    if (merged.length > 0) {
      const cacheData = { items: merged, timestamp: Date.now() };
      const value = JSON.stringify(cacheData);
      await prisma.kvCache.upsert({
        where: { key: CACHE_KEY },
        update: { value },
        create: { key: CACHE_KEY, value },
      });
      return NextResponse.json(merged);
    }
  } catch (error) {
    console.warn("[official-news] upstream refresh failed", error instanceof Error ? error.message : error);
  }

  return NextResponse.json(staleItems, {
    headers: staleItems.length > 0 ? { Warning: '110 - "Response is stale"' } : undefined,
  });
}
