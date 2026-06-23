import { prisma } from "../db";
import { load } from "cheerio";
import * as iconv from "iconv-lite";

const HEROLIST_URL = "https://pvp.qq.com/web201605/js/herolist.json";
const BIGSKIN_BASE = "https://game.gtimg.cn/images/yxzj/img201606/skin/hero-info/{id}/{id}-bigskin-{idx}.jpg";
const HEROIMG_URL = "https://game.gtimg.cn/images/yxzj/img201606/heroimg/{id}/{id}.jpg";

interface RawHero {
  ename: number;
  cname: string;
  title: string;
  hero_type: number;
  hero_type2?: number;
  id_name?: string;
}

// Official type: 1=战士 2=法师 3=坦克 4=刺客 5=射手 6=辅助
// Map to lane: use hero_type2 as fallback for ambiguous heroes
const CLASS_TO_LANE: Record<number, string> = {
  1: "top",      // 战士 → 上路
  2: "mid",      // 法师 → 中路
  3: "top",      // 坦克 → 上路
  4: "jungle",   // 刺客 → 打野
  5: "adc",      // 射手 → 发育路
  6: "support",  // 辅助 → 游走
};

// Heroes where class→lane mapping needs manual correction
// Format: heroId → correct lane
// Fill in based on confirmed in-game lane data
const LANE_OVERRIDES: Record<number, string> = {
  // Add confirmed overrides here
};

function resolveRoleType(h: RawHero): string {
  if (LANE_OVERRIDES[h.ename]) return LANE_OVERRIDES[h.ename];
  return CLASS_TO_LANE[h.hero_type] || "top";
}

function sanitize(s: string): string {
  return s.replace(/\0/g, "").replace(/�/g, "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "").trim();
}

// ── Fetch hero detail page ──────────────────────────────────────────
async function fetchDetail(heroId: number, idName?: string): Promise<string> {
  const urls = [
    `https://pvp.qq.com/web201605/herodetail/${heroId}.shtml`,
    `https://pvp.qq.com/web201605/herodetail/${idName}.shtml`, // Some heroes use id_name in URL
    `https://pvp.qq.com/web201706/herodetail/${heroId}.shtml`,
  ];
  if (idName) urls.push(`https://pvp.qq.com/ingame/all/tobe/newheros/${idName}.html`);

  for (const url of urls) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) break;
        const buf = Buffer.from(await res.arrayBuffer());
        // Try multiple encodings
        for (const enc of ["gbk", "utf-8", "gb2312"]) {
          const html = iconv.decode(buf, enc);
          // Check if decoding worked (should contain Chinese characters)
          if (html.includes("英雄") || html.includes("技能") || html.includes("玩法")) {
            return html.replace(/\0/g, "").replace(/�/g, "?");
          }
        }
        break; // Page loaded but encoding detection failed - use GBK
      } catch {
        if (attempt === 0) await new Promise((r) => setTimeout(r, 500));
      }
    }
  }
  return "";
}

// ── Check if image URL exists ───────────────────────────────────────
async function imgExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Parse skins ─────────────────────────────────────────────────────
function parseSkins(html: string, heroTitle: string): { name: string; index: number }[] {
  const match = html.match(/data-imgname="([^"]*)"/);
  if (!match) return [{ name: heroTitle, index: 1 }];
  const items = match[1].split("|").filter(Boolean);
  if (items.length === 0) return [{ name: heroTitle, index: 1 }];
  return items.map((item, i) => {
    const [name] = item.split("&");
    return { name: sanitize(name) || heroTitle, index: i + 1 };
  });
}

