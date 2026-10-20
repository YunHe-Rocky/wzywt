/** Official crawl targets shared by configuration and HTTP clients. */
export function validateCrawlUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new TypeError("爬取地址格式无效"); }
  if (url.protocol !== "https:" || url.username || url.password || !["pvp.qq.com", "game.gtimg.cn"].includes(url.hostname.toLowerCase()))
    throw new TypeError("爬取地址仅允许受信任的 HTTPS 官方域名");
  return value.trim();
}
