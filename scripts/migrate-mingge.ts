// 命格关系绑定 — 爬虫无法自动检测双向关联，需手动维护此映射
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 命格映射表：{ 本命英雄名: "命格形态名" }
// 新增命格时在此添加条目即可
const MINGGE_MAP: Record<string, string> = {
  "孙悟空": "心魔六耳",
};

async function main() {
  for (const [baseName, minggeName] of Object.entries(MINGGE_MAP)) {
    const base = await prisma.hero.findFirst({ where: { name: baseName } });
    const mingge = await prisma.hero.findFirst({ where: { name: minggeName } });

    if (!base) {
      console.log(`[mingge] 本命英雄 ${baseName} 不存在，等待同步`);
      continue;
    }
    if (!mingge) {
      console.log(`[mingge] 命格英雄 ${minggeName} 不存在，等待同步`);
      continue;
    }

    await prisma.hero.update({
      where: { heroId: base.heroId },
      data: { mingge: true, minggeName, minggeRelatedId: mingge.heroId },
    });
    await prisma.hero.update({
      where: { heroId: mingge.heroId },
      data: { mingge: true, minggeName: baseName, minggeRelatedId: base.heroId },
    });

    console.log(`[mingge] ${baseName}(#${base.heroId}) ↔ ${minggeName}(#${mingge.heroId}) 已绑定`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