// ── Parse skills ────────────────────────────────────────────────────
function parseSkills(html: string): { name: string; cd: string; cost: string; desc: string }[] {
  const $ = load(html);

  // 1. Standard page: .skill-show .show-list
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
  if (skills.length >= 3) return skills;

  // 2. Preview page: .detail-js with <b> skill titles
  const $detail = $(".detail-js");
  if ($detail.length > 0) {
    const previewSkills: { name: string; cd: string; cost: string; desc: string }[] = [];
    const html = $detail.html() || "";

    // Split by <b>...</b> blocks to extract title + description pairs
    const bRegex = /<b[^>]*>(?:<font[^>]*>)?([^<]+)(?:<\/font>)?<\/b>\s*(?:<br\s*\/?>\s*)?([^<]*)/gi;
    let match: RegExpExecArray | null;
    while ((match = bRegex.exec(html)) !== null) {
      const title = sanitize(match[1]);
      const desc = sanitize(match[2] || "");
      if (!title || !desc) continue;
      if (title === "连招" || title.includes("连招") || title.includes("升级推荐")) continue;
      if (title.length > 20) continue;
      previewSkills.push({ name: title, cd: "", cost: "", desc });
    }

    // If regex found nothing, try text-based extraction
    if (previewSkills.length === 0) {
      const text = sanitize($detail.text());
      const lines = text.split(/[。！？\n]/).filter((l) => l.length > 10);
      if (lines.length >= 2) {
        previewSkills.push({ name: "技能详情", cd: "", cost: "", desc: lines.slice(0, 3).join("。") });
      }
    }

    if (previewSkills.length >= 2) return previewSkills;
  }

  return [{ name: "数据暂缺", cd: "", cost: "", desc: "" }];
}

// ── Main sync ───────────────────────────────────────────────────────
export async function syncHeroes(): Promise<{ inserted: number; updated: number }> {
  console.log("[sync] Fetching hero list...");
  const res = await fetch(HEROLIST_URL, {
    headers: { "User-Agent": "Mozilla/5.0" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Hero list fetch failed: ${res.status}`);
  const heroes: RawHero[] = await res.json();
  console.log(`[sync] ${heroes.length} heroes in list`);

  let inserted = 0;
  let updated = 0;
  let imageFallbacks = 0;
  let detail404s = 0;

  // Process in batches of 8 for speed
  const batchSize = 8;
  for (let b = 0; b < heroes.length; b += batchSize) {
    const batch = heroes.slice(b, b + batchSize);
    const results = await Promise.all(
      batch.map(async (h) => {
        const roleType = resolveRoleType(h);
        const html = await fetchDetail(h.ename, h.id_name);

        // Skills
        const skills = html ? parseSkills(html) : [{ name: "数据暂缺", cd: "", cost: "", desc: "" }];
        const skillsJson = JSON.stringify(skills);

        // Skins
        const skins = html ? parseSkins(html, h.title) : [{ name: h.title, index: 1 }];
        const skinsJson = JSON.stringify(skins);

        // Image: prefer bigskin-1, fallback to heroimg
        const bigskin = BIGSKIN_BASE.replace(/{id}/g, String(h.ename)).replace("{idx}", "1");
        const heroimg = HEROIMG_URL.replace(/{id}/g, String(h.ename));
        let imageUrl: string;
        if (await imgExists(bigskin)) {
          imageUrl = bigskin;
        } else {
          imageUrl = heroimg;
          imageFallbacks++;
        }

        if (!html) detail404s++;

        return { h, roleType, skillsJson, skinsJson, imageUrl, hasDetail: !!html };
      })
    );

    for (const { h, roleType, skillsJson, skinsJson, imageUrl } of results) {
      const existing = await prisma.hero.findUnique({ where: { heroId: h.ename } });
      if (!existing) {
        await prisma.hero.create({
          data: { heroId: h.ename, name: h.cname, title: h.title, roleType, heroType: h.hero_type, heroType2: h.hero_type2 ?? 0, imageUrl, skinsJson, skillsJson },
        });
        inserted++;
      } else {
        // Update official data fields, but preserve roleType (may have been manually corrected)
        await prisma.hero.update({
          where: { heroId: h.ename },
          data: { name: h.cname, title: h.title, heroType: h.hero_type, heroType2: h.hero_type2 ?? 0, imageUrl, skinsJson, skillsJson },
        });
        updated++;
      }
    }

    console.log(`[sync] ${Math.min(b + batchSize, heroes.length)}/${heroes.length} done`);
  }

  console.log(`[sync] Complete: ${inserted} new, ${updated} updated, ${imageFallbacks} img fallback, ${detail404s} no detail page`);
  return { inserted, updated };
}

// Self-execute
syncHeroes()
  .then((r) => {
    console.log(`Hero sync done: ${r.inserted} inserted, ${r.updated} updated`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("Hero sync failed:", err);
    process.exit(1);
  });
