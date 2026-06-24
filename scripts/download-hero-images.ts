import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();
const HERO_IMG_DIR = path.join(__dirname, "..", "public", "heroes", "images");
const SKIN_IMG_DIR = path.join(__dirname, "..", "public", "heroes", "skins");

const HERO_CDN = "https://game.gtimg.cn/images/yxzj/img201606/heroimg/{id}/{id}.jpg";
const SKIN_CDN = "https://game.gtimg.cn/images/yxzj/img201606/skin/hero-info/{id}/{id}-bigskin-{idx}.jpg";

async function downloadIfMissing(url: string, localPath: string): Promise<boolean> {
  if (fs.existsSync(localPath)) return false; // already downloaded

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
    select: { heroId: true, name: true, imageUrl: true, skinsJson: true },
  });

  let heroCount = 0;
  let skinCount = 0;

  for (const hero of heroes) {
    // Download hero avatar
    const heroUrl = HERO_CDN.replace(/{id}/g, String(hero.heroId));
    const heroPath = path.join(HERO_IMG_DIR, `${hero.heroId}.jpg`);
    if (await downloadIfMissing(heroUrl, heroPath)) {
      heroCount++;
    }

    // Update DB to point to local if needed
    const localUrl = `/heroes/images/${hero.heroId}.jpg`;
    if (!hero.imageUrl.startsWith("/heroes/")) {
      await prisma.hero.update({
        where: { heroId: hero.heroId },
        data: { imageUrl: localUrl },
      });
    }

    // Download skin images
    let skinNames: { name: string; index: number }[] = [];
    try {
      if (hero.skinsJson) skinNames = JSON.parse(hero.skinsJson);
    } catch { continue; }

    for (const skin of skinNames) {
      const skinUrl = SKIN_CDN.replace(/{id}/g, String(hero.heroId)).replace("{idx}", String(skin.index));
      const skinPath = path.join(SKIN_IMG_DIR, String(hero.heroId), `${skin.index}.jpg`);
      if (await downloadIfMissing(skinUrl, skinPath)) {
        skinCount++;
      }
    }
  }

  return { heroes: heroCount, skins: skinCount };
}

// CLI entry
async function main() {
  console.log("Downloading hero + skin images...\n");
  const result = await downloadAllImages();
  console.log(`Heroes: ${result.heroes} downloaded`);
  console.log(`Skins:  ${result.skins} downloaded`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
