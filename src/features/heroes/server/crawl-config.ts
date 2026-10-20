import { prisma } from "@/lib/db";
import { validateCrawlUrl } from "@/core/crawl-url";
import { DEFAULT_CRAWL_CONFIG, type CrawlConfig } from "@/features/heroes/crawl-config";
export const CRAWL_CONFIG_KEY = "config:crawl_urls";
export async function getCrawlConfig(): Promise<CrawlConfig> {
  const row = await prisma.kvCache.findUnique({ where: { key: CRAWL_CONFIG_KEY } });
  if (!row) return { ...DEFAULT_CRAWL_CONFIG };
  try {
    const saved: unknown = JSON.parse(row.value);
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) throw new TypeError("invalid crawl configuration");
    const config = { ...DEFAULT_CRAWL_CONFIG };
    for (const key of Object.keys(config) as (keyof CrawlConfig)[]) {
      const value = (saved as Record<string, unknown>)[key];
      if (value !== undefined) {
        if (typeof value !== "string") throw new TypeError("invalid crawl address");
        config[key] = validateCrawlUrl(value);
      }
    }
    return config;
  } catch {
    console.warn("[sync] invalid crawl configuration; using trusted defaults");
    return { ...DEFAULT_CRAWL_CONFIG };
  }
}
