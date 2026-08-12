// Lightweight monitoring — checks official sources without full scraping.
// When changes are detected, triggers the corresponding scraper module.

import { prisma } from "@/lib/db";
import { fetchWithRetry } from "@/lib/anti-bot";
import { fetchGicpNews, GICP_CHANNELS } from "@/lib/gicp";

// ── Config ─────────────────────────────────────────────────────────────
const HEROLIST_URL = "https://pvp.qq.com/web201605/js/herolist.json";

interface MonitorResult {
  module: "news" | "heroes" | "skins" | "skills" | "items";
  changed: boolean;
  detail: string;
  count?: number;
}

// ── News Monitor (light: checks first headline via GICP API) ───────────
async function checkNews(): Promise<MonitorResult> {
  try {
    const items = await fetchGicpNews(GICP_CHANNELS.announcement, 1);
    if (items.length === 0) return { module: "news", changed: false, detail: "no items from API" };

    const firstTitle = items[0].title;

    const cache = await prisma.kvCache.findUnique({ where: { key: "news_last_title" } });

    if (cache?.value === firstTitle) {
      return { module: "news", changed: false, detail: "unchanged" };
    }

    await prisma.kvCache.upsert({
      where: { key: "news_last_title" },
      update: { value: firstTitle },
      create: { key: "news_last_title", value: firstTitle },
    });

    return { module: "news", changed: true, detail: firstTitle };
  } catch (e: unknown) {
    return { module: "news", changed: false, detail: (e as Error).message };
  }
}

// ── Hero Monitor (light: checks hero count + names) ────────────────────
async function checkHeroes(): Promise<MonitorResult> {
  try {
    const res = await fetchWithRetry(HEROLIST_URL, { timeout: 10000, referer: "https://pvp.qq.com/", isJson: true });
    if (!res.ok || !res.json) return { module: "heroes", changed: false, detail: "HTTP " + res.status };

    const official = res.json as { ename: number; cname: string; title: string; hero_type: number; hero_type2?: number }[];

    // Light check: compare hero count and names
    const dbCount = await prisma.hero.count();
    if (official.length !== dbCount) {
      return { module: "heroes", changed: true, detail: `count ${dbCount}→${official.length}`, count: official.length };
    }

    // Compare first & last hero names (cheap fingerprint)
    const dbFirst = await prisma.hero.findFirst({ where: { heroId: official[0].ename }, select: { name: true } });
    const dbLast = await prisma.hero.findFirst({ where: { heroId: official[official.length - 1].ename }, select: { name: true } });

    if (!dbFirst || dbFirst.name !== official[0].cname || !dbLast || dbLast.name !== official[official.length - 1].cname) {
      return { module: "heroes", changed: true, detail: "name mismatch", count: official.length };
    }

    // Check for any mismatch by sampling more heroes (every 20th + 命格 heroes)
    let mismatchCount = 0;
    const sampleIndices = new Set<number>();
    for (let i = 0; i < official.length; i += 20) sampleIndices.add(i);
    // Also explicitly check heroes that have 命格 in DB
    const mingGeHeroes = await prisma.hero.findMany({ where: { mingge: true }, select: { heroId: true } });
    for (const h of mingGeHeroes) {
      const idx = official.findIndex(o => o.ename === h.heroId);
      if (idx >= 0) sampleIndices.add(idx);
    }

    for (const i of Array.from(sampleIndices)) {
      const db = await prisma.hero.findUnique({ where: { heroId: official[i].ename }, select: { name: true, title: true, heroType: true, mingge: true, minggeName: true } });
      if (db && (db.name !== official[i].cname || db.title !== official[i].title || db.heroType !== official[i].hero_type)) {
        mismatchCount++;
      }
    }

    if (mismatchCount > 0) {
      return { module: "heroes", changed: true, detail: `${mismatchCount} mismatches`, count: official.length };
    }

    return { module: "heroes", changed: false, detail: "unchanged" };
  } catch (e: unknown) {
    return { module: "heroes", changed: false, detail: (e as Error).message };
  }
}

