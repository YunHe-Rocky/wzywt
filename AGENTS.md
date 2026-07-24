# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

王者演武堂 — 王者荣耀 5v5 内战分队系统。Next.js 14 全栈应用。

## 命令

```bash
npm run dev            # 开发服务器 (localhost:8001)，自动清理端口占用
npm run dev:all        # 开发 + cron 定时任务
npm run build          # 生产构建
npm run db:push        # 同步 Prisma schema
npm run db:generate    # 重新生成 Prisma 客户端
npm run sync-heroes    # 手动同步英雄数据
npm run cron           # 独立 cron 进程
npx tsc --noEmit       # 类型检查
```

部署：`bash scripts/deploy.sh`（SSL → git pull → install → prisma → 英雄同步 → build → pm2 restart）
SSL：`bash scripts/setup-ssl.sh`（acme.sh，Nginx `/opt/Nginx/nginx.1.30.2/`）

## 技术栈

Next.js 14 (App Router) · TypeScript · Tailwind CSS · Prisma 5 + MySQL · iron-session + bcryptjs · cheerio + iconv-lite · node-cron · SSE · PM2 · acme.sh · Redis (缓存)

## 端口

固定 **8001**。`npm run dev` 自动执行 `scripts/kill-port.ts` 清理残留进程后启动。
种子脚本 `scripts/seed-test-data.ts` 默认 `127.0.0.1:8001`。

## 权限系统

User 表 `role` 字段：`admin` | `user`（默认）。

| 角色 | 说明 |
|------|------|
| `admin` | 超管，登录后访问 `/admin` 后台。内置账号 `admin / admin12345678` |
| `user` | 普通用户，无后台权限。若 role 被设为 admin，Header 菜单出现「后台管理」入口 |

权限守卫：`src/lib/permissions.ts`
- `requireSuperAdmin()` — API 层超管校验
- `requireTournamentAdmin(id)` — 赛事管理员校验

Admin 用户受保护：前端隐藏封禁/删除按钮，API 层禁止操作 admin 用户。

## 后台管理系统

`/admin` 使用独立 layout（server component），从 ThemeLayout 中排除（无 Header/Dock）。

```
/admin              仪表盘（用户数/赛事数/英雄数）
/admin/users        用户管理（封禁/解封/删除，admin 用户不可操作）
/admin/tournaments  房间管理（查看所有赛事/删除）
/admin/announcements 系统公告（版本号/主题/Markdown 正文，新增/编辑/发布/删除）
/admin/heroes       英雄分路管理（修改即保存，同步不覆盖）
/admin/settings     系统设置（爬取地址配置 + 同步进度条）
```

侧边栏 `AdminSidebar.tsx`：`w-44` 紧凑布局，`bg-nav` 材质，与 Header 同款。

## 调试面板

`/debug` 独立于后台，仅需登录即可访问（非超管也可用）。中间件公开路径。

## 头像系统

User 表 `avatar` 字段（VARCHAR 255，nullable）。本地文件存储 `/data/uploads/avatars/`（仓库外）。

| API | 说明 |
|-----|------|
| `POST /api/me/avatar` | 上传（FormData，校验 jpg/png/webp <2MB） |
| `GET /api/avatars/[filename]` | 读取（公开，Cache-Control 24h） |

前端：`/me` 个人空间页顶部有 `AvatarUpload` 组件。Header 导航栏显示头像图片，加载失败回退首字母。

## 忘记密码

`/api/auth/security-question` GET 查安全问题 → `POST /api/auth/reset-password` 验证答案并重置。
- 先验答案再进密码设置步骤，答案错误停留在第二步
- admin 账户设了安全问题：`系统内置管理员` / `admin`

## 认证与中间件

- iron-session cookie: `wzyt_session`，90 天有效期
- SessionData：`userId` / `username` / `role`
- 公开路径：`/login`, `/register`, `/`, `/heroes`, `/tournaments`, `/changelog`, `/monitor`, `/debug`, `/equipment`
- 受保护路径：`/me`, `/admin`（未登录跳转登录页）
- 公开 API：`/api/auth`, `/api/official-news`, `/api/announcements`, `/api/changelog`, `/api/tournaments/public`, `/api/heroes`, `/api/equipment`
- 静态文件前缀白名单：`/_next`, `/favicon`, `/public`, `/robots.txt`, `/sitemap.xml`
- `GET /api/auth/me` 验证用户存在 + 封禁检查，封禁用户自动销毁 session
- 登录时检查 banned 状态，被封禁用户拒绝登录
- 未知路径不再重定向到登录页，由 Next.js 返回 404 页面（`not-found.tsx`）

