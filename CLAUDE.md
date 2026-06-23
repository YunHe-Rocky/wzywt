# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

王者演武堂 — 王者荣耀内战分队系统。Next.js 全栈 Web 应用，为 5v5 内战提供自动分队服务，综合分路偏好与英雄战力实现实力均衡。

## 常用命令

```bash
npm run dev           # 启动开发服务器
npm run build         # 生产构建
npm run lint          # ESLint 检查
npm run db:push       # 同步 Prisma schema 到数据库（无需 shadow DB）
npm run db:migrate    # 数据库迁移（需要 shadow DB 权限）
npm run db:generate   # 重新生成 Prisma 客户端

npx tsc --noEmit      # TypeScript 类型检查
```

## 技术栈

- Next.js 14 (App Router) + TypeScript + Tailwind CSS
- Prisma 5 + MySQL
- iron-session (Cookie-based session 认证)
- bcryptjs (密码哈希)
- cheerio (英雄数据爬取)
- node-cron (定时任务，当前禁用)

## 项目结构

```
src/
├── app/                        # Next.js App Router
│   ├── layout.tsx              # 根布局（Header + 暗色主题）
│   ├── page.tsx                # 首页
│   ├── login/register/me/      # 认证页面 + 个人空间
│   ├── tournaments/            # 赛事大厅 + 赛事详情页
│   └── api/                    # API 路由
│       ├── auth/               # 注册/登录/登出/当前用户
│       ├── users/me/           # 分路偏好 + 英雄战力 CRUD
│       ├── tournaments/        # 赛事 CRUD + 加入/退出/踢人/延长/分队/临时人员
│       └── heroes/             # 英雄数据查询
├── components/
│   ├── auth/AuthForm.tsx       # 登录/注册表单（共用组件）
│   ├── layout/Header.tsx       # 顶部导航（用户状态 + 导航链接）
│   ├── me/                     # 分路偏好编辑器 + 英雄战力编辑器
│   └── tournament/             # 赛事列表 + 赛事详情（含分队结果展示）
├── lib/
│   ├── db.ts                   # Prisma 客户端单例
│   ├── session.ts              # iron-session 配置（wzyt_session cookie，7天有效）
│   ├── auth.ts                 # 密码哈希 + requireAuth() 鉴权守卫
│   ├── split.ts                # 分队算法（枚举分路分配 × 分队组合，平衡评分）
│   └── hero-sync.ts            # 从官方源同步英雄数据
└── instrumentation.ts          # 定时任务入口（当前禁用）
```

## 核心架构

### 认证流程

API 层通过 `requireAuth()` 鉴权——从 iron-session cookie 读取 `userId`/`username`，未登录抛出 `"UNAUTHORIZED"`。各 API route 用 `.catch(() => ({ userId: 0 }))` 模式处理。

**重要**：`session.ts` 必须使用 `cookies` 的**静态 import**（`import { cookies } from "next/headers"`），不能动态 import，否则 Next.js webpack 编译 API route 时会失败。

### 分队算法 (`src/lib/split.ts`)

两阶段枚举：
1. **分路分配**：N 名选手分配到 5 个分路（每路 N/5 人），枚举所有合法方案
2. **分队平衡**：每路 2 人分入红/蓝队（2^5=32 种），选战力差最小的

评分公式：`score = -|红蓝战力差| × 100 + 偏好满足度 × 1`

对 10 人规模搜索空间约 360 万，<1 秒完成。

### 权限模型

| 操作 | 房主 | 次房主 | 普通选手 |
|------|:--:|:--:|:--:|
| 赛事管理（分队/踢人/延长截止） | ✓ | ✓ (5分钟内不能推翻房主操作) | |
| 任命次房主/取消赛事 | ✓ | | |
| 加入/退出赛事 | ✓ | ✓ | ✓ |

冷却通过 `AdminOperation` 表记录操作时间戳实现。

### 数据库

9 张表：`users`, `tournaments`, `tournament_players`, `tournament_admins`, `temp_player_applications`, `role_preferences`, `hero_powers`, `heroes`, `admin_operations`。

临时人员创建空密码 User 记录（不能登录），管理员/申请人后续补填资料。

## 已知限制

- **Prisma ≥ 6 兼容性**：Prisma 6+ 需要 driver adapter 直连 MySQL。当前使用 Prisma 5，升级需评估。
- **instrumentation hook**：Next.js instrumentation 中加载 Prisma 客户端会导致编译错误，当前 `next.config.js` 已禁用 `instrumentationHook`。英雄同步和截止检查的 cron 暂不可用，后续可用独立脚本替代。
- **英雄数据**：首次使用前需手动运行 `npx tsx src/lib/hero-sync.ts` 同步官方数据。
- **`@` 在数据库密码中**：`.env` 中 DATABASE_URL 的密码如有 `@` 字符，必须 URL 编码为 `%40`。
