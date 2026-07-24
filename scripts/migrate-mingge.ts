// 命格关系绑定 — 爬虫无法自动检测双向关联，需手动维护此映射
import { PrismaClient } from "@prisma/client";
import { KNOWN_MINGGE_PAIRS } from "@/features/heroes/model";

const prisma = new PrismaClient();

async function main() {
  for (const pair of KNOWN_MINGGE_PAIRS) {
    const base = await prisma.hero.findUnique({ where: { heroId: pair.baseId } });
    const mingge = await prisma.hero.findUnique({ where: { heroId: pair.formId } });

    if (!base) {
      console.log(`[mingge] 本命英雄 ${pair.baseName} 不存在，等待同步`);
      continue;
    }
    if (!mingge) {
      console.log(`[mingge] 命格英雄 ${pair.formName} 不存在，等待同步`);
      continue;
    }

    await prisma.hero.update({
      where: { heroId: base.heroId },
      data: { mingge: true, minggeName: pair.formName, minggeRelatedId: pair.formId },
    });
    await prisma.hero.update({
      where: { heroId: mingge.heroId },
      data: { mingge: true, minggeName: null, minggeRelatedId: pair.baseId },
    });

    console.log(`[mingge] ${pair.baseName}(#${base.heroId}) ↔ ${pair.formName}(#${mingge.heroId}) 已绑定`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
