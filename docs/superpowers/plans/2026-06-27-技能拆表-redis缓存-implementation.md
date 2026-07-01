# 技能拆表 + Redis 缓存 Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** 技能 JSON 拆为独立表 hero_skills，新增 equipment 表，Redis 缓存英雄/装备 API，监控升级为 50% 采样全量哈希。

**Architecture:** Prisma schema 变更 → sync.ts 适配新表 → Redis lib 封装 → API 加缓存层 → 监控改造 → 前端适配。cache-aside 模式，MySQL 是真实数据源，Redis 是可丢弃副本。

**Tech Stack:** Next.js 14, TypeScript, Prisma 5, ioredis, MySQL 8, Redis 8.6.4

---

### Task 1: Prisma Schema 变更 + 数据迁移

**Files:** `prisma/schema.prisma`

### Task 2: 安装 ioredis + Redis 客户端

**Files:** `package.json`, `src/lib/redis.ts`

### Task 3: 英雄 sync 适配 hero_skills 表

**Files:** `src/lib/heroes/sync.ts`

### Task 4: 装备同步模块

**Files:** `src/lib/equipment/sync.ts`

### Task 5: 英雄 API 加 Redis 缓存

**Files:** `src/app/api/heroes/route.ts`, `src/app/api/heroes/[id]/route.ts`

### Task 6: 装备 API + Redis 缓存

**Files:** `src/app/api/equipment/route.ts`, `src/app/api/equipment/[id]/route.ts`

### Task 7: 监控升级（50% 采样 + item.json）

**Files:** `src/lib/monitor/index.ts`

### Task 8: 前端适配

**Files:** `src/components/hero/HeroDetail.tsx`, `src/components/hero/HeroGrid.tsx`
