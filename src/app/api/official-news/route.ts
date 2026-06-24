import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import crypto from "crypto";

function md5(s: string): string {
  return crypto.createHash("md5").update(s).digest("hex");
}

interface GicpNewsItem {
  sTitle: string;
  sTargetIdxTime: string;
  iId: number;
  sRedirectURL?: string;
}

const SERVICE_ID = 18;
const PC_TOKEN = "234ce0aef3020cb83887883877b64869";
const SOURCE = "web_pc";
const EXCLUSIVE_CHANNEL = "4";
const API_URL = "https://apps.game.qq.com/cmc/cross";

async function fetchNewsChannel(chanid: string, limit: number = 5): Promise<{ title: string; date: string; url: string }[]> {
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = md5(PC_TOKEN + SOURCE + SERVICE_ID + timestamp);

  const params = new URLSearchParams({
    serviceId: String(SERVICE_ID),
    filter: "channel",
    sortby: "sIdxTime",
    source: SOURCE,
    limit: String(limit),
    logic: "or",
    typeids: "1",
    withtop: "yes",
    chanid,
    start: "0",
    exclusiveChannel: EXCLUSIVE_CHANNEL,
    exclusiveChannelSign: sign,
    time: String(timestamp),
  });

  const res = await fetch(`${API_URL}?${params}`, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0" },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) return [];

  const json = await res.json() as { status: number; data: { items: GicpNewsItem[] } };
  if (json.status !== 0 || !json.data?.items) return [];

  return json.data.items.map((item) => ({
    title: item.sTitle,
    date: item.sTargetIdxTime.slice(0, 10),
    url: item.sRedirectURL || `https://pvp.qq.com/web201706/newsdetail.shtml?id=${item.iId}`,
  }));
}

export async function GET() {
  try {
    // 从缓存读取 (1 小时有效)
    const cacheRow = await prisma.$queryRawUnsafe(
      "SELECT `value` FROM kv_cache WHERE `key` = 'official_news'"
    ) as { value: string }[];

    if (cacheRow.length > 0) {
      const cached = JSON.parse(cacheRow[0].value);
      // Check if cache is within 1 hour
      if (cached.timestamp && Date.now() - cached.timestamp < 3600000) {
        return NextResponse.json(cached.items);
      }
    }

    // Fetch from both announcement and news channels
    const [announcements, news] = await Promise.all([
      fetchNewsChannel("1762", 5), // 公告
      fetchNewsChannel("1761", 5), // 新闻
    ]);

    // Merge, deduplicate by title, sort by date desc
    const seen = new Set<string>();
    const merged: { title: string; date: string; url: string }[] = [];
    for (const item of [...announcements, ...news]) {
      if (seen.has(item.title)) continue;
      seen.add(item.title);
      merged.push(item);
    }
    merged.sort((a, b) => b.date.localeCompare(a.date));
    const items = merged.slice(0, 10);

    if (items.length > 0) {
      const cacheData = { items, timestamp: Date.now() };
      await prisma.$executeRawUnsafe(
        "INSERT INTO kv_cache (`key`, `value`) VALUES ('official_news', ?) ON DUPLICATE KEY UPDATE `value` = ?",
        JSON.stringify(cacheData), JSON.stringify(cacheData)
      );
      return NextResponse.json(items);
    }
  } catch { /* fall through to cache or empty */ }

  return NextResponse.json([]);
}
