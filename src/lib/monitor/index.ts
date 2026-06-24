// Lightweight monitoring — checks official sources without full scraping.
// When changes are detected, triggers the corresponding scraper module.

import { prisma } from "@/lib/db";
import { fetchWithRetry } from "@/lib/anti-bot";

// ── Config ─────────────────────────────────────────────────────────────
const NEWS_URL = "https://pvp.qq.com/";
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
    const res = await fetchWithRetry(NEWS_URL, { timeout: 8000, referer: "https://pvp.qq.com/" });
    if (!res.ok || !res.text) return { module: "news", changed: false, detail: "HTTP " + res.status };

    const html = res.text;

    // Extract first headline (support nested HTML in links)
    const linkMatch = html.match(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) return { module: "news", changed: false, detail: "no titles found" };

    const firstTitle = linkMatch[2].replace(/<[^>]*>/g, "").trim();
    if (!firstTitle) return { module: "news", changed: false, detail: "no titles found" };

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
        case "heroes": {
          const { syncHeroes } = await import("@/lib/heroes/sync");
          const result = await syncHeroes();
          events.push({ module: "heroes", action: "scrape-done", detail: `inserted=${result.inserted} updated=${result.updated}`, timestamp: Date.now() });
          break;
        }
        case "skins": {
          // Skin changes need hero sync (updates skinsJson) + image download
          const { syncHeroes } = await import("@/lib/heroes/sync");
          const result = await syncHeroes();
          events.push({ module: "skins", action: "scrape-done", detail: `synced ${result.updated} heroes, run scripts/download-hero-images.ts for new images`, timestamp: Date.now() });
          break;
        }
        case "news": {
          try {
            const res = await fetchWithRetry(NEWS_URL, { timeout: 8000, referer: "https://pvp.qq.com/" });
            if (res.ok && res.text) {
              const html = res.text;
              const newsItems: { title: string; date: string; url: string }[] = [];
              const seen = new Set<string>();
              const linkRegex = /<a[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
              const datePattern = /(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/;
              let match;

              while ((match = linkRegex.exec(html)) !== null) {
                const rawHref = match[1];
                const innerHtml = match[2];
                if (!rawHref || rawHref === "#" || rawHref.startsWith("javascript:")) continue;

                const title = innerHtml.replace(/<[^>]*>/g, "").trim();
                if (title.length < 4 || title.length > 100) continue;
                if (seen.has(title)) continue;
                seen.add(title);

                let url = rawHref;
                if (url.startsWith("//")) url = "https:" + url;
                else if (url.startsWith("/")) url = "https://pvp.qq.com" + url;
                else if (!url.startsWith("http")) url = "https://pvp.qq.com/web201605/" + url;

                const ctxStart = Math.max(0, match.index - 300);
                const context = html.slice(ctxStart, match.index + match[0].length);
                const dateMatch = context.match(datePattern);
                const date = dateMatch ? dateMatch[1].replace(/[./]/g, "-") : new Date().toISOString().slice(0, 10);

                newsItems.push({ title, date, url });
                if (newsItems.length >= 10) break;
              }

              if (newsItems.length > 0) {
                await prisma.$executeRawUnsafe(
                  "INSERT INTO kv_cache (`key`, `value`) VALUES ('official_news', ?) ON DUPLICATE KEY UPDATE `value` = ?",
                  JSON.stringify(newsItems), JSON.stringify(newsItems)
                );
                events.push({ module: "news", action: "scrape-done", detail: `cached ${newsItems.length} items`, timestamp: Date.now() });
              } else {
                events.push({ module: "news", action: "scrape-done", detail: "no news items found", timestamp: Date.now() });
              }
            }
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
