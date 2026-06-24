import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchGicpNews, GICP_CHANNELS } from "@/lib/gicp";

const CACHE_KEY = "official_news";
const CACHE_TTL = 3600000; // 1 hour

export async function GET() {
  try {
    const cacheRow = (await prisma.$queryRawUnsafe(
      "SELECT `value` FROM kv_cache WHERE `key` = ?",
      CACHE_KEY
    )) as { value: string }[];

    if (cacheRow.length > 0) {
      const cached = JSON.parse(cacheRow[0].value);
      if (cached.timestamp && Date.now() - cached.timestamp < CACHE_TTL) {
        return NextResponse.json(cached.items);
      }
    }

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
      await prisma.$executeRawUnsafe(
        "INSERT INTO kv_cache (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?",
        CACHE_KEY,
        JSON.stringify(cacheData),
        JSON.stringify(cacheData)
      );
      return NextResponse.json(merged);
    }
  } catch {
    /* fall through to empty */
  }

  return NextResponse.json([]);
}
