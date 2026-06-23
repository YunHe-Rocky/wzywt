import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

const FALLBACK_NEWS = [
  { title: "新英雄大禹上线", date: "2026-01-08", url: "https://pvp.qq.com/ingame/all/tobe/newheros/dayu.html" },
  { title: "元流之子系列上线", date: "2025-12", url: "https://pvp.qq.com/web201605/herolist.shtml" },
  { title: "赛季更新公告", date: "2026-01", url: "https://pvp.qq.com/web201605/news.shtml" },
];

export async function GET() {
  try {
    const res = await fetch("https://pvp.qq.com/web201605/newslist.shtml", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Referer": "https://pvp.qq.com/",
        "Cache-Control": "no-cache",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const html = await res.text();
    const $ = cheerio.load(html);

    const news: { title: string; date: string; url: string }[] = [];

    $(".news-list li, .news-item, a[href*='news']").each((_, el) => {
      const $el = $(el);
      const $link = $el.is("a") ? $el : $el.find("a").first();
      const href = $link.attr("href") || "";
      const title = ($link.text() || $el.find(".title, h3, h4").text() || $el.text()).trim();
      const date = ($el.find(".date, .time, span:last-child").text() || "").trim();

      if (!title || title.length < 4) return;

      let url = href;
      if (url && !url.startsWith("http")) {
        url = url.startsWith("/") ? `https://pvp.qq.com${url}` : `https://pvp.qq.com/web201605/${url}`;
      }

      news.push({ title, date: date || "", url: url || "#" });
    });

    if (news.length > 0) {
      return NextResponse.json(news.slice(0, 10));
    }
  } catch {
    // Fall through to fallback data
  }

  return NextResponse.json(FALLBACK_NEWS);
}