// ── Skin Monitor (light: checks skin names per hero from official JSON) ─
async function checkSkins(): Promise<MonitorResult> {
  try {
    const res = await fetchWithRetry(HEROLIST_URL, { timeout: 10000, referer: "https://pvp.qq.com/", isJson: true });
    if (!res.ok || !res.json) return { module: "skins", changed: false, detail: "HTTP " + res.status };

    const official = res.json as { ename: number; skin_name?: string }[];

    const storedHeroes = await prisma.hero.findMany({
      select: { heroId: true, skinsJson: true },
    });
    const storedById = new Map(storedHeroes.map((hero) => [hero.heroId, hero.skinsJson]));
    let skinChanges = 0;

    // 全量名称指纹仅需一次官方请求和一次数据库查询，避免抽样漏掉最新皮肤。
    for (const h of official) {
      if (!h.skin_name) continue;
      const skinsJson = storedById.get(h.ename);
      if (!skinsJson) {
        skinChanges++;
        continue;
      }

      try {
        const dbSkins: { name: string }[] = JSON.parse(skinsJson);
        const dbNames = dbSkins.map((s) => s.name).sort().join("|");
        const officialNames = h.skin_name.split("|").sort().join("|");

        if (dbNames !== officialNames) {
          skinChanges++;
        }
      } catch { continue; }
    }

    if (skinChanges > 0) {
      return { module: "skins", changed: true, detail: `${skinChanges} heroes have new/changed skins` };
    }

    return { module: "skins", changed: false, detail: "skins unchanged" };
  } catch (e: unknown) {
    return { module: "skins", changed: false, detail: (e as Error).message };
  }
}

// ── Skill Monitor (50% sampling, full hash comparison) ─────────────────
async function checkSkills(): Promise<MonitorResult> {
  try {
    const heroes = await prisma.hero.findMany({
      select: { heroId: true, name: true, dataHash: true, skillsJson: true, skinsJson: true },
    });
    if (heroes.length === 0) return { module: "skills", changed: false, detail: "no heroes in db" };

    // 50% random sample
    const sampleSize = Math.max(heroes.length / 2, 1);
    const shuffled = [...heroes].sort(() => Math.random() - 0.5);
    const samples = shuffled.slice(0, sampleSize);

    const { createHash } = await import("crypto");
    const { load } = await import("cheerio");
    const iconv = await import("iconv-lite");
    const { getHeaders } = await import("@/lib/anti-bot");

    const sanitize = (s: string): string =>
      s.replace(/\0/g, "").replace(/�/g, "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "").trim();

    let mismatchCount = 0;
    const batchSize = 8;
    for (let b = 0; b < samples.length; b += batchSize) {
      const batch = samples.slice(b, b + batchSize);
      const results = await Promise.all(
        batch.map(async (h) => {
          // Fetch detail page
          const urls = [
            `https://pvp.qq.com/web201605/herodetail/${h.heroId}.shtml`,
            `https://pvp.qq.com/web201706/herodetail/${h.heroId}.shtml`,
          ];
          let html = "";
          for (const url of urls) {
            try {
              const res = await fetch(url, { headers: getHeaders(), signal: AbortSignal.timeout(8000) });
              if (!res.ok) continue;
              const buf = Buffer.from(await res.arrayBuffer());
              html = iconv.decode(buf, "gbk");
              if (html.includes("技能") || html.includes("skill-show")) break;
            } catch { continue; }
          }

          if (!html) return { heroId: h.heroId, hashed: false, newHash: "" };

          // Parse skills
          const $ = load(html);
          const skills: { name: string; cd: string; cost: string; desc: string }[] = [];
          $(".skill-show .show-list").each((_, el: any) => {
            const name = sanitize($(el).find(".skill-name b").text());
            if (!name) return;
            const spans = $(el).find(".skill-name span");
            skills.push({
              name,
              cd: sanitize(spans.eq(0).text().replace(/冷却值[：:]\s*/, "")),
              cost: sanitize(spans.eq(1).text().replace(/消耗[：:]\s*/, "")),
              desc: sanitize($(el).find(".skill-desc").text()),
            });
          });

          // Parse skins
          let skinsJson = "[]";
          const imgMatch = html.match(/data-imgname="([^"]*)"/);
          if (imgMatch) {
            const items = imgMatch[1].split("|").filter(Boolean);
            skinsJson = JSON.stringify(items.map((item, i) => ({
              name: sanitize(item.split("&")[0]),
              index: i + 1,
            })));
          }

          const skillsJson = JSON.stringify(skills);
          const newHash = createHash("md5").update(skillsJson).update(skinsJson).digest("hex");
          return { heroId: h.heroId, hashed: true, newHash, dbHash: h.dataHash };
        })
      );

      for (const r of results) {
        if (r.hashed && r.newHash !== r.dbHash) {
          mismatchCount++;
          console.log(`[monitor:skills] hash mismatch for #${r.heroId}`);
        }
      }
    }

    if (mismatchCount > 0) {
      return { module: "skills", changed: true, detail: `${mismatchCount}/${samples.length} heroes have changes` };
    }
    return { module: "skills", changed: false, detail: `${samples.length} heroes OK` };
  } catch (e: unknown) {
    return { module: "skills", changed: false, detail: (e as Error).message };
  }
}

