# 安全问题系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用安全问题体系替换邮箱验证码系统，覆盖注册、忘记密码、修改密码、注销账号全流程。

**Architecture:** Prisma User 表增加 security_question + security_answer_hash，删除 email 相关字段。注册/找回密码 API 改为安全问题校验，新增 change-password API。前端 AuthForm 重写，DeleteAccountModal 改造，新增 SecurityQuestionModal。

**Tech Stack:** Next.js 14 + TypeScript + Prisma + MySQL + bcryptjs + Tailwind CSS

---

### Task 1: Prisma Schema 变更

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: 修改 User 模型**

在 `prisma/schema.prisma` 中修改 User 模型：

```prisma
model User {
  id                  Int       @id @default(autoincrement())
  username            String    @unique @db.VarChar(32)
  passwordHash        String    @map("password_hash") @db.VarChar(255)
  securityQuestion    String?   @map("security_question") @db.VarChar(255)
  securityAnswerHash  String?   @map("security_answer_hash") @db.VarChar(255)
  createdAt           DateTime  @default(now()) @map("created_at")

  rolePreferences    RolePreference[]
  heroPowers         HeroPower[]
  tournamentPlayers  TournamentPlayer[]
  tournamentAdmins   TournamentAdmin[]
  adminOperations    AdminOperation[]
  tempApplications   TempPlayerApplication[]

  @@map("users")
}
```

删除的字段：`email`, `emailVerified`, `resetCode`, `resetCodeExpires`, `resetCodeAttempts`。

- [ ] **Step 2: 运行数据库迁移**

```bash
npx prisma db push --force-reset
```

> **注意：** 由于删除列涉及数据丢失，本地开发环境使用 `--force-reset`。生产环境需用 `prisma migrate dev --name remove_email_add_security` 生成迁移文件后手动执行，并在此之前备份数据。

- [ ] **Step 3: 重新生成 Prisma 客户端**

```bash
npx prisma generate
```

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: replace email fields with security question in User model"
```

---

### Task 2: 注册 API 改造

**Files:**
- Modify: `src/app/api/auth/register/route.ts`

- [ ] **Step 1: 重写注册逻辑**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { getSession } from "@/lib/session";

const PRESET_QUESTIONS = [
  "你的出生城市是？",
  "你母亲的名字是？",
  "你父亲的名字是？",
  "你第一只宠物的名字是？",
  "你最喜欢的电影角色是？",
  "你的小学名称是？",
  "你最好的朋友的名字是？",
  "你的座右铭是？",
];

export async function POST(req: NextRequest) {
  const { username, securityQuestion, customQuestion, securityAnswer, password, confirmPassword } = await req.json();

  if (!username || !securityQuestion || !securityAnswer || !password || !confirmPassword) {
    return NextResponse.json({ error: "请填写所有字段" }, { status: 400 });
  }

  if (username.length < 2 || password.length < 11) {
    return NextResponse.json({ error: "用户名至少2位，密码至少11位" }, { status: 400 });
  }

  if (password !== confirmPassword) {
    return NextResponse.json({ error: "两次密码不一致" }, { status: 400 });
  }

  // 校验安全问题
  let finalQuestion: string;
  if (securityQuestion === "__custom__") {
    if (!customQuestion || customQuestion.trim().length < 2) {
      return NextResponse.json({ error: "请填写自定义安全问题" }, { status: 400 });
    }
    finalQuestion = customQuestion.trim();
  } else if (!PRESET_QUESTIONS.includes(securityQuestion)) {
    return NextResponse.json({ error: "无效的安全问题" }, { status: 400 });
  } else {
    finalQuestion = securityQuestion;
  }

  // 检查用户名
  const existingUser = await prisma.user.findUnique({ where: { username } });
  if (existingUser) {
    return NextResponse.json({ error: "用户名已被占用" }, { status: 409 });
  }

  // 创建用户
  const passwordHash = await hashPassword(password);
  const securityAnswerHash = await hashPassword(securityAnswer.trim());

  const user = await prisma.user.create({
    data: {
      username,
      passwordHash,
      securityQuestion: finalQuestion,
      securityAnswerHash,
    },
  });

  // 登录
  const session = await getSession();
  session.userId = user.id;
  session.username = user.username;
  await session.save();

  return NextResponse.json({ id: user.id, username: user.username });
}
```

- [ ] **Step 2: 类型检查**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/auth/register/route.ts
git commit -m "feat: rewrite register API with security question instead of email"
```

---

### Task 3: 安全问题查询 + 重置密码 API

**Files:**
- Create: `src/app/api/auth/security-question/route.ts`
- Modify: `src/app/api/auth/reset-password/route.ts`

- [ ] **Step 1: 创建安全问题查询 API**

`src/app/api/auth/security-question/route.ts`：

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get("username");
  if (!username) {
    return NextResponse.json({ error: "请输入用户名" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { username },
    select: { securityQuestion: true },
  });

  if (!user) {
    return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  }

  if (!user.securityQuestion) {
    return NextResponse.json({ error: "该账号未设置安全问题，请联系管理员" }, { status: 400 });
  }

  return NextResponse.json({ question: user.securityQuestion });
}
```

- [ ] **Step 2: 重写重置密码 API**

