import { fetchGicpNews, GICP_CHANNELS } from "@/lib/gicp";
import { prisma } from "@/lib/db";

const CACHE_KEY = "official_news";
export const OFFICIAL_NEWS_MAX_AGE_MS = 60 * 60 * 1000;

export interface OfficialNewsItem {
  title: string;
  date: string;
  url: string;
}

interface NewsCache {
  timestamp: number;
  items: OfficialNewsItem[];
}

function parseCache(value: string): NewsCache | null {
  try {
    const parsed = JSON.parse(value) as Partial<NewsCache>;
    if (!Number.isFinite(parsed.timestamp) || !Array.isArray(parsed.items)) return null;
    return { timestamp: parsed.timestamp!, items: parsed.items as OfficialNewsItem[] };
  } catch {
    return null;
  }
}

export async function refreshOfficialNews(): Promise<NewsCache> {
  const [announcements, news] = await Promise.all([
    fetchGicpNews(GICP_CHANNELS.announcement, 5),
    fetchGicpNews(GICP_CHANNELS.news, 5),
  ]);
  const seen = new Set<string>();
  const items = [...announcements, ...news]
    .filter((item) => !seen.has(item.title) && Boolean(seen.add(item.title)))
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, 10);
  if (items.length === 0) throw new Error("官方资讯上游返回空数据");
  const cache = { timestamp: Date.now(), items };
  const value = JSON.stringify(cache);
  await prisma.kvCache.upsert({
    where: { key: CACHE_KEY },
    update: { value },
    create: { key: CACHE_KEY, value },
  });
  return cache;
}

export async function getOfficialNews(): Promise<NewsCache> {
  let stale: NewsCache | null = null;
  try {
    const row = await prisma.kvCache.findUnique({ where: { key: CACHE_KEY } });
    stale = row ? parseCache(row.value) : null;
    if (stale && Date.now() - stale.timestamp < OFFICIAL_NEWS_MAX_AGE_MS) return stale;
  } catch (error) {
    console.warn("[official-news] cache read failed", error instanceof Error ? error.message : error);
  }
  try {
    return await refreshOfficialNews();
  } catch (error) {
    console.warn("[official-news] upstream refresh failed", error instanceof Error ? error.message : error);
    return stale ?? { timestamp: 0, items: [] };
  }
}
