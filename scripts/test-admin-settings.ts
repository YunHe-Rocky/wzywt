import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as configModel from "../src/features/heroes/crawl-config";
import { validateCrawlUrl } from "../src/core/crawl-url";
import { ServiceError } from "../src/lib/service-error";

function load(file: string, dependencies: Record<string, unknown>) {
  const compiled = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const instance = { exports: {} as Record<string, (...args: unknown[]) => Promise<unknown>> };
  new Function("require", "module", "exports", compiled)((name: string) => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`);
    return dependencies[name];
  }, instance, instance.exports);
  return instance.exports;
}

async function main() {
  const { DEFAULT_CRAWL_CONFIG, parseCrawlConfig, crawlExample } = configModel;
  assert.deepEqual(parseCrawlConfig({}), DEFAULT_CRAWL_CONFIG);
  for (const value of [null, [], "text"]) assert.throws(() => parseCrawlConfig(value));
  for (const url of ["http://pvp.qq.com/x", "https://pvp.qq.com.evil.invalid/x", "https://user:pass@pvp.qq.com/x", "https://127.0.0.1/x"]) assert.throws(() => validateCrawlUrl(url));
  assert.throws(() => parseCrawlConfig({ hero_img_base: "https://game.gtimg.cn/avatar.jpg" }), /id/);
  assert.throws(() => parseCrawlConfig({ skin_img_base: "https://game.gtimg.cn/{id}/{skin}.jpg" }), /idx/);
  assert.throws(() => parseCrawlConfig({ hero_list_json: "" }));
  assert.equal(crawlExample(DEFAULT_CRAWL_CONFIG, "hero_detail_base"), "https://pvp.qq.com/web201605/herodetail/105.shtml");
  assert.equal(crawlExample(DEFAULT_CRAWL_CONFIG, "skin_img_base").includes("105-bigskin-1.jpg"), true);
  let row: { value: string } | null = null; let writes = 0;
  const database = { kvCache: {
    async findUnique() { return row; },
    async upsert(input: { create: { value: string }; update: { value: string } }) { writes++; row = { value: row ? input.update.value : input.create.value }; },
  } };
  const config = load("src/features/heroes/server/crawl-config.ts", {
    "@/lib/db": { prisma: database }, "@/core/crawl-url": { validateCrawlUrl }, "@/features/heroes/crawl-config": configModel,
  });
  const settings = load("src/features/admin/server/settings.ts", {
    "@/lib/db": { prisma: database }, "@/lib/service-error": { ServiceError },
    "@/features/heroes/crawl-config": configModel, "@/features/heroes/server/crawl-config": config,
  });
  await settings.saveAdminCrawlSettings({ hero_img_base: "https://game.gtimg.cn/custom/{id}.jpg" });
  await settings.saveAdminCrawlSettings({ hero_list_json: "https://pvp.qq.com/custom/herolist.json" });
  const saved = await config.getCrawlConfig() as configModel.CrawlConfig;
  assert.equal(saved.hero_img_base, "https://game.gtimg.cn/custom/{id}.jpg", "partial saves must preserve other saved fields");
  assert.equal(saved.hero_list_json, "https://pvp.qq.com/custom/herolist.json");
  await assert.rejects(() => settings.saveAdminCrawlSettings({ hero_img_base: "https://evil.invalid/{id}.jpg" }), /官方域名/);
  assert.equal(writes, 2, "invalid configuration must not write to storage");
  assert.deepEqual(await settings.readAdminCrawlSettings(), { settings: saved });
  console.log("PASS admin settings: trusted sources, template validation, persisted partial updates and sync configuration readback");
}
void main().catch(cause => { console.error(cause); process.exitCode = 1; });
