import { prisma } from "@/lib/db";
import * as fs from "fs/promises";
import * as path from "path";
import { validateCrawlUrl } from "@/lib/anti-bot";
import { readResponseBytes } from "@/lib/http-response";

const HERO_IMG_DIR = path.join(process.cwd(), "public", "heroes", "images");
const SKIN_IMG_DIR = path.join(process.cwd(), "public", "heroes", "skins");

const HERO_CDN = "https://game.gtimg.cn/images/yxzj/img201606/heroimg/{id}/{id}.jpg";
const SKIN_CDN = "https://game.gtimg.cn/images/yxzj/img201606/skin/hero-info/{id}/{id}-bigskin-{idx}.jpg";

async function pathExists(filePath: string): Promise<boolean> {
  return fs.access(filePath).then(() => true).catch(() => false);
}

async function fetchImage(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(validateCrawlUrl(url), {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Referer: "https://pvp.qq.com/",
      },
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
    if (!res.ok || !res.headers.get("content-type")?.startsWith("image/")) {
      await res.body?.cancel();
      return null;
    }
    const buffer = Buffer.from(await readResponseBytes(res, 12 * 1024 * 1024));
    return buffer.length >= 1024 ? buffer : null;
  } catch {
    return null;
  }
}

async function downloadBestImage(
  candidates: readonly string[],
  localPath: string,
): Promise<boolean> {
  const sourcePath = `${localPath}.source`;
  const previousSource = await fs.readFile(sourcePath, "utf8").catch(() => "");
  const hasLocal = await pathExists(localPath);

  for (const url of Array.from(new Set(candidates.filter(Boolean)))) {
    if (hasLocal && previousSource === url) return false;
    const buffer = await fetchImage(url);
    if (!buffer) continue;
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    const tempPath = `${localPath}.${process.pid}.tmp`;
    await fs.writeFile(tempPath, buffer);
    // copyFile 可跨平台覆盖已有文件；rename 在 Windows 上无法替换现有目标。
    await fs.copyFile(tempPath, localPath);
    await fs.unlink(tempPath).catch(() => {});
    await fs.writeFile(sourcePath, url, "utf8");
    return true;
  }
  return false;
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
    if (await downloadBestImage([heroUrl], heroPath)) heroCount++;

    const localUrl = `/heroes/images/${hero.heroId}.jpg`;
    if (!hero.imageUrl.startsWith("/heroes/")) {
      await prisma.hero.update({
        where: { heroId: hero.heroId },
        data: { imageUrl: localUrl },
      });
    }

    // Skin images
    let skins: { index: number; imageUrls?: string[] }[] = [];
    try { if (hero.skinsJson) skins = JSON.parse(hero.skinsJson); } catch { continue; }

    for (const skin of skins) {
      const skinUrl = SKIN_CDN.replace(/{id}/g, String(hero.heroId)).replace("{idx}", String(skin.index));
      const standardUrl = skinUrl.replace("-bigskin-", "-mobileskin-");
      const skinPath = path.join(SKIN_IMG_DIR, String(hero.heroId), `${skin.index}.jpg`);
      const candidates = skin.imageUrls ?? [skinUrl, standardUrl, heroUrl];
      if (await downloadBestImage(candidates, skinPath)) skinCount++;
    }
  }

  return { heroes: heroCount, skins: skinCount };
}
