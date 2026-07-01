# 权限系统 + 头像功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现三级权限模型（超管/房管/个人）+ 头像上传功能

**Architecture:** 数据库添加 role/avatar/banned 字段；扩展 session 和 auth 守卫；超管 API 路由保护 + 用户管理后台；头像本地存储 + API 读写

**Tech Stack:** Prisma · iron-session · bcryptjs · Next.js 14 App Router · TypeScript

---

### Task 1: Database Schema Changes

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add role, avatar, banned fields to User model**

在 `prisma/schema.prisma` 的 User 模型中，`createdAt` 字段后面添加：

```prisma
model User {
  id            Int       @id @default(autoincrement())
  username      String    @unique @db.VarChar(32)
  passwordHash        String    @map("password_hash") @db.VarChar(255)
  securityQuestion    String?   @map("security_question") @db.VarChar(255)
  securityAnswerHash  String?   @map("security_answer_hash") @db.VarChar(255)
  role          String    @default("user") @db.VarChar(16)  // user | super_admin
  avatar        String?   @db.VarChar(255)                   // 头像文件名
  banned        Boolean   @default(false)                    // 封禁标记
  createdAt           DateTime  @default(now()) @map("created_at")
  // ... 其余关系保持不变
}
```

- [ ] **Step 2: Run Prisma migration**

```bash
npx prisma db push
```

Expected: Schema synced without errors. 验证：`npx prisma db pull` 确认新字段出现。

### Task 2: Seed Admin User

**Files:**
- Modify: `scripts/seed-test-data.ts`

- [ ] **Step 1: Add admin user seeding**

在 `scripts/seed-test-data.ts` 中添加 admin 用户创建逻辑：

```typescript
import { prisma } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth";

async function seedAdmin() {
  const existing = await prisma.user.findUnique({ where: { username: "admin" } });
  if (!existing) {
    const hash = await hashPassword("admin");
    await prisma.user.create({
      data: {
        username: "admin",
        passwordHash: hash,
        role: "super_admin",
      },
    });
    console.log("✓ Admin user created: admin / admin");
  } else {
    // 确保已有 admin 用户角色正确
    if (existing.role !== "super_admin") {
      await prisma.user.update({ where: { id: existing.id }, data: { role: "super_admin" } });
      console.log("✓ Admin user role updated to super_admin");
    } else {
      console.log("✓ Admin user already exists");
    }
  }
}

// 在现有 seed 函数调用链中加入
seedAdmin();
```

- [ ] **Step 2: Run seed script**

```bash
npx tsx scripts/seed-test-data.ts
```

Expected: `✓ Admin user created: admin / admin`（或已存在的提示）

### Task 3: Extend Session & Auth Guards

**Files:**
- Modify: `src/lib/session.ts`
- Modify: `src/lib/auth.ts`
- Create: `src/lib/permissions.ts`

- [ ] **Step 1: Add role to SessionData**

在 `src/lib/session.ts` 中：

```typescript
export interface SessionData {
  userId?: number;
  username?: string;
  role?: string;
}
```

- [ ] **Step 2: Extend requireAuth to include role lookup**

修改 `src/lib/auth.ts` 的 `requireAuth`：

```typescript
import { prisma } from "./db";

export async function requireAuth() {
  const session = await getSession();
  if (!session.userId) {
    throw new Error("UNAUTHORIZED");
  }
  // 如果 session 没有 role，从 DB 读取并写入 session
  if (!session.role) {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { role: true, banned: true },
    });
    if (!user) throw new Error("UNAUTHORIZED");
    if (user.banned) throw new Error("BANNED");
    session.role = user.role;
    await session.save();
  }
  return { userId: session.userId, username: session.username!, role: session.role };
}
```

- [ ] **Step 3: Create permission guards**

创建 `src/lib/permissions.ts`：

```typescript
import { requireAuth } from "./auth";
import { prisma } from "./db";

export async function requireSuperAdmin() {
  const user = await requireAuth();
  if (user.role !== "super_admin") {
    throw new Error("FORBIDDEN");
  }
  return user;
}

export async function requireTournamentAdmin(tournamentId: number) {
  const user = await requireAuth();
  const admin = await prisma.tournamentAdmin.findFirst({
    where: { tournamentId, userId: user.userId },
  });
  if (!admin) throw new Error("FORBIDDEN");
  return user;
}
```

- [ ] **Step 4: Update login to set role in session**

