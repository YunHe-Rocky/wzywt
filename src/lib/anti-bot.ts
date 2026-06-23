// Anti-bot bypass with fallback strategies

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

// Tiered fetch: try regular fetch, fall back to Playwright if blocked
export async function fetchWithRetry(
  url: string,
  options: { timeout?: number; referer?: string; isJson?: boolean } = {}
): Promise<{ ok: boolean; status: number; text?: string; json?: unknown }> {
  const { timeout = 10000, referer, isJson } = options;

  // Tier 1: Regular fetch with browser headers
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: getHeaders(referer),
        signal: AbortSignal.timeout(timeout),
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
        console.log(`[anti-bot] ${res.status} on ${url}, waiting ${Math.round(delay / 1000)}s...`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      return { ok: false, status: res.status };
    } catch (e) {
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      return { ok: false, status: 0 };
    }
  }

  // Tier 2: Playwright headless browser (heavy, only as fallback)
  try {
    // eslint-disable-next-line
    const pw = require("playwright") as any;
    const browser = await pw.chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders(getHeaders(referer));

    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: timeout * 2,
    });

    const status = response?.status() || 0;
    const text = await page.content();
    await browser.close();

    return { ok: status >= 200 && status < 300, status, text };
  } catch {
    return { ok: false, status: 0 };
  }
}
