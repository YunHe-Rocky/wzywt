// HTTP retry strategy with rotating browser headers; no browser fallback.

const ALLOWED_CRAWL_HOSTS = new Set(["pvp.qq.com", "game.gtimg.cn"]);

export function validateCrawlUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("爬取地址格式无效");
  }
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || !ALLOWED_CRAWL_HOSTS.has(url.hostname.toLowerCase())
  ) {
    throw new TypeError("爬取地址仅允许受信任的 HTTPS 官方域名");
  }
  // 保留 `{id}` 等受控路径模板，URL 对象仅用于协议和主机校验。
  return value.trim();
}

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
];

let uaIndex = 0;

export function getHeaders(referer?: string) {
  const ua = USER_AGENTS[uaIndex % USER_AGENTS.length];
  uaIndex++;
  return {
    "User-Agent": ua,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Cache-Control": "no-cache",
    ...(referer ? { Referer: referer } : {}),
  };
}

export function getRandomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export async function fetchWithRetry(
  url: string,
  options: { timeout?: number; referer?: string; isJson?: boolean } = {}
): Promise<{ ok: boolean; status: number; text?: string; json?: unknown }> {
  const { timeout = 10000, referer, isJson } = options;
  const safeUrl = validateCrawlUrl(url);

  // Tier 1: Regular fetch with rotating browser headers (5 retries)
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      // Rotate UA on each retry
      const ua = getRandomUA();
      const headers = {
        ...getHeaders(referer),
        "User-Agent": ua,
      };
      const res = await fetch(safeUrl, {
        headers,
        signal: AbortSignal.timeout(timeout),
        redirect: "error",
      });

      if (res.ok) {
        return {
          ok: true,
          status: res.status,
          text: isJson ? undefined : await res.text(),
          json: isJson ? await res.json() : undefined,
        };
      }

      // 403/429/503 → rate limited or blocked, wait and retry
      if (res.status === 403 || res.status === 429 || res.status === 503) {
        const delay = (attempt + 1) * 3000 + Math.random() * 2000;
        console.log(`[anti-bot] ${res.status} on ${safeUrl}, waiting ${Math.round(delay / 1000)}s...`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      return { ok: false, status: res.status };
    } catch (e) {
      if (attempt < 4) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      return { ok: false, status: 0 };
    }
  }

  // All retries exhausted
  console.error(`[anti-bot] All retries failed for ${safeUrl}`);
  return { ok: false, status: 0 };
}