修改 `src/app/api/auth/login/route.ts`，登录成功时把 role 写入 session，同时检查封禁状态：

```typescript
const user = await prisma.user.findUnique({ where: { username } });
if (!user) return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });

// 被封禁用户禁止登录
if (user.banned) {
  return NextResponse.json({ error: "账户已被封禁" }, { status: 403 });
}

const valid = await verifyPassword(password, user.passwordHash);
// ... 验证通过后：
session.userId = user.id;
session.username = user.username;
session.role = user.role;
await session.save();
```

- [ ] **Step 5: Update /api/auth/me to return role + avatar + banned**

修改 `src/app/api/auth/me/route.ts` 的 GET：

```typescript
const user = await prisma.user.findUnique({
  where: { id: session.userId },
  select: { id: true, username: true, securityQuestion: true, role: true, avatar: true, banned: true },
});

// 被封禁的用户
if (user?.banned) {
  session.destroy();
  return NextResponse.json({ user: null, banned: true }, {
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate", "Pragma": "no-cache", "Expires": "0" },
  });
}

// 返回时加入 role 和 avatar
return NextResponse.json({
  user: {
    userId: session.userId,
    username: user.username,
    securityQuestion: user.securityQuestion || null,
    hasSecurityQuestion: !!user.securityQuestion,
    role: user.role,
    avatar: user.avatar,
  },
}, { ... });
```

- [ ] **Step 6: Update useAuth hook**

修改 `src/hooks/useAuth.ts` 的 User 接口和 fetch 逻辑：

```typescript
interface User {
  userId: number;
  username: string;
  role?: string;
  avatar?: string | null;
}

// fetch 返回后直接 setUser(d.user ?? null)，avatar 和 role 会自动带上
```

### Task 4: Protect Existing Admin APIs

**Files:**
- Modify: `src/app/api/announcements/route.ts`
- Modify: `src/app/api/announcements/[id]/route.ts`
- Modify: `src/app/api/heroes/route.ts` (add POST for sync trigger)

- [ ] **Step 1: Protect announcements POST with super admin**

修改 `src/app/api/announcements/route.ts` 的 POST handler，将 `requireAuth` 替换为 `requireSuperAdmin`：

```typescript
import { requireSuperAdmin } from "@/lib/permissions";

export async function POST(req: NextRequest) {
  const { userId } = await requireSuperAdmin().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "无权限" }, { status: 403 });
  // ... 其余不变
}
```

- [ ] **Step 2: Protect announcements PUT/DELETE with super admin**

修改 `src/app/api/announcements/[id]/route.ts` 的 PUT 和 DELETE handler，同样替换为 `requireSuperAdmin`。

- [ ] **Step 3: Add hero sync trigger API**

在 `src/app/api/heroes/route.ts` 添加 POST handler：

```typescript
import { requireSuperAdmin } from "@/lib/permissions";

export async function POST(req: NextRequest) {
  const { userId } = await requireSuperAdmin().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "无权限" }, { status: 403 });

  // 异步执行同步，避免请求超时
  const { syncAllHeroes } = await import("@/lib/heroes/sync");
  syncAllHeroes().catch((e) => console.error("Manual hero sync failed:", e));

  return NextResponse.json({ ok: true, message: "英雄同步已触发" });
}
```

- [ ] **Step 4: Protect tournament DELETE with super admin OR room admin**

检查 `src/app/api/tournaments/[id]/` 下是否有 DELETE route，若没有则创建 `src/app/api/tournaments/[id]/route.ts`（如果已存在则修改），添加 DELETE handler：

```typescript
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth().catch(() => ({ userId: 0 }));
  if (!user.userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournamentId = parseInt(params.id);

  // 超管可删除任意赛事，房管只能删自己的
  if (user.role !== "super_admin") {
    const admin = await prisma.tournamentAdmin.findFirst({
      where: { tournamentId, userId: user.userId, role: "owner" },
    });
    if (!admin) return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  await prisma.tournament.delete({ where: { id: tournamentId } });
  return NextResponse.json({ ok: true });
}
```

### Task 5: User Management API

**Files:**
- Create: `src/app/api/admin/users/route.ts`
- Create: `src/app/api/admin/users/[id]/route.ts`

- [ ] **Step 1: Create GET /api/admin/users (list all users)**

创建 `src/app/api/admin/users/route.ts`：