## SEO 与静态资源

- `public/robots.txt`：允许所有爬虫，禁止 `/admin/`、`/api/`、`/me/`、`/debug/`
- `src/app/sitemap.ts`：Next.js 原生 sitemap.xml 生成，包含首页/英雄/装备/赛事/更新日志
- `public/icon.svg`：全站 favicon，"武"字金色圆形图标
- `src/app/not-found.tsx`：自定义 404 页面

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

## 背景光球系统

三颗光球由 `BackgroundOrbs.tsx` 渲染，CSS 变量全部作用域在 `.bg-orbs-container` 内部。

- **鼠标驱赶**：反向逃逸，力曲线 `0.5 / (1 + dist * 4)`
- **手机陀螺仪**：倾斜驱赶 + 摇晃打散
- **接近度感应**：贴近变亮变清晰
- **性能**：rAF 节流 60fps，CSS transition `0.12s linear`（移动端）/ `0.8s ease-out`（桌面）
- **尺寸**：桌面固定 px，移动端 vw 比例
- #2 光球配色：青绿 `#00e5a0` + 亮蓝 `#4488ff` + 紫罗兰 `#7c5cfc`
- **无障碍**：`prefers-reduced-motion: reduce` 时隐藏光球、禁用所有动画

## 登录动画

`GlassShatter` — 卡片裂纹扩散后震碎为三角碎片飞散坠落。登录成功后根据角色跳转：`admin` 账号直接进 `/admin`，普通用户进首页。

## 页面动画

- `src/app/template.tsx`：全局页面切换过渡，`key={pathname}` 确保每次导航重播
- `.stagger-enter` CSS 类：直接子元素错峰浮现（0.15s 间隔）
- 分路编辑器：FLIP 重排动画
- **无障碍**：所有动画/过渡在 `prefers-reduced-motion: reduce` 时禁用（duration: 0.001ms）

## 移动端 /m 路由

- `src/middleware.ts` UA 检测 → 手机 307 到 `/m`（根路径重定向到 `/m` 而非 `/m/`，消除多余跳转）
- `/m` 下所有页面 re-export 主路由的同名页面
- `/m/admin/*`、`/m/debug/*` 同步 re-export

## 代码分层

运行时仍为 `web`（Next.js）和 `cron`（独立调度进程）两个进程。源码职责进一步拆分：

| 目录 | 职责 |
|------|------|
| `src/app/` | Next.js 页面与 API 路由适配 |
| `src/web/` | React 组件、布局、主题和动画 |
| `src/features/` | 日历、输入输出、同步、监控、用户档案等业务功能 |
| `src/core/` | 分队、伤害、装备规则等纯算法 |
| `src/lib/` | Prisma、Redis、Session、认证和外部请求基础设施 |

依赖方向：`app/web → features → core`，`features → lib`。`core` 禁止依赖 React、Next.js、Prisma 和 I/O。`scripts/cron.ts` 只负责启动 `features/cron/worker.ts`。

详细规则见 `docs/code-architecture.md`，执行 `npm run check:architecture` 检查跨层引用。

## 架构

