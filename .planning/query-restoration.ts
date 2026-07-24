import { prisma } from "../src/lib/db";

async function main(): Promise<void> {
  const heroes = await prisma.hero.findMany({
    where: { heroId: { in: [167, 549] } },
    select: {
      heroId: true,
      name: true,
      title: true,
      skinsJson: true,
      mingge: true,
      minggeName: true,
      minggeRelatedId: true,
      imageUrl: true,
    },
  });

  console.log(JSON.stringify(heroes, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
