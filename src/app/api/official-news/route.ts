import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const FALLBACK_NEWS = [
  { title: "新赛季更新公告", date: new Date().toISOString().slice(0, 10), url: "https://pvp.qq.com/web201605/news.shtml" },
];

function isValidUrl(url: string): boolean {
  if (!url || url === "#" || url.startsWith("javascript:")) return false;
  return true;
}

function resolveUrl(href: string): string {
  if (!href) return "#";
  if (href.startsWith("http")) return href;
  if (href.startsWith("//")) return "https:" + href;
  if (href.startsWith("/")) return "https://pvp.qq.com" + href;
  return "https://pvp.qq.com/web201605/" + href;
}

function extractNewsFromHtml(html: string): { title: string; date: string; url: string }[] {
  const items: { title: string; date: string; url: string }[] = [];
  const seen = new Set<string>();

  // Try to find news items by looking for link patterns near date patterns
  // Strategy: find all links with reasonable href, then try to extract date from nearby context
  const linkPattern = /<a[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const datePattern = /(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/;

  let linkMatch;
  while ((linkMatch = linkPattern.exec(html)) !== null) {
    const rawHref = linkMatch[1];
    const innerHtml = linkMatch[2];

    if (!isValidUrl(rawHref)) continue;

    // Extract text from inner HTML (strip tags)
    const title = innerHtml.replace(/<[^>]*>/g, "").trim();
    if (title.length < 4 || title.length > 100) continue;

    // Skip duplicates
    if (seen.has(title)) continue;
    seen.add(title);

    const url = resolveUrl(rawHref);

    // Try to find date in ~300 chars before the link
    const contextStart = Math.max(0, linkMatch.index - 300);
    const context = html.slice(contextStart, linkMatch.index + linkMatch[0].length);
    const dateMatch = context.match(datePattern);
    const date = dateMatch ? dateMatch[1].replace(/[./]/g, "-") : new Date().toISOString().slice(0, 10);

    items.push({ title, date, url });
    if (items.length >= 10) break;
  }

  return items;
}

export async function GET() {
  try {
    // 从缓存读取
    const cacheRow = await prisma.$queryRawUnsafe(
      "SELECT `value` FROM kv_cache WHERE `key` = 'official_news'"
    ) as { value: string }[];

    if (cacheRow.length > 0) {
      const news = JSON.parse(cacheRow[0].value);
      return NextResponse.json(news);
    }

    // 缓存未命中，执行一次爬取
    const { fetchWithRetry } = await import("@/lib/anti-bot");
    const res = await fetchWithRetry("https://pvp.qq.com/web201605/newslist.shtml", {
      timeout: 8000,
      referer: "https://pvp.qq.com/",
    });

    if (res.ok && res.text) {
      const newsItems = extractNewsFromHtml(res.text);

      if (newsItems.length > 0) {
        await prisma.$executeRawUnsafe(
          "INSERT INTO kv_cache (`key`, `value`) VALUES ('official_news', ?) ON DUPLICATE KEY UPDATE `value` = ?",
          JSON.stringify(newsItems), JSON.stringify(newsItems)
        );
        return NextResponse.json(newsItems);
      }
    }
  } catch {
    // Fall through to fallback
  }

  return NextResponse.json(FALLBACK_NEWS);
}
