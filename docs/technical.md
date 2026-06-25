# 王者演武堂 — 技术文档 V1.0.1

## 项目概述

王者荣耀 5v5 内战分队系统。Next.js 14 全栈，综合分路段位、偏好、英雄战力自动均衡分队。

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 14 (App Router) |
| 语言 | TypeScript |
| 样式 | Tailwind CSS + CSS 变量双主题 |
| 数据库 | MySQL 8 + Prisma 5 |
| 认证 | iron-session + bcryptjs |
| 爬虫 | 官方 herolist.json + 详情页 cheerio 解析 |
| 实时 | SSE (Server-Sent Events) |
| 进程 | PM2 (ecosystem.config.js) |
| 反代 | Nginx |

## 目录结构

```
src/
  hooks/                     # 数据 hooks（与 UI 分离）
    useAuth.ts               # 用户登录态
    useAnnouncements.ts      # 公告 + 版本号
    useRolePreferences.ts    # 段位/分路/英雄战力
  components/
    layout/
      Header.tsx             # 顶部导航（三模式：#1/#2//m）
      Dock.tsx               # 底部导航（双主题适配）
      BackgroundOrbs.tsx     # 动态光晕背景
      CursorLighting.tsx     # #2 鼠标跟随阴影
    hero/
      HeroGrid.tsx           # 图鉴网格 + 筛选
      HeroDetail.tsx         # 详情 + 命格切换
      HeroSelect.tsx         # 搜索下拉（拼音 + portal）
    me/
      RolePreferenceEditor.tsx  # 段位 + 分路 + 英雄战力
    auth/
      AuthForm.tsx           # 登录/注册
      SecurityQuestionModal.tsx
      DeleteAccountModal.tsx
    tournament/
      TournamentDetail.tsx
      TournamentList.tsx
    ui/
      Toast.tsx
  app/
    page.tsx                 # 首页（公告 + 房间 + 新闻）
    api/                     # 28 个 API 路由（全部 force-dynamic）
    m/                       # 移动端路由（re-export）
    login/register/me/heroes/tournaments/
  lib/
    heroes/sync.ts           # 全量英雄同步
    monitor/index.ts         # 轻量监控（3分钟）
    anti-bot.ts              # 反爬（5 UA + 退避重试）
    sse/heroes.ts            # SSE 广播
  themes/
    ThemeProvider.tsx        # hash 驱动主题
scripts/
  deploy.sh                  # 一键部署
  cron.ts                    # 定时任务
  migrate-announcements.ts   # 公告迁移
  download-hero-images.ts
```

## 核心设计

### 双主题
hash `#1` / `#2` 切换，CSS 变量全隔离。移动端 UA 检测自动 `/m`。

### 爬虫
3 分钟监控 → 检测变化 → 全量同步。5 UA 轮换 + 退避重试。详情页 cheerio 解析技能/皮肤/命格。

### 分队算法 (`lib/split.ts`)
10 人选 5v5。权重：偏好满足(×350) > 段位覆盖(×50) > 段位均衡(×30) > 战力均衡(×20)。

### 命格系统
`Hero.mingge` + `minggeName` + `minggeRelatedId`。爬虫检测 + 手动绑定双向关联。

### API 缓存
全部 28 个路由 `export const dynamic = "force-dynamic"`，禁止 Next.js 缓存。

## 数据库

远程 MySQL `38.22.234.148:3306`，数据库 `yanwutang`。

核心表：`heroes`, `hero_lane_overrides`, `hero_powers`, `announcements`, `users`, `tournaments`, `kv_cache`