```
src/
  hooks/          # useAuth, useAnnouncements, useRolePreferences, useHeroes, useEquipment
  components/
    layout/       # Header, Dock, BackgroundOrbs, CursorLighting, ThemeLayout, PageEntrance
    admin/        # AdminSidebar
    home/         # LoginReveal
    hero/         # HeroGrid, HeroDetail, HeroSelect
    me/           # RolePreferenceEditor, HeroPowerEditor, AvatarUpload
    auth/         # AuthForm, GlassShatter, DeleteAccountModal, SecurityQuestionModal
    tournament/   # TournamentList, TournamentDetail, TeamBuilder, HeroPickPanel
    ui/           # Toast, CalendarModal
  lib/
    heroes/sync.ts      爬虫核心（URL 从 KvCache 可配置，数字页优先）
    equipment/sync.ts   装备同步（官方 item.json）
    monitor/index.ts    轻量监控
    split.ts            分队算法（偏好满足/段位均衡/战力均衡 四层权重）
    anti-bot.ts         5 UA 轮换 + 退避重试
    redis.ts            Redis 缓存（1h TTL，silent fallback）
    permissions.ts      权限守卫
  app/
    api/            # 全部 API（force-dynamic）
    admin/          # 后台（独立 layout）
    debug/          # 调试面板（仅需登录）
    m/              # 移动端路由
    template.tsx    # 页面切换过渡
    not-found.tsx   # 自定义 404 页面
    sitemap.ts      # sitemap.xml 生成
```

### 核心 hooks
- `useAuth()` → `{ user: { userId, username, role?, avatar? }, loaded, logout }`
- `useAnnouncements(full?)` → `{ announcements, loaded, latestVersion }`
- `useRolePreferences()` → 段位/分路/英雄 state + API 方法 + FLIP 动画状态
- `useHeroes(roleFilter?, classFilter?)` → `{ heroes, loading, error, refetch }`
- `useEquipment()` → `{ items, loading }`

### 弹窗组件（全部支持无障碍）

| 组件 | 用途 | 无障碍特性 |
|------|------|------------|
| `SecurityQuestionModal` | 修改密码 | role="dialog" + aria-modal + 焦点陷阱 + Esc 关闭 |
| `DeleteAccountModal` | 注销账户 | role="dialog" + aria-modal |
| `CalendarModal` | 日期时间选择 | 整体 Portal + 焦点陷阱 + Esc 关闭 + 日期/小时/分钟确认 |
| `AuthForm` 忘记密码 | 找回密码 | role="dialog" + aria-modal + 焦点陷阱 + Esc 关闭 |
| `Toast` | 消息通知 | role="alert" |

功能层级统一使用 `--layer-sticky/dock/overlay/modal/popover/toast/transition`，禁止在组件内使用任意数字 `z-index`。

## 赛事报名与截止

- 输入房间号后先返回房间预览，不直接加入；预览优先展示截止时间、报名人数和房间公告。
- 公开访客详情不返回成员身份，只返回非观战人数统计。
- 非观战成员达到 10 人时立即将赛事设为 `locked`；减员后若原截止时间未到且尚未分队，自动恢复 `recruiting`。
- 加人使用 Serializable 事务和重试，防止并发超过 10 人。
- 延期必须同时选择日期和时间，且新时间必须晚于当前截止时间；满员房间不能延期。

## 系统公告

- 所有写操作由 `requireSuperAdmin()` 校验 `admin` 角色。
- 新公告必填版本号、公告主题和 Markdown 正文。
- 摘要与 slug 由服务端生成，Markdown 使用 React 节点渲染，不使用 `dangerouslySetInnerHTML`。

### 表单无障碍

所有认证表单控件（AuthForm / SecurityQuestionModal）已添加：
- `id` / `name` / `autoComplete` 属性，支持密码管理器自动填充
- `aria-label` 在图标按钮上（密码显隐切换、用户菜单等）
- 登录按钮触控目标 ≥ 36px

## 爬虫与监控

### 触发机制
- `scripts/cron.ts`：启动 5s 后全量同步 + 每天 06:00 全量 + 每 3 分钟监控
- `/api/heroes` POST：超管手动触发同步（`/admin/settings` 页面）
- 同步进度写入 KvCache，前端轮询 `/api/admin/sync-status` 展示进度条

### 爬取 URL 配置
所有爬取地址可通过 `/admin/settings` 配置，存储在 `KvCache key: config:crawl_urls`，sync.ts 运行时读取。未配置时使用默认值：
- `hero_list_page`：`https://pvp.qq.com/web201605/herolist.shtml`
- `hero_list_json`：`https://pvp.qq.com/web201605/js/herolist.json`
- `hero_detail_base`：`https://pvp.qq.com/web201605/herodetail`
- `hero_img_base`：`https://game.gtimg.cn/images/yxzj/img201606/heroimg/{id}/{id}.jpg`
- `skin_img_base`：`https://game.gtimg.cn/images/yxzj/img201606/skin/hero-info/{id}/{id}-bigskin-{idx}.jpg`

