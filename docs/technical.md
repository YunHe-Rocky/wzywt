# 王者演武堂 — 技术文档 V1.0.0

## 项目概述

王者演武堂是一个王者荣耀 5v5 内战分队系统。基于 Next.js 14 全栈架构，综合分路段位、偏好与英雄战力自动均衡分队。

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 14 (App Router) |
| 语言 | TypeScript |
| 样式 | Tailwind CSS + 内联样式 |
| 数据库 | MySQL + Prisma 5 ORM |
| 认证 | iron-session (cookie) + bcryptjs |
| 爬虫 | GICP 官方 API + herolist.json CDN |
| 实时推送 | Server-Sent Events (SSE) |
| 进程管理 | PM2 |
| 反向代理 | Nginx |

## 项目结构

```
src/
  app/                     # App Router 页面 + API
    ├── layout.tsx          # 根布局 (Header)
    ├── page.tsx            # 首页 (公告 + 新闻 + 公开房间)
    ├── login/register/me/  # 认证 + 个人空间
    ├── tournaments/[id]/   # 赛事详情 (分队 + 选手管理)
    ├── heroes/[id]/        # 英雄图鉴 + 详情 (皮肤切换)
    └── api/
        ├── auth/           # 注册/登录/登出/me/安全问题/修改密码
        ├── heroes/         # 列表 + 详情 + PATCH + watch(SSE)
        ├── tournaments/    # CRUD + join/leave/kick/split/admin
        ├── official-news/  # 官方公告 (GICP API)
        └── announcements/  # 系统公告 (Markdown 文件)
  components/
    ├── layout/Header.tsx   # 顶部导航 (品牌名 + 版本号 + 用户菜单)
    ├── auth/               # AuthForm, SecurityQuestionModal, DeleteAccountModal
    ├── tournament/         # TournamentList, TournamentDetail
    ├── hero/               # HeroGrid, HeroDetail, HeroSelect
    ├── me/                 # RolePreferenceEditor, HeroPowerEditor
    └── ui/Toast.tsx        # Toast 通知
  lib/
    ├── db.ts               # Prisma 客户端单例
    ├── session.ts          # iron-session 配置
    ├── auth.ts             # bcrypt 密码哈希 + requireAuth()
    ├── gicp.ts             # GICP 官方内容平台 API 封装
    ├── split.ts            # 分队算法
    ├── anti-bot.ts         # UA 轮换 + 指数退避重试
    ├── heroes/
    │   ├── sync.ts         # 英雄数据同步 (herolist.json + 详情页)
    │   └── download-images.ts  # CDN 图片下载
    ├── monitor/index.ts    # 轻量监控 (新闻/英雄/皮肤变化检测)
    └── sse/heroes.ts       # SSE 广播 (实时推送)
scripts/
  ├── cron.ts               # 定时任务入口
  └── download-hero-images.ts  # 图片下载 CLI
prisma/schema.prisma        # 数据模型
data/
  ├── announcements/        # 系统公告 Markdown 文件
  └── changelog.json        # 更新日志
```

## 数据库模型

### User
| 字段 | 类型 | 说明 |
|------|------|------|
| id | Int (PK) | 自增主键 |
| username | String (unique) | 召唤师名称 |
| passwordHash | String | bcrypt 密码哈希 |
| securityQuestion | String? | 安全问题文本 |
| securityAnswerHash | String? | 安全问题答案 bcrypt 哈希 |
| createdAt | DateTime | 注册时间 |

### Tournament
| 字段 | 类型 | 说明 |
|------|------|------|
| id | Int (PK) | 自增主键 |
| code | String (unique) | 8 位房间码 |
| name | String | 房间名称 |
| deadline | DateTime | 报名截止时间 |
| status | String | recruiting/locked/ended |
| isPublic | Boolean | 是否公开 |
| announcement | String? | 房间公告 |
| splitResult | Json? | 分队结果 JSON |

### TournamentPlayer
| 字段 | 类型 | 说明 |
|------|------|------|
| tournamentId + userId | 联合唯一 | 选手关联 |
| roleType | String? | 分路偏好 |
| isTemporary | Boolean | 是否补位选手 |
| isSpectator | Boolean | 是否旁观 |

### TournamentAdmin
| 字段 | 类型 | 说明 |
|------|------|------|
| tournamentId + userId | 联合唯一 | 管理关联 |
| role | String | owner / co_owner |

### Hero
| 字段 | 类型 | 说明 |
|------|------|------|
| heroId | Int (unique) | 官方英雄 ID |
| name | String | 英雄名 |
| title | String | 称号 |
| roleType | String | 分路 |
| heroType / heroType2 | Int | 官方职业分类 |
| imageUrl | String | 头像 CDN 地址 |
| skinsJson | String? | 皮肤列表 JSON |
| skillsJson | String | 技能列表 JSON |

