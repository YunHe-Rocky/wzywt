# 综合功能修复与增强 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复7项功能缺陷并新增邮箱验证、密码重置、账号注销功能

**Architecture:** 修改现有5个API路由 + 新增3个API路由 + 修改5个前端组件 + 新增2个前端组件 + Schema扩展User模型。所有修改在现有Next.js 14 App Router架构内完成，认证沿用iron-session + bcryptjs，邮件发送引入nodemailer + QQ邮箱SMTP。

**Tech Stack:** Next.js 14 · TypeScript · Prisma 5 + MySQL · iron-session · bcryptjs · nodemailer · Tailwind CSS

---

## File Structure Map

```
修改:
  prisma/schema.prisma                              # User模型新增email/验证码字段
  src/lib/auth.ts                                   # 新增generateCode/sendVerificationCode函数
  src/lib/monitor/index.ts                          # news分支改为真正爬取+写缓存
  src/app/api/official-news/route.ts                # 改为从kv_cache读缓存
  src/app/api/tournaments/route.ts                  # GET返回公开赛事+我的赛事
  src/app/api/tournaments/[id]/kick/route.ts        # 目标为co_owner时先降级再踢出
  src/app/api/auth/register/route.ts                # 增加email+验证码校验
  src/components/auth/AuthForm.tsx                  # 注册增加邮箱+验证码字段；登录增加忘记密码入口
  src/app/me/page.tsx                               # 底部增加危险区域(注销入口)
  src/components/tournament/TournamentDetail.tsx    # 踢出逻辑调整 + 弃权按钮
  src/components/tournament/TournamentList.tsx      # 赛事列表增加公开赛事
  src/app/page.tsx                                  # 移除公告非空过滤

新增:
  src/lib/email.ts                                  # nodemailer SMTP发送封装
  src/app/api/auth/send-code/route.ts               # 发送邮箱验证码
  src/app/api/auth/reset-password/route.ts          # 重置密码
  src/app/api/auth/me/route.ts (新增DELETE)          # 注销账号
  src/app/api/tournaments/[id]/admin/resign/route.ts # 次房主弃权

.env (新增配置):
  EMAIL_HOST=smtp.qq.com
  EMAIL_PORT=465
  EMAIL_USER=your-qq@qq.com
  EMAIL_PASS=QQ邮箱SMTP授权码
```

---

### Task 1: Schema变更 — User模型新增邮箱字段

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: 更新 Prisma schema**

在 User 模型中新增字段。找到 `model User`，在 `passwordHash` 和 `createdAt` 之间插入：

```prisma
  email             String?   @unique
  emailVerified     Boolean   @default(false) @map("email_verified")
  resetCode         String?   @map("reset_code")
  resetCodeExpires  DateTime? @map("reset_code_expires")
  resetCodeAttempts Int       @default(0) @map("reset_code_attempts")
```

- [ ] **Step 2: Push schema**

