import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();
const PUBLIC_DIR = path.join(__dirname, "..", "public", "heroes", "images");

async function main() {
  const heroes = await prisma.hero.findMany({ select: { heroId: true, name: true, imageUrl: true } });
  console.log(`Downloading ${heroes.length} hero images...`);

  // Ensure directory exists
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });

  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (const hero of heroes) {
    const localPath = path.join(PUBLIC_DIR, `${hero.heroId}.jpg`);
    const localUrl = `/heroes/images/${hero.heroId}.jpg`;

    // Skip if already downloaded
    if (fs.existsSync(localPath)) {
      skipped++;
      // Still ensure the DB points to local
      if (!hero.imageUrl.startsWith("/heroes/")) {
        await prisma.hero.update({
          where: { heroId: hero.heroId },
          data: { imageUrl: localUrl },
        });
      }
      continue;
    }

    try {
      const res = await fetch(hero.imageUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        console.error(`  ${hero.heroId} ${hero.name}: HTTP ${res.status}`);
        failed++;
        continue;
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(localPath, buffer);

      // Update DB to point to local path
      await prisma.hero.update({
        where: { heroId: hero.heroId },
        data: { imageUrl: localUrl },
      });

      success++;
      console.log(`  ${hero.heroId} ${hero.name}: OK (${(buffer.length / 1024).toFixed(0)}KB)`);
    } catch (err) {
      console.error(`  ${hero.heroId} ${hero.name}: ${err instanceof Error ? err.message : "unknown"}`);
      failed++;
    }
  }

  console.log(`\nDone: ${success} downloaded, ${skipped} skipped, ${failed} failed`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
