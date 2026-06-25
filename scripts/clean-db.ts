// 清空所有数据，保留表结构
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("[clean] Clearing all data...");

  // 按外键依赖顺序删除
  await prisma.tempPlayerApplication.deleteMany();
  await prisma.adminOperation.deleteMany();
  await prisma.tournamentPlayer.deleteMany();
  await prisma.tournamentAdmin.deleteMany();
  await prisma.heroPower.deleteMany();
  await prisma.rolePreference.deleteMany();
  await prisma.tournament.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.heroLaneOverride.deleteMany();
  await prisma.hero.deleteMany();
  await prisma.kvCache.deleteMany();
  await prisma.user.deleteMany();

  console.log("[clean] All data cleared. Tables preserved.");
  console.log("[clean] Run 'bash scripts/deploy.sh' to re-migrate announcements and mingge.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
