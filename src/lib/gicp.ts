import crypto from "crypto";
import { readResponseJson } from "@/lib/http-response";

const SERVICE_ID = 18;
const PC_TOKEN = "234ce0aef3020cb83887883877b64869";
const SOURCE = "web_pc";
const EXCLUSIVE_CHANNEL = "4";
const API_URL = "https://apps.game.qq.com/cmc/cross";

export const GICP_CHANNELS = {
  hot: "1760",
  news: "1761",
  announcement: "1762",
  event: "1763",
  esports: "1764",
} as const;

interface GicpNewsItem {
  sTitle: string;
  sTargetIdxTime: string;
  iId: number;
  sRedirectURL?: string;
  sTitleSub?: string;
}

export interface NewsItem {
  title: string;
  date: string;
  url: string;
}

function md5(s: string): string {
  return crypto.createHash("md5").update(s).digest("hex");
}

export async function fetchGicpNews(
  chanid: string,
  limit: number = 10
): Promise<NewsItem[]> {
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
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0",
    },
    signal: AbortSignal.timeout(10000),
    redirect: "error",
  });

  if (!res.ok) {
    await res.body?.cancel();
    return [];
  }

  const json = (await readResponseJson(res, 2 * 1024 * 1024)) as {
    status: number;
    data: { items: GicpNewsItem[] };
  };
  if (json.status !== 0 || !json.data?.items) return [];

  return json.data.items.map((item) => ({
    title: item.sTitle,
    date: item.sTargetIdxTime.slice(0, 10),
    url:
      item.sRedirectURL ||
      `https://pvp.qq.com/web201706/newsdetail.shtml?id=${item.iId}`,
  }));
}
