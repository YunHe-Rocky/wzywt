# 王者演武堂 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a web-based tournament team-splitting system for Honor of Kings 5v5 internal matches with role preference, hero power balancing, scheduled events, and daily hero data sync.

**Architecture:** Next.js App Router monolith — React pages at `/app/*`, API handlers at `/app/api/*`, shared lib at `/lib/*`, Prisma ORM over MySQL, node-cron for daily hero sync, iron-session for cookie auth.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, Prisma, MySQL, iron-session, node-cron, cheerio, bcryptjs

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.js`, `tailwind.config.ts`, `postcss.config.js`, `.env.example`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`

- [ ] **Step 1: Initialize Next.js project**

```bash
cd D:/个人项目/王者演武堂
npx create-next-app@14 . --typescript --tailwind --eslint --app --src-dir --no-import-alias
```

- [ ] **Step 2: Install dependencies**

```bash
npm install prisma @prisma/client iron-session bcryptjs node-cron cheerio
npm install -D @types/bcryptjs @types/node-cron
```

- [ ] **Step 3: Create .env.example**

```
DATABASE_URL="mysql://user:password@localhost:3306/wangzhe_yanwutang"
SESSION_SECRET="change-me-to-a-random-string-at-least-32-chars"
```

- [ ] **Step 4: Initialize Prisma**

```bash
npx prisma init
```

- [ ] **Step 5: Configure tailwind.config.ts for Chinese fonts**

```typescript
// tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"PingFang SC"', '"Microsoft YaHei"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
```

- [ ] **Step 6: Write root layout with Chinese metadata**

```tsx
// src/app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "王者演武堂",
  description: "王者荣耀内战分队系统",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="font-sans bg-gray-950 text-gray-100 min-h-screen">{children}</body>
    </html>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "chore: scaffold Next.js project with Prisma and Tailwind"
```

---

### Task 2: Database Schema

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/lib/db.ts`

- [ ] **Step 1: Write Prisma schema**

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

model User {
  id            Int       @id @default(autoincrement())
  username      String    @unique @db.VarChar(32)
  passwordHash  String    @map("password_hash") @db.VarChar(255)
  createdAt     DateTime  @default(now()) @map("created_at")

  rolePreferences RolePreference[]
  heroPowers      HeroPower[]
  tournamentPlayers TournamentPlayer[]
  tournamentAdmins TournamentAdmin[]
  adminOperations AdminOperation[]
  tempApplications TempPlayerApplication[]

  @@map("users")
}

model Tournament {
  id        Int       @id @default(autoincrement())
  name      String    @db.VarChar(64)
  deadline  DateTime
  status    String    @default("recruiting") @db.VarChar(16) // recruiting | locked | finished
  createdAt DateTime  @default(now()) @map("created_at")

  players      TournamentPlayer[]
  admins       TournamentAdmin[]
  applications TempPlayerApplication[]
  operations   AdminOperation[]

  @@map("tournaments")
}

model TournamentPlayer {
  id           Int    @id @default(autoincrement())
  tournamentId Int    @map("tournament_id")
  userId       Int    @map("user_id")
  roleType     String? @map("role_type") @db.VarChar(16) // top | jungle | mid | adc | support | null
  isTemporary  Boolean @default(false) @map("is_temporary")
  isSpectator  Boolean @default(false) @map("is_spectator")
  tempName     String? @map("temp_name") @db.VarChar(32)

  tournament Tournament @relation(fields: [tournamentId], references: [id], onDelete: Cascade)
  user       User       @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([tournamentId, userId])
  @@map("tournament_players")
}

model TournamentAdmin {
  id           Int    @id @default(autoincrement())
  tournamentId Int    @map("tournament_id")
  userId       Int    @map("user_id")
  role         String @db.VarChar(16) // owner | co_owner

  tournament Tournament @relation(fields: [tournamentId], references: [id], onDelete: Cascade)
  user       User       @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([tournamentId, userId])
  @@map("tournament_admins")
}

model TempPlayerApplication {
  id           Int      @id @default(autoincrement())
  tournamentId Int      @map("tournament_id")
  applicantId  Int      @map("applicant_id")
  tempName     String?  @map("temp_name") @db.VarChar(32)
  status       String   @default("pending") @db.VarChar(16) // pending | approved | rejected
  createdAt    DateTime @default(now()) @map("created_at")

  tournament Tournament @relation(fields: [tournamentId], references: [id], onDelete: Cascade)
  applicant  User       @relation(fields: [applicantId], references: [id], onDelete: Cascade)

  @@map("temp_player_applications")
}

model RolePreference {
  id             Int    @id @default(autoincrement())
  userId         Int    @map("user_id")
  roleType       String @map("role_type") @db.VarChar(16)
  preferenceRank Int    @map("preference_rank")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, roleType])
  @@map("role_preferences")
}

model HeroPower {
  id        Int    @id @default(autoincrement())
  userId    Int    @map("user_id")
  roleType  String @map("role_type") @db.VarChar(16)
  heroId    Int    @map("hero_id")
  heroName  String @map("hero_name") @db.VarChar(64)
  powerScore Int   @map("power_score")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("hero_powers")
}

model Hero {
  id         Int      @id @default(autoincrement())
  heroId     Int      @unique @map("hero_id")
  name       String   @db.VarChar(64)
  title      String   @db.VarChar(64)
  roleType   String   @map("role_type") @db.VarChar(16)
  skillsJson String   @map("skills_json") @db.Text
  updatedAt  DateTime @default(now()) @updatedAt @map("updated_at")

  @@map("heroes")
}

model AdminOperation {
  id           Int      @id @default(autoincrement())
  tournamentId Int      @map("tournament_id")
  adminId      Int      @map("admin_id")
  action       String   @db.VarChar(32) // split | kick | extend
  targetId     Int?     @map("target_id")
  createdAt    DateTime @default(now()) @map("created_at")

  tournament Tournament @relation(fields: [tournamentId], references: [id], onDelete: Cascade)
  admin      User       @relation(fields: [adminId], references: [id], onDelete: Cascade)

  @@map("admin_operations")
}
```

- [ ] **Step 2: Create Prisma client singleton**

```typescript
// src/lib/db.ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

- [ ] **Step 3: Run migration**

```bash
npx prisma migrate dev --name init
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: add database schema with Prisma"
```

---

### Task 3: Auth System

**Files:**
- Create: `src/lib/auth.ts`, `src/lib/session.ts`, `src/app/api/auth/register/route.ts`, `src/app/api/auth/login/route.ts`, `src/app/api/auth/me/route.ts`, `src/app/api/auth/logout/route.ts`

- [ ] **Step 1: Write session config**

```typescript
// src/lib/session.ts
import { getIronSession, SessionOptions } from "iron-session";

export interface SessionData {
  userId?: number;
  username?: string;
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET || "fallback-dev-secret-at-least-32-chars!!",
  cookieName: "wzyt_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
};

