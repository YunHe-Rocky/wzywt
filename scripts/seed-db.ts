// 直接写DB创建用户+赛事，绕过注册API
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const USERS = ["剑仙小李","打野王者","中路法王","射手大神","辅助之光","边路战神","野区之王","中单教父","百里穿杨","游走大师"];
const PWD = "12345678901";

async function main() {
  // 先清理旧数据
  console.log("清理旧数据...");
  await prisma.tempPlayerApplication.deleteMany();
  await prisma.adminOperation.deleteMany();
  await prisma.tournamentPlayer.deleteMany();
  await prisma.tournamentAdmin.deleteMany();
  await prisma.heroPower.deleteMany();
  await prisma.rolePreference.deleteMany();
  await prisma.tournament.deleteMany();
  // 保留用户：如果已存在则跳过创建
  console.log("  旧赛事+战力已清理，用户保留\n");

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

  // 每人数据不同，制造实力偏差
  const data = [
    { name:"剑仙小李", topRole:"top", rank:7, peak:1800, mainPower:8500, offPower:4000 },
    { name:"打野王者", topRole:"jungle", rank:8, peak:2200, mainPower:9500, offPower:3000 },
    { name:"中路法王", topRole:"mid", rank:9, peak:2500, mainPower:10000, offPower:2000 },
    { name:"射手大神", topRole:"adc", rank:8, peak:2000, mainPower:9200, offPower:3500 },
    { name:"辅助之光", topRole:"support", rank:7, peak:1600, mainPower:7200, offPower:5000 },
    { name:"边路战神", topRole:"top", rank:8, peak:2100, mainPower:9000, offPower:3800 },
    { name:"野区之王", topRole:"jungle", rank:6, peak:1400, mainPower:7800, offPower:5500 },
    { name:"中单教父", topRole:"mid", rank:5, peak:1200, mainPower:6500, offPower:6000 },
    { name:"百里穿杨", topRole:"adc", rank:9, peak:2400, mainPower:9800, offPower:2500 },
    { name:"游走大师", topRole:"support", rank:4, peak:1000, mainPower:5500, offPower:7000 },
  ];

  for (let i = 0; i < userIds.length; i++) {
    const uid = userIds[i];
    const d = data[i];
    const ordered = [d.topRole, ...roles.filter(r => r !== d.topRole)];

    for (let j = 0; j < ordered.length; j++) {
      const role = ordered[j];
      const isMain = j === 0;
      await prisma.rolePreference.upsert({
        where: { userId_roleType: { userId: uid, roleType: role } },
        create: { userId: uid, roleType: role, preferenceRank: j+1, roleRank: d.rank, peakScore: d.peak, peakRank: Math.min(9,d.rank+1) },
        update: { preferenceRank: j+1, roleRank: d.rank, peakScore: d.peak, peakRank: Math.min(9,d.rank+1) },
      });
      for (const h of heroes[role]) {
        await prisma.heroPower.upsert({
          where: { userId_heroId_roleType: { userId: uid, heroId: h.id, roleType: role } },
          create: { userId: uid, roleType: role, heroId: h.id, heroName: h.name,
            powerScore: isMain ? d.mainPower + Math.floor(Math.random()*2000) : d.offPower + Math.floor(Math.random()*3000) },
          update: { powerScore: isMain ? d.mainPower + Math.floor(Math.random()*2000) : d.offPower + Math.floor(Math.random()*3000) },
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
      name: "周五内战测试", code: "T" + Date.now().toString(36).toUpperCase().slice(-5), deadline, isPublic: true,
      players: { create: userIds.map((uid, i) => ({ userId: uid, isSpectator: false })) },
      admins: { create: { userId: userIds[0], role: "owner" } },
    },
  });
  console.log(`  房间: ${t.name} #${t.code} (ID:${t.id})`);

  // 分队
  console.log("\n执行分队...");
  const { splitTeams } = await import("../src/lib/split");
  const players = await prisma.tournamentPlayer.findMany({ where: { tournamentId: t.id, isSpectator: false } });
  const prefs = await prisma.rolePreference.findMany({ where: { userId: { in: players.map(p => p.userId) } } });
  const powers = await prisma.heroPower.findMany({ where: { userId: { in: players.map(p => p.userId) } } });
  const usernames = await prisma.user.findMany({ where: { id: { in: players.map(p => p.userId) } }, select: { id: true, username: true } });
  const nameMap = new Map(usernames.map(u => [u.id, u.username]));

  const input = players.map(p => ({
    userId: p.userId,
    username: nameMap.get(p.userId) || "?",
    rolePreferences: prefs.filter(f => f.userId === p.userId).map(f => ({ roleType: f.roleType, preferenceRank: f.preferenceRank, roleRank: f.roleRank, peakScore: f.peakScore, peakRank: f.peakRank })),
    heroPowers: (() => {
      const map: Record<string, number[]> = {};
      powers.filter(h => h.userId === p.userId).forEach(h => {
        if (!map[h.roleType]) map[h.roleType] = [];
        map[h.roleType].push(h.powerScore);
      });
      return map;
    })(),
  }));

  const result = splitTeams(input);
  if (result) {
    await prisma.tournament.update({ where: { id: t.id }, data: { splitResult: JSON.stringify(result), status: "locked" } });
    console.log(`  ✓ 分队完成! 战力差: ${result.strengthDiff}`);
  } else {
    console.log(`  ✗ 分队失败(需要正好10人)`);
  }
  // 同步英雄 + 绑定命格
  console.log("\n同步英雄数据...");
  try {
    const { syncHeroes } = await import("../src/lib/heroes/sync");
    const r = await syncHeroes();
    console.log(`  ✓ ${r.inserted} new, ${r.updated} updated`);
  } catch(e: any) { console.log(`  ⚠ 同步失败: ${e.message}`); }

  console.log("绑定命格关系...");
  try {
    const { execSync } = await import("child_process");
    execSync("npx tsx scripts/migrate-mingge.ts", { cwd: "/opt/yanwutang", stdio: "inherit" });
  } catch { console.log("  ⚠ 命格绑定失败"); }

  console.log(`\n=== 完成 ===`);
  console.log(`赛事: http://ywt.yunhe.ink/tournaments/${t.id}`);
  console.log(`邀请码: ${t.code}`);
  console.log(`账号: ${USERS[0]}~${USERS[9]} / ${PWD}`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
