// 直接写DB创建用户+赛事，绕过注册API
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const USERS = ["剑仙小李","打野王者","中路法王","射手大神","辅助之光","边路战神","野区之王","中单教父","百里穿杨","游走大师"];
const PWD = "12345678901";

async function main() {
  const hash = await bcrypt.hash(PWD, 10);
  const hashAnswer = await bcrypt.hash("北京", 10);

  console.log("创建用户...");
  const userIds: number[] = [];
  for (const name of USERS) {
    const existing = await prisma.user.findFirst({ where: { username: name } });
    if (existing) {
      userIds.push(existing.id);
      console.log(`  ✓ ${name} (已存在)`);
    } else {
      const u = await prisma.user.create({
        data: { username: name, passwordHash: hash, securityQuestion: "你的出生城市是？", securityAnswerHash: hashAnswer },
      });
      userIds.push(u.id);
      console.log(`  + ${name}`);
    }
  }

  // 给每人设段位+英雄
  console.log("\n设置段位...");
  const roles = ["top","jungle","mid","adc","support"];
  const heroes: Record<string, {id:number,name:string,power:number}[]> = {
    top: [{id:183,name:"亚瑟",power:8000},{id:146,name:"吕布",power:7200}],
    jungle: [{id:167,name:"孙悟空",power:9000},{id:121,name:"兰陵王",power:7000}],
    mid: [{id:106,name:"小乔",power:8500},{id:157,name:"不知火舞",power:7500}],
    adc: [{id:169,name:"后羿",power:8800},{id:174,name:"虞姬",power:6600}],
    support: [{id:108,name:"墨子",power:6000},{id:118,name:"孙膑",power:5500}],
  };

  for (let i = 0; i < userIds.length; i++) {
    const uid = userIds[i];
    const topRole = ["top","jungle","mid","adc","support","top","jungle","mid","adc","support"][i];
    const ordered = [topRole, ...roles.filter(r => r !== topRole)];
    const rank = [7,8,9,8,7,8,7,7,7,6][i];
    const peak = [1800,2100,2400,1900,1600,2000,2200,1700,2300,1500][i];

    for (let j = 0; j < ordered.length; j++) {
      await prisma.rolePreference.upsert({
        where: { userId_roleType: { userId: uid, roleType: ordered[j] } },
        create: { userId: uid, roleType: ordered[j], preferenceRank: j+1, roleRank: rank, peakScore: peak, peakRank: rank },
        update: { preferenceRank: j+1, roleRank: rank, peakScore: peak, peakRank: rank },
      });
      for (const h of heroes[ordered[j]]) {
        await prisma.heroPower.create({
          data: { userId: uid, roleType: ordered[j], heroId: h.id, heroName: h.name, powerScore: h.power + Math.floor(Math.random()*3000) },
        });
      }
    }
  }
  console.log("  ✓ 10人数据完成");

  // 创建赛事
  console.log("\n创建赛事...");
  const deadline = new Date(Date.now() + 86400000);
  const t = await prisma.tournament.create({
    data: {
      name: "周五内战测试", code: "TEST01", deadline, isPublic: true,
      players: { create: userIds.map((uid, i) => ({ userId: uid, isSpectator: false })) },
      admins: { create: { userId: userIds[0], role: "owner" } },
    },
  });
  console.log(`  房间: ${t.name} #${t.code} (ID:${t.id})`);

  // 分队
  console.log("\n执行分队...");
  const { splitTeam } = await import("../src/lib/split");
  const players = await prisma.tournamentPlayer.findMany({ where: { tournamentId: t.id, isSpectator: false } });
  const prefs = await prisma.rolePreference.findMany({ where: { userId: { in: players.map(p => p.userId) } } });
  const powers = await prisma.heroPower.findMany({ where: { userId: { in: players.map(p => p.userId) } } });
  const usernames = await prisma.user.findMany({ where: { id: { in: players.map(p => p.userId) } }, select: { id: true, username: true } });
  const nameMap = new Map(usernames.map(u => [u.id, u.username]));

  const input = players.map(p => ({
    userId: p.userId,
    username: nameMap.get(p.userId) || "?",
    prefs: prefs.filter(f => f.userId === p.userId).map(f => ({ roleType: f.roleType, preferenceRank: f.preferenceRank, roleRank: f.roleRank, peakScore: f.peakScore, peakRank: f.peakRank })),
    heroes: powers.filter(h => h.userId === p.userId).map(h => ({ heroId: h.heroId, heroName: h.heroName, powerScore: h.powerScore, roleType: h.roleType })),
  }));

  const result = splitTeam(input);
  await prisma.tournament.update({ where: { id: t.id }, data: { splitResult: JSON.stringify(result), status: "locked" } });

  console.log(`  ✓ 分队完成! 战力差: ${result.powerDiff}`);
  console.log(`\n=== 完成 ===`);
  console.log(`赛事: http://ywt.yunhe.ink/tournaments/${t.id}`);
  console.log(`邀请码: ${t.code}`);
  console.log(`账号: ${USERS[0]}~${USERS[9]} / ${PWD}`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
