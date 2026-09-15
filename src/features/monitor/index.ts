// Lightweight monitoring — checks official sources without full scraping.
// When changes are detected, triggers the corresponding scraper module.

import { prisma } from "@/lib/db";
import { fetchWithRetry } from "@/lib/anti-bot";
import { fetchGicpNews, GICP_CHANNELS } from "@/lib/gicp";
import { parseSkinNames } from "@/features/heroes/model";

// ── Config ─────────────────────────────────────────────────────────────
type OfficialHero = {
  ename: number;
  cname: string;
  title: string;
  hero_type: number;
  hero_type2?: number;
  skin_name?: string;
  id_name?: string;
};
type HeroListResponse = Awaited<ReturnType<typeof fetchWithRetry>>;

export interface MonitorResult {
  module: "news" | "heroes" | "skins" | "skills" | "items";
  ok: boolean;
  changed: boolean;
  detail: string;
  count?: number;
}

// ── News Monitor (light: checks first headline via GICP API) ───────────
async function checkNews(): Promise<MonitorResult> {
  try {
    const items = await fetchGicpNews(GICP_CHANNELS.announcement, 1);
    if (items.length === 0) return { module: "news", ok: false, changed: false, detail: "no items from API" };

    const firstTitle = items[0].title;

    const cache = await prisma.kvCache.findUnique({ where: { key: "news_last_title" } });

    if (cache?.value === firstTitle) {
      return { module: "news", ok: true, changed: false, detail: "unchanged" };
    }

    await prisma.kvCache.upsert({
      where: { key: "news_last_title" },
      update: { value: firstTitle },
      create: { key: "news_last_title", value: firstTitle },
    });

    return { module: "news", ok: true, changed: true, detail: firstTitle };
  } catch (e: unknown) {
    return { module: "news", ok: false, changed: false, detail: (e as Error).message };
  }
}

// ── Hero Monitor (light: checks hero count + names) ────────────────────
async function checkHeroes(response: Promise<HeroListResponse>): Promise<MonitorResult> {
  try {
    const res = await response;
    if (!res.ok || !Array.isArray(res.json) || res.json.length === 0) {
      return { module: "heroes", ok: false, changed: false, detail: "HTTP/schema " + res.status };
    }

    const official = res.json as OfficialHero[];

    // Sync keeps historical rows. Only compare the current merged catalog;
    // an extra stored hero is not a source change that sync could resolve.
    const dbCount = await prisma.hero.count({
      where: { heroId: { in: official.map(hero => hero.ename) } },
    });
    if (official.length !== dbCount) {
      return { module: "heroes", ok: true, changed: true, detail: `count ${dbCount}→${official.length}`, count: official.length };
    }

    // One batched query covers the boundary fingerprint and the rotating sample.
    const sampleIndices = new Set<number>();
    sampleIndices.add(0);
    sampleIndices.add(official.length - 1);
    for (let i = 0; i < official.length; i += 20) sampleIndices.add(i);
    // Also explicitly check heroes that have 命格 in DB
    const mingGeHeroes = await prisma.hero.findMany({ where: { mingge: true }, select: { heroId: true } });
    for (const h of mingGeHeroes) {
      const idx = official.findIndex(o => o.ename === h.heroId);
      if (idx >= 0) sampleIndices.add(idx);
    }

    const sampledOfficials = Array.from(sampleIndices, (index) => official[index]);
    const sampledRows = await prisma.hero.findMany({
      where: { heroId: { in: sampledOfficials.map((hero) => hero.ename) } },
      select: { heroId: true, name: true, title: true, heroType: true },
    });
    const sampledById = new Map(sampledRows.map((hero) => [hero.heroId, hero]));
    const mismatchCount = sampledOfficials.filter((hero) => {
      const stored = sampledById.get(hero.ename);
      return !stored
        || stored.name !== hero.cname
        || stored.title !== hero.title
        || stored.heroType !== hero.hero_type;
    }).length;

    if (mismatchCount > 0) {
      return { module: "heroes", ok: true, changed: true, detail: `${mismatchCount} mismatches`, count: official.length };
    }

    return { module: "heroes", ok: true, changed: false, detail: "unchanged" };
  } catch (e: unknown) {
    return { module: "heroes", ok: false, changed: false, detail: (e as Error).message };
  }
}

