import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const FALLBACK_NEWS = [
  { title: "版本更新公告", date: new Date().toISOString().slice(0, 10), url: "https://pvp.qq.com/" },
  { title: "新英雄上线", date: new Date().toISOString().slice(0, 10), url: "https://pvp.qq.com/" },
  { title: "赛季活动公告", date: new Date().toISOString().slice(0, 10), url: "https://pvp.qq.com/" },
];

function extractNewsFromHtml(html: string): { title: string; date: string; url: string }[] {
  const items: { title: string; date: string; url: string }[] = [];
  const seen = new Set<string>();
  const linkPattern = /<a[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const datePattern = /(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/;

  let match;
  while ((match = linkPattern.exec(html)) !== null) {
    const rawHref = match[1];
    const innerHtml = match[2];
    if (!rawHref || rawHref === "#" || rawHref.startsWith("javascript:")) continue;
    if (rawHref.startsWith("http") && !rawHref.includes("pvp.qq.com") && !rawHref.includes("qq.com")) continue;

    const title = innerHtml.replace(/<[^>]*>/g, "").trim();
    if (title.length < 4 || title.length > 80) continue;
    if (seen.has(title)) continue;
    seen.add(title);

    let url = rawHref;
    if (url.startsWith("//")) url = "https:" + url;
    else if (url.startsWith("/")) url = "https://pvp.qq.com" + url;
    else if (!url.startsWith("http")) url = "https://pvp.qq.com/" + url;

    const ctxStart = Math.max(0, match.index - 300);
    const context = html.slice(ctxStart, match.index + match[0].length);
    const dateMatch = context.match(datePattern);
    const date = dateMatch ? dateMatch[1].replace(/[./]/g, "-") : new Date().toISOString().slice(0, 10);

    items.push({ title, date, url });
    if (items.length >= 10) break;
  }
  return items;
}

async function scrapeWithPlaywright(): Promise<{ title: string; date: string; url: string }[] | null> {
  try {
    const pw = require("playwright") as any;
    const browser = await pw.chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto("https://pvp.qq.com/", {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });
    await page.waitForTimeout(5000);
    const html = await page.content();
    await browser.close();
    return extractNewsFromHtml(html);
  } catch {
    return null;
  }
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

    // 缓存未命中 — 尝试 Playwright 渲染 SPA
    const items = await scrapeWithPlaywright();
    if (items && items.length > 0) {
      await prisma.$executeRawUnsafe(
        "INSERT INTO kv_cache (`key`, `value`) VALUES ('official_news', ?) ON DUPLICATE KEY UPDATE `value` = ?",
        JSON.stringify(items), JSON.stringify(items)
      );
      return NextResponse.json(items);
    }

    // Playwright 不可用 — 尝试简单 HTTP 抓取
    try {
      const res = await fetch("https://pvp.qq.com/", {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0" },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const html = await res.text();
        const newsItems = extractNewsFromHtml(html);
        if (newsItems.length > 0) {
          await prisma.$executeRawUnsafe(
            "INSERT INTO kv_cache (`key`, `value`) VALUES ('official_news', ?) ON DUPLICATE KEY UPDATE `value` = ?",
            JSON.stringify(newsItems), JSON.stringify(newsItems)
          );
          return NextResponse.json(newsItems);
        }
      }
    } catch { /* fall through */ }
  } catch { /* fall through */ }

  return NextResponse.json(FALLBACK_NEWS);
}
