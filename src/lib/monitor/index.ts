// Lightweight monitoring — checks official sources without full scraping.
// When changes are detected, triggers the corresponding scraper module.

import { prisma } from "@/lib/db";
import { fetchWithRetry } from "@/lib/anti-bot";
import { fetchGicpNews, GICP_CHANNELS } from "@/lib/gicp";

// ── Config ─────────────────────────────────────────────────────────────
const HEROLIST_URL = "https://pvp.qq.com/web201605/js/herolist.json";

interface MonitorResult {
  module: "news" | "heroes" | "skins" | "skills";
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

    const cache = await prisma.$queryRawUnsafe(
      "SELECT value FROM kv_cache WHERE `key` = 'news_last_title'"
    ) as { value: string }[];

    if (cache.length > 0 && cache[0].value === firstTitle) {
      return { module: "news", changed: false, detail: "unchanged" };
    }

    await prisma.$executeRawUnsafe(
      "INSERT INTO kv_cache (`key`, `value`) VALUES ('news_last_title', ?) ON DUPLICATE KEY UPDATE `value` = ?",
      firstTitle, firstTitle
    );

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

    // Check skin fingerprints: sample every 5th hero's skin_name
    const samples = official.filter((_, i) => i % 5 === 0);
    let skinChanges = 0;

    for (const h of samples) {
      if (!h.skin_name) continue;
      const db = await prisma.hero.findUnique({
        where: { heroId: h.ename },
        select: { skinsJson: true },
      });
      if (!db?.skinsJson) continue;

      try {
        const dbSkins: { name: string }[] = JSON.parse(db.skinsJson);
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

// ── Skill Monitor (light: samples 3 random heroes' skill names) ──────────
async function checkSkills(): Promise<MonitorResult> {
  try {
    // 随机抽 3 个英雄做技能指纹对比
    const heroes = await prisma.hero.findMany({
      select: { heroId: true, name: true, skillsJson: true },
      take: 100,
    });
    if (heroes.length === 0) return { module: "skills", changed: false, detail: "no heroes in db" };

    const samples = [];
    const used = new Set<number>();
    while (samples.length < 3 && used.size < heroes.length) {
      const idx = Math.floor(Math.random() * heroes.length);
      if (used.has(idx)) continue;
      used.add(idx);
      samples.push(heroes[idx]);
    }

    const { load } = await import("cheerio");
    const iconv = await import("iconv-lite");
    const { getHeaders } = await import("@/lib/anti-bot");

    const HERO_URLS = [
      (id: number) => `https://pvp.qq.com/web201605/herodetail/${id}.shtml`,
      (id: number) => `https://pvp.qq.com/web201605/herodetail2/${id}.shtml`,
      (id: number) => `https://apps.game.qq.com/wmp/v3.1/public/search.php?p0=41&p1=searchHero&heroId=${id}&source=web_pc`,
    ];

    let mismatchCount = 0;
    for (const h of samples) {
      if (!h.skillsJson) continue;
      const dbSkills: { name: string }[] = JSON.parse(h.skillsJson);
      const dbNames = dbSkills.map(s => s.name).sort().join("|");
      if (!dbNames) continue;

      // 抓取详情页
      let html = "";
      for (const urlFn of HERO_URLS) {
        const url = urlFn(h.heroId);
        const res = await fetch(url, { headers: getHeaders(), signal: AbortSignal.timeout(8000) });
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        html = iconv.decode(buf, "gbk");
        if (html.includes("技能") || html.includes("skill-show") || html.includes("detail-js")) break;
      }

      if (!html) continue;

      // 解析技能名
      const $ = load(html);
      const officialNames: string[] = [];
      $(".skill-show .show-list").each((_, el: any) => {
        const name = ($(el).find(".skill-name b").text() || "").trim();
        if (name) officialNames.push(name);
      });

      if (officialNames.length < 3) {
        // 尝试 preview 页面格式
        const detailHtml = $(".detail-js").html() || "";
        const bRegex = /<b[^>]*>(?:<font[^>]*>)?([^<]+)(?:<\/font>)?<\/b>/gi;
        let match: RegExpExecArray | null;
        while ((match = bRegex.exec(detailHtml)) !== null) {
          const title = (match[1] || "").trim();
          if (title && title.length <= 20 && !title.includes("连招") && !title.includes("升级推荐")) {
            officialNames.push(title);
          }
        }
      }

      const officialFingerprint = [...officialNames].sort().join("|");
      if (officialFingerprint && officialFingerprint !== dbNames) {
        mismatchCount++;
      }
    }

    if (mismatchCount > 0) {
      return { module: "skills", changed: true, detail: `${mismatchCount}/${samples.length} heroes have skill changes` };
    }
    return { module: "skills", changed: false, detail: "skills unchanged" };
  } catch (e: unknown) {
    return { module: "skills", changed: false, detail: (e as Error).message };
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
  const results = await Promise.all([checkNews(), checkHeroes(), checkSkins(), checkSkills()]);
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
          const { syncHeroes } = await import("@/lib/heroes/sync");
          const result = await syncHeroes();
          events.push({ module: mod, action: "scrape-done", detail: `inserted=${result.inserted} updated=${result.updated}`, timestamp: Date.now() });

          // Auto-download new images from CDN
          try {
            const { downloadAllImages } = await import("@/lib/heroes/download-images");
            const imgResult = await downloadAllImages();
            if (imgResult.heroes > 0 || imgResult.skins > 0) {
              events.push({ module: mod, action: "scrape-done", detail: `downloaded ${imgResult.heroes} hero + ${imgResult.skins} skin images`, timestamp: Date.now() });
            }
          } catch (e: unknown) {
            events.push({ module: mod, action: "scrape-fail", detail: `image download: ${(e as Error).message}`, timestamp: Date.now() });
          }
          break;
        }
        case "news": {
          try {
            // Clear cache so next request fetches fresh data
            await prisma.$executeRawUnsafe(
              "DELETE FROM kv_cache WHERE `key` = 'official_news'"
            );
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