// ── Item Monitor ──────────────────────────────────────────────────────
async function checkItems(): Promise<MonitorResult> {
  try {
    const ITEM_URL = "https://pvp.qq.com/web201605/js/item.json";
    const res = await fetchWithRetry(ITEM_URL, { timeout: 10000, referer: "https://pvp.qq.com/", isJson: true });
    if (!res.ok || !res.json) return { module: "items", changed: false, detail: "HTTP " + res.status };

    const { createHash } = await import("crypto");
    const newHash = createHash("md5").update(JSON.stringify(res.json)).digest("hex");

    const cache = await prisma.kvCache.findUnique({ where: { key: "items_hash" } });

    if (cache?.value === newHash) {
      return { module: "items", changed: false, detail: "unchanged" };
    }

    await prisma.kvCache.upsert({
      where: { key: "items_hash" },
      update: { value: newHash },
      create: { key: "items_hash", value: newHash },
    });

    return { module: "items", changed: true, detail: "item.json changed" };
  } catch (e: unknown) {
    return { module: "items", changed: false, detail: (e as Error).message };
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
  const results = await Promise.all([checkNews(), checkHeroes(), checkSkins(), checkSkills(), checkItems()]);
  return results;
}

export async function runMonitorAndScrape(
  changedModules?: string[]
): Promise<MonitorEvent[]> {
  const events: MonitorEvent[] = [];

  // If specific changed modules are passed, scrape only those
  const toScrape = changedModules || [];

  if (toScrape.length === 0) return events;

  for (const mod of toScrape) {
    events.push({ module: mod, action: "scrape-start", detail: "detected change", timestamp: Date.now() });

    try {
      switch (mod) {
        case "heroes":
        case "skins":
        case "skills": {
          const { syncHeroes } = await import("@/features/heroes/server/sync");
          const result = await syncHeroes();
          events.push({ module: mod, action: "scrape-done", detail: `inserted=${result.inserted} updated=${result.updated}`, timestamp: Date.now() });

          // Auto-download new images from CDN
          try {
            const { downloadAllImages } = await import("@/features/heroes/server/download-images");
            const imgResult = await downloadAllImages();
            if (imgResult.heroes > 0 || imgResult.skins > 0) {
              events.push({ module: mod, action: "scrape-done", detail: `downloaded ${imgResult.heroes} hero + ${imgResult.skins} skin images`, timestamp: Date.now() });
            }
          } catch (e: unknown) {
            events.push({ module: mod, action: "scrape-fail", detail: `image download: ${(e as Error).message}`, timestamp: Date.now() });
          }
          break;
        }
        case "items": {
          const { syncItems } = await import("@/features/equipment/server/sync");
          const result = await syncItems();
          events.push({ module: "items", action: "scrape-done", detail: `inserted=${result.inserted} updated=${result.updated}`, timestamp: Date.now() });
          break;
        }
        case "news": {
          try {
            // Clear cache so next request fetches fresh data
            await prisma.kvCache.deleteMany({ where: { key: "official_news" } });
            events.push({ module: "news", action: "scrape-done", detail: "cache cleared, fresh data on next request", timestamp: Date.now() });
          } catch (e: unknown) {
            events.push({ module: "news", action: "scrape-fail", detail: (e as Error).message, timestamp: Date.now() });
          }
          break;
        }
      }
    } catch (e: unknown) {
      events.push({ module: mod, action: "scrape-fail", detail: (e as Error).message, timestamp: Date.now() });
    }
  }

  return events;
}
