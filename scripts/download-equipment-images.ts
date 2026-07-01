import { prisma } from "../src/lib/db";
import * as fs from "fs";
import * as path from "path";

const IMG_DIR = path.join(process.cwd(), "public", "equipment", "images");
const CDN_BASE = "https://game.gtimg.cn/images/yxzj/img201606/itemimgo";

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

async function main() {
  const items = await prisma.equipment.findMany({ select: { itemId: true } });
  console.log(`Downloading images for ${items.length} items...`);

  let downloaded = 0;
  for (const item of items) {
    const url = `${CDN_BASE}/${item.itemId}.png`;
    const localPath = path.join(IMG_DIR, `${item.itemId}.png`);
    if (await downloadIfMissing(url, localPath)) {
      downloaded++;
      if (downloaded % 20 === 0) console.log(`  ${downloaded}...`);
    }
    // Update imageUrl to local path
    const localUrl = `/equipment/images/${item.itemId}.png`;
    await prisma.equipment.update({
      where: { itemId: item.itemId },
      data: { imageUrl: localUrl },
    });
  }

  console.log(`Done: ${downloaded} downloaded, ${items.length} total`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