```bash
npx prisma db push
```

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add email and verification code fields to User"
```

---

### Task 2: 邮件发送基础设施

**Files:**
- Create: `src/lib/email.ts`
- Modify: `.env` (手动添加环境变量)

- [ ] **Step 1: 安装 nodemailer**

```bash
npm install nodemailer
npm install -D @types/nodemailer
```

- [ ] **Step 2: 创建 `src/lib/email.ts`**

```typescript
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp.qq.com",
  port: parseInt(process.env.EMAIL_PORT || "465"),
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export async function sendVerificationEmail(
  to: string,
  code: string,
  type: "register" | "reset"
): Promise<{ success: boolean; error?: string }> {
  const subject = type === "register"
    ? "王者演武堂 - 邮箱验证码"
    : "王者演武堂 - 密码重置验证码";

  const html = `
<div style="max-width:480px;margin:0 auto;padding:32px;font-family:sans-serif">
  <h2 style="color:#c0a84a">王者演武堂</h2>
  <p>您的验证码为：</p>
  <div style="font-size:28px;font-weight:700;letter-spacing:4px;color:#c0a84a;padding:16px 0">${code}</div>
  <p style="color:#888">5分钟内有效，请勿泄露给他人。</p>
  ${type === "register" ? '<p style="color:#888">验证成功后即可完成注册。</p>' : '<p style="color:#888">如非本人操作，请忽略此邮件。</p>'}
</div>`;

  try {
    await transporter.sendMail({
      from: `"王者演武堂" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: (e as Error).message };
  }
}
```

- [ ] **Step 3: 提交**

```bash
git add src/lib/email.ts package.json package-lock.json
git commit -m "feat: add nodemailer email sending infrastructure"
```

---

### Task 3: 发送验证码 API

**Files:**
- Create: `src/app/api/auth/send-code/route.ts`

- [ ] **Step 1: 创建路由**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendVerificationEmail } from "@/lib/email";

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(req: NextRequest) {
  const { email, type } = await req.json();

  if (!email || !type) {
    return NextResponse.json({ error: "缺少参数" }, { status: 400 });
  }

  if (!email.endsWith("@qq.com")) {
    return NextResponse.json({ error: "请输入有效的QQ邮箱地址" }, { status: 400 });
  }

  if (!["register", "reset"].includes(type)) {
    return NextResponse.json({ error: "无效的验证类型" }, { status: 400 });
  }

  // 注册：检查邮箱是否已被使用
  if (type === "register") {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "该邮箱已被其他账号使用" }, { status: 409 });
    }
  }

  // 重置密码：检查邮箱是否已注册
  if (type === "reset") {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: "该邮箱未绑定任何账号" }, { status: 404 });
    }
  }

  // 检查60秒冷却
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser?.resetCodeExpires) {
    const remaining = Math.ceil(
      (existingUser.resetCodeExpires.getTime() - Date.now() - 4 * 60 * 1000) / 1000
    );
    if (remaining > 0 && remaining <= 60) {
      return NextResponse.json(
        { error: `请${remaining}秒后再发送验证码` },
        { status: 429 }
      );
    }
  }

  // 生成6位验证码，5分钟有效
  const code = generateCode();
  const expires = new Date(Date.now() + 5 * 60 * 1000);

  if (existingUser) {
    await prisma.user.update({
      where: { email },
      data: {
        resetCode: code,
        resetCodeExpires: expires,
        resetCodeAttempts: 0,
      },
    });
  }

  // 发送邮件
  const result = await sendVerificationEmail(email, code, type);
  if (!result.success) {
    return NextResponse.json(
      { error: "邮件发送失败，请稍后重试" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: 提交**

```bash
git add src/app/api/auth/send-code/
git commit -m "feat: add send verification code API"
```

---

### Task 4: 修改注册 API — 增加邮箱验证

**Files:**
- Modify: `src/app/api/auth/register/route.ts`

- [ ] **Step 1: 重写注册路由**

用以下内容替换现有 `src/app/api/auth/register/route.ts`：

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { getSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  const { username, email, password, code } = await req.json();

  if (!username || !password || !email || !code) {
    return NextResponse.json({ error: "请填写所有字段" }, { status: 400 });
  }

  if (username.length < 2 || password.length < 11) {
    return NextResponse.json({ error: "用户名至少2位，密码至少11位" }, { status: 400 });
  }

  if (!email.endsWith("@qq.com")) {
    return NextResponse.json({ error: "请输入有效的QQ邮箱地址" }, { status: 400 });
  }

  // 检查用户名
  const existingUser = await prisma.user.findUnique({ where: { username } });
  if (existingUser) {
    return NextResponse.json({ error: "用户名已被占用" }, { status: 409 });
  }

  // 检查邮箱
  const existingEmail = await prisma.user.findUnique({ where: { email } });
  if (existingEmail) {
    return NextResponse.json({ error: "该邮箱已被其他账号使用" }, { status: 409 });
  }

  // 校验验证码（从email查临时存储或直接用已发送的code对比）
  // 验证码存储在准备注册的email对应的记录上，但User还不存在
  // 改用单独的验证码缓存表或kv_cache
  // 这里从kv_cache查
  const cacheRow = await prisma.$queryRawUnsafe(
    "SELECT `value` FROM kv_cache WHERE `key` = ?",
    `verify_${email}`
  ) as { value: string }[];

  if (!cacheRow.length) {
    return NextResponse.json({ error: "请先发送验证码" }, { status: 400 });
  }

  const cached = JSON.parse(cacheRow[0].value);
  if (cached.code !== code) {
    const attempts = (cached.attempts || 0) + 1;
    cached.attempts = attempts;
    await prisma.$executeRawUnsafe(
      "UPDATE kv_cache SET `value` = ? WHERE `key` = ?",
      JSON.stringify(cached), `verify_${email}`
    );
    if (attempts >= 5) {
      return NextResponse.json({ error: "验证码错误次数过多，请15分钟后再试" }, { status: 429 });
    }
    return NextResponse.json({ error: "验证码错误" }, { status: 400 });
  }

  if (Date.now() > cached.expires) {
    return NextResponse.json({ error: "验证码已过期，请重新发送" }, { status: 400 });
  }

  // 创建用户
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash,
      email,
      emailVerified: true,
    },
  });

  // 清除验证码缓存
  await prisma.$executeRawUnsafe(
    "DELETE FROM kv_cache WHERE `key` = ?",
    `verify_${email}`
  );

  // 登录
  const session = await getSession();
  session.userId = user.id;
  session.username = user.username;
  await session.save();

  return NextResponse.json({ id: user.id, username: user.username });
}
```

**注意：** 验证码改为存储在 `kv_cache` 中而非 User 表（因为注册时 User 还不存在）。send-code API 也需要同步改为写入 kv_cache。

- [ ] **Step 2: 同步修改 send-code API — 验证码存入 kv_cache**

修改 `src/app/api/auth/send-code/route.ts`，将验证码写入 kv_cache（而非 User 表）：

在 `send-code/route.ts` 中，替换 `if (existingUser)` 块为：

```typescript
// 存储验证码到 kv_cache（5分钟有效）
await prisma.$executeRawUnsafe(
  "INSERT INTO kv_cache (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?",
  `verify_${email}`,
  JSON.stringify({ code, expires: expires.getTime(), attempts: 0 }),
  JSON.stringify({ code, expires: expires.getTime(), attempts: 0 })
);
```

并且把 send-code 中对 existingUser 的冷却检查改为从 kv_cache 中查：

```typescript
// 检查60秒冷却（改为查kv_cache）
const verifyRow = await prisma.$queryRawUnsafe(
  "SELECT `value` FROM kv_cache WHERE `key` = ?",
  `verify_${email}`
) as { value: string }[];

