// Lightweight monitoring — checks official sources without full scraping.
// When changes are detected, triggers the corresponding scraper module.

import { prisma } from "@/lib/db";

// ── Config ─────────────────────────────────────────────────────────────
const NEWS_URL = "https://pvp.qq.com/web201605/newslist.shtml";
const HEROLIST_URL = "https://pvp.qq.com/web201605/js/herolist.json";

interface MonitorResult {
  module: "news" | "heroes" | "skins";
  changed: boolean;
  detail: string;
  count?: number;
}

// ── News Monitor (light: only checks headlines) ────────────────────────
async function checkNews(): Promise<MonitorResult> {
  try {
    const res = await fetch(NEWS_URL, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { module: "news", changed: false, detail: "HTTP " + res.status };

    const html = await res.text();

    // Light check: extract first headline
    const titleMatch = html.match(/<a[^>]*href="([^"]*)"[^>]*>([^<]{4,})<\/a>/);
    if (!titleMatch) return { module: "news", changed: false, detail: "no titles found" };

    const firstTitle = titleMatch[2].trim();
    const firstUrl = titleMatch[1];

    // Compare with cached last title
    const cache = await prisma.$queryRawUnsafe(
      "SELECT value FROM kv_cache WHERE `key` = 'news_last_title'"
    ) as { value: string }[];

    if (cache.length > 0 && cache[0].value === firstTitle) {
      return { module: "news", changed: false, detail: "unchanged" };
    }

    // Store new title
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
    const res = await fetch(HEROLIST_URL, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { module: "heroes", changed: false, detail: "HTTP " + res.status };

    const official = await res.json() as { ename: number; cname: string; title: string; hero_type: number; hero_type2?: number }[];

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

    // Check for any title mismatch by sampling more heroes
    let mismatchCount = 0;
    for (let i = 0; i < official.length; i += 20) {
      const db = await prisma.hero.findUnique({ where: { heroId: official[i].ename }, select: { name: true, title: true, heroType: true } });
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

// ── Skin Monitor (light: checks hero count; images checked per-hero) ───
async function checkSkins(): Promise<MonitorResult> {
  try {
    // Skins change when heroes change. Use a simple count comparison.
    const dbCount = await prisma.hero.count();

    const cache = await prisma.$queryRawUnsafe(
      "SELECT value FROM kv_cache WHERE `key` = 'skins_hero_count'"
    ) as { value: string }[];

    const lastCount = cache.length > 0 ? parseInt(cache[0].value) : 0;

    if (dbCount !== lastCount) {
      await prisma.$executeRawUnsafe(
        "INSERT INTO kv_cache (`key`, `value`) VALUES ('skins_hero_count', ?) ON DUPLICATE KEY UPDATE `value` = ?",
        String(dbCount), String(dbCount)
      );
      return { module: "skins", changed: true, detail: `count ${lastCount}→${dbCount}` };
    }

    return { module: "skins", changed: false, detail: "unchanged" };
  } catch (e: unknown) {
    return { module: "skins", changed: false, detail: (e as Error).message };
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
  const results = await Promise.all([checkNews(), checkHeroes(), checkSkins()]);
  return results;
}

export async function runMonitorAndScrape(): Promise<MonitorEvent[]> {
  const events: MonitorEvent[] = [];

  // Check all modules
  const results = await runAllMonitors();

  for (const r of results) {
    events.push({ module: r.module, action: "check", detail: r.detail, timestamp: Date.now() });

    if (!r.changed) continue;

    // Trigger the corresponding scraper
    events.push({ module: r.module, action: "scrape-start", detail: r.detail, timestamp: Date.now() });

    try {
      switch (r.module) {
        case "heroes": {
          // Dynamic import to avoid circular deps and side effects
          const { syncHeroes } = await import("@/lib/heroes/sync");
          const result = await syncHeroes();
          events.push({ module: "heroes", action: "scrape-done", detail: `inserted=${result.inserted} updated=${result.updated}`, timestamp: Date.now() });
          break;
        }
        case "skins": {
          // Signal skin download needed (actual download is a separate script)
          events.push({ module: "skins", action: "scrape-done", detail: "hero count changed, run scripts/download-hero-images.ts", timestamp: Date.now() });
          break;
        }
        case "news": {
          // News scraping is handled by /api/official-news
          events.push({ module: "news", action: "scrape-done", detail: "news titles changed, refresh /api/official-news", timestamp: Date.now() });
          break;
        }
      }
    } catch (e: unknown) {
      events.push({ module: r.module, action: "scrape-fail", detail: (e as Error).message, timestamp: Date.now() });
    }
  }

  emit({ module: "all", action: "check", detail: "cycle complete", timestamp: Date.now() });
  return events;
}
