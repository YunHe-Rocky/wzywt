import { prisma } from "../src/lib/db";
import { parseSkillDamage } from "../src/core/game/data";

async function main() {
  const skills = await prisma.heroSkill.findMany({
    orderBy: [{ heroId: "asc" }, { skillIndex: "asc" }],
  });

  let updated = 0;
  let skipped = 0;

  for (const skill of skills) {
    const damage = parseSkillDamage(skill.desc, skill.damageType);

    const hasData = damage.length > 0;
    const oldExtra = (skill.extraJson as Record<string, unknown>) || {};

    // Keep existing extraJson fields if any
    const newExtra = { ...oldExtra, damage };

    // Only update if damage data changed
    const oldDamage = oldExtra.damage;
    if (JSON.stringify(oldDamage) === JSON.stringify(damage) && !hasData) {
      skipped++;
      continue;
    }

    try {
      await prisma.heroSkill.update({
        where: { heroId_skillIndex: { heroId: skill.heroId, skillIndex: skill.skillIndex } },
        data: { extraJson: newExtra as any },
      });

      if (hasData) {
        console.log(`[${skill.heroId}:${skill.skillIndex}] ${skill.name} → ${damage.length} effects`);
        updated++;
      }
    } catch (err: any) {
      if (err?.code === "P2025") {
        console.warn(`[WARN] heroId=${skill.heroId} skillIndex=${skill.skillIndex} not found, skipping`);
      } else {
        throw err;
      }
    }
  }

  console.log(`\nDone: ${updated} updated, ${skipped} skipped, ${skills.length} total`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
