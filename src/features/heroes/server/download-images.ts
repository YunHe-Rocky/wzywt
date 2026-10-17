import { prisma } from "@/lib/db";
import * as fs from "fs/promises";
import * as path from "path";
import { validateCrawlUrl } from "@/lib/anti-bot";
import { streamResponseToFile } from "@/lib/stream-download";
import { assertTaskWriteAllowed } from "@/lib/task-write-fence";
import { resourceCheckpoint } from "@/lib/resource-governor";

const HERO_IMG_DIR = path.join(process.cwd(), "public", "heroes", "images");
const SKIN_IMG_DIR = path.join(process.cwd(), "public", "heroes", "skins");

const HERO_CDN = "https://game.gtimg.cn/images/yxzj/img201606/heroimg/{id}/{id}.jpg";
const SKIN_CDN = "https://game.gtimg.cn/images/yxzj/img201606/skin/hero-info/{id}/{id}-bigskin-{idx}.jpg";

async function pathExists(filePath: string): Promise<boolean> {
  return fs.access(filePath).then(() => true).catch(() => false);
}

async function fetchImage(url: string, temporaryPath: string): Promise<boolean> {
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
      return false;
    }
    await streamResponseToFile(res, temporaryPath, 12 * 1024 * 1024, 1024);
    return true;
  } catch {
    return false;
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
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    const tempPath = `${localPath}.${process.pid}.tmp`;
    try {
      if (!await fetchImage(url, tempPath)) continue;
      assertTaskWriteAllowed();
      // Same-directory rename keeps concurrent readers on a complete old/new image.
      await fs.rename(tempPath, localPath);
    } finally {
      await fs.unlink(tempPath).catch(() => {});
    }
    assertTaskWriteAllowed();
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
    await resourceCheckpoint("hero-images");
    // Hero avatar
    const heroUrl = HERO_CDN.replace(/{id}/g, String(hero.heroId));
    const heroPath = path.join(HERO_IMG_DIR, `${hero.heroId}.jpg`);
    if (await downloadBestImage([heroUrl], heroPath)) heroCount++;

    const localUrl = `/heroes/images/${hero.heroId}.jpg`;
    // A failed download must not replace a working remote URL with a missing file.
    if (hero.imageUrl !== localUrl && await pathExists(heroPath)) {
      await prisma.hero.update({
        where: { heroId: hero.heroId },
        data: { imageUrl: localUrl },
      });
    }

    // Skin images
    let skins: unknown = [];
    try { if (hero.skinsJson) skins = JSON.parse(hero.skinsJson); } catch { continue; }
    if (!Array.isArray(skins)) continue;

    for (const skin of skins) {
      await resourceCheckpoint("skin-images");
      if (!skin || typeof skin !== "object" || !Number.isSafeInteger(skin.index) || skin.index < 1) continue;
      const skinUrl = SKIN_CDN.replace(/{id}/g, String(hero.heroId)).replace("{idx}", String(skin.index));
      const standardUrl = skinUrl.replace("-bigskin-", "-mobileskin-");
      const skinPath = path.join(SKIN_IMG_DIR, String(hero.heroId), `${skin.index}.jpg`);
      const candidates = Array.isArray(skin.imageUrls)
        ? skin.imageUrls.filter((url: unknown): url is string => typeof url === "string" && url.length > 0)
        : [];
      if (candidates.length === 0) candidates.push(skinUrl, standardUrl, heroUrl);
      if (await downloadBestImage(candidates, skinPath)) skinCount++;
    }
  }

  return { heroes: heroCount, skins: skinCount };
}
