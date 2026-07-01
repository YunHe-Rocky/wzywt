import { prisma } from "../src/lib/db";
import { HERO_STAT_PROFILES } from "../src/engine/combat";

async function main() {
  const heroes = await prisma.hero.findMany();
  let done = 0;
  for (const hero of heroes) {
    const profile = HERO_STAT_PROFILES[hero.heroType] || HERO_STAT_PROFILES[1];
    if (!profile) continue;
    for (let retry = 0; retry < 3; retry++) {
      try {
        await prisma.hero.update({
          where: { heroId: hero.heroId },
          data: {
            baseJson: {
              ...profile.base,
              hpPerLv: profile.growth.hpPerLv,
              mpPerLv: profile.growth.mpPerLv,
              atkPerLv: profile.growth.atkPerLv,
              apPerLv: profile.growth.apPerLv,
              defPerLv: profile.growth.defPerLv,
              mdefPerLv: profile.growth.mdefPerLv,
              atkSpeedPerLv: profile.growth.atkSpeedPerLv,
            },
          },
        });
        done++;
        break;
      } catch { await new Promise(r => setTimeout(r, 1000)); }
    }
  }
  console.log(`Seeded ${done}/${heroes.length} heroes with base stats`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