### 注意
- **数字页优先**：`fetchDetail` 先请求 `{heroId}.shtml` 再试拼音页，因为拼音页可能存旧数据
- 反爬：5 个 UA 轮换，403/429/503 → 退避 3s/6s/9s/12s，最多 5 次重试

## 装备系统

- 数据来源：`https://pvp.qq.com/web201605/js/item.json`
- 装备解析：属性列存（atk/ap/def/mdef/hp/mp 等15项）+ 被动效果 + 合成路径
- 特性标签：物理/法术/防御/移速/打野/辅助
- 等级分级：名字含 `·` → 三级，price ≤ 400 → 一级，price ≤ 2000 → 二级，其余三级
- 装备图片已启用 `loading="lazy"` + 明确的 width/height

## 数据库

远程 MySQL `38.22.234.148:3306`，数据库名 `yanwutang_test`。

### 核心模型
| 表 | 说明 |
|---|---|
| users | 用户（含 role/avatar/banned/security_question/is_temporary，级联删除） |
| heroes | 英雄数据（含 baseJson/mingge/skillsJson） |
| hero_skills | 技能拆表（skillIndex 0=被动 1-4=主动，含 damage_type/extraJson） |
| hero_lane_overrides | 手动分路修正（sync 不覆盖） |
| hero_powers | 用户英雄战力 |
| role_preferences | 用户分路偏好（排序 + 段位 + 巅峰分） |
| announcements | 系统公告（含 version/brief/slug/published） |
| tournaments | 赛事（含 deadline/status/split_result JSON） |
| tournament_players | 参赛者（含 is_temporary/is_spectator） |
| tournament_admins | 赛事管理员（owner/co_owner） |
| tournament_picks | 英雄选择（含 team/equip_json） |
| temp_player_applications | 临时玩家申请 |
| admin_operations | 管理操作日志 |
| equipment | 装备数据（15项属性列存 + passive_json/extra_json） |
| kv_cache | 键值缓存（爬取配置/同步进度/英雄列表） |

## 命格系统

- Hero 模型：`mingge`（bool）+ `minggeName`（string）+ `minggeRelatedId`（int?）
- 爬虫从详情页 HTML 检测命格关键词
- 英雄目录取 herolist.shtml 与 herolist.json 并集；同步后固定恢复孙悟空(167) ↔ 心魔六耳(549)
- 英雄详情页：有 `minggeRelatedId` 时显示切换按钮
- 图鉴卡片：命格形态英雄不展示，本命英雄显示「双形态」徽章
- 皮肤以 JSON 最新名称为准，图片按 bigskin → mobileskin → heroimg 回退；daily/initial 同步后刷新本地图片
- 补位 User 使用 `isTemporary=true`，后台不统计；recruiting/locked 房间过期时 cron 自动删除
- 英雄战力保持原始整数，分路段位为前 5 战力总和 / 1000，最多三位小数

## 分队算法

`src/lib/split.ts` — 10 人选 5v5，两阶段算法：

**阶段一：分路分配（~113,400 种方案）**
四层权重评分：
| 因子 | 权重 | 说明 |
|------|------|------|
| 偏好满足 | ×350 | 最高优先，确保拿到想玩的分路 |
| 段位覆盖 | ×50 | 有段位数据的选手被正确评估 |
| 段位均衡 | ×30 | 红蓝双方段位和接近 |
| 战力均衡 | ×20 | 红蓝双方战力接近 |

**阶段二：红蓝分队** — 每种分路方案尝试 32 种分队方式，选均衡度最高。实力加权罚分确保强者被挤出主分路罚更多，弱者补位代价更小。

## 注意事项

- Nginx 非标准路径：`/opt/Nginx/nginx.1.30.2/`，配置 `conf.d/sites/`
- 服务器已配置 HTTPS（Let's Encrypt + acme.sh）
- 英雄同步用 `npx tsx -e "import(...)"` 调用
- 所有新增 `/m` 路由需在 `src/app/m/` 创建 re-export
- 种子脚本中文参数需用文件传递避免 shell 编码损坏