### 其他
- **RolePreference** — 用户分路偏好 + 段位
- **HeroPower** — 用户英雄战力
- **HeroLaneOverride** — 分路手动修正
- **KvCache** — 键值缓存 (验证码/新闻缓存/监控指纹)
- **AdminOperation** — 管理操作日志
- **TempPlayerApplication** — 补位申请

## API 路由

### 认证 (`/api/auth/`)

| 方法 | 路由 | 说明 | 鉴权 |
|------|------|------|------|
| POST | /register | 注册 (用户名 + 安全问题 + 密码) | 否 |
| POST | /login | 登录 | 否 |
| POST | /logout | 登出 | 是 |
| GET | /me | 当前用户信息 | 是 |
| DELETE | /me | 注销账号 (安全问题验证) | 是 |
| POST | /change-password | 修改密码 (安全问题验证) | 是 |
| POST | /reset-password | 重置密码 (用户名 + 安全问题) | 否 |
| GET | /security-question | 查询用户安全问题 | 否 |
| POST | /security-question | 设置/更新安全问题 | 是 |

### 赛事 (`/api/tournaments/`)

| 方法 | 路由 | 说明 | 鉴权 |
|------|------|------|------|
| GET/POST | / | 列表 / 创建 | 是 |
| GET | /[id] | 赛事详情 | 是* |
| POST | /[id]/join | 加入房间 | 是 |
| POST | /[id]/leave | 退出房间 | 是 |
| POST | /[id]/kick | 踢出选手 | 管理 |
| POST | /[id]/split | 执行分队 | 管理 |
| POST | /[id]/admin | 任命/撤销管理 | 房主 |
| POST | /[id]/admin/resign | 辞去管理 | 管理 |
| PATCH | /[id] | 编辑房间 | 管理 |
| GET | /public | 公开房间列表 | 否 |

> *公开房间允许访客查看

### 英雄 (`/api/heroes/`)

| 方法 | 路由 | 说明 |
|------|------|------|
| GET | / | 英雄列表 |
| GET | /watch | SSE 实时监控推送 |
| PATCH | /[id] | 更新英雄数据 |

### 其他

| 路由 | 说明 |
|------|------|
| GET /api/official-news | 官方公告 (GICP API, 1h 缓存) |
| GET /api/announcements | 系统公告 (Markdown 文件) |
| GET /api/users/me/roles | 用户分路偏好 |
| POST /api/users/me/roles | 更新分路偏好 |

## 认证体系

- **会话**: iron-session，cookie name `wzyt_session`
- **密码**: bcryptjs, cost=10
- **安全问题**: 答案 trim 后 bcrypt 哈希存储，验证时 bcrypt.compare
- **中间件**: `src/middleware.ts`，白名单控制未登录可访问路径

## 权限模型

| 操作 | 房主 | 管理 | 选手 |
|------|:--:|:--:|:--:|
| 加入/退出 | ✓ | ✓ | ✓ |
| 分队/踢人/延长 | ✓ | ✓ (5分冷却) | |
| 公告/公开切换 | ✓ | ✓ | |
| 任命/撤销管理 | ✓ | | |
| 辞去管理 | | ✓ | |

## 分队算法

`src/lib/split.ts` — 取前 10 人 5v5，多余静默排除。

权重: 段位覆盖(×100) > 段位均衡(×50) > 偏好满足(×10) > 战力均衡(×1)

分区结果持久化到 `tournaments.split_result`，刷新不丢失。

## 爬虫架构

```
定时监控 (60s, cron.ts → runAllMonitors)
  ├─ checkNews()     → GICP API 对比头条标题
  ├─ checkHeroes()   → herolist.json 对比数量和名称
  └─ checkSkins()    → herolist.json 皮肤名称指纹对比

检测到变化 → SSE 广播 → runMonitorAndScrape()
  ├─ news:    清除缓存，下次请求从 GICP API 拉取
  ├─ heroes:  syncHeroes() 拉取全量数据 + downloadAllImages()
  └─ skins:   syncHeroes() + downloadAllImages()
```

### 数据源

| 数据 | 来源 | 方式 |
|------|------|------|
| 新闻/公告 | GICP API (apps.game.qq.com/cmc/cross) | MD5 签名 HTTP |
| 英雄列表 | herolist.json CDN | HTTP GET |
| 英雄详情 | pvp.qq.com 详情页 | cheerio 解析 |
| 英雄头像 | game.gtimg.cn CDN | 直接下载 |
| 皮肤图片 | game.gtimg.cn CDN | 拼接 URL 下载 |

## 部署

```bash
# 环境变量 (.env)
DATABASE_URL=mysql://user:pass@localhost:3306/db
SESSION_SECRET=<random-64-char>

# 启动
npm install
npx prisma db push
npm run build
pm2 start node_modules/next/dist/bin/next --name yanwutang -- start -p 8081
pm2 start scripts/cron.ts --name yanwutang-cron --interpreter tsx
```

详见 `docs/deploy.md`。

## 监控面板

`/monitor` — 实时查看爬虫状态，SSE 推送变化事件。