// ── Skin Monitor (light: checks skin names per hero from official JSON) ─
async function checkSkins(response: Promise<HeroListResponse>): Promise<MonitorResult> {
  try {
    const res = await response;
    if (!res.ok || !Array.isArray(res.json) || res.json.length === 0) {
      return { module: "skins", ok: false, changed: false, detail: "HTTP/schema " + res.status };
    }

    const official = res.json as OfficialHero[];

    const storedHeroes = await prisma.hero.findMany({
      select: { heroId: true, skinsJson: true },
    });
    const storedById = new Map(storedHeroes.map((hero) => [hero.heroId, hero.skinsJson]));
    let skinChanges = 0;

    // 全量名称指纹复用本轮目录和一次数据库查询，避免抽样漏掉最新皮肤。
    for (const h of official) {
      if (!h.skin_name?.trim()) continue;
      const skinsJson = storedById.get(h.ename);
      if (!skinsJson) {
        skinChanges++;
        continue;
      }

      try {
        const dbSkins: { name: string }[] = JSON.parse(skinsJson);
        const dbNames = dbSkins.map((s) => s.name).sort().join("|");
        const officialNames = parseSkinNames(h.skin_name, h.title || h.cname).sort().join("|");

        if (dbNames !== officialNames) {
          skinChanges++;
        }
      } catch { continue; }
    }

    if (skinChanges > 0) {
      return { module: "skins", ok: true, changed: true, detail: `${skinChanges} heroes have new/changed skins` };
    }

    return { module: "skins", ok: true, changed: false, detail: "skins unchanged" };
  } catch (e: unknown) {
    return { module: "skins", ok: false, changed: false, detail: (e as Error).message };
  }
}

// ── Skill Monitor (bounded sample, same source/parser as sync) ─────────
async function checkSkills(response: Promise<HeroListResponse>): Promise<MonitorResult> {
  try {
    const heroList = await response;
    if (!heroList.ok || !Array.isArray(heroList.json) || heroList.json.length === 0) {
      return { module: "skills", ok: false, changed: false, detail: "hero catalog unavailable" };
    }
    const official = heroList.json as OfficialHero[];
    const heroes = await prisma.hero.findMany({
      where: { heroId: { in: official.map(hero => hero.ename) } },
      select: { heroId: true, skillsJson: true },
      orderBy: { heroId: "asc" },
    });
    if (heroes.length === 0) return { module: "skills", ok: false, changed: false, detail: "no heroes in db" };

    // Rotate a bounded deterministic window instead of opening dozens of upstream connections every three minutes.
    const sampleSize = Math.min(8, heroes.length);
    const windowIndex = Math.floor(Date.now() / (3 * 60 * 1000));
    const start = (windowIndex * sampleSize) % heroes.length;
    const samples = Array.from({ length: sampleSize }, (_, index) => heroes[(start + index) % heroes.length]);

    const { fetchDetail, getCrawlConfig, parseSkills } = await import("@/features/heroes/server/sync");
    const cfg = await getCrawlConfig();
    const detailNames = new Map(official.map(hero => [hero.ename, hero.id_name]));

    let mismatchCount = 0;
    let checkedCount = 0;
    const batchSize = 8;
    for (let b = 0; b < samples.length; b += batchSize) {
      const batch = samples.slice(b, b + batchSize);
      const results = await Promise.all(
        batch.map(async (h) => {
          const html = await fetchDetail(cfg, h.heroId, detailNames.get(h.heroId));
          if (!html) return { heroId: h.heroId, checked: false, changed: false };
          const skills = parseSkills(html);
          if (skills.length === 1 && skills[0].name === "数据暂缺") {
            return { heroId: h.heroId, checked: false, changed: false };
          }
          // dataHash also includes skin image URLs; it is not a skill fingerprint.
          // Compare the same serialized skills that sync writes, keeping existing
          // database hashes compatible. Skin names are checked independently.
          return {
            heroId: h.heroId,
            checked: true,
            changed: JSON.stringify(skills) !== h.skillsJson,
          };
        })
      );

      for (const r of results) {
        if (r.checked) checkedCount++;
        if (r.changed) {
          mismatchCount++;
          console.log(`[monitor:skills] content changed for #${r.heroId}`);
        }
      }
    }

    if (mismatchCount > 0) {
      return { module: "skills", ok: true, changed: true, detail: `${mismatchCount}/${checkedCount} checked heroes have changes` };
    }
    if (checkedCount < samples.length) {
      return { module: "skills", ok: false, changed: false, detail: `${checkedCount}/${samples.length} hero details available` };
    }
    return { module: "skills", ok: true, changed: false, detail: `${samples.length} heroes OK` };
  } catch (e: unknown) {
    return { module: "skills", ok: false, changed: false, detail: (e as Error).message };
  }
}