```typescript
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { userId } = await requireSuperAdmin().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = 20;
  const search = searchParams.get("search") || "";

  const where = search
    ? { username: { contains: search } }
    : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        username: true,
        role: true,
        banned: true,
        avatar: true,
        createdAt: true,
        _count: { select: { tournamentPlayers: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return NextResponse.json({
    users,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
}
```

- [ ] **Step 2: Create PUT/DELETE /api/admin/users/[id]**

创建 `src/app/api/admin/users/[id]/route.ts`：

```typescript
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/db";

// 封禁/解封 + 修改角色
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await requireSuperAdmin().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const targetId = parseInt(params.id);
  if (targetId === userId) {
    return NextResponse.json({ error: "不能操作自己" }, { status: 400 });
  }

  const { banned, role } = await req.json();
  const data: Record<string, unknown> = {};
  if (banned !== undefined) data.banned = banned;
  if (role !== undefined && ["user", "super_admin"].includes(role)) data.role = role;

  const user = await prisma.user.update({ where: { id: targetId }, data });
  return NextResponse.json({ ok: true, user: { id: user.id, username: user.username, role: user.role, banned: user.banned } });
}

// 删除用户
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await requireSuperAdmin().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const targetId = parseInt(params.id);
  if (targetId === userId) {
    return NextResponse.json({ error: "不能删除自己" }, { status: 400 });
  }

  await prisma.user.delete({ where: { id: targetId } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Add admin API paths to middleware PUBLIC_API exception**

修改 `src/middleware.ts`，在 PUBLIC_API 中加入 `/api/admin` 路径前缀豁免（实际不做豁免，走正常的 cookie 检查），但要确保 admin API 不走 PUBIC_API 白名单（它们需要 auth cookie）。

实际上 middleware 已经正确：只有 PUBLIC_API 中的路径免登录检查，admin API 不在其中会自动要求登录。

### Task 6: Avatar Backend

**Files:**
- Create: `src/app/api/me/avatar/route.ts`
- Create: `src/app/api/avatars/[filename]/route.ts`

- [ ] **Step 1: Create POST /api/me/avatar**

创建 `src/app/api/me/avatar/route.ts`：

```typescript
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

const AVATAR_DIR = process.env.AVATAR_DIR || "/data/uploads/avatars";
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 2 * 1024 * 1024; // 2MB

export async function POST(req: NextRequest) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("avatar") as File | null;
  if (!file) return NextResponse.json({ error: "请选择图片" }, { status: 400 });

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "仅支持 JPG/PNG/WebP 格式" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "图片大小不能超过 2MB" }, { status: 400 });
  }

  // 确保目录存在
  if (!existsSync(AVATAR_DIR)) {
    await mkdir(AVATAR_DIR, { recursive: true });
  }

  const ext = file.type.split("/")[1].replace("jpeg", "jpg");
  const filename = `${userId}_${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(join(AVATAR_DIR, filename), buffer);

  // 删除旧头像文件（可选，此处跳过以保持简洁）
  const oldUser = await prisma.user.findUnique({ where: { id: userId }, select: { avatar: true } });

  await prisma.user.update({ where: { id: userId }, data: { avatar: filename } });

  return NextResponse.json({ avatar: filename });
}
```

- [ ] **Step 2: Create GET /api/avatars/[filename]**

创建 `src/app/api/avatars/[filename]/route.ts`：

```typescript
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

const AVATAR_DIR = process.env.AVATAR_DIR || "/data/uploads/avatars";

export async function GET(req: NextRequest, { params }: { params: { filename: string } }) {
  const filename = params.filename;
  // 防御路径穿越
  if (filename.includes("..") || filename.includes("/")) {
    return NextResponse.json({ error: "非法文件名" }, { status: 400 });
  }

  const filepath = join(AVATAR_DIR, filename);
  if (!existsSync(filepath)) {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }

  const buffer = await readFile(filepath);
  const ext = filename.split(".").pop();
  const contentType = ext === "webp" ? "image/webp" : ext === "png" ? "image/png" : "image/jpeg";

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
```

### Task 7: Avatar Frontend

**Files:**
- Modify: `src/components/layout/Header.tsx`
- Modify: `src/app/me/page.tsx`
- Modify: `src/app/layout.tsx` (check if header is rendered there)
- Create: `src/components/me/AvatarUpload.tsx`

- [ ] **Step 1: Create AvatarUpload component**

创建 `src/components/me/AvatarUpload.tsx`：

