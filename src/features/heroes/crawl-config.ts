import { validateCrawlUrl } from "@/core/crawl-url";
export const DEFAULT_CRAWL_CONFIG = {
  hero_list_page: "https://pvp.qq.com/web201605/herolist.shtml",
  hero_list_json: "https://pvp.qq.com/web201605/js/herolist.json",
  hero_detail_base: "https://pvp.qq.com/web201605/herodetail",
  hero_img_base: "https://game.gtimg.cn/images/yxzj/img201606/heroimg/{id}/{id}.jpg",
  skin_img_base: "https://game.gtimg.cn/images/yxzj/img201606/skin/hero-info/{id}/{id}-bigskin-{idx}.jpg",
};
export type CrawlConfig = typeof DEFAULT_CRAWL_CONFIG;
export type CrawlConfigKey = keyof CrawlConfig;
export const CRAWL_FIELDS: { key: CrawlConfigKey; label: string; description: string; tokens: string[] }[] = [
  { key: "hero_list_json", label: "英雄名单", description: "读取英雄编号、名称和基础资料，通常保留默认地址。", tokens: [] },
  { key: "hero_list_page", label: "备用英雄名单", description: "从官网页面补齐英雄名单，与上面的名单共同使用。", tokens: [] },
  { key: "hero_detail_base", label: "英雄详情目录", description: "填写目录即可，同步时会自动加上英雄编号和页面后缀。", tokens: [] },
  { key: "hero_img_base", label: "英雄头像地址", description: "保留 {id}，系统会把它替换成每位英雄的编号。", tokens: ["id"] },
  { key: "skin_img_base", label: "皮肤图片地址", description: "保留 {id} 和 {idx}，分别代表英雄编号和皮肤序号。", tokens: ["id", "idx"] },
];
export function crawlConfigErrors(config: CrawlConfig): Partial<Record<CrawlConfigKey, string>> {
  const errors: Partial<Record<CrawlConfigKey, string>> = {};
  for (const { key, tokens } of CRAWL_FIELDS) {
    try {
      const value = config[key];
      if (typeof value !== "string" || !value.trim()) throw new Error("请填写地址，或使用这一项的默认值。");
      if (value.length > 2048) throw new Error("地址过长，请检查后重新填写。");
      validateCrawlUrl(value);
      if (tokens.some(token => !value.includes(`{${token}}`))) throw new Error(`地址中需要保留 ${tokens.map(token => `{${token}}`).join(" 和 ")}。`);
      if ([...value.matchAll(/\{([^}]*)\}/g)].some(match => !tokens.includes(match[1]))) throw new Error("地址中包含无法识别的占位符，请参考默认地址。");
    } catch (cause) { errors[key] = cause instanceof Error ? cause.message : "地址无效"; }
  }
  return errors;
}
export function parseCrawlConfig(input: unknown, base: CrawlConfig = DEFAULT_CRAWL_CONFIG): CrawlConfig {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("配置格式无效");
  const config = { ...base };
  for (const { key } of CRAWL_FIELDS) {
    const value = (input as Record<string, unknown>)[key];
    if (value !== undefined) {
      if (typeof value !== "string") throw new TypeError("爬取地址必须是文本");
      config[key] = value.trim();
    }
  }
  const errors = crawlConfigErrors(config);
  for (const { key, label } of CRAWL_FIELDS) if (errors[key]) throw new TypeError(`${label}：${errors[key]}`);
  return config;
}
export function crawlExample(config: CrawlConfig, key: CrawlConfigKey): string {
  const value = config[key].replace(/\{id\}/g, "105").replace(/\{idx\}/g, "1");
  return key === "hero_detail_base" ? `${value.replace(/\/$/, "")}/105.shtml` : value;
}