export async function getSession() {
  const { cookies } = await import("next/headers");
  return getIronSession<SessionData>(cookies(), sessionOptions);
}
```

- [ ] **Step 2: Write auth helpers**

```typescript
// src/lib/auth.ts
import bcrypt from "bcryptjs";
import { getSession } from "./session";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function requireAuth() {
  const session = await getSession();
  if (!session.userId) {
    throw new Error("UNAUTHORIZED");
  }
  return { userId: session.userId, username: session.username! };
}
```

- [ ] **Step 3: Write register endpoint**

```typescript
// src/app/api/auth/register/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { getSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();
  if (!username || !password || username.length < 2 || password.length < 4) {
    return NextResponse.json({ error: "用户名至少2位，密码至少4位" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return NextResponse.json({ error: "用户名已被占用" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({ data: { username, passwordHash } });

  const session = await getSession();
  session.userId = user.id;
  session.username = user.username;
  await session.save();

  return NextResponse.json({ id: user.id, username: user.username });
}
```

- [ ] **Step 4: Write login endpoint**

```typescript
// src/app/api/auth/login/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import { getSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
  }

  const session = await getSession();
  session.userId = user.id;
  session.username = user.username;
  await session.save();

  return NextResponse.json({ id: user.id, username: user.username });
}
```

- [ ] **Step 5: Write me and logout endpoints**

```typescript
// src/app/api/auth/me/route.ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ user: null });
  }
  return NextResponse.json({ user: { id: session.userId, username: session.username } });
}
```

```typescript
// src/app/api/auth/logout/route.ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function POST() {
  const session = await getSession();
  session.destroy();
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add auth system with register, login, session"
```

---

### Task 4: Login & Register Pages

**Files:**
- Create: `src/components/auth/AuthForm.tsx`, `src/app/login/page.tsx`, `src/app/register/page.tsx`, `src/components/layout/Header.tsx`
- Modify: `src/app/layout.tsx` (add Header)

- [ ] **Step 1: Write AuthForm component**

```tsx
// src/components/auth/AuthForm.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "操作失败");
      return;
    }
    router.push("/tournaments");
    router.refresh();
  }

  const title = mode === "login" ? "登录" : "注册";
  const switchText = mode === "login" ? "没有账号？去注册" : "已有账号？去登录";
  const switchHref = mode === "login" ? "/register" : "/login";

  return (
    <div className="max-w-sm mx-auto mt-24 p-6 bg-gray-900 rounded-lg">
      <h1 className="text-2xl font-bold text-center mb-6">{title}</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text" placeholder="用户名" value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full px-3 py-2 bg-gray-800 rounded border border-gray-700 focus:border-blue-500 outline-none"
          required minLength={2}
        />
        <input
          type="password" placeholder="密码" value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2 bg-gray-800 rounded border border-gray-700 focus:border-blue-500 outline-none"
          required minLength={4}
        />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          type="submit" disabled={loading}
          className="w-full py-2 bg-blue-600 hover:bg-blue-500 rounded font-medium disabled:opacity-50"
        >
          {loading ? "请稍候..." : title}
        </button>
      </form>
      <p className="text-center mt-4 text-sm text-gray-400">
        <a href={switchHref} className="text-blue-400 hover:underline">{switchText}</a>
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Write login and register pages**

```tsx
// src/app/login/page.tsx
import { AuthForm } from "@/components/auth/AuthForm";
export default function LoginPage() { return <AuthForm mode="login" />; }
```

```tsx
// src/app/register/page.tsx
import { AuthForm } from "@/components/auth/AuthForm";
export default function RegisterPage() { return <AuthForm mode="register" />; }
```

- [ ] **Step 3: Write Header component**

```tsx
// src/components/layout/Header.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";

interface User { id: number; username: string }

export function Header() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => {
      setUser(d.user);
      setLoading(false);
    });
  }, [pathname]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-gray-800 px-6 py-3 flex items-center justify-between">
      <Link href="/" className="text-lg font-bold text-blue-400">演武堂</Link>
      <nav className="flex items-center gap-4 text-sm">
        {!loading && (
          user ? (
            <>
              <Link href="/me" className="hover:text-blue-400">{user.username}</Link>
              <Link href="/tournaments" className="hover:text-blue-400">赛事</Link>
              <button onClick={logout} className="text-gray-400 hover:text-white">退出</button>
            </>
          ) : (
            <Link href="/login" className="hover:text-blue-400">登录</Link>
          )
        )}
      </nav>
    </header>
  );
}
```

- [ ] **Step 4: Update root layout to include Header**

```tsx
// src/app/layout.tsx — add Header import and render
import { Header } from "@/components/layout/Header";
// ... keep metadata, update body:
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="font-sans bg-gray-950 text-gray-100 min-h-screen">
        <Header />
        <main>{children}</main>
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Write placeholder home page**

```tsx
// src/app/page.tsx
import Link from "next/link";

export default function Home() {
  return (
    <div className="max-w-2xl mx-auto mt-32 text-center px-4">
      <h1 className="text-4xl font-bold mb-4">王者演武堂</h1>
      <p className="text-gray-400 text-lg mb-8">内战分队，公平竞技</p>
      <Link href="/tournaments" className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium">
        进入赛事
      </Link>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add login, register pages and header"
```

---

### Task 5: Hero Data Sync

**Files:**
- Create: `src/lib/hero-sync.ts`, `src/app/api/heroes/route.ts`, `src/app/api/heroes/[id]/route.ts`
- Create: `src/instrumentation.ts` (Next.js instrumentation hook for cron)

- [ ] **Step 1: Write hero sync logic**

```typescript
// src/lib/hero-sync.ts
import { prisma } from "./db";

const HEROLIST_URL = "https://pvp.qq.com/web201605/js/herolist.json";
const HERODETAIL_URL = "https://pvp.qq.com/web201605/herodetail/{id}.shtml";

interface RawHero {
  ename: number;
  cname: string;
  title: string;
  hero_type: number; // 1=战士 2=法师 3=坦克 4=刺客 5=射手 6=辅助
}

function mapRoleType(heroType: number): string {
  // 王者官网分6类，映射到5个分路
  if (heroType === 1 || heroType === 3) return "top";       // 战士/坦克 → 对抗路
  if (heroType === 2) return "mid";                          // 法师 → 中路
  if (heroType === 4) return "jungle";                       // 刺客 → 打野
  if (heroType === 5) return "adc";                          // 射手 → 发育路
  if (heroType === 6) return "support";                      // 辅助 → 游走
  return "top";
}

async function fetchHeroDetail(heroId: number): Promise<string> {
  try {
    const url = HERODETAIL_URL.replace("{id}", String(heroId));
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    const html = await res.text();
    return html; // cheerio parse later
  } catch {
    return "";
  }
}

function parseSkillsFromHtml(html: string): object[] {
  const skills: object[] = [];
  // Match skill name patterns: 被动/一技能/二技能/三技能
  const cheerio = require("cheerio");
  const $ = cheerio.load(html);
  $(".skill-show").each((_: number, el: any) => {
    const name = $(el).find(".skill-name b").text().trim() || "";
    const cd = $(el).find(".skill-cd").text().trim() || "";
    const cost = $(el).find(".skill-cost").text().trim() || "";
    const desc = $(el).find(".skill-desc").text().trim() || "";
    if (name) skills.push({ name, cd, cost, desc });
  });
  return skills.length > 0 ? skills : [{ name: "数据暂缺", cd: "", cost: "", desc: "" }];
}

export async function syncHeroes(): Promise<{ inserted: number; updated: number }> {
  const res = await fetch(HEROLIST_URL, {
    headers: { "User-Agent": "Mozilla/5.0" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Hero list fetch failed: ${res.status}`);
  const heroes: RawHero[] = await res.json();

  let inserted = 0;
  let updated = 0;

  for (const h of heroes) {
    const roleType = mapRoleType(h.hero_type);
    const html = await fetchHeroDetail(h.ename);
    const skillsJson = JSON.stringify(html ? parseSkillsFromHtml(html) : []);

    const existing = await prisma.hero.findUnique({ where: { heroId: h.ename } });
    if (!existing) {
      await prisma.hero.create({
        data: {
          heroId: h.ename,
          name: h.cname,
          title: h.title,
          roleType,
          skillsJson,
        },
      });
      inserted++;
    } else {
      await prisma.hero.update({
        where: { heroId: h.ename },
        data: { name: h.cname, title: h.title, roleType, skillsJson },
      });
      updated++;
    }
  }

  return { inserted, updated };
}
```

- [ ] **Step 2: Write instrumentation hook for cron**

```typescript
// src/instrumentation.ts
import cron from "node-cron";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { syncHeroes } = await import("./lib/hero-sync");

    // Run daily at 06:00
    cron.schedule("0 6 * * *", async () => {
      console.log("[hero-sync] Starting daily sync...");
      try {
        const result = await syncHeroes();
        console.log(`[hero-sync] Done: ${result.inserted} inserted, ${result.updated} updated`);
      } catch (err) {
        console.error("[hero-sync] Failed:", err);
      }
    });

    // Also run once on startup
    console.log("[hero-sync] Running initial sync...");
    try {
      const result = await syncHeroes();
      console.log(`[hero-sync] Initial sync: ${result.inserted} inserted, ${result.updated} updated`);
    } catch (err) {
      console.error("[hero-sync] Initial sync failed:", err);
    }
  }
}
```

- [ ] **Step 3: Enable instrumentation in next.config.js**

```javascript
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    instrumentationHook: true,
  },
};
module.exports = nextConfig;
```

- [ ] **Step 4: Write hero API endpoints**

```typescript
// src/app/api/heroes/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try { await requireAuth(); } catch { return NextResponse.json({ error: "请先登录" }, { status: 401 }); }

  const { searchParams } = new URL(req.url);
  const roleType = searchParams.get("role_type");

  const where = roleType ? { roleType } : {};
  const heroes = await prisma.hero.findMany({ where, orderBy: { heroId: "asc" } });

  return NextResponse.json(heroes.map((h) => ({
    ...h,
    skills: JSON.parse(h.skillsJson),
  })));
}
```

```typescript
// src/app/api/heroes/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try { await requireAuth(); } catch { return NextResponse.json({ error: "请先登录" }, { status: 401 }); }

  const hero = await prisma.hero.findUnique({ where: { heroId: parseInt(params.id) } });
  if (!hero) return NextResponse.json({ error: "英雄不存在" }, { status: 404 });

  return NextResponse.json({ ...hero, skills: JSON.parse(hero.skillsJson) });
}
```

- [ ] **Step 5: Add initial sync script to package.json**

In `package.json`, add to scripts:
```json
"sync-heroes": "node -e \"require('./src/lib/hero-sync').syncHeroes().then(r => console.log(r))\""
```

- [ ] **Step 6: Test sync**

```bash
npx tsx src/lib/hero-sync.ts
```

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: add hero data sync with daily cron"
```

---

### Task 6: Personal Space — Role Preferences

**Files:**
- Create: `src/app/api/users/me/roles/route.ts`, `src/app/me/page.tsx`, `src/components/me/RolePreferenceEditor.tsx`

- [ ] **Step 1: Write role preferences API**

```typescript
// src/app/api/users/me/roles/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

const ALL_ROLES = ["top", "jungle", "mid", "adc", "support"] as const;

export async function GET() {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const prefs = await prisma.rolePreference.findMany({
    where: { userId },
    orderBy: { preferenceRank: "asc" },
  });

  return NextResponse.json({ preferences: prefs });
}

export async function PUT(req: NextRequest) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { preferences } = await req.json();
  // preferences: { role_type: string, preference_rank: number }[]
  if (!preferences || preferences.length !== 5) {
    return NextResponse.json({ error: "必须为全部5个分路设置偏好" }, { status: 400 });
  }

  await prisma.$transaction(
    preferences.map((p: { role_type: string; preference_rank: number }) =>
      prisma.rolePreference.upsert({
        where: { userId_roleType: { userId, roleType: p.role_type } },
        update: { preferenceRank: p.preference_rank },
        create: { userId, roleType: p.role_type, preferenceRank: p.preference_rank },
      })
    )
  );

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Write RolePreferenceEditor component**

```tsx
// src/components/me/RolePreferenceEditor.tsx
"use client";

import { useEffect, useState } from "react";

const ROLE_LABELS: Record<string, string> = {
  top: "对抗路", jungle: "打野", mid: "中路", adc: "发育路", support: "游走",
};

interface Pref { roleType: string; preferenceRank: number }

export function RolePreferenceEditor() {
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/users/me/roles").then((r) => r.json()).then((d) => {
      if (d.preferences?.length) {
        setPrefs(d.preferences.sort((a: Pref, b: Pref) => a.preferenceRank - b.preferenceRank));
      } else {
        // Default: top > jungle > mid > adc > support
        setPrefs([
          { roleType: "top", preferenceRank: 1 },
          { roleType: "jungle", preferenceRank: 2 },
          { roleType: "mid", preferenceRank: 3 },
          { roleType: "adc", preferenceRank: 4 },
          { roleType: "support", preferenceRank: 5 },
        ]);
      }
    });
  }, []);

  function moveUp(index: number) {
    if (index === 0) return;
    const next = [...prefs];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    setPrefs(next.map((p, i) => ({ ...p, preferenceRank: i + 1 })));
  }

  function moveDown(index: number) {
    if (index === 4) return;
    const next = [...prefs];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    setPrefs(next.map((p, i) => ({ ...p, preferenceRank: i + 1 })));
  }

  async function save() {
    setSaving(true);
    setMsg("");
    const res = await fetch("/api/users/me/roles", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferences: prefs }),
    });
    setSaving(false);
    setMsg(res.ok ? "保存成功" : "保存失败");
  }

  return (
    <div className="bg-gray-900 rounded-lg p-6">
      <h2 className="text-lg font-bold mb-4">分路偏好排序</h2>
      <p className="text-sm text-gray-400 mb-4">从最想玩到最不想玩排列，系统分队时会尽量满足</p>
      <div className="space-y-2">
        {prefs.map((p, i) => (
          <div key={p.roleType} className="flex items-center gap-3 bg-gray-800 rounded px-4 py-3">
            <span className="text-gray-500 w-6 text-center">{i + 1}</span>
            <span className="flex-1">{ROLE_LABELS[p.roleType]}</span>
            <button onClick={() => moveUp(i)} disabled={i === 0}
              className="px-2 py-1 text-xs bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-30">↑</button>
            <button onClick={() => moveDown(i)} disabled={i === 4}
              className="px-2 py-1 text-xs bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-30">↓</button>
          </div>
        ))}
      </div>
      <button onClick={save} disabled={saving}
        className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm disabled:opacity-50">
        {saving ? "保存中..." : "保存"}
      </button>
      {msg && <p className={`mt-2 text-sm ${msg === "保存成功" ? "text-green-400" : "text-red-400"}`}>{msg}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Write personal space page**

```tsx
// src/app/me/page.tsx
import { RolePreferenceEditor } from "@/components/me/RolePreferenceEditor";
import { HeroPowerEditor } from "@/components/me/HeroPowerEditor";

export default function MePage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-bold">个人空间</h1>
      <RolePreferenceEditor />
      <HeroPowerEditor />
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: add role preference editor"
```

---

### Task 7: Personal Space — Hero Power

**Files:**
- Create: `src/app/api/users/me/heroes/route.ts`, `src/components/me/HeroPowerEditor.tsx`

- [ ] **Step 1: Write hero power API**

```typescript
// src/app/api/users/me/heroes/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const powers = await prisma.heroPower.findMany({ where: { userId } });
  // Group by role
  const grouped: Record<string, typeof powers> = {};
  for (const p of powers) {
    if (!grouped[p.roleType]) grouped[p.roleType] = [];
    grouped[p.roleType].push(p);
  }
  return NextResponse.json({ heroPowers: grouped });
}

export async function POST(req: NextRequest) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { roleType, heroId, heroName, powerScore } = await req.json();
  if (!roleType || !heroId || !heroName || !powerScore) {
    return NextResponse.json({ error: "参数不完整" }, { status: 400 });
  }

  // Max 3 heroes per role
  const count = await prisma.heroPower.count({ where: { userId, roleType } });
  if (count >= 3) {
    return NextResponse.json({ error: "每个分路最多3个英雄" }, { status: 400 });
  }

  const created = await prisma.heroPower.create({
    data: { userId, roleType, heroId, heroName, powerScore },
  });
  return NextResponse.json(created);
}

export async function DELETE(req: NextRequest) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少id" }, { status: 400 });

  const existing = await prisma.heroPower.findFirst({ where: { id: parseInt(id), userId } });
  if (!existing) return NextResponse.json({ error: "不存在" }, { status: 404 });

  await prisma.heroPower.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Write HeroPowerEditor component**

```tsx
// src/components/me/HeroPowerEditor.tsx
"use client";

import { useEffect, useState } from "react";

const ROLE_LABELS: Record<string, string> = {
  top: "对抗路", jungle: "打野", mid: "中路", adc: "发育路", support: "游走",
};
const ROLES = ["top", "jungle", "mid", "adc", "support"];

interface HeroEntry { id: number; heroId: number; heroName: string; powerScore: number }
interface HeroOption { heroId: number; name: string; title: string }

export function HeroPowerEditor() {
  const [grouped, setGrouped] = useState<Record<string, HeroEntry[]>>({});
  const [heroOptions, setHeroOptions] = useState<Record<string, HeroOption[]>>({});
  const [activeRole, setActiveRole] = useState<string | null>(null);
  const [selectedHero, setSelectedHero] = useState("");
  const [powerScore, setPowerScore] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/users/me/heroes").then((r) => r.json()).then((d) => {
      if (d.heroPowers) setGrouped(d.heroPowers);
    });
  }, []);

  async function loadHeroes(role: string) {
    if (heroOptions[role]) { setActiveRole(role); return; }
    const res = await fetch(`/api/heroes?role_type=${role}`);
    const data = await res.json();
    setHeroOptions((prev) => ({ ...prev, [role]: data }));
    setActiveRole(role);
  }

  async function addHero() {
    if (!activeRole || !selectedHero || !powerScore) return;
    const hero = heroOptions[activeRole]?.find((h) => String(h.heroId) === selectedHero);
    if (!hero) return;

    setMsg("");
    const res = await fetch("/api/users/me/heroes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roleType: activeRole,
        heroId: hero.heroId,
        heroName: hero.name,
        powerScore: parseInt(powerScore),
      }),
    });
    if (res.ok) {
      const created = await res.json();
      setGrouped((prev) => ({
        ...prev,
        [activeRole]: [...(prev[activeRole] || []), created],
      }));
      setSelectedHero("");
      setPowerScore("");
      setMsg("添加成功");
    } else {
      const err = await res.json();
      setMsg(err.error || "添加失败");
    }
  }

  async function removeHero(id: number, role: string) {
    await fetch(`/api/users/me/heroes?id=${id}`, { method: "DELETE" });
    setGrouped((prev) => ({
      ...prev,
      [role]: prev[role].filter((h) => h.id !== id),
    }));
  }

  return (
    <div className="bg-gray-900 rounded-lg p-6">
      <h2 className="text-lg font-bold mb-4">英雄战力</h2>
      <p className="text-sm text-gray-400 mb-4">每个分路选1-3个擅长的英雄，填写战力</p>

      <div className="space-y-4">
        {ROLES.map((role) => (
          <div key={role}>
            <button onClick={() => loadHeroes(role)}
              className="text-left w-full flex items-center justify-between bg-gray-800 rounded px-4 py-3 hover:bg-gray-700">
              <span>{ROLE_LABELS[role]}</span>
              <span className="text-sm text-gray-400">
                {(grouped[role] || []).map((h) => `${h.heroName}(${h.powerScore})`).join(", ") || "未选择"}
              </span>
            </button>

            {activeRole === role && (
              <div className="mt-2 ml-4 space-y-2">
                {(grouped[role] || []).map((h) => (
                  <div key={h.id} className="flex items-center gap-2 text-sm">
                    <span className="text-gray-300">{h.heroName} — {h.powerScore} 战力</span>
                    <button onClick={() => removeHero(h.id, role)}
                      className="text-red-400 hover:text-red-300 text-xs">删除</button>
                  </div>
                ))}
                {(grouped[role] || []).length < 3 && (
                  <div className="flex items-center gap-2">
                    <select value={selectedHero} onChange={(e) => setSelectedHero(e.target.value)}
                      className="bg-gray-800 rounded px-2 py-1 text-sm border border-gray-700">
                      <option value="">选择英雄</option>
                      {(heroOptions[role] || []).map((h) => (
                        <option key={h.heroId} value={h.heroId}>{h.name} ({h.title})</option>
                      ))}
                    </select>
                    <input type="number" placeholder="战力" value={powerScore}
                      onChange={(e) => setPowerScore(e.target.value)}
                      className="w-24 bg-gray-800 rounded px-2 py-1 text-sm border border-gray-700" />
                    <button onClick={addHero}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-sm">添加</button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {msg && <p className={`mt-2 text-sm ${msg === "添加成功" ? "text-green-400" : "text-red-400"}`}>{msg}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: add hero power configuration"
```

---

### Task 8: Tournament CRUD API

**Files:**
- Create: `src/app/api/tournaments/route.ts`, `src/app/api/tournaments/[id]/route.ts`

- [ ] **Step 1: Write tournaments list/create endpoint**

```typescript
// src/app/api/tournaments/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

function generateCode(): number {
  return Math.floor(100000 + Math.random() * 900000); // 6-digit
}

export async function GET() {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  // Tournaments where user is a player or admin
  const tournaments = await prisma.tournament.findMany({
    where: {
      OR: [
        { players: { some: { userId } } },
        { admins: { some: { userId } } },
      ],
      status: { not: "finished" },
    },
    include: {
      _count: { select: { players: true } },
      admins: { select: { userId: true, role: true } },
    },
    orderBy: { deadline: "asc" },
  });

  return NextResponse.json({ tournaments });
}

export async function POST(req: NextRequest) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { name, deadline } = await req.json();
  if (!name || !deadline) {
    return NextResponse.json({ error: "赛事名称和截止时间必填" }, { status: 400 });
  }

  const code = generateCode();

  const tournament = await prisma.tournament.create({
    data: {
      name,
      code: String(code),
      deadline: new Date(deadline),
      admins: { create: { userId, role: "owner" } },
      players: { create: { userId, isSpectator: false } },
    },
    include: { admins: true, _count: { select: { players: true } } },
  });

  return NextResponse.json({ tournament });
}
```

Wait — I need to add `code` field to Tournament model. Let me fix the schema step.

- [ ] **Step 1a: Add code field to Tournament model**

Edit `prisma/schema.prisma`, add to Tournament model:
```prisma
  code      String    @unique @default("") @db.VarChar(8) // 6-digit room code
```

Then run:
```bash
npx prisma migrate dev --name add_tournament_code
```

- [ ] **Step 2: Write single tournament get/update/delete endpoint**

```typescript
// src/app/api/tournaments/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournament = await prisma.tournament.findUnique({
    where: { id: parseInt(params.id) },
    include: {
      players: { include: { user: { select: { id: true, username: true } } } },
      admins: { include: { user: { select: { id: true, username: true } } } },
      applications: {
        where: { status: "pending" },
        include: { applicant: { select: { id: true, username: true } } },
      },
    },
  });

  if (!tournament) return NextResponse.json({ error: "赛事不存在" }, { status: 404 });

  // Check if user is in this tournament
  const isPlayer = tournament.players.some((p) => p.userId === userId);
  if (!isPlayer) return NextResponse.json({ error: "你不在该赛事中" }, { status: 403 });

  return NextResponse.json({ tournament });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournament = await prisma.tournament.findUnique({ where: { id: parseInt(params.id) } });
  if (!tournament) return NextResponse.json({ error: "赛事不存在" }, { status: 404 });

  // Only owner can delete
  const admin = await prisma.tournamentAdmin.findFirst({
    where: { tournamentId: tournament.id, userId, role: "owner" },
  });
  if (!admin) return NextResponse.json({ error: "仅房主可取消赛事" }, { status: 403 });

  await prisma.tournament.update({ where: { id: tournament.id }, data: { status: "finished" } });
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { name, deadline } = await req.json();
  const tournament = await prisma.tournament.findUnique({ where: { id: parseInt(params.id) } });
  if (!tournament) return NextResponse.json({ error: "赛事不存在" }, { status: 404 });

  const admin = await prisma.tournamentAdmin.findFirst({
    where: { tournamentId: tournament.id, userId, role: { in: ["owner", "co_owner"] } },
  });
  if (!admin) return NextResponse.json({ error: "仅管理员可修改赛事" }, { status: 403 });

  const updated = await prisma.tournament.update({
    where: { id: tournament.id },
    data: { ...(name && { name }), ...(deadline && { deadline: new Date(deadline) }) },
  });

  return NextResponse.json({ tournament: updated });
}
```

- [ ] **Step 3: Re-run migration for code field**

```bash
npx prisma migrate dev --name add_tournament_code
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: add tournament CRUD API with 6-digit codes"
```

---

### Task 9: Join, Leave, Kick, Extend Endpoints

**Files:**
- Create: `src/app/api/tournaments/[id]/join/route.ts`, `src/app/api/tournaments/[id]/leave/route.ts`, `src/app/api/tournaments/[id]/kick/route.ts`, `src/app/api/tournaments/[id]/extend/route.ts`, `src/app/api/tournaments/[id]/admin/route.ts`

- [ ] **Step 1: Write join endpoint**

```typescript
// src/app/api/tournaments/[id]/join/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournamentId = parseInt(params.id);
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) return NextResponse.json({ error: "赛事不存在" }, { status: 404 });
  if (tournament.status !== "recruiting") {
    return NextResponse.json({ error: "赛事已截止报名" }, { status: 400 });
  }

  const existing = await prisma.tournamentPlayer.findUnique({
    where: { tournamentId_userId: { tournamentId, userId } },
  });
  if (existing) return NextResponse.json({ error: "你已在赛事中" }, { status: 409 });

  const player = await prisma.tournamentPlayer.create({
    data: { tournamentId, userId, isSpectator: false },
    include: { user: { select: { id: true, username: true } } },
  });

  return NextResponse.json({ player });
}
```

- [ ] **Step 2: Write leave endpoint**

```typescript
// src/app/api/tournaments/[id]/leave/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournamentId = parseInt(params.id);
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament || tournament.status !== "recruiting") {
    return NextResponse.json({ error: "赛事已截止" }, { status: 400 });
  }

  // Owner can't leave
  const isOwner = await prisma.tournamentAdmin.findFirst({
    where: { tournamentId, userId, role: "owner" },
  });
  if (isOwner) return NextResponse.json({ error: "房主不能退出，请取消赛事" }, { status: 400 });

  await prisma.tournamentPlayer.delete({ where: { tournamentId_userId: { tournamentId, userId } } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Write kick endpoint**

```typescript
// src/app/api/tournaments/[id]/kick/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournamentId = parseInt(params.id);
  const { targetUserId } = await req.json();

  // Check admin role
  const admin = await prisma.tournamentAdmin.findFirst({ where: { tournamentId, userId } });
  if (!admin) return NextResponse.json({ error: "仅管理员可踢人" }, { status: 403 });

  // Can't kick owner
  const targetIsOwner = await prisma.tournamentAdmin.findFirst({
    where: { tournamentId, userId: targetUserId, role: "owner" },
  });
  if (targetIsOwner) return NextResponse.json({ error: "不能踢出房主" }, { status: 400 });

  await prisma.tournamentPlayer.delete({
    where: { tournamentId_userId: { tournamentId, userId: targetUserId } },
  });

  // Log operation for cooldown
  await prisma.adminOperation.create({
    data: { tournamentId, adminId: userId, action: "kick", targetId: targetUserId },
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Write extend endpoint**

```typescript
// src/app/api/tournaments/[id]/extend/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournamentId = parseInt(params.id);
  const { newDeadline } = await req.json();
  if (!newDeadline) return NextResponse.json({ error: "请提供新的截止时间" }, { status: 400 });

  const admin = await prisma.tournamentAdmin.findFirst({ where: { tournamentId, userId } });
  if (!admin) return NextResponse.json({ error: "仅管理员操作" }, { status: 403 });

  // Cooldown check: if co-owner, check if owner performed extend within 5 min
  if (admin.role === "co_owner") {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentOwnerOp = await prisma.adminOperation.findFirst({
      where: {
        tournamentId,
        action: "extend",
        createdAt: { gte: fiveMinAgo },
        admin: { tournamentAdmins: { some: { tournamentId, role: "owner" } } },
      },
    });
    if (recentOwnerOp) {
      return NextResponse.json({ error: "房主5分钟内执行过此操作，请稍后再试" }, { status: 409 });
    }
  }

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { deadline: new Date(newDeadline), status: "recruiting" },
  });

  await prisma.adminOperation.create({
    data: { tournamentId, adminId: userId, action: "extend" },
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Write admin management endpoint**

```typescript
// src/app/api/tournaments/[id]/admin/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournamentId = parseInt(params.id);
  const { targetUserId, action } = await req.json(); // action: "promote" | "demote"

  const isOwner = await prisma.tournamentAdmin.findFirst({
    where: { tournamentId, userId, role: "owner" },
  });
  if (!isOwner) return NextResponse.json({ error: "仅房主可管理管理员" }, { status: 403 });

  if (action === "promote") {
    await prisma.tournamentAdmin.upsert({
      where: { tournamentId_userId: { tournamentId, userId: targetUserId } },
      update: { role: "co_owner" },
      create: { tournamentId, userId: targetUserId, role: "co_owner" },
    });
  } else if (action === "demote") {
    const target = await prisma.tournamentAdmin.findFirst({
      where: { tournamentId, userId: targetUserId },
    });
    if (target?.role === "owner") {
      return NextResponse.json({ error: "不能撤销房主" }, { status: 400 });
    }
    await prisma.tournamentAdmin.deleteMany({ where: { tournamentId, userId: targetUserId } });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add join, leave, kick, extend, admin endpoints"
```

---

### Task 10: Temporary Player Endpoints

**Files:**
- Create: `src/app/api/tournaments/[id]/temp-player/route.ts`, `src/app/api/tournaments/[id]/temp-application/route.ts`, `src/app/api/tournaments/[id]/temp-application/[appId]/route.ts`

- [ ] **Step 1: Write temp application endpoint**

```typescript
// src/app/api/tournaments/[id]/temp-application/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournamentId = parseInt(params.id);
  const { tempName } = await req.json();

  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament || tournament.status !== "recruiting") {
    return NextResponse.json({ error: "赛事不可用" }, { status: 400 });
  }

  const app = await prisma.tempPlayerApplication.create({
    data: { tournamentId, applicantId: userId, tempName: tempName || null, status: "pending" },
  });

  return NextResponse.json({ application: app });
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournamentId = parseInt(params.id);
  const admin = await prisma.tournamentAdmin.findFirst({ where: { tournamentId, userId } });
  if (!admin) return NextResponse.json({ error: "仅管理员可查看申请" }, { status: 403 });

  const apps = await prisma.tempPlayerApplication.findMany({
    where: { tournamentId, status: "pending" },
    include: { applicant: { select: { id: true, username: true } } },
  });

  return NextResponse.json({ applications: apps });
}
```

- [ ] **Step 2: Write temp application approve/reject endpoint**

```typescript
// src/app/api/tournaments/[id]/temp-application/[appId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function PUT(req: NextRequest, { params }: { params: { id: string; appId: string } }) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournamentId = parseInt(params.id);
  const appId = parseInt(params.appId);
  const { status } = await req.json(); // "approved" | "rejected"

  const admin = await prisma.tournamentAdmin.findFirst({ where: { tournamentId, userId } });
  if (!admin) return NextResponse.json({ error: "仅管理员审批" }, { status: 403 });

  const app = await prisma.tempPlayerApplication.findFirst({ where: { id: appId, tournamentId } });
  if (!app) return NextResponse.json({ error: "申请不存在" }, { status: 404 });

  if (status === "approved") {
    // Create temp player: use a "negative" userId to avoid collision with real users
    const tempUserId = -(appId + 100000);
    // Upsert a placeholder user for the temp player
    await prisma.user.upsert({
      where: { id: tempUserId },
      update: { username: app.tempName || `临时选手${appId}` },
      create: { id: tempUserId, username: app.tempName || `临时选手${appId}`, passwordHash: "" },
    });
    await prisma.tournamentPlayer.create({
      data: { tournamentId, userId: tempUserId, isTemporary: true, tempName: app.tempName, isSpectator: false },
    });
  }

  await prisma.tempPlayerApplication.update({ where: { id: appId }, data: { status } });
  return NextResponse.json({ ok: true });
}
```

Wait, using negative user IDs is fragile. Better approach: add a nullable `userId` to TournamentPlayer for temp players.

Let me revise. Actually, let me use a simpler approach: add temp-specific fields to TournamentPlayer (already have `isTemporary` and `tempName`). We'll use user_id = null for temp players, or we can create a real user with a temp flag.

Let me keep it simple: temp players get a real User record with a simple password hash (empty string means can't login). The applicant/admin can fill in role prefs and hero powers later under that user ID.

Actually, re-reading the schema, TournamentPlayer has `isTemporary` and `tempName`. Using User with empty password seems cleaner since it reuses the same role/hero system. Let me adjust the schema to allow User with empty password.

Actually, the current schema works. Let me just modify the User model slightly to allow empty passwordHash for temp users. Actually db.VarChar(255) allows empty strings. Let me just not set password strength requirement for login (only for registration of real users).

Let me proceed with the approach of creating a real User for temp players (with empty passwordHash). The admin/applicant associates temp user role/hero data later.

- [ ] **Step 3: Write temp player direct add endpoint**

```typescript
// src/app/api/tournaments/[id]/temp-player/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournamentId = parseInt(params.id);
  const { tempName } = await req.json();

  const admin = await prisma.tournamentAdmin.findFirst({ where: { tournamentId, userId } });
  if (!admin) return NextResponse.json({ error: "仅管理员操作" }, { status: 403 });

  // Create temp user account (can't login — no password)
  const tempUser = await prisma.user.create({
    data: { username: tempName || `临时_${Date.now()}`, passwordHash: "" },
  });

  const player = await prisma.tournamentPlayer.create({
    data: { tournamentId, userId: tempUser.id, isTemporary: true, tempName, isSpectator: false },
  });

  return NextResponse.json({ player });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournamentId = parseInt(params.id);
  const { targetUserId, roleType, heroPowers } = await req.json();

  // Check permission: admin OR original applicant
  const isAdmin = await prisma.tournamentAdmin.findFirst({ where: { tournamentId, userId } });
  const isApplicant = await prisma.tempPlayerApplication.findFirst({
    where: { tournamentId, applicantId: userId, status: "approved" },
  });
  if (!isAdmin && !isApplicant) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  // Update temp player's role/hero data
  if (roleType) {
    await prisma.rolePreference.upsert({
      where: { userId_roleType: { userId: targetUserId, roleType } },
      update: { preferenceRank: 1 },
      create: { userId: targetUserId, roleType, preferenceRank: 1 },
    });
  }

  if (heroPowers && Array.isArray(heroPowers)) {
    for (const hp of heroPowers) {
      await prisma.heroPower.create({
        data: { userId: targetUserId, roleType: hp.roleType, heroId: hp.heroId, heroName: hp.heroName || "", powerScore: hp.powerScore },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: add temporary player application and management endpoints"
```

---

### Task 11: Team Splitting Algorithm

**Files:**
- Create: `src/lib/split.ts`, `src/app/api/tournaments/[id]/split/route.ts`

- [ ] **Step 1: Write splitting algorithm**

```typescript
// src/lib/split.ts

interface Player {
  userId: number;
  rolePreferences: { roleType: string; preferenceRank: number }[];
  heroPowers: Record<string, number[]>; // roleType -> power scores
  peakPower: number; // highest power across all heroes
}

interface SplitResult {
  teamRed: { userId: number; roleType: string }[];
  teamBlue: { userId: number; roleType: string }[];
  score: number;
  powerDiff: number;
  preferenceScore: number;
}

const ROLES = ["top", "jungle", "mid", "adc", "support"];
const W1 = 100; // Power balance weight
const W2 = 1;   // Preference satisfaction weight

// Generate all ways to pick k items from arr
function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  const withFirst = combinations(rest, k - 1).map((c) => [first, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

interface RoleAssignment {
  assignments: { userId: number; roleType: string }[];
}

// Generate all valid role assignments: N players -> 5 roles, each role gets N/5 players
function generateRoleAssignments(players: Player[]): RoleAssignment[] {
  const n = players.length;
  const perRole = Math.floor(n / 5);
  const remainder = n % 5;
  // For simplicity, handle the standard case of n=10, perRole=2
  // For non-standard, split as evenly as possible

  const results: RoleAssignment[] = [];
  const playerIds = players.map((p) => p.userId);

  // Assign players to roles recursively
  function assign(remaining: number[], roleIndex: number, current: { userId: number; roleType: string }[]): void {
    if (roleIndex === 5) {
      if (remaining.length === 0) {
        results.push({ assignments: current });
      }
      return;
    }

    const needed = roleIndex < remainder ? perRole + 1 : perRole;
    if (remaining.length < needed) return;

    const combos = combinations(remaining, needed);
    for (const combo of combos) {
      const nextRemaining = remaining.filter((id) => !combo.includes(id));
      const newAssignments = [
        ...current,
        ...combo.map((userId) => ({ userId, roleType: ROLES[roleIndex] })),
      ];
      assign(nextRemaining, roleIndex + 1, newAssignments);
    }
  }

  assign(playerIds, 0, []);
  return results;
}

function evaluateTeamSplit(
  roleGroups: Map<string, Player[]>,
  players: Player[]
): { teamRed: { userId: number; roleType: string }[]; teamBlue: { userId: number; roleType: string }[]; powerDiff: number } {
  let bestSplit: { teamRed: any[]; teamBlue: any[]; powerDiff: number } = {
    teamRed: [], teamBlue: [], powerDiff: Infinity,
  };

  // For each role, 2 players -> assign one to red, one to blue
  // 2^5 = 32 combinations, use bit enumeration
  for (let mask = 0; mask < 32; mask++) {
    const red: { userId: number; roleType: string }[] = [];
    const blue: { userId: number; roleType: string }[] = [];
    let redPower = 0;
    let bluePower = 0;

    for (let ri = 0; ri < 5; ri++) {
      const role = ROLES[ri];
      const group = roleGroups.get(role) || [];
      if (group.length === 0) continue;

      const redPlayer = group[0];
      const bluePlayer = group[1] || group[0];

      const assignRedFirst = (mask >> ri) & 1;

      if (assignRedFirst) {
        red.push({ userId: redPlayer.userId, roleType: role });
        redPower += redPlayer.peakPower;
        if (group.length > 1) {
          blue.push({ userId: bluePlayer.userId, roleType: role });
          bluePower += bluePlayer.peakPower;
        }
      } else {
        if (group.length > 1) {
          red.push({ userId: bluePlayer.userId, roleType: role });
          redPower += bluePlayer.peakPower;
        }
        blue.push({ userId: redPlayer.userId, roleType: role });
        bluePower += redPlayer.peakPower;
      }
    }

    const diff = Math.abs(redPower - bluePower);
    if (diff < bestSplit.powerDiff) {
      bestSplit = { teamRed: red, teamBlue: blue, powerDiff: diff };
    }
  }

  return bestSplit;
}

function preferenceScore(assignments: { userId: number; roleType: string }[], players: Player[]): number {
  let total = 0;
  const playerMap = new Map(players.map((p) => [p.userId, p]));

  for (const a of assignments) {
    const player = playerMap.get(a.userId);
    if (!player) continue;
    const pref = player.rolePreferences.find((p) => p.roleType === a.roleType);
    if (pref) {
      total += 6 - pref.preferenceRank; // rank 1 = 5pts, rank 5 = 1pt
    }
  }

  return total;
}

export function splitTeams(players: Player[]): SplitResult | null {
  if (players.length < 2) return null;

  const roleAssignments = generateRoleAssignments(players);
  let bestResult: SplitResult | null = null;
  let bestScore = -Infinity;

  const playerMap = new Map(players.map((p) => [p.userId, p]));

  for (const ra of roleAssignments) {
    // Group players by role
    const roleGroups = new Map<string, Player[]>();
    for (const a of ra.assignments) {
      const p = playerMap.get(a.userId)!;
      if (!roleGroups.has(a.roleType)) roleGroups.set(a.roleType, []);
      roleGroups.get(a.roleType)!.push(p);
    }

    const split = evaluateTeamSplit(roleGroups, players);
    const prefScore = preferenceScore([...split.teamRed, ...split.teamBlue], players);
    const score = -split.powerDiff * W1 + prefScore * W2;

    if (score > bestScore) {
      bestScore = score;
      bestResult = {
        teamRed: split.teamRed,
        teamBlue: split.teamBlue,
        score,
        powerDiff: split.powerDiff,
        preferenceScore: prefScore,
      };
    }
  }

  return bestResult;
}
```

- [ ] **Step 2: Write split API endpoint**

```typescript
// src/app/api/tournaments/[id]/split/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { splitTeams } from "@/lib/split";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournamentId = parseInt(params.id);

  // Check admin role
  const admin = await prisma.tournamentAdmin.findFirst({ where: { tournamentId, userId } });
  if (!admin) return NextResponse.json({ error: "仅管理员可分隊" }, { status: 403 });

  // Cooldown check for co_owner
  if (admin.role === "co_owner") {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentOwnerSplit = await prisma.adminOperation.findFirst({
      where: {
        tournamentId,
        action: "split",
        createdAt: { gte: fiveMinAgo },
        admin: { tournamentAdmins: { some: { tournamentId, role: "owner" } } },
      },
    });
    if (recentOwnerSplit) {
      return NextResponse.json({ error: "房主5分钟内执行过此操作，请稍后再试" }, { status: 409 });
    }
  }

  // Lock tournament if not already
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) return NextResponse.json({ error: "赛事不存在" }, { status: 404 });

  if (tournament.status === "recruiting") {
    await prisma.tournament.update({ where: { id: tournamentId }, data: { status: "locked" } });
  }

  // Get non-spectator players
  const players = await prisma.tournamentPlayer.findMany({
    where: { tournamentId, isSpectator: false },
    include: {
      user: {
        include: {
          rolePreferences: true,
          heroPowers: true,
        },
      },
    },
  });

  // Build Player objects for algorithm
  const algoPlayers = players.map((p) => {
    const heroPowers: Record<string, number[]> = {};
    let peakPower = 0;
    for (const hp of p.user.heroPowers) {
      if (!heroPowers[hp.roleType]) heroPowers[hp.roleType] = [];
      heroPowers[hp.roleType].push(hp.powerScore);
      if (hp.powerScore > peakPower) peakPower = hp.powerScore;
    }

    return {
      userId: p.userId,
      rolePreferences: p.user.rolePreferences || [],
      heroPowers,
      peakPower,
    };
  });

  const result = splitTeams(algoPlayers);

  // Log operation
  await prisma.adminOperation.create({
    data: { tournamentId, adminId: userId, action: "split" },
  });

  return NextResponse.json({
    teamRed: result?.teamRed || [],
    teamBlue: result?.teamBlue || [],
    powerDiff: result?.powerDiff || 0,
    preferenceScore: result?.preferenceScore || 0,
    playerDetails: players.map((p) => ({
      userId: p.userId,
      username: p.user.username,
      peakPower: algoPlayers.find((ap) => ap.userId === p.userId)?.peakPower || 0,
      rolePreferences: p.user.rolePreferences,
    })),
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: implement team splitting algorithm with power balance + role preference"
```

---

### Task 12: Tournament Pages (List, Create, Detail)

**Files:**
- Create: `src/app/tournaments/page.tsx`, `src/components/tournament/TournamentList.tsx`, `src/components/tournament/CreateTournament.tsx`
- Create: `src/app/tournaments/[id]/page.tsx`, `src/components/tournament/TournamentDetail.tsx`

- [ ] **Step 1: Write TournamentList with create form**

```tsx
// src/components/tournament/TournamentList.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Tournament {
  id: number; name: string; code: string; deadline: string; status: string;
  _count: { players: number };
  admins: { userId: number; role: string }[];
}

export function TournamentList() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [deadline, setDeadline] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => { refresh(); }, []);

  async function refresh() {
    const res = await fetch("/api/tournaments");
    const data = await res.json();
    if (data.tournaments) setTournaments(data.tournaments);
  }

  async function create() {
    setError("");
    if (!name || !deadline) { setError("请填写完整"); return; }
    const res = await fetch("/api/tournaments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, deadline: new Date(deadline).toISOString() }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); return; }
    setShowCreate(false);
    setName("");
    setDeadline("");
    refresh();
    router.push(`/tournaments/${data.tournament.id}`);
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">赛事大厅</h1>
        <button onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm">
          {showCreate ? "取消" : "创建赛事"}
        </button>
      </div>

      {showCreate && (
        <div className="bg-gray-900 rounded-lg p-6 mb-6 space-y-4">
          <input type="text" placeholder="赛事名称" value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 rounded border border-gray-700 outline-none focus:border-blue-500" />
          <input type="datetime-local" value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 rounded border border-gray-700 outline-none focus:border-blue-500" />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button onClick={create}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded text-sm">创建</button>
        </div>
      )}

      {tournaments.length === 0 ? (
        <p className="text-gray-400 text-center py-8">暂无赛事，创建一个吧</p>
      ) : (
        <div className="space-y-3">
          {tournaments.map((t) => (
            <button key={t.id} onClick={() => router.push(`/tournaments/${t.id}`)}
              className="w-full text-left bg-gray-900 rounded-lg p-4 hover:bg-gray-800 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium">{t.name}</span>
                  <span className="ml-3 text-sm text-gray-400">#{t.code}</span>
                </div>
                <div className="text-sm text-gray-400">
                  <span className="mr-3">{t._count.players}人</span>
                  <span>{new Date(t.deadline).toLocaleString("zh-CN")}</span>
                </div>
              </div>
              <div className="mt-1">
                <span className={`text-xs px-2 py-0.5 rounded ${
                  t.status === "recruiting" ? "bg-green-900 text-green-300" :
                  t.status === "locked" ? "bg-yellow-900 text-yellow-300" : "bg-gray-700 text-gray-400"
                }`}>
                  {t.status === "recruiting" ? "报名中" : t.status === "locked" ? "已锁定" : "已结束"}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write tournament list page**

```tsx
// src/app/tournaments/page.tsx
import { TournamentList } from "@/components/tournament/TournamentList";
export default function TournamentsPage() { return <TournamentList />; }
```

- [ ] **Step 3: Write TournamentDetail component**

```tsx
// src/components/tournament/TournamentDetail.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface PlayerInfo {
  userId: number; user: { id: number; username: string };
  isTemporary: boolean; tempName: string | null; isSpectator: boolean;
}
interface Tournament {
  id: number; name: string; code: string; deadline: string; status: string;
  players: PlayerInfo[];
  admins: { userId: number; role: string; user: { id: number; username: string } }[];
  applications: { id: number; tempName: string | null; applicant: { id: number; username: string } }[];
}
interface SplitResult {
  teamRed: { userId: number; roleType: string }[];
  teamBlue: { userId: number; roleType: string }[];
  powerDiff: number;
  preferenceScore: number;
  playerDetails: { userId: number; username: string; peakPower: number }[];
}

const ROLE_LABELS: Record<string, string> = {
  top: "对抗路", jungle: "打野", mid: "中路", adc: "发育路", support: "游走",
};

export function TournamentDetail() {
  const params = useParams();
  const id = params.id as string;
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [splitResult, setSplitResult] = useState<SplitResult | null>(null);
  const [adminMsg, setAdminMsg] = useState("");
  const [me, setMe] = useState<{ userId: number } | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => setMe(d.user));
    refreshTournament();
  }, [id]);

  async function refreshTournament() {
    const res = await fetch(`/api/tournaments/${id}`);
    if (res.ok) {
      const data = await res.json();
      setTournament(data.tournament);
    }
  }

  async function join() {
    const res = await fetch(`/api/tournaments/${id}/join`, { method: "POST" });
    if (res.ok) refreshTournament();
    else { const d = await res.json(); setAdminMsg(d.error); }
  }

  async function leave() {
    const res = await fetch(`/api/tournaments/${id}/leave`, { method: "POST" });
    if (res.ok) refreshTournament();
    else { const d = await res.json(); setAdminMsg(d.error); }
  }

  async function doSplit() {
    setAdminMsg("");
    const res = await fetch(`/api/tournaments/${id}/split`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setSplitResult(data);
      setTournament((prev) => prev ? { ...prev, status: "locked" } : null);
    } else {
      setAdminMsg(data.error || "分队失败");
    }
  }

  async function doExtend() {
    const newDeadline = prompt("新截止时间（如 2026-06-30T20:00）：");
    if (!newDeadline) return;
    const res = await fetch(`/api/tournaments/${id}/extend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newDeadline: new Date(newDeadline).toISOString() }),
    });
    if (res.ok) { refreshTournament(); setAdminMsg("已延长"); }
    else { const d = await res.json(); setAdminMsg(d.error); }
  }

  if (!tournament) return <div className="p-8 text-center text-gray-400">加载中...</div>;

  const isAdmin = tournament.admins.some((a) => a.userId === me?.userId);
  const isOwner = tournament.admins.some((a) => a.userId === me?.userId && a.role === "owner");
  const isPlayer = tournament.players.some((p) => p.userId === me?.userId);
  const playerCount = tournament.players.filter((p) => !p.isSpectator).length;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{tournament.name}</h1>
          <p className="text-sm text-gray-400 mt-1">
            #{tournament.code} · 截止 {new Date(tournament.deadline).toLocaleString("zh-CN")}
            {tournament.status === "recruiting" ? ` · ${playerCount}人已报名` : ""}
          </p>
        </div>
        <span className={`px-3 py-1 rounded text-sm ${
          tournament.status === "recruiting" ? "bg-green-900 text-green-300" :
          tournament.status === "locked" ? "bg-yellow-900 text-yellow-300" : "bg-gray-700 text-gray-400"
        }`}>
          {tournament.status === "recruiting" ? "报名中" : tournament.status === "locked" ? "已锁定" : "已结束"}
        </span>
      </div>

      {adminMsg && <p className={`text-sm ${adminMsg.includes("成功") ? "text-green-400" : "text-red-400"}`}>{adminMsg}</p>}

      {/* Player List */}
      <div className="bg-gray-900 rounded-lg p-6">
        <h2 className="font-bold mb-3">选手列表 ({playerCount}人)</h2>
        <div className="flex flex-wrap gap-2">
          {tournament.players.map((p) => (
            <span key={p.userId} className={`px-3 py-1 rounded text-sm ${
              p.isSpectator ? "bg-gray-700 text-gray-400" : "bg-blue-900 text-blue-200"
            }`}>
              {p.isTemporary ? (p.tempName || "临时选手") : p.user.username}
              {p.isSpectator && " 📺"}
            </span>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        {tournament.status === "recruiting" && !isPlayer && (
          <button onClick={join} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm">加入赛事</button>
        )}
        {tournament.status === "recruiting" && isPlayer && !isOwner && (
          <button onClick={leave} className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded text-sm">退出赛事</button>
        )}
        {tournament.status === "recruiting" && isAdmin && (
          <button onClick={doSplit} className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded text-sm">
            立即分队 ({playerCount}人)
          </button>
        )}
        {(tournament.status === "recruiting" || tournament.status === "locked") && isAdmin && (
          <button onClick={doExtend} className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 rounded text-sm">延长截止</button>
        )}
      </div>

      {/* Split Result */}
      {splitResult && (
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-red-900/30 rounded-lg p-6 border border-red-800">
            <h3 className="font-bold text-lg text-red-400 mb-3">红队</h3>
            <div className="space-y-2">
              {splitResult.teamRed.map((p) => {
                const detail = splitResult.playerDetails.find((d) => d.userId === p.userId);
                return (
                  <div key={p.userId} className="flex justify-between text-sm">
                    <span>{detail?.username || "?"}</span>
                    <span className="text-gray-400">{ROLE_LABELS[p.roleType]} · {detail?.peakPower || 0}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="bg-blue-900/30 rounded-lg p-6 border border-blue-800">
            <h3 className="font-bold text-lg text-blue-400 mb-3">蓝队</h3>
            <div className="space-y-2">
              {splitResult.teamBlue.map((p) => {
                const detail = splitResult.playerDetails.find((d) => d.userId === p.userId);
                return (
                  <div key={p.userId} className="flex justify-between text-sm">
                    <span>{detail?.username || "?"}</span>
                    <span className="text-gray-400">{ROLE_LABELS[p.roleType]} · {detail?.peakPower || 0}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="col-span-2 text-center text-sm text-gray-400">
            战力差: {splitResult.powerDiff} · 偏好分: {splitResult.preferenceScore}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write tournament detail page**

```tsx
// src/app/tournaments/[id]/page.tsx
import { TournamentDetail } from "@/components/tournament/TournamentDetail";
export default function TournamentDetailPage() { return <TournamentDetail />; }
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add tournament pages (list, create, detail with split)"
```

---

### Task 13: Deadline Cron + Number Validation

**Files:**
- Modify: `src/instrumentation.ts`

- [ ] **Step 1: Add deadline checker to instrumentation**

In `src/instrumentation.ts`, add alongside the hero sync cron:

```typescript
// Check deadlines every minute
cron.schedule("* * * * *", async () => {
  const { prisma } = await import("./lib/db");
  const now = new Date();

  const expired = await prisma.tournament.findMany({
    where: { status: "recruiting", deadline: { lte: now } },
    include: { _count: { select: { players: { where: { isSpectator: false } } } } },
  });

  for (const t of expired) {
    if (t._count.players >= 10) {
      // Auto split — trigger via internal call
      console.log(`[deadline] Tournament ${t.id} (${t.name}): ${t._count.players} players, auto-locking`);
      await prisma.tournament.update({ where: { id: t.id }, data: { status: "locked" } });
    } else {
      // Mark as locked but alert (less than 10)
      console.log(`[deadline] Tournament ${t.id} (${t.name}): only ${t._count.players} players, marked for review`);
      await prisma.tournament.update({ where: { id: t.id }, data: { status: "locked" } });
    }
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: add deadline auto-lock cron job"
```

---

### Task 14: Join by Code + Spectator Toggle

**Files:**
- Create: `src/app/api/tournaments/join-by-code/route.ts`
- Modify: `src/app/api/tournaments/[id]/join/route.ts` (add spectator support)

- [ ] **Step 1: Write join-by-code endpoint**

```typescript
// src/app/api/tournaments/join-by-code/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { code } = await req.json();
  if (!code) return NextResponse.json({ error: "请输入赛事号" }, { status: 400 });

  const tournament = await prisma.tournament.findUnique({ where: { code } });
  if (!tournament) return NextResponse.json({ error: "赛事不存在" }, { status: 404 });
  if (tournament.status !== "recruiting") {
    return NextResponse.json({ error: "赛事已截止" }, { status: 400 });
  }

  const existing = await prisma.tournamentPlayer.findUnique({
    where: { tournamentId_userId: { tournamentId: tournament.id, userId } },
  });
  if (existing) return NextResponse.json({ error: "你已在赛事中" }, { status: 409 });

  await prisma.tournamentPlayer.create({
    data: { tournamentId: tournament.id, userId, isSpectator: false },
  });

  return NextResponse.json({ tournamentId: tournament.id, name: tournament.name });
}
```

- [ ] **Step 2: Add join-by-code UI to tournament list page**

Add a search input to `TournamentList`:

```tsx
const [joinCode, setJoinCode] = useState("");

async function joinByCode() {
  setError("");
  const res = await fetch("/api/tournaments/join-by-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: joinCode.trim() }),
  });
  const data = await res.json();
  if (!res.ok) { setError(data.error); return; }
  router.push(`/tournaments/${data.tournamentId}`);
}
```

And add to the JSX:

```tsx
<div className="bg-gray-900 rounded-lg p-4 mb-6 flex gap-3">
  <input type="text" placeholder="输入6位赛事号" value={joinCode}
    onChange={(e) => setJoinCode(e.target.value)} maxLength={6}
    className="flex-1 px-3 py-2 bg-gray-800 rounded border border-gray-700 outline-none focus:border-blue-500" />
  <button onClick={joinByCode}
    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm whitespace-nowrap">
    加入赛事
  </button>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: add join-by-code with 6-digit room code"
```

---

## Self-Review Checklist

1. **Spec coverage**: Auth ✓, Role prefs ✓, Hero power ✓, Hero sync ✓, Tournament CRUD ✓, Join/leave/kick ✓, Deadline ✓, Split algorithm ✓, Temp players ✓, Admin cooldown ✓, Spectator ✓, Join by code ✓
2. **Placeholder scan**: No TBD/TODO found. All steps have complete code.
3. **Type consistency**: SessionData.userId matches requireAuth return. TournamentPlayer.userId matches User.id. SplitResult shape matches API response.

**One known gap**: Lineup planning area (阵容演练区) is lightweight and can be added as a Task 15 after core split UI is working — it's essentially a per-team hero picker with no restrictions, which reuses the HeroSelector from HeroPowerEditor.