```typescript
"use client";

import { useRef, useState } from "react";

interface Props {
  avatar: string | null | undefined;
  username: string;
  size?: number;
  onUpdated: (filename: string) => void;
}

export function AvatarUpload({ avatar, username, size = 80, onUpdated }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const avatarUrl = avatar
    ? `/api/avatars/${avatar}`
    : null;

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setUploading(true);

    const formData = new FormData();
    formData.append("avatar", file);

    const res = await fetch("/api/me/avatar", { method: "POST", body: formData });
    const data = await res.json();

    setUploading(false);
    if (data.avatar) {
      onUpdated(data.avatar);
    } else {
      setError(data.error || "上传失败");
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="relative rounded-full overflow-hidden border-2 border-gold/20 hover:border-gold/50 transition-all disabled:opacity-50"
        style={{ width: size, height: size }}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={username}
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <span className="w-full h-full flex items-center justify-center font-bold text-white bg-blue/20 text-blue"
            style={{ fontSize: size * 0.4 }}
          >
            {username[0]}
          </span>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <svg className="animate-spin w-5 h-5 text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}
      </button>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFile} hidden />
      <span className="text-[11px] text-text-muted cursor-pointer" onClick={() => inputRef.current?.click()}>
        {uploading ? "上传中..." : "更换头像"}
      </span>
      {error && <span className="text-[11px] text-red">{error}</span>}
    </div>
  );
}
```

- [ ] **Step 2: Add avatar display + upload to Me page**

修改 `src/app/me/page.tsx`，在标题下方添加头像区域：

```typescript
"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { RolePreferenceEditor } from "@/components/me/RolePreferenceEditor";
import { AvatarUpload } from "@/components/me/AvatarUpload";
import { PageEntrance } from "@/components/layout/PageEntrance";

export default function MePage() {
  const { user } = useAuth();
  const [avatar, setAvatar] = useState<string | null | undefined>(user?.avatar);

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-10 flex flex-col gap-6">
      <PageEntrance>
        <h1 className="text-[28px] font-extrabold text-gold-light tracking-wider m-0">个人空间</h1>
      </PageEntrance>

      <PageEntrance stagger={0.15}>
        <div className="flex justify-center py-4">
          <AvatarUpload
            avatar={avatar}
            username={user?.username || "?"}
            size={96}
            onUpdated={setAvatar}
          />
        </div>
      </PageEntrance>

      <PageEntrance stagger={0.3}>
        <RolePreferenceEditor />
      </PageEntrance>
    </div>
  );
}
```

- [ ] **Step 3: Update Header to show avatar image**

修改 `src/components/layout/Header.tsx`：

将两处用户首字母圆圈（顶部导航按钮 + 下拉菜单头部）的 `<span>` 替换为条件渲染：

