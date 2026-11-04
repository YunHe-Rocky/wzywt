import { prisma } from "@/lib/db";
import * as fs from "fs/promises";
import * as path from "path";
import { validateCrawlUrl } from "@/lib/anti-bot";
import { streamResponseToFile } from "@/lib/stream-download";
import { assertTaskWriteAllowed } from "@/lib/task-write-fence";
import { resourceCheckpoint } from "@/lib/resource-governor";

const HERO_IMG_DIR = path.join(process.cwd(), "public", "heroes", "images");
const SKIN_IMG_DIR = path.join(process.cwd(), "public", "heroes", "skins");
const IMAGE_REVALIDATE_MS = 24 * 60 * 60 * 1000;

import { getCrawlConfig } from "@/features/heroes/server/crawl-config";

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
  invalidFallbackUrl?: string,
): Promise<boolean> {
  const sourcePath = `${localPath}.source`;
  const sourceText = await fs.readFile(sourcePath, "utf8").catch(() => "");
  let previousUrl = sourceText;
  let previousSource: { url: string; checkedAt: number } | undefined;
  try {
    const parsed: unknown = JSON.parse(sourceText);
    if (parsed && typeof parsed === "object" && "url" in parsed && "checkedAt" in parsed
      && typeof parsed.url === "string" && typeof parsed.checkedAt === "number") {
      previousSource = { url: parsed.url, checkedAt: parsed.checkedAt };
      previousUrl = parsed.url;
    }
  } catch { /* Old URL-only sidecars require one refresh to repair stale images. */ }
  let hasLocal = await pathExists(localPath);
  if (hasLocal && invalidFallbackUrl && previousUrl === invalidFallbackUrl) {
    // These are generated caches with a positively identified old avatar
    // fallback, not user media. Stop serving the known-wrong skin immediately.
    assertTaskWriteAllowed();
    await fs.unlink(localPath);
    await fs.unlink(sourcePath).catch(() => {});
    hasLocal = false;
  }

  for (const url of Array.from(new Set(candidates.filter(Boolean)))) {
    if (hasLocal && previousSource?.url === url && Date.now() >= previousSource.checkedAt
      && Date.now() - previousSource.checkedAt < IMAGE_REVALIDATE_MS) return false;
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
    await fs.writeFile(sourcePath, JSON.stringify({ url, checkedAt: Date.now() }), "utf8");
    return true;
  }
  return false;
}

export async function downloadAllImages(): Promise<{ heroes: number; skins: number }> {
  const config = await getCrawlConfig();
  const heroes = await prisma.hero.findMany({
    select: { heroId: true, imageUrl: true, skinsJson: true },
  });

  let heroCount = 0;
  let skinCount = 0;

  for (const hero of heroes) {
    await resourceCheckpoint("hero-images");
    // Hero avatar
    const heroUrl = config.hero_img_base.replace(/{id}/g, String(hero.heroId));
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
      const skinUrl = config.skin_img_base.replace(/{id}/g, String(hero.heroId)).replace(/{idx}/g, String(skin.index));
      const standardUrl = skinUrl.replace("-bigskin-", "-mobileskin-");
      const skinPath = path.join(SKIN_IMG_DIR, String(hero.heroId), `${skin.index}.jpg`);
      // Never persist an avatar under a skin filename. Old metadata included
      // the avatar as a fallback, permanently disguising missing skin images.
      const candidates = [skinUrl, standardUrl];
      if (await downloadBestImage(candidates, skinPath, heroUrl)) skinCount++;
    }
  }

  return { heroes: heroCount, skins: skinCount };
}
