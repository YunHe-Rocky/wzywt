# CLAUDE.md

王者演武堂 — 王者荣耀 5v5 内战分队系统。Next.js 14 全栈应用。

## 命令

```bash
npm run dev            # 开发服务器 (localhost:3000)
npm run dev:all        # 开发 + cron 定时任务
npm run build          # 生产构建
npm run db:push        # 同步 Prisma schema
npm run db:generate    # 重新生成 Prisma 客户端
npm run sync-heroes    # 手动同步英雄数据
npm run cron           # 独立 cron 进程
npx tsc --noEmit       # 类型检查
```

部署：`bash scripts/deploy.sh`（自动 git pull → install → prisma → build → pm2 restart）

## 技术栈

Next.js 14 (App Router) · TypeScript · Tailwind CSS · Prisma 5 + MySQL · iron-session + bcryptjs · cheerio + iconv-lite · pinyin · node-cron · SSE · PM2

## 双主题系统

详见 `docs/themes/README.md`。

| | 演武 #1 | 厚玻璃 #2 |
|---|---|---|
| 定位 | 桌面主力 | 移动主力 + 桌面可选 |
| 基底 | 石板灰 `#161920` | 浅灰 `#efeff2` |
| 强调色 | 暖铜金 `#a89068` | 系统蓝 `#4488f0` |
| 卡片 | 暗琉璃（顶部微光） | 厚毛玻璃（blur 28px + 多层阴影） |
| 圆角 | 6px | 16px |
| Dock | 仅移动端 | 桌面 + 移动端 |

切换：URL `#1` / `#2`，所有内部链接自动保留 hash。内联脚本防 FOUC。

## 移动端 /m 路由

- `src/middleware.ts` UA 检测 → 手机自动 307 到 `/m` 路由
- `/m` 使用独立 layout（`src/app/m/layout.tsx`）
- `/m` 下所有页面 re-export 主路由的同名页面
- Header 在 /m 路由显示简洁版（品牌 + 用户），Dock 提供主导航

## 架构

### 目录结构
```
src/
  hooks/          # 数据 hooks（与 UI 分离）
    useAuth.ts        用户登录态
    useAnnouncements.ts  公告列表 + 版本号
    useRolePreferences.ts 段位/分路/英雄战力
  components/
    layout/        # 布局组件
      Header.tsx      顶部导航（三模式）
      Dock.tsx        底部导航栏（双主题）
      BackgroundOrbs.tsx  三颗动态光晕
      CursorLighting.tsx  #2 鼠标跟随阴影
    hero/          # 英雄相关
      HeroGrid.tsx     图鉴网格 + 筛选
      HeroDetail.tsx   详情页 + 命格切换
      HeroSelect.tsx   搜索下拉（拼音 + portal）
    me/            # 个人空间
      RolePreferenceEditor.tsx  段位 + 分路 + 英雄战力
    auth/          # 认证
      AuthForm.tsx      登录/注册表单
    tournament/    # 赛事
    ui/            # 通用 UI
      Toast.tsx
  lib/
    heroes/sync.ts    爬虫核心：全量英雄同步
    monitor/index.ts   轻量监控（3分钟对比）
    anti-bot.ts       5 UA 轮换 + 退避重试
    sse/heroes.ts     SSE 广播
  themes/
    ThemeProvider.tsx  hash 驱动主题切换
  app/
    api/            # 全部 API（28 个路由均已 force-dynamic）
    m/              # 移动端路由
```

### 核心 hooks（业务逻辑与 UI 分离）
- `useAuth()` → `{ user, loaded, logout }`
- `useAnnouncements(full?)` → `{ announcements, loaded, latestVersion }`
- `useRolePreferences()` → 所有段位/分路/英雄的 state + API 方法

### API 缓存
**所有 28 个 API 路由**均以 `export const dynamic = "force-dynamic"` 开头，禁止 Next.js 缓存。

## 认证与中间件

- iron-session cookie: `wzyt_session`
- 公开路径：`/login`, `/register`
- 公开 API：`/api/auth`, `/api/official-news`, `/api/announcements`, `/api/tournaments/public`, `/api/heroes`
- 移动 UA 检测 → `/m` 重定向（保留 hash）

## 配色系统

所有颜色通过 CSS 变量定义，禁止硬编码。组件统一引用 `var(--xxx)` 或 Tailwind token（`text-gold`, `bg-card` 等）。金色仅用于强调，正文灰白系。

## 爬虫系统

### 触发机制
- `scripts/cron.ts`：启动后 5s 全量同步 + 每天 06:00 全量同步 + 每 3 分钟轻量监控
- `/api/heroes/watch` SSE：浏览器连接时每 60s 辅助检查

### 工作流
```
监控层 (monitor/index.ts)
  ├── checkHeroes()   → 拉 herolist.json，对比数量/名称/类型/命格
  ├── checkSkins()    → 采样对比 skin_name
  └── checkNews()     → GICP API 对比头条
  ↓ 检测到变化
同步层 (heroes/sync.ts)
  ├── fetchWithRetry(herolist.json)    → 5 重 UA 轮换 + 退避
  ├── fetchDetail(herodetail/*.shtml)  → 4 URL × 2 重试
  ├── parseSkills/parseSkins/parseMingGe → cheerio + 正则
  └── prisma.upsert() → 写入 DB + 变化日志
  ↓
广播层 (sse/heroes.ts)
  └── broadcastHeroUpdate() → 浏览器自动刷新
```

### 反爬容灾
- 5 个 UA 轮换 + Accept-Language: zh-CN
- 403/429/503 → 退避 3s/6s/9s/12s（指数 + 随机抖动）
- 共 5 次重试，全失败则 log 错误不崩溃

## 数据库

远程 MySQL `38.22.234.148:3306`，数据库名 `yanwutang`。

### 核心模型
| 表 | 说明 |
|---|---|
| heroes | 英雄数据（含 mingge/minggeName/minggeRelatedId） |
| hero_lane_overrides | 手动分路修正（sync 不覆盖） |
| hero_powers | 用户英雄战力 |
| announcements | 系统公告（DB 管理，部署时自动迁移旧 md） |
| users | 用户 |
| tournaments | 赛事 |

## 命格系统

- Hero 模型：`mingge`（bool）+ `minggeName`（string）+ `minggeRelatedId`（int?）
- 爬虫从详情页 HTML 检测命格关键词，提取形态名称
- 英雄详情页：有 `minggeRelatedId` 时显示切换按钮，点击跳转关联英雄
- 命格关系需手动绑定（爬虫无法自动检测双向关联）：部署后执行 SQL 设置
