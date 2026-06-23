import { prisma } from "./db";
import { load } from "cheerio";

const HEROLIST_URL = "https://pvp.qq.com/web201605/js/herolist.json";
const HERODETAIL_URL = "https://pvp.qq.com/web201605/herodetail/{id}.shtml";

interface RawHero {
  ename: number;
  cname: string;
  title: string;
  hero_type: number; // 1=战士 2=法师 3=坦克 4=刺客 5=射手 6=辅助
}

function mapRoleType(heroType: number): string {
  if (heroType === 1 || heroType === 3) return "top";
  if (heroType === 2) return "mid";
  if (heroType === 4) return "jungle";
  if (heroType === 5) return "adc";
  if (heroType === 6) return "support";
  return "top";
}

async function fetchHeroDetail(heroId: number): Promise<string> {
  try {
    const url = HERODETAIL_URL.replace("{id}", String(heroId));
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    const html = await res.text();
    return html;
  } catch {
    return "";
  }
}

function parseSkillsFromHtml(html: string): object[] {
  const $ = load(html);
  const skills: object[] = [];
  $(".skill-show").each((_: number, el: any) => {
    const name = $(el).find(".skill-name b").text().trim() || "";
    const cd = $(el).find(".skill-cd").text().trim() || "";
    const cost = $(el).find(".skill-cost").text().trim() || "";
    const desc = $(el).find(".skill-desc").text().trim() || "";
    if (name) skills.push({ name, cd, cost, desc });
  });
  return skills.length > 0 ? skills : [{ name: "数据暂缺", cd: "", cost: "", desc: "" }];
}

export async function syncHeroes(): Promise<{ inserted: number; updated: number }> {
  const res = await fetch(HEROLIST_URL, {
    headers: { "User-Agent": "Mozilla/5.0" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Hero list fetch failed: ${res.status}`);
  const heroes: RawHero[] = await res.json();

  let inserted = 0;
  let updated = 0;

  for (const h of heroes) {
    const roleType = mapRoleType(h.hero_type);
    const html = await fetchHeroDetail(h.ename);
    const skillsJson = JSON.stringify(html ? parseSkillsFromHtml(html) : []);

    const existing = await prisma.hero.findUnique({ where: { heroId: h.ename } });
    if (!existing) {
      await prisma.hero.create({
        data: { heroId: h.ename, name: h.cname, title: h.title, roleType, skillsJson },
      });
      inserted++;
    } else {
      await prisma.hero.update({
        where: { heroId: h.ename },
        data: { name: h.cname, title: h.title, roleType, skillsJson },
      });
      updated++;
    }
  }

  return { inserted, updated };
}
