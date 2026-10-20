import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/service-error";
import { parseCrawlConfig } from "@/features/heroes/crawl-config";
import { CRAWL_CONFIG_KEY, getCrawlConfig } from "@/features/heroes/server/crawl-config";
export async function readAdminCrawlSettings() { return { settings: await getCrawlConfig() }; }
export async function saveAdminCrawlSettings(input: unknown) {
  const current = await getCrawlConfig();
  let settings;
  try { settings = parseCrawlConfig(input, current); }
  catch (cause) { throw new ServiceError("VALIDATION_ERROR", cause instanceof Error ? cause.message : "配置格式无效"); }
  const value = JSON.stringify(settings);
  await prisma.kvCache.upsert({ where: { key: CRAWL_CONFIG_KEY }, update: { value }, create: { key: CRAWL_CONFIG_KEY, value } });
  return { ok: true, settings };
}
