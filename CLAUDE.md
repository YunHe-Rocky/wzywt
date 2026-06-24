# CLAUDE.md

## 项目

王者演武堂 — 王者荣耀 5v5 内战分队系统。Next.js 14 全栈应用，综合分路段位、偏好与英雄战力自动均衡分队。

## 命令

```bash
npm run dev            # 开发服务器 (默认 webpack, -p 8001)
npm run dev:all        # 开发 + 定时任务
npm run build          # 生产构建
npm run db:push        # 同步 Prisma schema
npm run db:generate    # 重新生成 Prisma 客户端
npm run sync-heroes    # 手动同步英雄数据
npm run cron           # 独立定时任务
npx tsc --noEmit       # 类型检查
```

## 技术栈

Next.js 14 (App Router) · TypeScript · Tailwind CSS · Prisma 5 + MySQL · iron-session + bcryptjs · cheerio + iconv-lite · pinyin · node-cron · SSE

## 结构

```
src/app/                    # App Router 页面 + API
  ├── layout.tsx            # 根布局 (Header + main-content)
  ├── page.tsx              # 首页 (标题 + 文档 + 公告双列)
  ├── login/register/me/    # 认证 + 个人空间
  ├── tournaments/[id]/     # 赛事详情 (分队 + 选手管理)
  ├── heroes/[id]/          # 英雄图鉴 + 详情 (皮肤切换)
  ├── admin/heroes/         # 分路管理 (手动修正)
  ├── monitor/              # 监控中心 (爬虫状态)
  └── api/
      ├── auth/             # 注册/登录/登出/me
      ├── heroes/           # 列表 + 详情 + PATCH + watch(SSE)
      ├── tournaments/      # CRUD + join/leave/kick/split/admin/extend
      ├── users/me/         # 分路偏好 + 段位 + 英雄战力
      └── official-news/    # 官方公告爬取
src/components/
  ├── layout/Header.tsx     # 顶部导航栏 (项目名 + 用户下拉菜单)
  ├── auth/AuthForm.tsx     # 登录/注册
  ├── me/                   # 分路偏好排序 + 段位 + 巅峰分 + 历史最高段位 + 模糊搜索英雄战力
  ├── tournament/           # 赛事列表 + 详情 (分队结果 + 管理)
  ├── hero/                 # 英雄网格 + 详情 (皮肤) + 选择器 (拼音)
  └── ui/Toast.tsx          # Toast 通知
src/lib/
  ├── db.ts                 # Prisma 客户端单例
  ├── session.ts            # iron-session 配置
  ├── auth.ts               # 密码哈希 + requireAuth()
  ├── split.ts              # 分队算法
  ├── heroes/sync.ts        # 英雄数据同步爬虫
  ├── monitor/index.ts      # 模块化监控 (news/heroes/skins)
  ├── sse/heroes.ts         # SSE 广播 (实时推送)
  └── anti-bot.ts           # 反爬 (UA轮换 + Playwright降级)
scripts/
  ├── cron.ts               # 定时任务
  └── download-hero-images.ts
prisma/schema.prisma        # 数据模型
docs/yanwutang.conf         # Nginx 反代配置
```

## 核心设计

### 认证
- `/api/auth/me` → `{ user: { userId, username } | null }`
- 前端用 `me.userId` 判断权限
- iron-session cookie: `wzyt_session`

### 权限
| 操作 | 房主 | 管理 | 选手 |
|------|:--:|:--:|:--:|
| 加入/退出 | ✓ | ✓ | ✓ |
| 分队/踢人/延长 | ✓ | ✓ (5分冷却) | |
| 公告/公开切换 | ✓ | ✓ | |
| 任命/撤销管理 | ✓ | | |

### 分队算法
`split.ts` — 取前 10 人 5v5，多余静默排除。

每人按分配分路计算综合战力（满分约 1000）：
- 英雄战力：该分路 Top3 均值 ÷ 30（满分 400）
- 巅峰赛分：`peak_score` ÷ 7（满分 ~357，巅峰赛 2500 封顶）
- 当前段位：`role_rank` × 15（满分 135）
- 历史最高段位：`peak_rank` × 10（满分 90）

评分权重: 偏好满足(×350) > 段位覆盖(×50) > 段位均衡(×30) > 战力均衡(×20)

结果持久化到 `tournaments.split_result`，刷新不丢失。

### 英雄系统
- `hero_type` / `hero_type2`: 官方职业 (1战士 2法师 3坦克 4刺客 5射手 6辅助)
- `role_type`: 分路 (top/jungle/mid/adc/support)
- `hero_lane_overrides`: 手动修正表，外部同步不覆盖
- 管理页 `/admin/heroes` 即时修改即时保存

### 实时监控
- SSE: `/api/heroes/watch` 每 60s 轻量检查官方数据
- 三模块独立: news (标题对比) / heroes (数量+采样) / skins (皮肤名对比)
- 变化时触发对应爬虫，广播到所有在线客户端
- 前端图鉴 + 详情页自动刷新，无需手动

### 反爬
`anti-bot.ts` — 5 UA 轮换 + 指数退避重试 + Playwright 无头浏览器降级

### 响应式
同一份布局，手机字号间距缩小，不做重排显隐。表格横向滚动。

### 部署
参考 `docs/deploy.md`，关键步骤：
```bash
git pull && npm install && npx prisma db push && npm run build && pm2 restart all
```

### 密码可见性
`AuthForm.tsx` 所有密码输入框右侧眼睛图标，点击切换 `type="password"` ↔ `type="text"`。登录页、注册页、忘记密码弹窗均覆盖。