// ── Item Monitor ──────────────────────────────────────────────────────
async function checkItems(): Promise<MonitorResult> {
  try {
    const ITEM_URL = "https://pvp.qq.com/web201605/js/item.json";
    const res = await fetchWithRetry(ITEM_URL, { timeout: 10000, referer: "https://pvp.qq.com/", isJson: true });
    if (!res.ok || !res.json) return { module: "items", ok: false, changed: false, detail: "HTTP " + res.status };

    const { createHash } = await import("crypto");
    const newHash = createHash("md5").update(JSON.stringify(res.json)).digest("hex");

    const cache = await prisma.kvCache.findUnique({ where: { key: "items_hash" } });

    if (cache?.value === newHash) {
      return { module: "items", ok: true, changed: false, detail: "unchanged" };
    }

    await prisma.kvCache.upsert({
      where: { key: "items_hash" },
      update: { value: newHash },
      create: { key: "items_hash", value: newHash },
    });

    return { module: "items", ok: true, changed: true, detail: "item.json changed" };
  } catch (e: unknown) {
    return { module: "items", ok: false, changed: false, detail: (e as Error).message };
  }
}

// ── Main Monitor ───────────────────────────────────────────────────────
export interface MonitorEvent {
  module: string;
  action: "check" | "scrape-start" | "scrape-done" | "scrape-fail";
  detail?: string;
  timestamp: number;
}

type Listener = (event: MonitorEvent) => void;
const listeners: Listener[] = [];

export function onMonitorEvent(fn: Listener) {
  listeners.push(fn);
  return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
}

function emit(event: MonitorEvent) {
  for (const fn of listeners) fn(event);
}

export async function runAllMonitors(): Promise<MonitorResult[]> {
  // Share the same configured HTML/JSON union and field normalization as sync.
  // All three checks reuse this promise; historical rows cannot trigger work
  // which the current sync catalog would never update.
  const heroList: Promise<HeroListResponse> = (async () => {
    const { fetchHeroList, getCrawlConfig } = await import("@/features/heroes/server/sync");
    const json = await fetchHeroList(await getCrawlConfig(), { requireComplete: true });
    return { ok: true, status: 200, json };
  })().catch((error: unknown) => {
    console.warn("[monitor:heroes] catalog unavailable", error instanceof Error ? error.message : error);
    return { ok: false, status: 0 };
  });
  const results = await Promise.all([
    checkNews(),
    checkHeroes(heroList),
    checkSkins(heroList),
    checkSkills(heroList),
    checkItems(),
  ]);
  return results;
}

export async function runMonitorAndScrape(
  changedModules?: string[]
): Promise<MonitorEvent[]> {
  const events: MonitorEvent[] = [];
  const toScrape = new Set(changedModules ?? []);
  if (toScrape.size === 0) return events;
  const addEvent = (event: MonitorEvent) => {
    events.push(event);
    emit(event);
  };

  const heroModules = (["heroes", "skins", "skills"] as const).filter((module) => toScrape.has(module));
  if (heroModules.length > 0) {
    heroModules.forEach((module) => addEvent({ module, action: "scrape-start", detail: "detected change", timestamp: Date.now() }));
    try {
      const [{ syncHeroes }, { downloadAllImages }] = await Promise.all([
        import("@/features/heroes/server/sync"),
        import("@/features/heroes/server/download-images"),
      ]);
      const result = await syncHeroes();
      const images = await downloadAllImages();
      const detail = `inserted=${result.inserted} updated=${result.updated}; images=${images.heroes}+${images.skins}`;
      heroModules.forEach((module) => addEvent({ module, action: "scrape-done", detail, timestamp: Date.now() }));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      heroModules.forEach((module) => addEvent({ module, action: "scrape-fail", detail, timestamp: Date.now() }));
    }
  }

  if (toScrape.has("items")) {
    addEvent({ module: "items", action: "scrape-start", detail: "detected change", timestamp: Date.now() });
    try {
      const { syncItems } = await import("@/features/equipment/server/sync");
      const result = await syncItems();
      addEvent({ module: "items", action: "scrape-done", detail: `inserted=${result.inserted} updated=${result.updated}`, timestamp: Date.now() });
    } catch (error) {
      addEvent({ module: "items", action: "scrape-fail", detail: error instanceof Error ? error.message : String(error), timestamp: Date.now() });
    }
  }

  if (toScrape.has("news")) {
    addEvent({ module: "news", action: "scrape-start", detail: "detected change", timestamp: Date.now() });
    try {
      await prisma.kvCache.deleteMany({ where: { key: "official_news" } });
      addEvent({ module: "news", action: "scrape-done", detail: "cache cleared, fresh data on next request", timestamp: Date.now() });
    } catch (error) {
      addEvent({ module: "news", action: "scrape-fail", detail: error instanceof Error ? error.message : String(error), timestamp: Date.now() });
    }
  }

  return events;
}
