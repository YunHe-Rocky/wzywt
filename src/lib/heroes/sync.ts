import { prisma } from "../db";
import { load } from "cheerio";
import * as iconv from "iconv-lite";
import { getHeaders } from "../anti-bot";

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
          headers: getHeaders(),
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
    const res = await fetch(url, {
      method: "HEAD",
      headers: getHeaders(),
      signal: AbortSignal.timeout(5000),
    });
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

// ── Parse 命格 ─────────────────────────────────────────────────────
function parseMingGe(html: string): { hasMingGe: boolean; mingGeName: string | null } {
  // 查找详情页中是否有"命格"相关 tab/section
  // 常见模式：
  // 1. 导航 tab 中包含"命格"文字
  // 2. 页面中有 mingge/fate 相关的 class 或 id
  // 3. data 属性中包含命格信息

  if (html.includes("命格")) {
    // 尝试提取命格形态名称
    // 匹配模式如: "命格：心魔六耳" 或 "命格形态：心魔六耳" 或 data-name="心魔六耳"
    const nameMatch = html.match(/命格[：:]\s*([^<\s]+)/) ||
      html.match(/命格形态[：:]\s*([^<\s]+)/) ||
      html.match(/data-mingge-name="([^"]+)"/) ||
      html.match(/命格名称[：:]\s*([^<\s]+)/);
    return { hasMingGe: true, mingGeName: nameMatch ? sanitize(nameMatch[1]) : null };
  }

  return { hasMingGe: false, mingGeName: null };
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
  const { fetchWithRetry } = await import("../anti-bot");
  const res = await fetchWithRetry(HEROLIST_URL, {
    timeout: 15000,
    referer: "https://pvp.qq.com/",
    isJson: true,
  });
  if (!res.ok || !res.json) throw new Error(`Hero list fetch failed: ${res.status}`);
  const heroes: RawHero[] = res.json as RawHero[];
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

        // 命格
        const mingGe = html ? parseMingGe(html) : { hasMingGe: false, mingGeName: null };

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

        return { h, roleType, skillsJson, skinsJson, imageUrl, hasDetail: !!html, mingGe };
      })
    );

    for (const { h, roleType, skillsJson, skinsJson, imageUrl, mingGe } of results) {
      const existing = await prisma.hero.findUnique({ where: { heroId: h.ename } });
      if (!existing) {
        await prisma.hero.create({
          data: { heroId: h.ename, name: h.cname, title: h.title, roleType, heroType: h.hero_type, heroType2: h.hero_type2 ?? 0, imageUrl, skinsJson, skillsJson, mingge: mingGe.hasMingGe, minggeName: mingGe.mingGeName },
        });
        console.log(`[sync] NEW #${h.ename} ${h.cname}${mingGe.hasMingGe ? ` 命格:${mingGe.mingGeName || '?'}` : ""}`);
        inserted++;
      } else {
        // Compare for changes
        const changes: string[] = [];
        if (existing.name !== h.cname) changes.push(`name:${existing.name}→${h.cname}`);
        if (existing.title !== h.title) changes.push(`title:${existing.title}→${h.title}`);
        if (existing.heroType !== h.hero_type) changes.push(`heroType:${existing.heroType}→${h.hero_type}`);
        if (existing.heroType2 !== (h.hero_type2 ?? 0)) changes.push(`heroType2:${existing.heroType2}→${h.hero_type2 ?? 0}`);
        if (existing.imageUrl !== imageUrl) changes.push(`imageUrl changed`);
        if (mingGe.hasMingGe && existing.mingge !== mingGe.hasMingGe) changes.push(`mingge:${existing.mingge}→${mingGe.hasMingGe}`);
        if (mingGe.hasMingGe && (existing.minggeName || null) !== mingGe.mingGeName) changes.push(`minggeName:${existing.minggeName}→${mingGe.mingGeName}`);

        if (changes.length > 0) {
          console.log(`[sync] #${h.ename} ${h.cname}: ${changes.join(" | ")}`);
        }

        // Update official data fields, preserve roleType & mingge (manually maintained)
        const updateData: Record<string, unknown> = {
          name: h.cname, title: h.title, heroType: h.hero_type, heroType2: h.hero_type2 ?? 0, imageUrl, skinsJson, skillsJson,
        };
        // Only update mingge if crawler detected it OR if existing wasn't set
        if (mingGe.hasMingGe || !existing.mingge) {
          updateData.mingge = mingGe.hasMingGe;
          updateData.minggeName = mingGe.mingGeName;
        }
        await prisma.hero.update({ where: { heroId: h.ename }, data: updateData });
        updated++;
      }
    }

    console.log(`[sync] ${Math.min(b + batchSize, heroes.length)}/${heroes.length} done`);
  }

  console.log(`[sync] Complete: ${inserted} new, ${updated} updated, ${imageFallbacks} img fallback, ${detail404s} no detail page`);
  return { inserted, updated };
}

// Self-execute only when run via `npx tsx src/lib/heroes/sync.ts`
// (removed from auto-execution to prevent accidental triggers)