```typescript
// 在组件顶部从 useAuth 获取 user，user 现在包含 avatar
// 将首字母 span 替换为：

{user.avatar ? (
  <img
    src={`/api/avatars/${user.avatar}`}
    alt={user.username}
    className="rounded-full object-cover w-8 h-8 border border-blue/15"
    onError={(e) => {
      // fallback 到首字母
      (e.target as HTMLImageElement).style.display = "none";
      (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
    }}
  />
) : null}
<span className={`rounded-full flex items-center justify-center font-bold shrink-0 w-8 h-8 text-sm bg-blue/8 text-[#4488f0] ${user.avatar ? "hidden" : ""}`}>
  {user.username[0]}
</span>
```

同时在导航按钮处（第68行）做同样替换（尺寸 w-6 h-6 text-[10px]）。

在下拉菜单中（第87行）的 w-8 h-8 处同样替换。

并在下拉菜单中加入"更换头像"选项：

```tsx
<button onClick={() => { setMenuOpen(false); router.push("/me"); }}
  className="w-full text-left flex items-center gap-2 px-4 py-2.5 text-sm transition-colors text-[#666] hover:bg-black/3 hover:text-[#333]">
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
  更换头像
</button>
```

### Task 8: Admin Pages

**Files:**
- Create: `src/app/admin/users/page.tsx`
- Create: `src/app/admin/layout.tsx` (if not exists — 为 /admin 统一加超管校验)
- Create: `src/app/m/admin/users/page.tsx` (移动端 re-export)

- [ ] **Step 1: Check/create admin layout for super admin protection**

如果 `src/app/admin/layout.tsx` 不存在，需要检查当前 layout 结构。如果存在则直接修改。

实际检查：当前 admin 页面直接使用根 layout。需要创建一个 AdminUsers 页面，通过客户端检查 role 来保护：

创建 `src/app/admin/users/page.tsx`：

```typescript
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

interface UserRow {
  id: number;
  username: string;
  role: string;
  banned: boolean;
  avatar: string | null;
  createdAt: string;
  _count: { tournamentPlayers: number };
}

export default function AdminUsersPage() {
  const { user, loaded } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (loaded && user?.role !== "super_admin") {
      router.replace("/");
    }
  }, [loaded, user, router]);

  useEffect(() => {
    if (user?.role !== "super_admin") return;
    setLoading(true);
    fetch(`/api/admin/users?page=${page}`)
      .then((r) => r.json())
      .then((d) => { setUsers(d.users); setTotal(d.total); setLoading(false); });
  }, [page, user]);

  async function toggleBan(id: number, current: boolean) {
    await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ banned: !current }),
    });
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, banned: !current } : u)));
  }

  async function deleteUser(id: number) {
    if (!confirm("确定删除该用户？此操作不可撤销。")) return;
    await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    setUsers((prev) => prev.filter((u) => u.id !== id));
    setTotal((t) => t - 1);
  }

  if (!loaded || user?.role !== "super_admin") {
    return <div className="p-10 text-center text-text-muted">Loading...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">用户管理</h1>
      <p className="text-text-muted text-sm mb-4">共 {total} 个用户</p>

      {loading ? (
        <div className="text-text-muted">加载中...</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border-light text-left text-text-muted">
                <th className="py-2 px-3">ID</th>
                <th className="py-2 px-3">用户名</th>
                <th className="py-2 px-3">角色</th>
                <th className="py-2 px-3">状态</th>
                <th className="py-2 px-3">赛事数</th>
                <th className="py-2 px-3">注册时间</th>
                <th className="py-2 px-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border-light hover:bg-black/2">
                  <td className="py-2 px-3">{u.id}</td>
                  <td className="py-2 px-3 font-medium">{u.username}</td>
                  <td className="py-2 px-3">
                    <span className={`text-[10px] font-semibold rounded px-1.5 py-0.5 ${
                      u.role === "super_admin" ? "bg-gold/10 text-gold" : "bg-gray-100 text-gray-500"
                    }`}>
                      {u.role === "super_admin" ? "超管" : "用户"}
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    <span className={u.banned ? "text-red" : "text-green"}>
                      {u.banned ? "已封禁" : "正常"}
                    </span>
                  </td>
                  <td className="py-2 px-3">{u._count.tournamentPlayers}</td>
                  <td className="py-2 px-3 text-text-muted">
                    {new Date(u.createdAt).toLocaleDateString("zh-CN")}
                  </td>
                  <td className="py-2 px-3 flex gap-2">
                    <button onClick={() => toggleBan(u.id, u.banned)}
                      className={`text-[11px] rounded px-2 py-0.5 ${
                        u.banned ? "bg-green/8 text-green" : "bg-yellow/8 text-yellow"
                      }`}>
                      {u.banned ? "解封" : "封禁"}
                    </button>
                    <button onClick={() => deleteUser(u.id)}
                      className="text-[11px] rounded px-2 py-0.5 bg-red/8 text-red">
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {total > 20 && (
            <div className="flex justify-center gap-2 mt-4">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1 text-sm rounded bg-card border border-border-light disabled:opacity-30">
                上一页
              </button>
              <span className="px-3 py-1 text-sm text-text-muted">
                {page} / {Math.ceil(total / 20)}
              </span>
              <button disabled={page >= Math.ceil(total / 20)}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 text-sm rounded bg-card border border-border-light disabled:opacity-30">
                下一页
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create mobile re-export**

创建 `src/app/m/admin/users/page.tsx`：

```typescript
export { default } from "@/app/admin/users/page";
```

### Task 9: Final Integration & Verification

- [ ] **Step 1: Update .env.example**

在 `D:\个人项目\王者演武堂\.env.example` 中添加：

```bash
AVATAR_DIR=/data/uploads/avatars
```

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```

Expected: 无类型错误。

- [ ] **Step 3: Test login flow**

`npm run dev` → 访问 `http://localhost:3000/login` → 使用 `admin / admin` 登录 → 确认登录成功，Header 显示 "a" 首字母 → 访问 `/admin/users` 确认可以访问。

- [ ] **Step 4: Test avatar upload**

登录后访问 `/me` → 确认头像区域显示 → 上传一张测试图片 → 确认 Header 中的头像更新。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: 权限系统 + 头像功能"
```
