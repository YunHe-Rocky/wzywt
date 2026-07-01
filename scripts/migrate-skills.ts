import { prisma } from "../src/lib/db";
import { createHash } from "crypto";

async function migrate() {
  const heroes = await prisma.hero.findMany({
    select: { heroId: true, name: true, skillsJson: true },
    where: { skillsJson: { not: "" } },
  });

  console.log(`Found ${heroes.length} heroes with skillsJson`);

  let migrated = 0;
  let skipped = 0;

  for (const hero of heroes) {
    // Check if hero_skills already populated
    const existing = await prisma.heroSkill.count({ where: { heroId: hero.heroId } });
    if (existing > 0) {
      skipped++;
      continue;
    }

    // Parse legacy JSON
    let skills: { name: string; cd: string; cost: string; desc: string }[] = [];
    try {
      skills = JSON.parse(hero.skillsJson);
    } catch {
      console.log(`  SKIP #${hero.heroId} ${hero.name}: invalid JSON`);
      skipped++;
      continue;
    }

    if (!Array.isArray(skills) || skills.length === 0) {
      skipped++;
      continue;
    }

    // Create hero_skills rows
    const rows = skills.map((s, i) => ({
      heroId: hero.heroId,
      skillIndex: i,
      name: s.name,
      cd: s.cd || "",
      cost: s.cost || "",
      desc: s.desc || "",
      dataHash: createHash("md5").update(JSON.stringify(s)).digest("hex"),
    }));

    await prisma.heroSkill.createMany({ data: rows });
    console.log(`  #${hero.heroId} ${hero.name}: ${rows.length} skills migrated`);
    migrated++;
  }

  console.log(`\nDone: ${migrated} migrated, ${skipped} skipped`);
}

migrate()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
