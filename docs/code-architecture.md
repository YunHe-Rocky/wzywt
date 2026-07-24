# 代码分层架构

## 目标

项目保持两个运行进程：

- `web`：Next.js 页面和 API。
- `cron`：`scripts/cron.ts` 启动的定时调度进程。

源码按职责分为四层，避免把“运行进程”和“代码职责”混为一谈。

## 目录

```text
src/
├── app/                 # Next.js 路由适配层
├── web/                 # React 渲染、布局、主题、动画
├── features/            # 业务功能与应用用例
├── core/                # 纯领域模型、规则和算法
└── lib/                 # 数据库、Redis、Session、外部请求等基础设施

scripts/
└── cron.ts              # cron 进程薄入口
```

## 依赖方向

```text
app ──────→ web ──────→ features ──────→ core
 │                         │
 └─────────────────────────┴───────────→ lib

cron ─────→ features ─────→ core / lib
```

### `src/web`

只负责用户可见的渲染和交互：

- React 组件；
- Layout、Header、Dock；
- 表单和弹窗的视图；
- 主题、CSS 表现和动画参数。

不得包含 Prisma 查询、Redis 操作、爬虫或分队算法。
不得直接调用 `fetch()`；HTTP 路径、请求体和响应解析由对应的 `features/*/client/api.ts` 封装。

### `src/features`

按业务功能组织可复用能力：

- `auth`：登录态客户端能力；
- `announcements`：公告读取、输入校验、admin CRUD 与客户端 API；
- `heroes`：英雄查询、同步、图片下载和事件广播；
- `equipment`：装备查询与同步；
- `profile`：分路偏好和英雄战力；
- `calendar`：日期网格、合法性判断和输出格式；
- `monitor`：数据变化检测与同步编排；
- `tournaments`：赛事容量、报名状态、截止时间与客户端 API；
- `cron`：定时任务注册与执行编排。

功能层可以被 Web API、React UI 和 cron 共同调用，但不能依赖 `src/web` 或 `src/app`。

### `src/core`

纯 TypeScript 领域代码：

- 游戏常量和数据类型；
- 装备分级、标签与技能解析；
- 伤害计算；
- 5v5 分队算法。

不得依赖 React、Next.js、Prisma、Redis、Node 文件系统或网络。

### `src/lib`

基础设施适配：

- Prisma；
- Redis；
- iron-session；
- bcrypt；
- 官方接口请求和反爬请求。

基础设施不负责页面渲染或业务流程编排。

## 新功能放置规则

1. 只有 JSX、样式和视觉交互：放 `web`。
2. 可以被页面、API 或 cron 调用的完整功能：放 `features/<domain>`。
3. 无 I/O、可直接单元测试的规则或算法：放 `core`。
4. 数据库、缓存、Session、文件和第三方服务：放 `lib`。
5. `scripts/cron.ts` 只启动功能层任务，不直接实现任务。

## 自动边界检查

```bash
npm run check:architecture
```

检查内容：

- `core` 不得依赖 Web、功能层、基础设施、React、Next.js 或 Node I/O；
- `features` 不得反向依赖 `web/app`；
- `web` 不得依赖 `lib/app`，也不得直接调用 `fetch()`；
- `scripts/cron.ts` 只能引用 `features/cron/worker`。

## 示例：日历

```text
features/calendar/model.ts          # 月份网格、过去日期判断、输出格式
web/components/ui/CalendarModal.tsx # 弹窗渲染和鼠标键盘交互
```

日期时间弹层整体 Portal 到 `document.body`。全站功能层级统一为：

```text
sticky < dock < overlay < modal < popover < toast < transition
```

组件只能使用 `--layer-*` 语义 token，`check:architecture` 会拒绝 Web 层数字 `zIndex`。

## 示例：赛事容量

```text
features/tournaments/model.ts            # 10 人容量和状态转换纯规则
features/tournaments/server/capacity.ts  # Serializable 加人事务与减员重算
app/api/tournaments/*                    # HTTP、认证和权限适配
web/components/tournament/*              # 预览、日期时间与成员交互
```

满员只切换 `status=locked`，不覆盖原计划 `deadline`；减员时可据原截止时间决定是否恢复报名。

## 示例：系统公告

```text
features/announcements/model.ts           # 三字段校验、摘要和 slug 生成
features/announcements/server/service.ts  # Prisma CRUD
features/announcements/client/api.ts      # 后台客户端 API
web/components/admin/AnnouncementManager.tsx
web/components/content/MarkdownContent.tsx
```

## 示例：英雄同步

```text
app/api/heroes/route.ts              # HTTP 适配
features/heroes/server/sync.ts       # 同步用例
lib/db.ts                            # Prisma 适配
lib/anti-bot.ts                      # 外部请求适配
core/game/data.ts                    # 纯数据解析
```
