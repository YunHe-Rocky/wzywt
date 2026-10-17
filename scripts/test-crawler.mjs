import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { test } from "node:test";
import ts from "typescript";
import iconv from "iconv-lite";

const nativeRequire = createRequire(import.meta.url);
const repo = resolve(import.meta.dirname, "..");

function detailHtml(layout, description) {
  const skills = layout === "preview"
    ? `<div class="detail-js"><b>A</b>${description}<br><b>B</b>Second description</div>`
    : layout === "redesigned"
      ? `<b class="skill-name"><b>A</b></b><p class="skill-desc">${description}</p><b class="skill-name"><b>B</b></b><p class="skill-desc">Second description</p>`
      : `<div class="skill-show">${["A", "B", "C"].map(name => `<div class="show-list"><p class="skill-name"><b>${name}</b><span>1</span><span>2</span></p><p class="skill-desc">${description}</p></div>`).join("")}</div>`;
  return `<h1>英雄技能</h1>${skills}<div data-imgname="Base|Variant"></div>`;
}

// Run the real sync, monitor, parsers and bounded HTTP reader. Only replace
// external I/O and unrelated skill enrichment; unexpected imports are refused.
function crawlerFixture({ layout = "standard", namedFallback = false, configuredCatalog = false } = {}) {
  const modules = new Map();
  const rows = new Map();
  const cache = new Map();
  const requests = [];
  const catalogRequests = [];
  const writes = [];
  const upstream = {
    description: "Original description",
    unavailable: false,
    unparseable: false,
    catalogUnavailable: false,
    unavailableCatalogPart: null,
    htmlOnly: [],
    heroes: Array.from({ length: 50 }, (_, index) => ({
      ename: index + 1, cname: `Hero${index + 1}`, title: "Title", hero_type: 1,
      skin_name: "Base|Variant", id_name: `hero${index + 1}`,
    })),
  };
  const detailBase = namedFallback ? "https://pvp.qq.com/custom/herodetail" : "https://pvp.qq.com/web201605/herodetail";
  const catalogBase = configuredCatalog ? "https://pvp.qq.com/custom" : "https://pvp.qq.com/web201605";
  const jsonUrl = `${catalogBase}/${configuredCatalog ? "" : "js/"}herolist.json`;
  const htmlUrl = `${catalogBase}/herolist.shtml`;
  if (namedFallback || configuredCatalog) cache.set("config:crawl_urls", JSON.stringify({
    hero_detail_base: detailBase, hero_list_json: jsonUrl, hero_list_page: htmlUrl,
  }));
  const selectRow = (row, select) => row ? structuredClone(select
    ? Object.fromEntries(Object.keys(select).filter(key => select[key]).map(key => [key, row[key]])) : row) : null;
  const matchingRows = (where) => [...rows.values()].filter(row => !where
    || (where.mingge !== undefined ? row.mingge === where.mingge : where.heroId.in.includes(row.heroId)));
  const prisma = {
    hero: {
      async findUnique({ where, select }) { return selectRow(rows.get(where.heroId), select); },
      async findMany({ where, select } = {}) { return matchingRows(where).map(row => selectRow(row, select)); },
      async count({ where } = {}) { return matchingRows(where).length; },
      async create({ data }) { writes.push(data.heroId); rows.set(data.heroId, structuredClone(data)); },
      async update({ where, data }) { writes.push(where.heroId); Object.assign(rows.get(where.heroId), structuredClone(data)); },
    },
    heroSkill: { async deleteMany() {}, async createMany() {} },
    kvCache: {
      async findUnique({ where }) { return cache.has(where.key) ? { value: cache.get(where.key) } : null; },
      async upsert({ where, create, update }) { cache.set(where.key, cache.has(where.key) ? update.value : create.value); },
      async deleteMany({ where }) { cache.delete(where.key); },
    },
    async $transaction(operations) { return Promise.all(operations); },
  };
  async function fixtureFetch(value, options) {
    const url = new URL(value);
    if (options?.method === "HEAD") return new Response(null, { status: 200 });
    if (url.pathname.endsWith("/herolist.json") || url.pathname.endsWith("/herolist.shtml")) {
      catalogRequests.push(String(url));
      if (upstream.catalogUnavailable || ![jsonUrl, htmlUrl].includes(String(url))) return new Response(null, { status: 404 });
      if ((upstream.unavailableCatalogPart === "json" && String(url) === jsonUrl)
        || (upstream.unavailableCatalogPart === "html" && String(url) === htmlUrl)) return new Response(null, { status: 404 });
      if (String(url) === jsonUrl) return Response.json(upstream.heroes);
      return new Response([...upstream.heroes, ...upstream.htmlOnly].map(hero => `<a href="herodetail/${hero.ename}.shtml">${hero.cname}</a>`).join(""));
    }
    if (url.pathname.endsWith("/item.json")) return Response.json([]);
    if (url.pathname.includes("/herodetail/")) {
      requests.push(String(url));
      if (upstream.unavailable || !String(url).startsWith(`${detailBase}/`)
        || (namedFallback && /\/\d+\.shtml$/.test(url.pathname))) return new Response(null, { status: 404 });
      return new Response(iconv.encode(upstream.unparseable ? "<h1>英雄页面暂不可用</h1>" : detailHtml(layout, upstream.description), "gbk"));
    }
    throw new Error(`Unexpected fixture request: ${url}`);
  }
  const stubs = {
    "@/lib/resource-governor": { resourceCheckpoint: async () => {}, resourceGovernor: { concurrency: () => 2 } },
    "@/lib/db": { prisma },
    "@/lib/redis": { cacheDel: async () => {}, cacheDelPattern: async () => {} },
    "@/lib/gicp": { GICP_CHANNELS: { announcement: "fixture" }, fetchGicpNews: async () => [{ title: "Unchanged" }] },
    "@/core/game": { processSkill: () => ({ extraJson: null }) },
    "@/features/heroes/server/download-images": { downloadAllImages: async () => ({ heroes: 0, skins: 0 }) },
  };
  function load(relative) {
    if (modules.has(relative)) return modules.get(relative).exports;
    const instance = { exports: {} };
    modules.set(relative, instance);
    const compiled = ts.transpileModule(readFileSync(resolve(repo, relative), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    function localRequire(specifier) {
      if (Object.hasOwn(stubs, specifier)) return stubs[specifier];
      if (["crypto", "cheerio", "iconv-lite"].includes(specifier)) return nativeRequire(specifier);
      if (["@/features/heroes/model", "@/features/heroes/server/sync", "@/lib/anti-bot", "@/lib/http-response"].includes(specifier)) {
        return load(`src/${specifier.slice(2)}.ts`);
      }
      throw new Error(`Unmocked import refused: ${specifier}`);
    }
    new Function("require", "module", "exports", "fetch", "console", "Date", compiled)(
      localRequire, instance, instance.exports, fixtureFetch, { log() {}, warn() {}, error() {} },
      class extends Date { static now() { return 0; } },
    );
    return instance.exports;
  }
  const sync = load("src/features/heroes/server/sync.ts");
  const monitor = load("src/features/monitor/index.ts");
  return {
    upstream, rows, requests, catalogRequests, writes,
    sync: () => sync.syncHeroes(),
    async cycle() {
      requests.length = 0;
      catalogRequests.length = 0;
      writes.length = 0;
      const results = await monitor.runAllMonitors();
      const events = await monitor.runMonitorAndScrape(results.filter(item => item.ok && item.changed).map(item => item.module));
      return { results, events };
    },
  };
}

for (const layout of ["standard", "preview", "redesigned"]) {
  test(`unchanged ${layout} pages do not start another full crawl after sync`, async () => {
    const fixture = crawlerFixture({ layout });
    await fixture.sync();
    assert.equal(fixture.rows.size, 50);
    assert.equal(JSON.parse(fixture.rows.get(1).skillsJson)[0].name, "A", "fixture must exercise real skill parsing");
    assert.deepEqual(Object.keys(JSON.parse(fixture.rows.get(1).skinsJson)[0]), ["name", "index", "imageUrls"]);
    for (let round = 0; round < 3; round++) {
      const { results, events } = await fixture.cycle();
      const skills = results.find(result => result.module === "skills");
      assert.equal(skills.ok, true);
      assert.equal(skills.changed, false, "image URLs and parser differences must not create a false skill change");
      assert.equal(fixture.requests.length, 8, "unchanged cycle only fetches its bounded detail sample");
      assert.equal(fixture.catalogRequests.length, 2, "all three checks share one HTML and one JSON catalog fetch");
      assert.equal(fixture.writes.length, 0, "unchanged cycle must not rewrite the hero catalog");
      assert.equal(events.some(event => ["skills", "skins", "heroes"].includes(event.module)), false);
    }
  });
}

test("a real skill change triggers sync once and then settles", async () => {
  const fixture = crawlerFixture();
  await fixture.sync();
  fixture.upstream.description = "Updated description";
  const changed = await fixture.cycle();
  assert.equal(changed.results.find(result => result.module === "skills").changed, true);
  assert.equal(JSON.parse(fixture.rows.get(1).skillsJson)[0].desc, "Updated description");
  assert.equal(fixture.writes.length, 50);
  const settled = await fixture.cycle();
  assert.equal(settled.results.find(result => result.module === "skills").changed, false);
  assert.equal(fixture.writes.length, 0);
});

test("a real skin addition still triggers sync without polluting the skill comparison", async () => {
  const fixture = crawlerFixture();
  await fixture.sync();
  fixture.upstream.heroes[0].skin_name += "|New skin";
  const changed = await fixture.cycle();
  assert.equal(changed.results.find(result => result.module === "skins").changed, true);
  assert.equal(changed.results.find(result => result.module === "skills").changed, false);
  assert.deepEqual(JSON.parse(fixture.rows.get(1).skinsJson).map(skin => skin.name), ["Base", "Variant", "New skin"]);
  await fixture.cycle();
  assert.equal(fixture.writes.length, 0, "official skin list can differ from detail-page list without repeat crawling");
});

test("monitor uses the same configured detail source and named fallback as sync", async () => {
  const fixture = crawlerFixture({ namedFallback: true });
  await fixture.sync();
  assert.equal(JSON.parse(fixture.rows.get(1).skillsJson)[0].name, "A");
  const unchanged = await fixture.cycle();
  assert.equal(unchanged.results.find(result => result.module === "skills").ok, true);
  assert.equal(fixture.requests.filter(url => url.includes("/custom/herodetail/hero")).length, 8);
  assert.equal(fixture.writes.length, 0);
  fixture.upstream.description = "Changed through named fallback";
  const changed = await fixture.cycle();
  assert.equal(changed.results.find(result => result.module === "skills").changed, true);
  assert.equal(JSON.parse(fixture.rows.get(1).skillsJson)[0].desc, "Changed through named fallback");
});

test("unavailable detail pages are not treated as changed or successful checks", async () => {
  const fixture = crawlerFixture();
  await fixture.sync();
  fixture.upstream.unavailable = true;
  const { results } = await fixture.cycle();
  const skills = results.find(result => result.module === "skills");
  assert.equal(skills.ok, false);
  assert.equal(skills.changed, false);
  assert.equal(fixture.writes.length, 0);
  assert.equal(JSON.parse(fixture.rows.get(1).skillsJson)[0].desc, "Original description");
});

test("an HTTP 200 page without recognizable skills does not trigger a destructive refresh", async () => {
  const fixture = crawlerFixture();
  await fixture.sync();
  fixture.upstream.unparseable = true;
  const { results } = await fixture.cycle();
  assert.equal(results.find(result => result.module === "skills").ok, false);
  assert.equal(fixture.writes.length, 0);
  assert.equal(JSON.parse(fixture.rows.get(1).skillsJson)[0].name, "A");
});

test("retained HTML-only or historical heroes do not repeatedly invalidate the JSON catalog", async () => {
  const fixture = crawlerFixture();
  await fixture.sync();
  // Sync merges HTML and JSON catalogs and does not delete older database rows.
  fixture.rows.set(999, { ...structuredClone(fixture.rows.get(1)), heroId: 999, name: "HTML-only hero" });
  const { results } = await fixture.cycle();
  assert.equal(results.find(result => result.module === "heroes").changed, false);
  assert.equal(fixture.writes.length, 0);
  fixture.rows.delete(1);
  const missing = await fixture.cycle();
  assert.equal(missing.results.find(result => result.module === "heroes").changed, true);
  assert.equal(fixture.rows.get(1).name, "Hero1", "a genuinely missing official hero must still be restored");
});

test("skin-name normalization agrees with sync and settles after a real name change", async () => {
  const fixture = crawlerFixture();
  fixture.upstream.heroes[0].skin_name = " Base&1 | Variant&2 |";
  await fixture.sync();
  assert.deepEqual(JSON.parse(fixture.rows.get(1).skinsJson).map(skin => skin.name), ["Base", "Variant"]);
  const { results } = await fixture.cycle();
  assert.equal(results.find(result => result.module === "skins").changed, false);
  assert.equal(fixture.writes.length, 0);
  fixture.upstream.heroes[0].skin_name = " Base&1 | Renamed&2 |";
  const changed = await fixture.cycle();
  assert.equal(changed.results.find(result => result.module === "skins").changed, true);
  assert.deepEqual(JSON.parse(fixture.rows.get(1).skinsJson).map(skin => skin.name), ["Base", "Renamed"]);
  await fixture.cycle();
  assert.equal(fixture.writes.length, 0);
});

test("historical skills outside the current catalog cannot cause an unresolvable refresh loop", async () => {
  const fixture = crawlerFixture();
  await fixture.sync();
  fixture.upstream.heroes.shift();
  fixture.upstream.heroes.push({ ename: 51, cname: "Hero51", title: "Title", hero_type: 1, skin_name: "Base|Variant" });
  fixture.rows.get(1).skillsJson = '[{"name":"Old skill","cd":"","cost":"","desc":"Historical description"}]';
  await fixture.sync();
  for (let round = 0; round < 2; round++) {
    const { results } = await fixture.cycle();
    assert.equal(results.find(result => result.module === "skills").changed, false);
    assert.equal(fixture.requests.some(url => url.endsWith("/1.shtml")), false);
    assert.equal(fixture.writes.length, 0);
    assert.equal(JSON.parse(fixture.rows.get(1).skillsJson)[0].name, "Old skill", "preserve historical records");
  }
});

test("HTML-only heroes still participate in skill monitoring without metadata false alarms", async () => {
  const fixture = crawlerFixture();
  fixture.upstream.htmlOnly.push(fixture.upstream.heroes.shift());
  await fixture.sync();
  const { results } = await fixture.cycle();
  assert.equal(results.find(result => result.module === "heroes").changed, false);
  assert.equal(fixture.requests.some(url => url.endsWith("/1.shtml")), true);
  assert.equal(fixture.writes.length, 0);
  fixture.rows.get(1).skillsJson = '[{"name":"Old skill","cd":"","cost":"","desc":""}]';
  const changed = await fixture.cycle();
  assert.equal(changed.results.find(result => result.module === "skills").changed, true);
  assert.equal(JSON.parse(fixture.rows.get(1).skillsJson)[0].name, "A");
  await fixture.cycle();
  assert.equal(fixture.writes.length, 0);
});

test("blank official skin names use the same detail fallback as sync", async () => {
  const fixture = crawlerFixture();
  fixture.upstream.heroes[0].skin_name = "   ";
  await fixture.sync();
  for (let round = 0; round < 2; round++) {
    const { results } = await fixture.cycle();
    assert.equal(results.find(result => result.module === "skins").changed, false);
    assert.equal(fixture.writes.length, 0);
    assert.deepEqual(JSON.parse(fixture.rows.get(1).skinsJson).map(skin => skin.name), ["Base", "Variant"]);
  }
});

test("monitor reads the configured catalog rather than comparing a different default source", async () => {
  const fixture = crawlerFixture({ configuredCatalog: true });
  await fixture.sync();
  const { results } = await fixture.cycle();
  assert.deepEqual(fixture.catalogRequests, ["https://pvp.qq.com/custom/herolist.shtml", "https://pvp.qq.com/custom/herolist.json"]);
  for (const moduleName of ["heroes", "skins", "skills"]) {
    assert.equal(results.find(result => result.module === moduleName).ok, true);
    assert.equal(results.find(result => result.module === moduleName).changed, false);
  }
  assert.equal(fixture.writes.length, 0);
});

test("an unavailable catalog leaves saved data untouched and does not start detail crawling", async () => {
  const fixture = crawlerFixture();
  await fixture.sync();
  fixture.upstream.catalogUnavailable = true;
  const { results } = await fixture.cycle();
  for (const moduleName of ["heroes", "skins", "skills"]) {
    assert.equal(results.find(result => result.module === moduleName).ok, false);
    assert.equal(results.find(result => result.module === moduleName).changed, false);
  }
  assert.equal(fixture.requests.length, 0);
  assert.equal(fixture.writes.length, 0);
  assert.equal(fixture.rows.size, 50);
});

for (const source of ["json", "html"]) {
  test(`a failed ${source} catalog source cannot turn fallback defaults into apparent changes`, async () => {
    const fixture = crawlerFixture();
    await fixture.sync();
    fixture.upstream.unavailableCatalogPart = source;
    const { results } = await fixture.cycle();
    assert.equal(results.find(result => result.module === "heroes").ok, false);
    assert.equal(fixture.writes.length, 0);
    assert.equal(fixture.rows.get(1).title, "Title");
    assert.equal(fixture.rows.get(1).heroType, 1);
    fixture.upstream.unavailableCatalogPart = null;
    await fixture.cycle();
    assert.equal(fixture.writes.length, 0, "source recovery is not a data change");
  });
}
