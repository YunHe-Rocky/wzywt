export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getOfficialNews, OFFICIAL_NEWS_MAX_AGE_MS } from "@/features/official-news/server/service";

export async function GET() {
  const result = await getOfficialNews();
  const stale = result.timestamp === 0 || Date.now() - result.timestamp >= OFFICIAL_NEWS_MAX_AGE_MS;
  return NextResponse.json(result.items, { headers: stale ? { Warning: '110 - "Response is stale"' } : undefined });
}