`src/app/api/auth/reset-password/route.ts`：

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { username, answer, newPassword, confirmPassword } = await req.json();

  if (!username || !answer || !newPassword || !confirmPassword) {
    return NextResponse.json({ error: "请填写所有字段" }, { status: 400 });
  }

  if (newPassword.length < 11) {
    return NextResponse.json({ error: "密码至少11位" }, { status: 400 });
  }

  if (newPassword !== confirmPassword) {
    return NextResponse.json({ error: "两次密码不一致" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  }

  if (!user.securityAnswerHash) {
    return NextResponse.json({ error: "该账号未设置安全问题" }, { status: 400 });
  }

  const valid = await verifyPassword(answer.trim(), user.securityAnswerHash);
  if (!valid) {
    return NextResponse.json({ error: "安全答案错误" }, { status: 403 });
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: 类型检查**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/auth/security-question/ src/app/api/auth/reset-password/route.ts
git commit -m "feat: add security-question lookup, rewrite reset-password with answer verification"
```

---

### Task 4: 修改密码 API（已登录）

**Files:**
- Create: `src/app/api/auth/change-password/route.ts`

- [ ] **Step 1: 创建 change-password API**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, hashPassword, verifyPassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { answer, newPassword, confirmPassword, verifyOnly } = await req.json();

  if (!answer) {
    return NextResponse.json({ error: "请输入安全答案" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "用户不存在" }, { status: 404 });

  if (!user.securityAnswerHash) {
    return NextResponse.json({ error: "请先设置安全问题" }, { status: 400 });
  }

  const valid = await verifyPassword(answer.trim(), user.securityAnswerHash);
  if (!valid) {
    return NextResponse.json({ error: "安全答案错误" }, { status: 403 });
  }

  // verifyOnly: 仅校验答案不修改密码（用于两步弹窗的第一步）
  if (verifyOnly) {
    return NextResponse.json({ ok: true, verified: true });
  }

  if (!newPassword || !confirmPassword) {
    return NextResponse.json({ error: "请填写所有字段" }, { status: 400 });
  }

  if (newPassword.length < 11) {
    return NextResponse.json({ error: "密码至少11位" }, { status: 400 });
  }

  if (newPassword !== confirmPassword) {
    return NextResponse.json({ error: "两次密码不一致" }, { status: 400 });
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: 类型检查**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/auth/change-password/
git commit -m "feat: add change-password API with security answer verification"
```

---

### Task 5: 更新 /api/auth/me（GET + DELETE）

**Files:**
- Modify: `src/app/api/auth/me/route.ts`

- [ ] **Step 1: GET 增加 securityQuestion + hasSecurityQuestion，DELETE 改为安全问题校验**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { requireAuth, verifyPassword } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ user: null });
  }
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { username: true, securityQuestion: true },
  });
  return NextResponse.json({
    user: {
      userId: session.userId,
      username: session.username,
      securityQuestion: user?.securityQuestion || null,
      hasSecurityQuestion: !!user?.securityQuestion,
    },
  });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await requireAuth().catch(() => ({ userId: 0 }));
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { answer } = await req.json();
  if (!answer) {
    return NextResponse.json({ error: "请输入安全答案确认身份" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "用户不存在" }, { status: 404 });

  if (!user.securityAnswerHash) {
    return NextResponse.json({ error: "请先设置安全问题" }, { status: 400 });
  }

  const valid = await verifyPassword(answer.trim(), user.securityAnswerHash);
  if (!valid) {
    return NextResponse.json({ error: "安全答案错误" }, { status: 403 });
  }

  await prisma.$transaction([
    prisma.tournamentPlayer.deleteMany({ where: { userId } }),
    prisma.tournamentAdmin.deleteMany({ where: { userId } }),
    prisma.rolePreference.deleteMany({ where: { userId } }),
    prisma.heroPower.deleteMany({ where: { userId } }),
    prisma.tempPlayerApplication.deleteMany({ where: { applicantId: userId } }),
    prisma.adminOperation.deleteMany({ where: { adminId: userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);

  const session = await getSession();
  session.destroy();

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: 类型检查**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/auth/me/route.ts
git commit -m "feat: update me API - add hasSecurityQuestion, use answer for delete"
```

---

### Task 6: SecurityQuestionModal 组件（修改密码用）

**Files:**
- Create: `src/components/auth/SecurityQuestionModal.tsx`

- [ ] **Step 1: 创建两步弹窗组件**

```typescript
"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toast";

const modalBackdrop: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000,
};
const modalCard: React.CSSProperties = {
  position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
  zIndex: 1001, padding: "32px 28px", width: 380, maxWidth: "90vw",
  borderRadius: 12, border: "1px solid rgba(192,168,74,0.15)",
  background: "linear-gradient(180deg, #1a1830 0%, #12101c 100%)",
  boxShadow: "0 0 60px rgba(192,168,74,0.04), 0 8px 40px rgba(0,0,0,0.5)",
  color: "#e0d8c0",
};

const glowStyle: React.CSSProperties = {
  position: "absolute", top: -40, left: "50%", transform: "translateX(-50%)",
  width: 160, height: 60, background: "radial-gradient(ellipse, rgba(192,168,74,0.1), transparent)",
  pointerEvents: "none" as const,
};

const goldBtn: React.CSSProperties = {
  width: "100%", padding: "11px 0", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: "pointer",
  background: "linear-gradient(135deg, #d4b85a, #a08030)",
  color: "#1a1408", letterSpacing: 0.5,
  boxShadow: "0 3px 14px rgba(192,168,74,0.18)",
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid rgba(192,168,74,0.12)",
  background: "rgba(255,255,255,0.03)", color: "#e0d8c0", fontSize: 13, boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, color: "#999", display: "block", marginBottom: 4,
};

export function SecurityQuestionModal({
  question,
  open,
  onClose,
}: {
  question: string;
  open: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [answer, setAnswer] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { success } = useToast();

  if (!open) return null;

  async function verifyAnswer() {
    if (!answer) { setError("请输入安全答案"); return; }
    setLoading(true); setError("");
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer, verifyOnly: true }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error || "验证失败"); return; }
    if (data.verified) setStep(2);
  }

  async function changePassword() {
    if (newPassword.length < 11) { setError("密码至少11位"); return; }
    if (newPassword !== confirmPassword) { setError("两次密码不一致"); return; }
    setLoading(true); setError("");
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer, newPassword, confirmPassword }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error || "修改失败"); return; }
    success("密码已修改");
    handleClose();
  }

  function handleClose() {
    setStep(1); setAnswer(""); setNewPassword(""); setConfirmPassword(""); setError(""); onClose();
  }

  return (
    <>
      <div onClick={handleClose} style={modalBackdrop} />
      <div className="card" style={modalCard}>
        <div style={glowStyle} />

        {step === 1 ? (
          <>
            {/* Step badge */}
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "rgba(192,168,74,0.08)", border: "1px solid rgba(192,168,74,0.15)",
              borderRadius: 20, padding: "3px 12px", marginBottom: 16,
            }}>
              <span style={{
                width: 18, height: 18, borderRadius: "50%", background: "#c0a84a",
                color: "#1a1408", fontSize: 10, fontWeight: 700,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
              }}>1</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#b0a060", letterSpacing: 0.5 }}>
                验证身份
              </span>
            </div>

            <h3 style={{ fontSize: 16, fontWeight: 700, color: "#e0d8c0", margin: "0 0 4px" }}>修改密码</h3>
            <p style={{ fontSize: 11, color: "#888", margin: "0 0 18px" }}>请回答以下安全问题确认身份</p>

            <div style={{
              background: "rgba(192,168,74,0.04)", border: "1px solid rgba(192,168,74,0.1)",
              borderRadius: 8, padding: "12px 14px", marginBottom: 14,
            }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: "#b0a060", display: "block", marginBottom: 4 }}>
                安全问题
              </span>
              <span style={{ fontSize: 13, color: "#e0d8c0", fontWeight: 500 }}>{question}</span>
            </div>

            <div style={{ marginBottom: error ? 12 : 18 }}>
              <label style={labelStyle}>安全答案</label>
              <input
                placeholder="请输入你的答案"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                style={inputStyle}
              />
            </div>

            {error && (
              <p style={{
                fontSize: 12, color: "var(--red)", textAlign: "center", marginBottom: 12,
                padding: "8px 12px", background: "rgba(224,80,80,0.06)", borderRadius: "var(--radius-sm)",
              }}>{error}</p>
            )}

            <button onClick={verifyAnswer} disabled={loading}
              style={{ ...goldBtn, opacity: loading ? 0.6 : 1 }}>
              {loading ? "验证中..." : "验证并继续"}
            </button>
          </>
        ) : (
          <>
            {/* Step badge */}
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "rgba(80,176,80,0.08)", border: "1px solid rgba(80,176,80,0.15)",
              borderRadius: 20, padding: "3px 12px", marginBottom: 16,
            }}>
              <span style={{
                width: 18, height: 18, borderRadius: "50%", background: "#50b050",
                color: "#fff", fontSize: 10, fontWeight: 700,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
              }}>✓</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#50b050", letterSpacing: 0.5 }}>
                身份已验证
              </span>
            </div>

            <h3 style={{ fontSize: 16, fontWeight: 700, color: "#e0d8c0", margin: "0 0 4px" }}>设置新密码</h3>
            <p style={{ fontSize: 11, color: "#888", margin: "0 0 18px" }}>身份验证通过，请输入新密码</p>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: error ? 12 : 18 }}>
              <div>
                <label style={labelStyle}>新密码</label>
                <input type="password" placeholder="至少 11 位"
                  value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                  style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>确认新密码</label>
                <input type="password" placeholder="再次输入"
                  value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                  style={inputStyle} />
              </div>
            </div>

            {error && (
              <p style={{
                fontSize: 12, color: "var(--red)", textAlign: "center", marginBottom: 12,
                padding: "8px 12px", background: "rgba(224,80,80,0.06)", borderRadius: "var(--radius-sm)",
              }}>{error}</p>
            )}

            <button onClick={changePassword} disabled={loading}
              style={{ ...goldBtn, opacity: loading ? 0.6 : 1 }}>
              {loading ? "修改中..." : "确认修改"}
            </button>
          </>
        )}

        <div style={{ textAlign: "center", marginTop: 14 }}>
          <button onClick={handleClose}
            style={{ background: "none", border: "none", color: "#888", fontSize: 11, cursor: "pointer" }}>
            取消
          </button>
        </div>
      </div>
    </>
  );
}
```

> **注意：** 两步验证的"第 1 步校验答案"通过 change-password API 的 `verifyOnly` 参数实现。传 `verifyOnly: true` 时仅校验安全答案，不更新密码。

- [ ] **Step 2: 类型检查**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/auth/SecurityQuestionModal.tsx
git commit -m "feat: add SecurityQuestionModal for password change flow"
```

