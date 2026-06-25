// 只清测试数据：删除测试用户及其关联数据、测试赛事
// 保留：英雄数据、命格绑定、公告、KV缓存
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TEST_USERS = ["剑仙小李","打野王者","中路法王","射手大神","辅助之光","边路战神","野区之王","中单教父","百里穿杨","游走大师"];

async function main() {
  // 找到测试用户ID
  const users = await prisma.user.findMany({ where: { username: { in: TEST_USERS } } });
  const userIds = users.map(u => u.id);

  // 删关联数据
  await prisma.tempPlayerApplication.deleteMany({ where: { applicantId: { in: userIds } } });
  await prisma.adminOperation.deleteMany({ where: { adminId: { in: userIds } } });
  await prisma.tournamentPlayer.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.tournamentAdmin.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.heroPower.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.rolePreference.deleteMany({ where: { userId: { in: userIds } } });

  // 删测试用户创建的赛事
  const tournaments = await prisma.tournament.findMany({ where: { admins: { some: { userId: { in: userIds } } } } });
  const tIds = tournaments.map(t => t.id);
  if (tIds.length > 0) {
    await prisma.tempPlayerApplication.deleteMany({ where: { tournamentId: { in: tIds } } });
    await prisma.adminOperation.deleteMany({ where: { tournamentId: { in: tIds } } });
    await prisma.tournamentPlayer.deleteMany({ where: { tournamentId: { in: tIds } } });
    await prisma.tournamentAdmin.deleteMany({ where: { tournamentId: { in: tIds } } });
    await prisma.tournament.deleteMany({ where: { id: { in: tIds } } });
  }

  // 删测试用户
  const r = await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  console.log(`已清理: ${r.count} 用户, ${tIds.length} 赛事`);
  console.log('保留: 英雄数据、命格绑定、公告');
}

main().catch(console.error).finally(() => prisma.$disconnect());
