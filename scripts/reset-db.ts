// 只保留英雄/公告/命格，其余全部清空
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  await p.tempPlayerApplication.deleteMany();
  await p.adminOperation.deleteMany();
  await p.tournamentPlayer.deleteMany();
  await p.tournamentAdmin.deleteMany();
  await p.heroPower.deleteMany();
  await p.rolePreference.deleteMany();
  await p.tournament.deleteMany();
  await p.user.deleteMany();
  console.log("✓ 已清空：用户、赛事、战力、偏好");
  console.log("✓ 保留：英雄、公告、命格绑定");
}
main().catch(console.error).finally(() => p.$disconnect());
