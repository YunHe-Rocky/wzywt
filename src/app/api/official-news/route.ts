import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const FALLBACK_NEWS = [
  { title: "新赛季更新公告", date: new Date().toISOString().slice(0, 10), url: "https://pvp.qq.com/web201605/news.shtml" },
];

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
      const html = res.text;
      const newsItems: { title: string; date: string; url: string }[] = [];
      const linkRegex = /<a[^>]*href="([^"]*)"[^>]*>([^<]{4,})<\/a>/g;
      let match;
      while ((match = linkRegex.exec(html)) !== null) {
        const href = match[1];
        const title = match[2].trim();
        if (title.length < 4) continue;
        let url = href;
        if (url && !url.startsWith("http")) {
          url = url.startsWith("/") ? `https://pvp.qq.com${url}` : `https://pvp.qq.com/web201605/${url}`;
        }
        const contextStart = Math.max(0, match.index - 200);
        const context = html.slice(contextStart, match.index);
        const dateMatch = context.match(/(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/);
        const date = dateMatch ? dateMatch[1].replace(/[./]/g, "-") : new Date().toISOString().slice(0, 10);
        newsItems.push({ title, date, url });
        if (newsItems.length >= 10) break;
      }

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