---

### Task 7: AuthForm 重写（注册 + 登录 + 忘记密码）

**Files:**
- Modify: `src/components/auth/AuthForm.tsx`

- [ ] **Step 1: 完全重写 AuthForm**

```typescript
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";

const PRESET_QUESTIONS = [
  "你的出生城市是？",
  "你母亲的名字是？",
  "你父亲的名字是？",
  "你第一只宠物的名字是？",
  "你最喜欢的电影角色是？",
  "你的小学名称是？",
  "你最好的朋友的名字是？",
  "你的座右铭是？",
];

// Shared styles
const cardBg = "linear-gradient(180deg, #1a1830 0%, #12101c 100%)";
const cardBorder = "1px solid rgba(192,168,74,0.15)";
const cardShadow = "0 0 60px rgba(192,168,74,0.04), 0 4px 32px rgba(0,0,0,0.4)";
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "11px 14px", borderRadius: 6, border: "1px solid rgba(192,168,74,0.12)",
  background: "rgba(255,255,255,0.03)", color: "#e0d8c0", fontSize: 13, boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: "#b0a060", display: "block", marginBottom: 6,
  textTransform: "uppercase", letterSpacing: 1,
};
const goldBtn: React.CSSProperties = {
  width: "100%", padding: "14px 0", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 6, fontSize: 15, fontWeight: 700, cursor: "pointer",
  background: "linear-gradient(135deg, #d4b85a, #a08030)",
  color: "#1a1408", letterSpacing: 1,
  boxShadow: "0 4px 20px rgba(192,168,74,0.2)",
};

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { success } = useToast();
  const redirect = searchParams.get("redirect") || "/";

  // Common
  const [checking, setChecking] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Register
  const [securityQuestion, setSecurityQuestion] = useState("");
  const [customQuestion, setCustomQuestion] = useState("");
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Forgot password modal
  const [showForgot, setShowForgot] = useState(false);
  const [forgotStep, setForgotStep] = useState<1 | 2 | 3>(1);
  const [forgotUsername, setForgotUsername] = useState("");
  const [forgotQuestion, setForgotQuestion] = useState("");
  const [forgotAnswer, setForgotAnswer] = useState("");
  const [forgotPassword, setForgotPassword] = useState("");
  const [forgotConfirm, setForgotConfirm] = useState("");
  const [forgotError, setForgotError] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user) router.replace(redirect);
        else setChecking(false);
      });
  }, [router]);

  // --- Handlers ---

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const body: Record<string, string> = { username, password };
    if (mode === "register") {
      body.securityQuestion = securityQuestion;
      if (securityQuestion === "__custom__") body.customQuestion = customQuestion;
      body.securityAnswer = securityAnswer;
      body.confirmPassword = confirmPassword;
    }

    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error || "操作失败"); return; }
    if (mode === "register") success("欢迎加入王者演武堂！");
    router.push(redirect);
    router.refresh();
  }

  async function lookupQuestion() {
    if (!forgotUsername) { setForgotError("请输入用户名"); return; }
    setForgotLoading(true); setForgotError("");
    const res = await fetch(`/api/auth/security-question?username=${encodeURIComponent(forgotUsername)}`);
    const data = await res.json();
    setForgotLoading(false);
    if (!res.ok) { setForgotError(data.error || "查询失败"); return; }
    setForgotQuestion(data.question);
    setForgotStep(2);
  }

  async function verifyAndReset() {
    if (!forgotAnswer) { setForgotError("请输入安全答案"); return; }
    if (forgotPassword.length < 11) { setForgotError("密码至少11位"); return; }
    if (forgotPassword !== forgotConfirm) { setForgotError("两次密码不一致"); return; }
    setForgotLoading(true); setForgotError("");
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: forgotUsername, answer: forgotAnswer, newPassword: forgotPassword, confirmPassword: forgotConfirm }),
    });
    const data = await res.json();
    setForgotLoading(false);
    if (!res.ok) { setForgotError(data.error || "重置失败"); return; }
    success("密码已重置，请登录");
    setShowForgot(false);
    resetForgot();
  }

  function resetForgot() {
    setForgotStep(1); setForgotUsername(""); setForgotQuestion("");
    setForgotAnswer(""); setForgotPassword(""); setForgotConfirm(""); setForgotError("");
  }

  const title = mode === "login" ? "登录" : "注册";
  const subtitle = mode === "login" ? "重返演武战场" : "新召唤师报到";
  const switchText = mode === "login" ? "没有账号？前往注册" : "已有账号？返回登录";
  const switchHref = mode === "login" ? "/register" : "/login";

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "calc(100vh - 64px)", padding: "0 24px" }}>
      {checking ? (
        <div className="skeleton" style={{ width: 420, height: 380, borderRadius: "var(--radius)" }} />
      ) : (
        <div style={{
          width: "100%", maxWidth: 420, padding: "40px 36px 36px",
          borderRadius: 12, position: "relative", overflow: "hidden",
          background: cardBg, border: cardBorder, boxShadow: cardShadow,
          color: "#e0d8c0", animation: "slide-up 0.5s ease-out",
        }}>
          {/* Top glow */}
          <div style={{
            position: "absolute", top: -60, left: "50%", transform: "translateX(-50%)",
            width: 200, height: 80, background: "radial-gradient(ellipse, rgba(192,168,74,0.12), transparent)",
            pointerEvents: "none",
          }} />

          {/* Title */}
          <h1 style={{
            fontSize: 28, fontWeight: 800, textAlign: "center", margin: "0 0 6px",
            background: "linear-gradient(135deg, #d4b85a, #c0a84a, #a08030)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            letterSpacing: 2,
          }}>{title}</h1>
          <p style={{ fontSize: 13, textAlign: "center", color: "#888", margin: "0 0 28px" }}>{subtitle}</p>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
            <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, transparent, rgba(192,168,74,0.2))" }} />
            <div style={{ width: 6, height: 6, background: "#c0a84a", borderRadius: 1, transform: "rotate(45deg)" }} />
            <div style={{ flex: 1, height: 1, background: "linear-gradient(-90deg, transparent, rgba(192,168,74,0.2))" }} />
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Username */}
            <div>
              <label style={labelStyle}>召唤师名称</label>
              <input type="text" placeholder="请输入召唤师名称" value={username}
                onChange={(e) => setUsername(e.target.value)} required minLength={2} style={inputStyle} />
            </div>

            {/* Register: security question */}
            {mode === "register" && (
              <>
                <div>
                  <label style={labelStyle}>安全问题</label>
                  <select value={securityQuestion} onChange={(e) => setSecurityQuestion(e.target.value)}
                    required style={{ ...inputStyle, cursor: "pointer" }}>
                    <option value="">请选择安全问题</option>
                    {PRESET_QUESTIONS.map((q) => <option key={q} value={q}>{q}</option>)}
                    <option value="__custom__">自定义问题...</option>
                  </select>
                </div>

                {securityQuestion === "__custom__" && (
                  <div>
                    <label style={labelStyle}>自定义问题</label>
                    <input placeholder="请输入你的安全问题" value={customQuestion}
                      onChange={(e) => setCustomQuestion(e.target.value)}
                      style={{ ...inputStyle, borderColor: "rgba(192,168,74,0.3)" }} />
                  </div>
                )}

                <div>
                  <label style={labelStyle}>安全答案</label>
                  <input placeholder="请输入答案" value={securityAnswer}
                    onChange={(e) => setSecurityAnswer(e.target.value)} required style={inputStyle} />
                  <span style={{ fontSize: 10, color: "#665", display: "block", marginTop: 3 }}>
                    用于找回密码和注销账号验证
                  </span>
                </div>
              </>
            )}

            {/* Password */}
            <div>
              <label style={labelStyle}>密码</label>
              <input type="password" placeholder={mode === "register" ? "至少 11 位" : "请输入密码"}
                value={password} onChange={(e) => setPassword(e.target.value)} required minLength={11} style={inputStyle} />
            </div>

            {/* Register: confirm password */}
            {mode === "register" && (
              <div>
                <label style={labelStyle}>确认密码</label>
                <input type="password" placeholder="再次输入密码" value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)} required minLength={11} style={inputStyle} />
              </div>
            )}

            {/* Error */}
            {error && (
              <div style={{
                padding: "12px 14px", borderRadius: "var(--radius-sm)", animation: "slide-up 0.2s ease-out",
                background: "rgba(224,80,80,0.06)", border: "1px solid rgba(224,80,80,0.12)",
              }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "var(--red)", textAlign: "center" }}>{error}</p>
              </div>
            )}

            {/* Submit */}
            <button type="submit" disabled={loading}
              style={{ ...goldBtn, marginTop: 6, opacity: loading ? 0.6 : 1 }}>
              {loading ? "请稍候..." : title}
            </button>
          </form>

          {/* Links */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 28, fontSize: 14 }}>
            {mode === "login" ? (
              <>
                <button type="button" onClick={() => { setShowForgot(true); resetForgot(); }}
                  style={{ background: "none", border: "none", color: "#b0a060", cursor: "pointer", fontSize: 14, fontWeight: 600, padding: 0 }}>
                  忘记密码？
                </button>
                <Link href={switchHref} style={{ color: "#b0a060", fontWeight: 600, textDecoration: "none" }}>
                  {switchText}
                </Link>
              </>
            ) : (
              <Link href={switchHref} style={{ color: "#b0a060", fontWeight: 600, textDecoration: "none", margin: "0 auto" }}>
                {switchText}
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/*  FORGOT PASSWORD MODAL (security question based)                  */}
      {/* ================================================================ */}
      {showForgot && (
        <>
          <div onClick={() => setShowForgot(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000 }} />
          <div style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
            zIndex: 1001, padding: "32px 28px", width: 380, maxWidth: "90vw",
            borderRadius: 12, border: cardBorder, background: cardBg, boxShadow: cardShadow,
            color: "#e0d8c0",
          }}>
            <div style={{ position: "absolute", top: -40, left: "50%", transform: "translateX(-50%)",
              width: 160, height: 60, background: "radial-gradient(ellipse, rgba(192,168,74,0.1), transparent)", pointerEvents: "none" }} />

            {forgotStep === 1 ? (
              <>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: "#e0d8c0", margin: "0 0 6px", textAlign: "center" }}>找回密码</h3>
                <p style={{ fontSize: 11, color: "#888", textAlign: "center", marginBottom: 18 }}>
                  输入用户名以验证身份
                </p>
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>召唤师名称</label>
                  <input placeholder="请输入召唤师名称" value={forgotUsername}
                    onChange={(e) => setForgotUsername(e.target.value)} style={inputStyle} />
                </div>
                {forgotError && <p style={{ fontSize: 12, color: "var(--red)", marginBottom: 12, textAlign: "center" }}>{forgotError}</p>}
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setShowForgot(false)}
                    style={{ flex: 1, padding: "10px 0", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, fontSize: 13, color: "#888", background: "transparent", cursor: "pointer" }}>取消</button>
                  <button onClick={lookupQuestion} disabled={forgotLoading}
                    style={{ ...goldBtn, flex: 1, fontSize: 13, padding: "10px 0", opacity: forgotLoading ? 0.6 : 1 }}>
                    {forgotLoading ? "查询中..." : "下一步"}
                  </button>
                </div>
              </>
            ) : forgotStep === 2 ? (
              <>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: "#e0d8c0", margin: "0 0 6px", textAlign: "center" }}>验证安全问题</h3>
                <p style={{ fontSize: 11, color: "#888", textAlign: "center", marginBottom: 14 }}>
                  账号：<span style={{ color: "#c0a84a" }}>{forgotUsername}</span>
                </p>
                <div style={{
                  background: "rgba(192,168,74,0.04)", border: "1px solid rgba(192,168,74,0.1)",
                  borderRadius: 8, padding: "12px 14px", marginBottom: 14,
                }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: "#b0a060", display: "block", marginBottom: 4 }}>安全问题</span>
                  <span style={{ fontSize: 13, color: "#e0d8c0", fontWeight: 500 }}>{forgotQuestion}</span>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>安全答案</label>
                  <input placeholder="请输入答案" value={forgotAnswer}
                    onChange={(e) => setForgotAnswer(e.target.value)} style={inputStyle} />
                </div>
                {forgotError && <p style={{ fontSize: 12, color: "var(--red)", marginBottom: 12, textAlign: "center" }}>{forgotError}</p>}
                <button onClick={() => { setForgotStep(3); setForgotError(""); }}
                  style={{ ...goldBtn, fontSize: 13, padding: "10px 0", marginBottom: 10 }}>
                  继续设置新密码
                </button>
                <div style={{ textAlign: "center" }}>
                  <button onClick={() => setShowForgot(false)}
                    style={{ background: "none", border: "none", color: "#888", fontSize: 11, cursor: "pointer" }}>取消</button>
                </div>
              </>
            ) : (
              <>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: "#e0d8c0", margin: "0 0 6px", textAlign: "center" }}>重置密码</h3>
                <p style={{ fontSize: 11, color: "#888", textAlign: "center", marginBottom: 18 }}>
                  为 <span style={{ color: "#c0a84a" }}>{forgotUsername}</span> 设置新密码
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: forgotError ? 12 : 18 }}>
                  <div>
                    <label style={labelStyle}>新密码</label>
                    <input type="password" placeholder="至少 11 位" value={forgotPassword}
                      onChange={(e) => setForgotPassword(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>确认新密码</label>
                    <input type="password" placeholder="再次输入" value={forgotConfirm}
                      onChange={(e) => setForgotConfirm(e.target.value)} style={inputStyle} />
                  </div>
                </div>
                {forgotError && <p style={{ fontSize: 12, color: "var(--red)", marginBottom: 12, textAlign: "center" }}>{forgotError}</p>}
                <button onClick={verifyAndReset} disabled={forgotLoading}
                  style={{ ...goldBtn, fontSize: 13, padding: "10px 0", opacity: forgotLoading ? 0.6 : 1 }}>
                  {forgotLoading ? "重置中..." : "确认重置"}
                </button>
                <div style={{ textAlign: "center", marginTop: 14 }}>
                  <button onClick={() => setShowForgot(false)}
                    style={{ background: "none", border: "none", color: "#888", fontSize: 11, cursor: "pointer" }}>取消</button>
                </div>
              </>
            )}
          </div>
        </>
      )}

      <style jsx>{`
        @media (max-width: 480px) {
          .auth-form-container { padding: 0 16px !important; }
        }
      `}</style>
    </div>
  );
}
```

