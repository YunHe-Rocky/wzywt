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
- 公开 API：`/api/auth`, `/api/official-news`, `/api/announcements`, `/api/tournaments/public`, `/api/heroes`, `/api/equipment`
- `GET /api/auth/me` 验证用户存在 + 封禁检查，封禁用户自动销毁 session
- 登录时检查 banned 状态，被封禁用户拒绝登录

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

## 登录动画

`GlassShatter` — 卡片裂纹扩散后震碎为三角碎片飞散坠落。登录成功后根据角色跳转：`admin` 账号直接进 `/admin`，普通用户进首页。

## 页面动画

- `src/app/template.tsx`：全局页面切换过渡，`key={pathname}` 确保每次导航重播
- `.stagger-enter` CSS 类：直接子元素错峰浮现（0.15s 间隔）
- 分路编辑器：FLIP 重排动画

## 移动端 /m 路由

- `src/middleware.ts` UA 检测 → 手机 307 到 `/m`
- `/m` 下所有页面 re-export 主路由的同名页面
- `/m/admin/*`、`/m/debug/*` 同步 re-export

## 架构

```
src/
  hooks/          # useAuth, useAnnouncements, useRolePreferences
  components/
    layout/       # Header, Dock, BackgroundOrbs, CursorLighting, ThemeLayout, PageEntrance
    admin/        # AdminSidebar
    home/         # LoginReveal
    hero/         # HeroGrid, HeroDetail, HeroSelect
    me/           # RolePreferenceEditor, HeroPowerEditor, AvatarUpload
    auth/         # AuthForm, GlassShatter, DeleteAccountModal, SecurityQuestionModal
    tournament/   # TournamentList, TournamentDetail
    ui/           # Toast
  lib/
    heroes/sync.ts      爬虫核心（URL 从 KvCache 可配置，数字页优先）
    monitor/index.ts    轻量监控
    anti-bot.ts         5 UA 轮换 + 退避重试
    redis.ts            Redis 缓存（1h TTL，silent fallback）
  app/
    api/            # 全部 API（force-dynamic）
    admin/          # 后台（独立 layout）
    debug/          # 调试面板（仅需登录）
    m/              # 移动端路由
    template.tsx    # 页面切换过渡
```

### 核心 hooks
- `useAuth()` → `{ user: { userId, username, role?, avatar? }, loaded, logout }`
- `useAnnouncements(full?)` → `{ announcements, loaded, latestVersion }`
- `useRolePreferences()` → 段位/分路/英雄 state + API 方法 + FLIP 动画状态

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

## 数据库

远程 MySQL `38.22.234.148:3306`，数据库名 `yanwutang`。

### 核心模型
| 表 | 说明 |
|---|---|
| users | 用户（含 role/avatar/banned，级联删除） |
| heroes | 英雄数据（含 baseJson/mingge/skillsJson） |
| hero_skills | 技能拆表（skillIndex 0=被动 1-4=主动） |
| hero_lane_overrides | 手动分路修正（sync 不覆盖） |
| hero_powers | 用户英雄战力 |
| announcements | 系统公告 |
| tournaments | 赛事 |
| tournament_players | 参赛者 |
| tournament_admins | 赛事管理员（owner/co_owner） |
| tournament_picks | 英雄选择 |
| equipment | 装备数据 |
| kv_cache | 键值缓存（爬取配置/同步进度） |

## 命格系统

- Hero 模型：`mingge`（bool）+ `minggeName`（string）+ `minggeRelatedId`（int?）
- 爬虫从详情页 HTML 检测命格关键词
- 英雄详情页：有 `minggeRelatedId` 时显示切换按钮

## 注意事项

- Nginx 非标准路径：`/opt/Nginx/nginx.1.30.2/`，配置 `conf.d/sites/`
- 服务器已配置 HTTPS（Let's Encrypt + acme.sh）
- 英雄同步用 `npx tsx -e "import(...)"` 调用
- 所有新增 `/m` 路由需在 `src/app/m/` 创建 re-export
- 种子脚本中文参数需用文件传递避免 shell 编码损坏
