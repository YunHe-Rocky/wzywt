import { prisma } from "@/lib/db";
import * as fs from "fs";
import * as path from "path";

const HERO_IMG_DIR = path.join(process.cwd(), "public", "heroes", "images");
const SKIN_IMG_DIR = path.join(process.cwd(), "public", "heroes", "skins");

const HERO_CDN = "https://game.gtimg.cn/images/yxzj/img201606/heroimg/{id}/{id}.jpg";
const SKIN_CDN = "https://game.gtimg.cn/images/yxzj/img201606/skin/hero-info/{id}/{id}-bigskin-{idx}.jpg";

async function downloadIfMissing(url: string, localPath: string): Promise<boolean> {
  if (fs.existsSync(localPath)) return false;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return false;
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    fs.writeFileSync(localPath, buffer);
    return true;
  } catch {
    return false;
  }
}

export async function downloadAllImages(): Promise<{ heroes: number; skins: number }> {
  const heroes = await prisma.hero.findMany({
    select: { heroId: true, imageUrl: true, skinsJson: true },
  });

  let heroCount = 0;
  let skinCount = 0;

  for (const hero of heroes) {
    // Hero avatar
    const heroUrl = HERO_CDN.replace(/{id}/g, String(hero.heroId));
    const heroPath = path.join(HERO_IMG_DIR, `${hero.heroId}.jpg`);
    if (await downloadIfMissing(heroUrl, heroPath)) heroCount++;

    const localUrl = `/heroes/images/${hero.heroId}.jpg`;
    if (!hero.imageUrl.startsWith("/heroes/")) {
      await prisma.hero.update({
        where: { heroId: hero.heroId },
        data: { imageUrl: localUrl },
      });
    }

    // Skin images
    let skins: { index: number }[] = [];
    try { if (hero.skinsJson) skins = JSON.parse(hero.skinsJson); } catch { continue; }

    for (const skin of skins) {
      const skinUrl = SKIN_CDN.replace(/{id}/g, String(hero.heroId)).replace("{idx}", String(skin.index));
      const skinPath = path.join(SKIN_IMG_DIR, String(hero.heroId), `${skin.index}.jpg`);
      if (await downloadIfMissing(skinUrl, skinPath)) skinCount++;
    }
  }

  return { heroes: heroCount, skins: skinCount };
}