- [ ] **Step 2: 类型检查**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/auth/AuthForm.tsx
git commit -m "feat: rewrite AuthForm - security question flow, gold-purple visual upgrade"
```

---

### Task 8: DeleteAccountModal 改造

**Files:**
- Modify: `src/components/auth/DeleteAccountModal.tsx`

- [ ] **Step 1: 密码校验 → 安全问题校验 + 视觉升级**

```typescript
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";

const cardBg = "linear-gradient(180deg, #1a1830 0%, #12101c 100%)";
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 6,
  border: "1px solid rgba(224,80,80,0.15)", background: "rgba(255,255,255,0.03)",
  color: "#e0d8c0", fontSize: 13, boxSizing: "border-box",
};

export function DeleteAccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [confirmText, setConfirmText] = useState("");
  const [answer, setAnswer] = useState("");
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const { success } = useToast();

  useEffect(() => {
    if (!open) return;
    setConfirmText(""); setAnswer(""); setError("");
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user?.securityQuestion) setQuestion(d.user.securityQuestion);
      });
  }, [open]);

  if (!open) return null;

  const canDelete = confirmText === "DELETE" && answer.length > 0;

  async function doDelete() {
    if (!canDelete) return;
    setLoading(true); setError("");
    const res = await fetch("/api/auth/me", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error || "注销失败"); return; }
    success("账号已注销");
    router.push("/");
    router.refresh();
  }

  return (
    <>
      <div onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000 }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        zIndex: 1001, padding: "28px", width: 400, maxWidth: "90vw",
        borderRadius: 12, border: "1px solid rgba(224,80,80,0.15)",
        background: cardBg, color: "#e0d8c0",
        boxShadow: "0 0 60px rgba(224,80,80,0.04), 0 8px 40px rgba(0,0,0,0.5)",
      }}>
        {/* Top glow (red) */}
        <div style={{
          position: "absolute", top: -40, left: "50%", transform: "translateX(-50%)",
          width: 160, height: 60, background: "radial-gradient(ellipse, rgba(224,80,80,0.08), transparent)",
          pointerEvents: "none",
        }} />

        <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--red)", textAlign: "center", margin: "0 0 6px" }}>
          注销账号
        </h3>
        <p style={{ fontSize: 12, color: "#888", textAlign: "center", marginBottom: 18, lineHeight: 1.6 }}>
          此操作<strong style={{ color: "var(--red)" }}>不可撤销</strong>，全部数据将被永久删除
        </p>

        <div style={{
          background: "rgba(224,80,80,0.04)", border: "1px solid rgba(224,80,80,0.1)",
          borderRadius: 6, padding: "8px 12px", marginBottom: 18,
          fontSize: 10, color: "#999", lineHeight: 1.6,
        }}>
          将删除：账号 · 密码 · 安全问题 · 分路偏好 · 段位 · 英雄战力 · 赛事记录 · 管理权限
        </div>

        {/* Step 1 */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span style={{
              width: 18, height: 18, borderRadius: "50%", background: "var(--red)",
              color: "#fff", fontSize: 10, fontWeight: 700,
              display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>1</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#e0d8c0" }}>
              输入 <code style={{
                background: "rgba(224,80,80,0.08)", padding: "1px 4px", borderRadius: 3,
                fontSize: 11, color: "var(--red)",
              }}>DELETE</code> 确认删除
            </span>
          </div>
          <input type="text" placeholder="DELETE" value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)} style={inputStyle} />
        </div>

        {/* Step 2: Security question */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span style={{
              width: 18, height: 18, borderRadius: "50%", background: "var(--red)",
              color: "#fff", fontSize: 10, fontWeight: 700,
              display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>2</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#e0d8c0" }}>验证安全问题</span>
          </div>
          {question ? (
            <div style={{
              background: "rgba(224,80,80,0.04)", border: "1px solid rgba(224,80,80,0.1)",
              borderRadius: 6, padding: "10px 12px", marginBottom: 8,
            }}>
              <span style={{ fontSize: 10, color: "#999", display: "block", marginBottom: 2 }}>安全问题</span>
              <span style={{ fontSize: 12, color: "#e0d8c0" }}>{question}</span>
            </div>
          ) : (
            <p style={{ fontSize: 11, color: "#888", margin: "4px 0 8px" }}>加载安全问题中...</p>
          )}
          <input type="text" placeholder="安全答案" value={answer}
            onChange={(e) => setAnswer(e.target.value)} style={inputStyle} />
        </div>

        {error && (
          <p style={{
            fontSize: 12, color: "var(--red)", textAlign: "center", marginBottom: 12,
            padding: "8px 12px", background: "rgba(224,80,80,0.06)", borderRadius: "var(--radius-sm)",
          }}>{error}</p>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "11px 0", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 6, fontSize: 13, color: "#888", background: "transparent", cursor: "pointer",
          }}>取消</button>
          <button onClick={doDelete} disabled={!canDelete || loading} style={{
            flex: 1, padding: "11px 0", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600,
            color: "#fff", cursor: canDelete ? "pointer" : "not-allowed",
            background: canDelete
              ? "linear-gradient(135deg, #e05050, #b03030)"
              : "rgba(224,80,80,0.3)",
            boxShadow: canDelete ? "0 3px 14px rgba(224,80,80,0.2)" : "none",
            opacity: (!canDelete || loading) ? 0.5 : 1,
          }}>{loading ? "注销中..." : "确认注销"}</button>
        </div>

        <p style={{ textAlign: "center", marginTop: 10, marginBottom: 0, fontSize: 11, color: "#888" }}>
          完成①②步后按钮自动激活
        </p>
      </div>
    </>
  );
}
```

> **注意：** DeleteAccountModal 通过 GET /api/auth/me 的 `securityQuestion` 字段获取用户的安全问题文本，无需额外请求。

- [ ] **Step 2: 类型检查**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/auth/DeleteAccountModal.tsx
git commit -m "feat: replace password with security question in delete account flow, visual upgrade"
```

---

### Task 9: /me 页面增加修改密码入口

**Files:**
- Modify: `src/app/me/page.tsx`

- [ ] **Step 1: 添加修改密码按钮和安全问题弹窗**

```typescript
"use client";

import { useEffect, useState } from "react";
import { RolePreferenceEditor } from "@/components/me/RolePreferenceEditor";
import { HeroPowerEditor } from "@/components/me/HeroPowerEditor";
import { DeleteAccountModal } from "@/components/auth/DeleteAccountModal";
import { SecurityQuestionModal } from "@/components/auth/SecurityQuestionModal";

export default function MePage() {
  const [showDelete, setShowDelete] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [securityQuestion, setSecurityQuestion] = useState("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user?.securityQuestion) setSecurityQuestion(d.user.securityQuestion);
      });
  }, []);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px", display: "flex", flexDirection: "column", gap: 32, animation: "fade-in 0.4s ease-out" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text)", margin: 0 }}>个人空间</h1>

      <div style={{ animation: "slide-up 0.4s 0.05s ease-out both" }}><RolePreferenceEditor /></div>
      <div style={{ animation: "slide-up 0.4s 0.1s ease-out both" }}><HeroPowerEditor /></div>

      {/* Account section */}
      <div style={{ animation: "slide-up 0.4s 0.15s ease-out both", padding: "20px", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "rgba(255,255,255,0.02)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>账户安全</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>修改登录密码</div>
          </div>
          <button onClick={() => setShowChangePassword(true)} style={{
            padding: "8px 20px", fontSize: 13, fontWeight: 600,
            color: "#1a1408", background: "linear-gradient(135deg, #d4b85a, #a08030)",
            border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer",
          }}>
            修改密码
          </button>
        </div>

        {/* Danger zone */}
        <div style={{ padding: "16px", border: "1px solid var(--red)", borderRadius: "var(--radius)", background: "rgba(224,80,80,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--red)", marginBottom: 4 }}>危险区域</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>注销后所有数据将被永久删除，无法恢复</div>
            </div>
            <button onClick={() => setShowDelete(true)} style={{
              padding: "8px 20px", fontSize: 13, fontWeight: 600,
              color: "#fff", background: "var(--red)", border: "none",
              borderRadius: "var(--radius-sm)", cursor: "pointer",
            }}>注销账号</button>
          </div>
        </div>
      </div>

      <SecurityQuestionModal question={securityQuestion} open={showChangePassword} onClose={() => setShowChangePassword(false)} />
      <DeleteAccountModal open={showDelete} onClose={() => setShowDelete(false)} />

      <style jsx>{`
        @media (max-width: 480px) {
          .me-page { padding: 24px 16px !important; gap: 20px !important; }
          .me-title { font-size: 22px !important; }
        }
      `}</style>
    </div>
  );
}
```

- [ ] **Step 2: 类型检查**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/me/page.tsx
git commit -m "feat: add change password entry in /me with SecurityQuestionModal"
```

---

### Task 10: 清理工作

**Files:**
- Delete: `src/lib/email.ts`
- Delete: `src/app/api/auth/send-code/route.ts`
- Modify: `package.json`

- [ ] **Step 1: 删除文件**

```bash
rm src/lib/email.ts
rm -r src/app/api/auth/send-code
```

- [ ] **Step 2: 移除 nodemailer 依赖**

```bash
npm uninstall nodemailer @types/nodemailer
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/email.ts src/app/api/auth/send-code/ package.json package-lock.json
git commit -m "chore: remove email/nodemailer, replaced by security question system"
```

---

### Task 11: 构建验证

- [ ] **Step 1: 类型检查**

```bash
npx tsc --noEmit
```

- [ ] **Step 2: 生产构建**

```bash
npm run build
```

- [ ] **Step 3: 启动开发服务器验证功能**

```bash
npm run dev
```

手动验证：
1. 访问 `/register` — 注册表单显示安全问题下拉框
2. 注册新用户 — 填写完整信息后能成功注册并登录
3. 退出登录 — 访问 `/login`，点击"忘记密码"，输入用户名能显示安全问题
4. 登录后访问 `/me` — 点击"修改密码"，弹出安全问题验证弹窗
5. 点击"注销账号" — 显示安全问题替代了密码输入

- [ ] **Step 4: Commit（如有遗漏修改）**

---

### 变更文件汇总

| 操作 | 文件 |
|------|------|
| 修改 | `prisma/schema.prisma` |
| 修改 | `src/app/api/auth/register/route.ts` |
| 修改 | `src/app/api/auth/reset-password/route.ts` |
| 修改 | `src/app/api/auth/me/route.ts` |
| 新增 | `src/app/api/auth/security-question/route.ts` |
| 新增 | `src/app/api/auth/change-password/route.ts` |
| 重写 | `src/components/auth/AuthForm.tsx` |
| 修改 | `src/components/auth/DeleteAccountModal.tsx` |
| 新增 | `src/components/auth/SecurityQuestionModal.tsx` |
| 修改 | `src/app/me/page.tsx` |
| 删除 | `src/lib/email.ts` |
| 删除 | `src/app/api/auth/send-code/route.ts` |
| 修改 | `package.json`（移除 nodemailer） |
