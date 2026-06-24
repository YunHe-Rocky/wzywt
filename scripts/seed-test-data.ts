const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const p = new PrismaClient();

async function main() {
  console.log('清空数据...');
  await p.adminOperation.deleteMany();
  await p.tempPlayerApplication.deleteMany();
  await p.tournamentPlayer.deleteMany();
  await p.tournamentAdmin.deleteMany();
  await p.heroPower.deleteMany();
  await p.rolePreference.deleteMany();
  await p.tournament.deleteMany();
  await p.user.deleteMany();
  console.log('已清空');

  const hash = await bcrypt.hash('12345678901', 10);
  const users: any[] = [];
  for (let i = 1; i <= 10; i++) {
    const u = await p.user.create({
      data: {
        username: 'test' + i,
        passwordHash: hash,
        email: 'test' + i + '@qq.com',
        emailVerified: true,
      }
    });
    users.push(u);
  }
  console.log('创建10个用户: test1 ~ test10');

  const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const t = await p.tournament.create({
    data: {
      name: '测试内战房间',
      code: '123456',
      deadline,
      isPublic: true,
      announcement: '欢迎加入测试房间！房间号 123456',
      admins: { create: { userId: users[0].id, role: 'owner' } },
      players: { create: { userId: users[0].id, isSpectator: false } },
    }
  });

  for (let i = 1; i < 10; i++) {
    await p.tournamentPlayer.create({
      data: { tournamentId: t.id, userId: users[i].id, isSpectator: false },
    });
  }

  console.log('');
  console.log('=== 完成 ===');
  console.log('房间: ' + t.name + ' (#' + t.code + ')');
  console.log('房主: test1');
  console.log('选手: test1 ~ test10 (10人)');
  console.log('');
  console.log('账号密码:');
  console.log('  test1 ~ test10 / 12345678901');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
