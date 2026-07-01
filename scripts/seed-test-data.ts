// 通过API创建10个测试用户 + 赛事 + 分队
// 用法: npx tsx scripts/seed-test-data.ts

import { prisma } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth";

const BASE = process.env.BASE_URL || "http://127.0.0.1:8001";
const PWD = "12345678901";

async function post(path: string, body: any, cookie?: string) {
  const res = await fetch(BASE + path, {
    method: "POST", redirect: "manual",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
  const sc = res.headers.getSetCookie?.()?.join?.("; ") || res.headers.get("set-cookie") || "";
  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch {}
  return { status: res.status, data, cookie: sc };
}

async function put(path: string, body: any, cookie: string) {
  const res = await fetch(BASE + path, {
    method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch {}
  return { status: res.status, data };
}

const USERS = [
  { name: "剑仙小李", rank: 7, peak: 1800, topRole: "top" },
  { name: "打野王者", rank: 8, peak: 2100, topRole: "jungle" },
  { name: "中路法王", rank: 9, peak: 2400, topRole: "mid" },
  { name: "射手大神", rank: 8, peak: 1900, topRole: "adc" },
  { name: "辅助之光", rank: 7, peak: 1600, topRole: "support" },
  { name: "边路战神", rank: 8, peak: 2000, topRole: "top" },
  { name: "野区之王", rank: 7, peak: 2200, topRole: "jungle" },
  { name: "中单教父", rank: 7, peak: 1700, topRole: "mid" },
  { name: "百里穿杨", rank: 7, peak: 2300, topRole: "adc" },
  { name: "游走大师", rank: 6, peak: 1500, topRole: "support" },
];

const ALL_ROLES = ["top", "jungle", "mid", "adc", "support"];

const HEROES: Record<string, { id: number; name: string; power: number }[]> = {
  top: [{ id: 183, name: "亚瑟", power: 8000 }, { id: 146, name: "吕布", power: 7200 }, { id: 163, name: "花木兰", power: 6500 }],
  jungle: [{ id: 167, name: "孙悟空", power: 9000 }, { id: 121, name: "兰陵王", power: 7000 }, { id: 130, name: "赵云", power: 6200 }],
  mid: [{ id: 106, name: "小乔", power: 8500 }, { id: 157, name: "不知火舞", power: 7500 }, { id: 152, name: "王昭君", power: 6800 }],
  adc: [{ id: 169, name: "后羿", power: 8800 }, { id: 174, name: "虞姬", power: 6600 }, { id: 133, name: "狄仁杰", power: 6000 }],
  support: [{ id: 108, name: "墨子", power: 6000 }, { id: 118, name: "孙膑", power: 5500 }, { id: 171, name: "张飞", power: 5200 }],
};

async function seedAdmin() {
  const existing = await prisma.user.findUnique({ where: { username: "admin" } });
  if (!existing) {
    const hash = await hashPassword("admin12345678");
    const aHash = await hashPassword("admin");
    await prisma.user.create({
      data: {
        username: "admin",
        passwordHash: hash,
        role: "admin",
        securityQuestion: "系统内置管理员",
        securityAnswerHash: aHash,
      },
    });
    console.log("✓ Admin user created: admin / admin12345678");
  } else {
    if (existing.role !== "admin") {
      await prisma.user.update({ where: { id: existing.id }, data: { role: "admin" } });
      console.log("✓ Admin user role updated to super_admin");
    } else {
      console.log("✓ Admin user already exists");
    }
  }
}

async function main() {
  // 0. 创建管理员
  console.log("=== 创建管理员 ===");
  await seedAdmin();
  console.log();

  // 1. 注册
  console.log("=== 注册10个用户 ===");
  const sessions: { name: string; cookie: string }[] = [];
  for (const u of USERS) {
    const r = await post("/api/auth/register", {
      username: u.name, password: PWD, confirmPassword: PWD,
      securityQuestion: "你的出生城市是？", securityAnswer: "北京",
    });
    if (r.cookie) {
      const c = r.cookie.split(";")[0];
      sessions.push({ name: u.name, cookie: c });
      console.log(`  ✓ ${u.name}`);
    } else {
      // 可能已存在，尝试登录
      const r2 = await post("/api/auth/login", { username: u.name, password: PWD });
      if (r2.cookie) {
        sessions.push({ name: u.name, cookie: r2.cookie.split(";")[0] });
        console.log(`  ✓ ${u.name} (登录)`);
      } else {
        console.log(`  ✗ ${u.name}: ${JSON.stringify(r.data)}`);
      }
    }
  }

  // 2. 设置段位 + 英雄
  console.log("\n=== 设置个人数据 ===");
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    const u = USERS[i];
    const roles = [...ALL_ROLES].sort((a, b) => (a === u.topRole ? -1 : b === u.topRole ? 1 : 0));
    const prefs = roles.map((r, j) => ({ role_type: r, preference_rank: j + 1, role_rank: u.rank, peak_score: u.peak, peak_rank: u.rank }));
    await put("/api/users/me/roles", { preferences: prefs }, s.cookie);

    for (const role of roles) {
      for (const h of HEROES[role]) {
        await post("/api/users/me/heroes", {
          roleType: role, heroId: h.id, heroName: h.name,
          powerScore: h.power + Math.floor(Math.random() * 3000),
        }, s.cookie);
      }
    }
    console.log(`  ✓ ${s.name}`);
  }

  // 3. 创建赛事
  console.log("\n=== 创建赛事 ===");
  const owner = sessions[0];
  const r = await post("/api/tournaments", {
    name: "周五内战测试", deadline: new Date(Date.now() + 86400000).toISOString(), isPublic: true,
  }, owner.cookie);
  const roomId = r.data.id;
  const code = r.data.code;
  console.log(`  房间: ${r.data.name} #${code}`);

  // 4. 加入
  console.log("\n=== 加入赛事 ===");
  for (let i = 1; i < sessions.length; i++) {
    const r2 = await post("/api/tournaments/join-by-code", { code }, sessions[i].cookie);
    console.log(`  ${r2.data.error ? "✗ " + r2.data.error : "✓"} ${sessions[i].name}`);
  }

  // 5. 分队
  console.log("\n=== 执行分队 ===");
  const r3 = await post(`/api/tournaments/${roomId}/split`, {}, owner.cookie);
  console.log(`  ${r3.data.error ? "✗ " + r3.data.error : "✓ 分队完成!"}`);

  console.log(`\n=== 完成 ===`);
  console.log(`房间ID: ${roomId}  邀请码: ${code}`);
  console.log(`赛事页: ${BASE}/tournaments/${roomId}`);
  console.log(`\n所有账号密码: ${PWD}`);
  for (const s of sessions) console.log(`  ${s.name}`);
}

main().catch(console.error);
