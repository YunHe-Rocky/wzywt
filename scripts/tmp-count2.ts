import { prisma } from "../src/lib/db";
async function main() {
  for (const t of ["internalMatch","authRateLimit","combatPost","tacticRoom","matchPlayer"]) {
    try {
      const n = await (prisma as any)[t].count();
      console.log(`${t}: ${n}`);
    } catch (e: any) {
      console.log(`${t}: ${e.message}`);
    }
  }
  await prisma.$disconnect();
}
main();