if (verifyRow.length > 0) {
  const cached = JSON.parse(verifyRow[0].value);
  const elapsed = Date.now() - cached.createdAt;
  if (elapsed < 60000) {
    return NextResponse.json(
      { error: `请${Math.ceil((60000 - elapsed) / 1000)}秒后再发送验证码` },
      { status: 429 }
    );
  }
}
```

在 send-code 写入 kv_cache 时加上 `createdAt`：

```json
JSON.stringify({ code, expires: expires.getTime(), attempts: 0, createdAt: Date.now() })
```

- [ ] **Step 3: 安装 nodemailer 类型（如未安装）**

```bash
npm install -D @types/nodemailer
```

- [ ] **Step 4: 提交**

```bash
git add src/app/api/auth/register/route.ts src/app/api/auth/send-code/route.ts
git commit -m "feat: add email verification to registration flow"
```

---

### Task 5: 忘记密码 — 重置密码 API

**Files:**
- Create: `src/app/api/auth/reset-password/route.ts`

- [ ] **Step 1: 创建重置密码路由**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { email, code, newPassword } = await req.json();

  if (!email || !code || !newPassword) {
    return NextResponse.json({ error: "请填写所有字段" }, { status: 400 });
  }

  if (newPassword.length < 11) {
    return NextResponse.json({ error: "密码至少11位" }, { status: 400 });
  }

  // 查找用户
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json({ error: "该邮箱未绑定任何账号" }, { status: 404 });
  }

  // 从 kv_cache 校验验证码
  const cacheRow = await prisma.$queryRawUnsafe(
    "SELECT `value` FROM kv_cache WHERE `key` = ?",
    `reset_${email}`
  ) as { value: string }[];

  if (!cacheRow.length) {
    return NextResponse.json({ error: "请先发送验证码" }, { status: 400 });
  }

  const cached = JSON.parse(cacheRow[0].value);
  if (cached.code !== code) {
    const attempts = (cached.attempts || 0) + 1;
    cached.attempts = attempts;
    await prisma.$executeRawUnsafe(
      "UPDATE kv_cache SET `value` = ? WHERE `key` = ?",
      JSON.stringify(cached), `reset_${email}`
    );
    if (attempts >= 5) {
      return NextResponse.json({ error: "验证码错误次数过多，请15分钟后再试" }, { status: 429 });
    }
    return NextResponse.json({ error: "验证码错误" }, { status: 400 });
  }

  if (Date.now() > cached.expires) {
    return NextResponse.json({ error: "验证码已过期，请重新发送" }, { status: 400 });
  }

  // 更新密码
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  // 清除验证码缓存
  await prisma.$executeRawUnsafe(
    "DELETE FROM kv_cache WHERE `key` = ?",
    `reset_${email}`
  );

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: 同步修改 send-code — 区分 register 和 reset 的缓存 key**

修改 `send-code/route.ts` 中 kv_cache 的 key 前缀：
- type=register → key = `verify_${email}`
- type=reset → key = `reset_${email}`

```typescript
const cacheKey = type === "register" ? `verify_${email}` : `reset_${email}`;
```

把发送验证码和写入缓存的地方都改用 `cacheKey`。

- [ ] **Step 3: 提交**

```bash
git add src/app/api/auth/reset-password/route.ts src/app/api/auth/send-code/route.ts
git commit -m "feat: add password reset API with email verification"
```

---

### Task 6: 修改前端 AuthForm — 注册增加邮箱 + 登录增加忘记密码入口

**Files:**
- Modify: `src/components/auth/AuthForm.tsx`

- [ ] **Step 1: 重写 AuthForm**

用以下内容替换 `src/components/auth/AuthForm.tsx`：

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { success, error: showError } = useToast();
  const redirect = searchParams.get("redirect") || "/";
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [sendingCode, setSendingCode] = useState(false);
  const [codeCooldown, setCodeCooldown] = useState(0);

  // Forgot password modal states
  const [showForgot, setShowForgot] = useState(false);
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotCode, setForgotCode] = useState("");
  const [forgotPassword, setForgotPassword] = useState("");
  const [forgotConfirm, setForgotConfirm] = useState("");
  const [forgotError, setForgotError] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user) {
          router.replace(redirect);
        } else {
          setChecking(false);
        }
      });
  }, [router]);

  // Code cooldown timer
  useEffect(() => {
    if (codeCooldown <= 0) return;
    const t = setInterval(() => setCodeCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [codeCooldown]);

  async function sendCode() {
    if (!email || !email.endsWith("@qq.com")) {
      setError("请输入有效的QQ邮箱地址");
      return;
    }
    setSendingCode(true);
    setError("");
    const res = await fetch("/api/auth/send-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, type: "register" }),
    });
    const data = await res.json();
    setSendingCode(false);
    if (!res.ok) {
      setError(data.error || "发送失败");
      return;
    }
    setCodeCooldown(60);
    success("验证码已发送，请查收QQ邮箱");
  }

  async function sendForgotCode() {
    if (!forgotEmail || !forgotEmail.endsWith("@qq.com")) {
      setForgotError("请输入有效的QQ邮箱地址");
      return;
    }
    setForgotLoading(true);
    setForgotError("");
    const res = await fetch("/api/auth/send-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: forgotEmail, type: "reset" }),
    });
    const data = await res.json();
    setForgotLoading(false);
    if (!res.ok) {
      setForgotError(data.error || "发送失败");
      return;
    }
    setForgotStep(2);
  }

  async function resetPassword() {
    if (forgotPassword.length < 11) {
      setForgotError("密码至少11位");
      return;
    }
    if (forgotPassword !== forgotConfirm) {
      setForgotError("两次密码不一致");
      return;
    }
    setForgotLoading(true);
    setForgotError("");
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: forgotEmail, code: forgotCode, newPassword: forgotPassword }),
    });
    const data = await res.json();
    setForgotLoading(false);
    if (!res.ok) {
      setForgotError(data.error || "重置失败");
      return;
    }
    success("密码已重置，请登录");
    setShowForgot(false);
    setForgotStep(1);
    setForgotEmail("");
    setForgotCode("");
    setForgotPassword("");
    setForgotConfirm("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (mode === "register" && !code) {
      setError("请先发送并填写邮箱验证码");
      setLoading(false);
      return;
    }

    const body: Record<string, string> = { username, password };
    if (mode === "register") {
      body.email = email;
      body.code = code;
    }

    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "操作失败");
      return;
    }
    if (mode === "register") {
      success("欢迎加入王者演武堂！");
    }
    router.push(redirect);
    router.refresh();
  }

  const title = mode === "login" ? "登录" : "注册";
  const subtitle =
    mode === "login" ? "重返演武战场" : "新召唤师报到";
  const switchText =
    mode === "login" ? "没有账号？前往注册" : "已有账号？返回登录";
  const switchHref = mode === "login" ? "/register" : "/login";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "calc(100vh - 64px)",
        padding: "0 24px",
      }}
    >
      {checking ? (
        <div className="skeleton" style={{ width: 420, height: 380, borderRadius: "var(--radius)" }} />
      ) : (
      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: 420,
          padding: "40px 36px 36px",
          animation: "slide-up 0.5s ease-out",
        }}
      >
        <h1
          style={{
            fontSize: 28,
            fontWeight: 700,
            textAlign: "center",
            marginBottom: 4,
            color: "var(--text)",
          }}
        >
          {title}
        </h1>

        <p
          style={{
            fontSize: 13,
            fontWeight: 400,
            textAlign: "center",
            color: "var(--text-muted)",
            marginBottom: 32,
          }}
        >
          {subtitle}
        </p>

        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: 20 }}
        >
          {/* Username */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-secondary)",
              }}
            >
              召唤师名称
            </label>
            <input
              type="text"
              placeholder="请输入召唤师名称"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={2}
            />
          </div>

          {/* Email (register only) */}
          {mode === "register" && (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                  }}
                >
                  QQ邮箱
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="email"
                    placeholder="example@qq.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={sendCode}
                    disabled={sendingCode || codeCooldown > 0}
                    className="btn-primary"
                    style={{
                      fontSize: 12,
                      padding: "8px 14px",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                      opacity: sendingCode || codeCooldown > 0 ? 0.6 : 1,
                    }}
                  >
                    {sendingCode ? "发送中..." : codeCooldown > 0 ? `${codeCooldown}s` : "发送验证码"}
                  </button>
                </div>
                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                  仅用于找回密码，验证码5分钟内有效
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                  }}
                >
                  验证码
                </label>
                <input
                  type="text"
                  placeholder="6位数字验证码"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  maxLength={6}
                  inputMode="numeric"
                />
              </div>
            </>
          )}

          {/* Password */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-secondary)",
              }}
            >
              密码
            </label>
            <input
              type="password"
              placeholder={mode === "register" ? "请输入密码（至少 11 位）" : "请输入密码"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={11}
            />
          </div>

          {/* Error */}
          {error && (
            <div
              className="card-red"
              style={{
                padding: "12px 14px",
                borderRadius: "var(--radius-sm)",
                animation: "slide-up 0.2s ease-out",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--red)",
                  textAlign: "center",
                }}
              >
                {error}
              </p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
            style={{
              width: "100%",
              marginTop: 6,
              padding: "14px 0",
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            {loading ? "请稍候..." : title}
          </button>
        </form>

        {/* Links */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 28,
            fontSize: 14,
          }}
        >
          {mode === "login" ? (
            <>
              <button
                type="button"
                onClick={() => { setShowForgot(true); setForgotStep(1); setForgotError(""); }}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--gold)",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 600,
                  padding: 0,
                }}
              >
                忘记密码？
              </button>
              <Link
                href={switchHref}
                style={{
                  color: "var(--text-muted)",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                {switchText}
              </Link>
            </>
          ) : (
            <Link
              href={switchHref}
              style={{
                color: "var(--text-muted)",
                fontWeight: 600,
                textDecoration: "none",
                margin: "0 auto",
              }}
            >
              {switchText}
            </Link>
          )}
        </div>
      </div>
      )}

      {/* ================================================================ */}
      {/*  FORGOT PASSWORD MODAL                                           */}
      {/* ================================================================ */}
      {showForgot && (
        <>
          <div
            onClick={() => setShowForgot(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000 }}
          />
          <div
            className="card"
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 1001,
              padding: "32px 28px",
              width: 380,
            }}
          >
            {forgotStep === 1 ? (
              <>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", margin: "0 0 6px", textAlign: "center" }}>
                  找回密码
                </h3>
                <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", marginBottom: 20 }}>
                  输入注册时绑定的QQ邮箱
                </p>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>QQ邮箱</label>
                  <input
                    type="email"
                    placeholder="example@qq.com"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    style={{ marginTop: 4 }}
                  />
                </div>
                {forgotError && (
                  <p style={{ fontSize: 12, color: "var(--red)", marginBottom: 12 }}>{forgotError}</p>
                )}
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    onClick={() => setShowForgot(false)}
                    className="btn-ghost"
                    style={{ flex: 1, fontSize: 13 }}
                  >
                    取消
                  </button>
                  <button
                    onClick={sendForgotCode}
                    disabled={forgotLoading}
                    className="btn-primary"
                    style={{ flex: 1, fontSize: 13 }}
                  >
                    {forgotLoading ? "发送中..." : "发送验证码"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", margin: "0 0 6px", textAlign: "center" }}>
                  重置密码
                </h3>
                <p style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", marginBottom: 20 }}>
                  已发送至 {forgotEmail.replace(/(.{3}).*(@.*)/, "$1***$2")}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>验证码</label>
                    <input
                      type="text"
                      placeholder="6位数字"
                      value={forgotCode}
                      onChange={(e) => setForgotCode(e.target.value)}
                      maxLength={6}
                      inputMode="numeric"
                      style={{ marginTop: 4 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>新密码</label>
                    <input
                      type="password"
                      placeholder="至少 11 位"
                      value={forgotPassword}
                      onChange={(e) => setForgotPassword(e.target.value)}
                      minLength={11}
                      style={{ marginTop: 4 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>确认新密码</label>
                    <input
                      type="password"
                      placeholder="再次输入"
                      value={forgotConfirm}
                      onChange={(e) => setForgotConfirm(e.target.value)}
                      style={{ marginTop: 4 }}
                    />
                  </div>
                </div>
                {forgotError && (
                  <p style={{ fontSize: 12, color: "var(--red)", margin: "12px 0 0" }}>{forgotError}</p>
                )}
                <button
                  onClick={resetPassword}
                  disabled={forgotLoading}
                  className="btn-primary"
                  style={{ width: "100%", marginTop: 16, fontSize: 13 }}
                >
                  {forgotLoading ? "处理中..." : "重置密码"}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 提交**

```bash
git add src/components/auth/AuthForm.tsx
git commit -m "feat: add email verification to register + forgot password modal"
```

---

### Task 7: 账号注销 API + 前端弹窗

**Files:**
- Modify: `src/app/api/auth/me/route.ts`（新增 DELETE handler）
- Modify: `src/app/me/page.tsx`（新增危险区域）
- Create: `src/components/auth/DeleteAccountModal.tsx`

- [ ] **Step 1: 先在 me route 新增 DELETE handler**

读取现有 `src/app/api/auth/me/route.ts`，在现有 GET handler 后面追加 DELETE handler：

```typescript
export async function DELETE(req: NextRequest) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { password } = await req.json();
  if (!password) {
    return NextResponse.json({ error: "请输入密码确认身份" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "用户不存在" }, { status: 404 });

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "密码错误" }, { status: 403 });
  }

  // 级联删除：tournament_players, tournament_admins, role_preferences,
  // hero_powers, temp_player_applications, admin_operations, 最后用户
  await prisma.$transaction([
    prisma.tournamentPlayer.deleteMany({ where: { userId } }),
    prisma.tournamentAdmin.deleteMany({ where: { userId } }),
    prisma.rolePreference.deleteMany({ where: { userId } }),
    prisma.heroPower.deleteMany({ where: { userId } }),
    prisma.tempPlayerApplication.deleteMany({ where: { applicantId: userId } }),
    prisma.adminOperation.deleteMany({ where: { adminId: userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);

  // 清除 session
  const session = await getSession();
  session.destroy();

  return NextResponse.json({ ok: true });
}
```

现有文件只 import 了 `{ NextResponse }` 和 `{ getSession }`。需要将第一行改为：

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { requireAuth, verifyPassword } from "@/lib/auth";
```

- [ ] **Step 2: 创建注销确认弹窗组件**

创建 `src/components/auth/DeleteAccountModal.tsx`：

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";

export function DeleteAccountModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const { success } = useToast();

  if (!open) return null;

  const canDelete = confirmText === "DELETE" && password.length >= 11;

  async function doDelete() {
    if (!canDelete) return;
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/me", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "注销失败");
      return;
    }
    success("账号已注销");
    router.push("/");
    router.refresh();
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000 }}
      />
      <div
        className="card"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 1001,
          padding: "28px",
          width: 400,
          maxWidth: "90vw",
        }}
      >
        <h3 style={{
          fontSize: 18,
          fontWeight: 700,
          color: "var(--red)",
          textAlign: "center",
          margin: "0 0 6px",
        }}>
          注销账号
        </h3>
        <p style={{
          fontSize: 12,
          color: "var(--text-muted)",
          textAlign: "center",
          marginBottom: 18,
          lineHeight: 1.6,
        }}>
          此操作<strong style={{ color: "var(--red)" }}>不可撤销</strong>，全部数据将被永久删除
        </p>

        <div style={{
          background: "rgba(224,80,80,0.04)",
          border: "1px solid rgba(224,80,80,0.12)",
          borderRadius: "var(--radius-sm)",
          padding: "10px 14px",
          marginBottom: 18,
          fontSize: 11,
          color: "var(--text-secondary)",
          lineHeight: 1.8,
        }}>
          将删除：账号 · 密码 · 分路偏好 · 段位 · 英雄战力 · 赛事记录 · 管理权限
        </div>

        {/* Step 1 */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span style={{
              display: "inline-flex",
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: "var(--gold)",
              color: "#1a1408",
              fontSize: 11,
              fontWeight: 700,
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}>1</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
              输入 <code style={{
                background: "rgba(224,80,80,0.08)",
                padding: "1px 4px",
                borderRadius: 3,
                fontSize: 11,
                color: "var(--red)",
              }}>DELETE</code> 确认删除
            </span>
          </div>
          <input
            type="text"
            placeholder="DELETE"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
          />
        </div>

        {/* Step 2 */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span style={{
              display: "inline-flex",
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: "var(--gold)",
              color: "#1a1408",
              fontSize: 11,
              fontWeight: 700,
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}>2</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>输入密码确认身份</span>
          </div>
          <input
            type="password"
            placeholder="当前密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && (
          <p style={{
            fontSize: 12,
            color: "var(--red)",
            textAlign: "center",
            marginBottom: 12,
            padding: "8px 12px",
            background: "rgba(224,80,80,0.06)",
            borderRadius: "var(--radius-sm)",
          }}>{error}</p>
        )}

        {/* Buttons */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: "10px 0",
              textAlign: "center",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              fontSize: 13,
              fontWeight: 500,
              color: "var(--text-muted)",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            取消
          </button>
          <button
            onClick={doDelete}
            disabled={!canDelete || loading}
            style={{
              flex: 1,
              padding: "10px 0",
              textAlign: "center",
              border: "none",
              borderRadius: "var(--radius-sm)",
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
              background: canDelete ? "var(--red)" : "rgba(224,80,80,0.3)",
              cursor: canDelete ? "pointer" : "not-allowed",
              opacity: !canDelete || loading ? 0.5 : 1,
            }}
          >
            {loading ? "注销中..." : "确认注销"}
          </button>
        </div>

        <p style={{
          textAlign: "center",
          marginTop: 10,
          marginBottom: 0,
          fontSize: 11,
          color: "var(--text-muted)",
        }}>
          完成①②步后按钮自动激活
        </p>
      </div>
    </>
  );
}
```

- [ ] **Step 3: 修改个人空间页面 — 底部加危险区域**

读取现有 `src/app/me/page.tsx`，在第二个 `HeroPowerEditor` 的 div 后面追加危险区域：

```tsx
"use client";

import { useState } from "react";
import { RolePreferenceEditor } from "@/components/me/RolePreferenceEditor";
import { HeroPowerEditor } from "@/components/me/HeroPowerEditor";
import { DeleteAccountModal } from "@/components/auth/DeleteAccountModal";

export default function MePage() {
  const [showDelete, setShowDelete] = useState(false);

  return (
    <div
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "48px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 32,
        animation: "fade-in 0.4s ease-out",
      }}
    >
      <h1
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: "var(--text)",
        }}
      >
        个人空间
      </h1>
      <div style={{ animation: "slide-up 0.4s 0.05s ease-out both" }}>
        <RolePreferenceEditor />
      </div>
      <div style={{ animation: "slide-up 0.4s 0.1s ease-out both" }}>
        <HeroPowerEditor />
      </div>

      {/* Danger zone */}
      <div
        style={{
          animation: "slide-up 0.4s 0.15s ease-out both",
          padding: "20px",
          border: "1px solid var(--red)",
          borderRadius: "var(--radius)",
          background: "rgba(224,80,80,0.04)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--red)", marginBottom: 4 }}>
              危险区域
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              注销后所有数据将被永久删除，无法恢复
            </div>
          </div>
          <button
            onClick={() => setShowDelete(true)}
            style={{
              padding: "8px 20px",
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
              background: "var(--red)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
            }}
          >
            注销账号
          </button>
        </div>
      </div>

      <DeleteAccountModal open={showDelete} onClose={() => setShowDelete(false)} />
    </div>
  );
}
```

- [ ] **Step 4: 提交**

```bash
git add src/app/api/auth/me/route.ts src/components/auth/DeleteAccountModal.tsx src/app/me/page.tsx
git commit -m "feat: add account deletion with confirmation modal"
```

---

### Task 8: 踢出次房主自动降级

**Files:**
- Modify: `src/app/api/tournaments/[id]/kick/route.ts`
- Modify: `src/components/tournament/TournamentDetail.tsx`

- [ ] **Step 1: 修改 kick API**

替换现有 `src/app/api/tournaments/[id]/kick/route.ts`：

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournamentId = parseInt(params.id);
  const { targetUserId } = await req.json();

  const admin = await prisma.tournamentAdmin.findFirst({ where: { tournamentId, userId } });
  if (!admin) return NextResponse.json({ error: "仅管理员可踢人" }, { status: 403 });

  const targetIsOwner = await prisma.tournamentAdmin.findFirst({
    where: { tournamentId, userId: targetUserId, role: "owner" },
  });
  if (targetIsOwner) return NextResponse.json({ error: "不能踢出房主" }, { status: 400 });

  // 如果目标是次房主，先降级再踢出
  const targetIsCoOwner = await prisma.tournamentAdmin.findFirst({
    where: { tournamentId, userId: targetUserId, role: "co_owner" },
  });

  await prisma.$transaction([
    ...(targetIsCoOwner
      ? [prisma.tournamentAdmin.delete({ where: { tournamentId_userId: { tournamentId, userId: targetUserId } } })]
      : []),
    prisma.tournamentPlayer.delete({
      where: { tournamentId_userId: { tournamentId, userId: targetUserId } },
    }),
    prisma.adminOperation.create({
      data: {
        tournamentId,
        adminId: userId,
        action: targetIsCoOwner ? "demote_and_kick" : "kick",
        targetId: targetUserId,
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: 更新前端按钮文案**

在 `TournamentDetail.tsx` 中找到 `canKick` 的定义和"踢出"按钮位置。在踢出按钮旁，检查目标是否为次房主：

在 `TournamentDetail.tsx` 的 player 行渲染中，找到踢出按钮（约 line 740），将按钮文案从固定"踢出"改为动态判断：

查找：
```tsx
{canKick && (
  <button ...>踢出</button>
)}
```

替换为：
```tsx
{canKick && (
  <button
    onClick={async () => {
      const name = p.isTemporary ? (p.tempName || "临时选手") : p.user.username;
      const isCoOwner = adminRole?.role === "co_owner";
      const msg = isCoOwner
        ? `确定将次房主 ${name} 降级并踢出吗？`
        : `确定踢出 ${name} 吗？`;
      if (!confirm(msg)) return;
      const res = await fetch(`/api/tournaments/${id}/kick`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: p.userId }),
      });
      if (res.ok) { refreshTournament(); success(isCoOwner ? "已降级并踢出" : "已踢出"); }
      else { const d = await res.json(); showError(d.error); }
    }}
    className="btn-subtle"
    style={{ fontSize: 12, padding: "5px 12px", color: "var(--red)", whiteSpace: "nowrap" }}
  >
    {adminRole?.role === "co_owner" ? "降级并踢出" : "踢出"}
  </button>
)}
```

- [ ] **Step 3: 提交**

```bash
git add src/app/api/tournaments/[id]/kick/route.ts src/components/tournament/TournamentDetail.tsx
git commit -m "fix: auto-demote co-owner before kicking"
```

---

### Task 9: 次房主主动弃权 API

**Files:**
- Create: `src/app/api/tournaments/[id]/admin/resign/route.ts`
- Modify: `src/components/tournament/TournamentDetail.tsx`

- [ ] **Step 1: 创建弃权路由**

创建 `src/app/api/tournaments/[id]/admin/resign/route.ts`：

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const tournamentId = parseInt(params.id);

  const admin = await prisma.tournamentAdmin.findFirst({
    where: { tournamentId, userId },
  });

  if (!admin) return NextResponse.json({ error: "你不是管理员" }, { status: 403 });
  if (admin.role === "owner") {
    return NextResponse.json({ error: "房主不能弃权，请取消赛事" }, { status: 400 });
  }

  // 删除 admin 记录，保留 player 记录
  await prisma.tournamentAdmin.delete({
    where: { tournamentId_userId: { tournamentId, userId } },
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: 前端增加弃权按钮**

在 `TournamentDetail.tsx` 的管理员控制栏（`isAdmin` 区域）中，次房主旁边增加"辞去管理"按钮。

找到管理员控制栏渲染（约 line 445-460），在"延长截止"按钮旁边追加：

```tsx
{!isOwner && (
  <button
    onClick={async () => {
      if (!confirm("确定辞去管理权限吗？你将变为普通选手。")) return;
      const res = await fetch(`/api/tournaments/${id}/admin/resign`, { method: "POST" });
      if (res.ok) { refreshTournament(); success("已辞去管理权限"); }
      else { const d = await res.json(); showError(d.error); }
    }}
    className="btn-subtle"
    style={{ fontSize: 13, padding: "8px 18px", color: "var(--red)" }}
  >
    辞去管理
  </button>
)}
```

- [ ] **Step 3: 提交**

```bash
git add src/app/api/tournaments/[id]/admin/resign/route.ts src/components/tournament/TournamentDetail.tsx
git commit -m "feat: allow co-owner to resign admin status"
```

---

### Task 10: 赛事大厅 — 返回公开赛事

**Files:**
- Modify: `src/app/api/tournaments/route.ts`
- Modify: `src/components/tournament/TournamentList.tsx`

- [ ] **Step 1: 修改 tournaments GET API**

替换 `src/app/api/tournaments/route.ts` 的 GET handler：

```typescript
export async function GET() {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  // 我的赛事（参与的 + 管理的）
  const myTournaments = await prisma.tournament.findMany({
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

  const myIds = myTournaments.map((t) => t.id);

  // 公开可报名的赛事（排除已加入的）
  const publicTournaments = await prisma.tournament.findMany({
    where: {
      isPublic: true,
      status: "recruiting",
      id: { notIn: myIds },
    },
    include: {
      _count: { select: { players: true } },
      admins: { select: { userId: true, role: true } },
    },
    orderBy: { deadline: "asc" },
  });

  return NextResponse.json({
    tournaments: myTournaments,
    publicTournaments,
  });
}
```

- [ ] **Step 2: 修改前端 TournamentList — 增加公开赛事展示**

在 `TournamentList.tsx` 中：
- 新增 state：`const [publicTournaments, setPublicTournaments] = useState<Tournament[]>([]);`
- 在 `refresh()` 中：`if (data.publicTournaments) setPublicTournaments(data.publicTournaments);`
- 在"我的赛事"列表下方追加公开赛区域：

```tsx
{publicTournaments.length > 0 && (
  <>
    <div style={{ marginTop: 32, marginBottom: 12 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
        公开赛事
      </h3>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {publicTournaments.map((t, i) => (
        <button
          key={t.id}
          onClick={() => router.push(`/tournaments/${t.id}`)}
          className="card"
          style={{
            textAlign: "left",
            padding: "16px 24px",
            cursor: "pointer",
            animation: `fade-in 0.3s ease-out ${i * 0.04}s both`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              <span style={{
                fontWeight: 600, fontSize: 16, color: "var(--text)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240,
              }}>
                {t.name}
              </span>
              <span style={{
                fontSize: 12, color: "var(--text-muted)", fontFamily: "monospace",
                fontWeight: 600, letterSpacing: 1, padding: "2px 8px",
                background: "var(--bg-input)", borderRadius: "var(--radius-sm)",
              }}>
                #{t.code}
              </span>
              <span className="badge badge-green" style={{ fontSize: 10 }}>公开</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: t._count.players >= 10 ? "var(--gold)" : "var(--text)" }}>
                  {t._count.players}
                </span>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>人</span>
              </div>
              <span style={{ fontSize: 12, color: "var(--text-secondary)", fontFamily: "monospace" }}>
                {new Date(t.deadline).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          </div>
        </button>
      ))}
    </div>
  </>
)}
```

- [ ] **Step 3: 提交**

```bash
git add src/app/api/tournaments/route.ts src/components/tournament/TournamentList.tsx
git commit -m "feat: show public tournaments in tournament lobby"
```

---

### Task 11: 首页 — 移除公告过滤 + 修复房间公告展示

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: 去掉 announcement 过滤**

在 `src/app/page.tsx` 中找到这一行（约 line 100）：

```typescript
fetch("/api/tournaments/public").then(r => r.json()).then(d => { if (d.tournaments) setRooms(d.tournaments.filter((t: PublicTournament) => t.announcement)); }).catch(() => {}),
```

改为：

```typescript
fetch("/api/tournaments/public").then(r => r.json()).then(d => { if (d.tournaments) setRooms(d.tournaments); }).catch(() => {}),
```

- [ ] **Step 2: 更新房间公告卡片 — 无公告时显示提示**

在房间公告列表项（约 line 216）中，将：

```tsx
<p style={{ fontSize: 12, ... }}>
  {room.announcement && room.announcement.length > 60 ? room.announcement.slice(0, 60) + "..." : room.announcement}
</p>
```

改为：

```tsx
<p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
  {room.announcement
    ? (room.announcement.length > 60 ? room.announcement.slice(0, 60) + "..." : room.announcement)
    : "暂无公告"}
</p>
```

- [ ] **Step 3: 提交**

```bash
git add src/app/page.tsx
git commit -m "fix: show all public rooms on homepage, handle empty announcements"
```

---

### Task 12: 官方公告爬虫修复

**Files:**
- Modify: `src/lib/monitor/index.ts`
- Modify: `src/app/api/official-news/route.ts`

- [ ] **Step 1: 在 monitor 中实现真正的新闻爬取+缓存**

修改 `src/lib/monitor/index.ts`，在 `runMonitorAndScrape` 的 `case "news"` 分支中，替换现有的空处理：

将：
```typescript
case "news": {
  events.push({ module: "news", action: "scrape-done", detail: "news titles changed, refresh /api/official-news", timestamp: Date.now() });
  break;
}
```

替换为：
```typescript
case "news": {
  try {
    const res = await fetchWithRetry(NEWS_URL, { timeout: 8000, referer: "https://pvp.qq.com/" });
    if (res.ok && res.text) {
      const html = res.text;
      // 提取新闻：查找包含链接和标题的 li 或 div
      const newsItems: { title: string; date: string; url: string }[] = [];
      const linkRegex = /<a[^>]*href="([^"]*)"[^>]*>([^<]{4,})<\/a>/g;
      let match;
      while ((match = linkRegex.exec(html)) !== null) {
        const href = match[1];
        const title = match[2].trim();
        if (title.length < 4) continue;
        let url = href;
        if (url && !url.startsWith("http")) {
          url = url.startsWith("/") ? `https://pvp.qq.com${url}` : `https://pvp.qq.com/web201605/${url}`;
        }
        // 尝试在周围提取日期
        const contextStart = Math.max(0, match.index - 200);
        const context = html.slice(contextStart, match.index);
        const dateMatch = context.match(/(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/);
        const date = dateMatch ? dateMatch[1].replace(/[./]/g, "-") : new Date().toISOString().slice(0, 10);
        newsItems.push({ title, date, url });
        if (newsItems.length >= 10) break;
      }
      if (newsItems.length > 0) {
        await prisma.$executeRawUnsafe(
          "INSERT INTO kv_cache (`key`, `value`) VALUES ('official_news', ?) ON DUPLICATE KEY UPDATE `value` = ?",
          JSON.stringify(newsItems), JSON.stringify(newsItems)
        );
        events.push({ module: "news", action: "scrape-done", detail: `cached ${newsItems.length} items`, timestamp: Date.now() });
      } else {
        events.push({ module: "news", action: "scrape-done", detail: "no news items found", timestamp: Date.now() });
      }
    }
  } catch (e: unknown) {
    events.push({ module: "news", action: "scrape-fail", detail: (e as Error).message, timestamp: Date.now() });
  }
  break;
}
```

- [ ] **Step 2: 重写 official-news API — 从缓存读取**

替换 `src/app/api/official-news/route.ts`：

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const FALLBACK_NEWS = [
  { title: "新赛季更新公告", date: new Date().toISOString().slice(0, 10), url: "https://pvp.qq.com/web201605/news.shtml" },
];

export async function GET() {
  try {
    // 从缓存读取
    const cacheRow = await prisma.$queryRawUnsafe(
      "SELECT `value` FROM kv_cache WHERE `key` = 'official_news'"
    ) as { value: string }[];

    if (cacheRow.length > 0) {
      const news = JSON.parse(cacheRow[0].value);
      return NextResponse.json(news);
    }

    // 缓存未命中，执行一次爬取
    const { fetchWithRetry } = await import("@/lib/anti-bot");
    const res = await fetchWithRetry("https://pvp.qq.com/web201605/newslist.shtml", {
      timeout: 8000,
      referer: "https://pvp.qq.com/",
    });

    if (res.ok && res.text) {
      const html = res.text;
      const newsItems: { title: string; date: string; url: string }[] = [];
      const linkRegex = /<a[^>]*href="([^"]*)"[^>]*>([^<]{4,})<\/a>/g;
      let match;
      while ((match = linkRegex.exec(html)) !== null) {
        const href = match[1];
        const title = match[2].trim();
        if (title.length < 4) continue;
        let url = href;
        if (url && !url.startsWith("http")) {
          url = url.startsWith("/") ? `https://pvp.qq.com${url}` : `https://pvp.qq.com/web201605/${url}`;
        }
        const contextStart = Math.max(0, match.index - 200);
        const context = html.slice(contextStart, match.index);
        const dateMatch = context.match(/(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/);
        const date = dateMatch ? dateMatch[1].replace(/[./]/g, "-") : new Date().toISOString().slice(0, 10);
        newsItems.push({ title, date, url });
        if (newsItems.length >= 10) break;
      }

      if (newsItems.length > 0) {
        // 写入缓存
        await prisma.$executeRawUnsafe(
          "INSERT INTO kv_cache (`key`, `value`) VALUES ('official_news', ?) ON DUPLICATE KEY UPDATE `value` = ?",
          JSON.stringify(newsItems), JSON.stringify(newsItems)
        );
        return NextResponse.json(newsItems);
      }
    }
  } catch {
    // Fall through to fallback
  }

  return NextResponse.json(FALLBACK_NEWS);
}
```

- [ ] **Step 3: 提交**

```bash
git add src/lib/monitor/index.ts src/app/api/official-news/route.ts
git commit -m "fix: implement news crawl→cache→serve pipeline, fix date parsing"
```

---

### Task 13: 整体验证 + 环境变量配置

- [ ] **Step 1: 添加 .env 示例**

在项目根目录创建或更新 `.env.example`：

```env
DATABASE_URL=mysql://root:password@localhost:3306/wzyt
SESSION_SECRET=your-secret-at-least-32-characters

# QQ邮箱 SMTP（用于发送验证码和重置密码）
EMAIL_HOST=smtp.qq.com
EMAIL_PORT=465
EMAIL_USER=your-qq@qq.com
EMAIL_PASS=your-smtp-auth-code
```

- [ ] **Step 2: 类型检查**

```bash
npx tsc --noEmit
```

修复所有类型错误。

- [ ] **Step 3: 运行 dev 服务器验证**

```bash
npm run dev
```

手动验证以下流程：
1. 注册（需要邮箱验证码）
2. 登录 → 忘记密码 Modal → 发送验证码
3. 创建公开赛事 → 赛事大厅查看公开赛事列表
4. 次房主踢人（自动降级）
5. 次房主弃权
6. 首页查看官方公告 + 房间公告
7. 个人空间 → 注销账号弹窗

- [ ] **Step 4: 最终提交**

```bash
git add .env.example
git commit -m "chore: add env example and finalize all 7 feature fixes"
```
