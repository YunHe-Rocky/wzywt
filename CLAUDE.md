# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目

王者演武堂 — 王者荣耀 5v5 内战分队系统。Next.js 14 全栈应用，综合分路段位、偏好与英雄战力自动均衡分队。

## 命令

```bash
npm run dev            # 开发服务器 (默认 localhost:3000)
npm run dev:all        # 开发 + 定时任务
npm run build          # 生产构建
npm run db:push        # 同步 Prisma schema
npm run db:generate    # 重新生成 Prisma 客户端
npm run sync-heroes    # 手动同步英雄数据
npm run cron           # 独立定时任务
npx tsc --noEmit       # 类型检查
```

部署脚本在 `scripts/deploy.sh`：
```bash
git pull && npm install && npx prisma db push && npm run build && pm2 restart all
```

## 技术栈

Next.js 14 (App Router) · TypeScript · Tailwind CSS · Prisma 5 + MySQL · iron-session + bcryptjs · cheerio + iconv-lite · pinyin · node-cron · SSE

## 核心设计

### 认证与中间件
- `/api/auth/me` → `{ user: { userId, username } | null }`
- iron-session cookie: `wzyt_session`
- `src/middleware.ts` — 拦截所有非公开路径，无 session 重定向到 `/login?redirect=原路径`
- 公开路径白名单：`/login`, `/register`, `/api/auth`, `/api/official-news`, `/api/announcements`, `/api/tournaments/public`

### 配色系统
石板灰基底 + 暖铜金点缀（低对比度、舒适）。所有颜色通过 CSS 变量定义在 `:root, [data-theme="yanwu"]`，组件统一引用 `var(--xxx)` 或 Tailwind 颜色 token。禁止硬编码颜色值。

**核心规则**：金色仅用于强调（标题、激活态、主按钮），正文用灰白系。按钮用 CSS 变量 `var(--gold-light)` 渐变，hover 用 `filter: brightness(1.08)`。

### 主题系统
`src/themes/ThemeProvider.tsx` — URL hash 驱动主题切换：
- `#1` 或无 hash → `yanwu` 主题（当前）
- `#2` → `alternate` 主题（占位）
- hash 变化自动切换 `<html data-theme="...">`，CSS 变量全隔离

两套主题功能完全相同，仅视觉差异。做第二套主题只需编辑 `globals.css` 中 `[data-theme="alternate"]` 的变量。

### 首页
`src/app/page.tsx` — 全宽三区：系统公告（可展开）+ 公开房间（双列网格）+ 王者官方公告。无侧边栏、无个人空间卡片。数据从 `/api/announcements`、`/api/tournaments/public`、`/api/official-news` 获取。

### 个人空间
`src/components/me/RolePreferenceEditor.tsx` — 三部分：
1. **段位信息卡片**：当前段位 + 分隔线 + 历史最高段位（统一设置所有分路）
2. **分路优先级排序栏**：5 个分路可拖拽排序（▲▼按钮），每个显示英雄数量 (0/3)
3. **Tab 内容区**：选中分路的英雄列表 + 添加表单（HeroSelect + 战力输入 + 添加按钮）+ 巅峰赛分数

### 分队算法
`split.ts` — 取前 10 人 5v5。每人按分配分路计算综合战力（满分约 1000），评分权重: 偏好满足(×350) > 段位覆盖(×50) > 段位均衡(×30) > 战力均衡(×20)。结果持久化到 `tournaments.split_result`。

### 权限
| 操作 | 房主 | 管理 | 选手 |
|------|:--:|:--:|:--:|
| 加入/退出 | ✓ | ✓ | ✓ |
| 分队/踢人/延长 | ✓ | ✓ (5分冷却) | |
| 公告/公开切换 | ✓ | ✓ | |
| 任命/撤销管理 | ✓ | | |

### HeroSelect 组件
`src/components/hero/HeroSelect.tsx` — 英雄搜索下拉。通过 `createPortal` 渲染到 `<body>`，`position: fixed` 定位，自动跟随滚动和窗口缩放。支持拼音模糊搜索（动态加载 pinyin 库）。下拉项格式：`[头像] 花木兰 #123 / 传说之刃`。z-index: 99999。

### 布局规范
- **桌面优先**，无复杂响应式。移动端仅基础适配（padding、字号）。
- Header 导航：`首页 | 赛事大厅 | 英雄图鉴`。桌面 nav 常显，手机端汉堡菜单。
- 卡片用 `.card` class（琉璃质感：顶部微亮反光 + 内阴影）
- 输入框背景 `var(--bg-input)` 比卡片亮，边框 `rgba(255,255,255,0.1)`

### 英雄系统
- `hero_type` / `hero_type2`: 官方职业 (1战士 2法师 3坦克 4刺客 5射手 6辅助)
- `role_type`: 分路 (top/jungle/mid/adc/support)
- `hero_lane_overrides`: 手动修正表，外部同步不覆盖

### 实时监控
SSE: `/api/heroes/watch` 每 60s 检查官方数据，三模块独立（news/heroes/skins），变化时触发爬虫并广播。

### 反爬
`anti-bot.ts` — 5 UA 轮换 + 指数退避重试 + Playwright 降级

### API 缓存
所有 GET API 路由必须加 `export const dynamic = "force-dynamic"` + `Cache-Control: no-cache` 响应头，防止 Next.js 缓存数据。

### 数据库
远程 MySQL `38.22.234.148:3306`，数据库名 `yanwutang`。`.env` 中 `DATABASE_URL` 配置。表名前缀映射见 `prisma/schema.prisma`。
