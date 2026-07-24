# 王者演武堂 架构文档

> 王者荣耀 5v5 内战分队系统，Next.js 14 全栈应用。

---

## 1. 项目概述

王者演武堂是一个面向王者荣耀玩家的 5v5 内战分队平台。核心功能包括：

- **英雄图鉴**：搜索、分路/职业筛选、技能伤害数据、命格切换、基础属性表
- **装备图鉴**：搜索、等级/特性筛选、被动解析
- **赛事系统**：创建房间、加入退出、管理员管理、分队算法、英雄选择
- **个人空间**：分路偏好、段位设置、英雄战力管理、头像上传
- **后台管理**：用户管理、赛事管理、英雄分路修正、系统设置、数据同步
- **自动监控**：3 分钟周期检测官方数据变更，自动触发增量同步

---

## 2. 技术栈

| 层次 | 技术 | 说明 |
|------|------|------|
| 框架 | Next.js 14 (App Router) | 全栈应用，SSR + 客户端渲染 |
| 语言 | TypeScript | 全项目类型覆盖 |
| 样式 | Tailwind CSS | 原子化 CSS + 双主题变量 |
| ORM | Prisma 5 | 类型安全数据库访问 |
| 数据库 | MySQL 8 | 远程 `38.22.234.148:3306` |
| 认证 | iron-session + bcryptjs | Cookie-based session + 密码哈希 |
| 爬虫 | cheerio + iconv-lite | HTML 解析 + GBK 解码 |
| 定时任务 | node-cron | 每天 06:00 全量同步 + 每 3 分钟监控 |
| 实时推送 | SSE | 同步进度广播、英雄变更推送 |
| 进程管理 | PM2 | 生产环境进程守护 |
| SSL | acme.sh | Let's Encrypt 自动续期 |
| 缓存 | Redis (ioredis) | 1h TTL，静默降级 |
| Web 服务器 | Nginx | 反向代理 `ywt.yunhe.ink` |

---

## 3. 目录结构

```
src/
├── engine/                    # 引擎层 — 全项目共享基础
│   ├── index.ts               # 统一导出
│   ├── constants.ts           # 常量：分路、职业、属性标签、装备配置
│   ├── types.ts               # 类型定义：英雄、装备、技能、伤害
│   ├── data.ts                # 数据计算：装备分级、标签、被动解析、技能伤害解析
│   ├── animation.ts           # 动画预设：缓动曲线、毛玻璃、错峰入场、按钮反馈
│   └── combat.ts              # 伤害公式引擎：属性计算、技能伤害、连招伤害
│
├── hooks/                     # 客户端 Hooks
│   ├── useAuth.ts             # 认证状态
│   ├── useAnnouncements.ts    # 公告列表
│   ├── useHeroes.ts           # 英雄列表（带筛选）
│   ├── useHero.ts             # 英雄详情
│   ├── useEquipment.ts        # 装备列表
│   ├── useEquipmentItem.ts    # 装备详情
│   └── useRolePreferences.ts  # 分路偏好 + 英雄战力
│
├── components/
│   ├── layout/                # 布局组件
│   │   ├── Header.tsx          # 顶部导航栏（含头像）
│   │   ├── ThemeLayout.tsx     # 主题布局容器（CSS 变量注入）
│   │   ├── BackgroundOrbs.tsx  # 背景光球系统（鼠标驱赶 + 陀螺仪）
│   │   ├── CursorLighting.tsx  # 光标照明效果
│   │   ├── PageEntrance.tsx    # 页面入场动画包装器
│   │   └── alternate/Dock.tsx  # 移动端底部 Dock 导航
│   ├── admin/                 # 后台组件
│   │   ├── AdminSidebar.tsx    # 桌面端侧边栏
│   │   └── MobileAdminLayout.tsx # 移动端后台布局
│   ├── home/                  # 首页组件
│   │   ├── LoginReveal.tsx     # 登录弹窗面板
│   │   └── JoinBattle.tsx      # 参赛入口
│   ├── hero/                  # 英雄组件
│   │   ├── HeroGrid.tsx        # 英雄网格（搜索 + 筛选）
│   │   ├── HeroDetail.tsx      # 英雄详情面板
│   │   ├── HeroSelect.tsx      # 英雄选择器
│   │   └── EquipSelect.tsx     # 装备选择器
│   ├── me/                    # 个人空间组件
│   │   ├── RolePreferenceEditor.tsx  # 分路偏好编辑器
│   │   ├── HeroPowerEditor.tsx       # 英雄战力编辑器
│   │   └── AvatarUpload.tsx          # 头像上传
│   ├── auth/                  # 认证组件
│   │   ├── AuthForm.tsx              # 登录/注册表单
│   │   ├── GlassShatter.tsx          # 玻璃碎裂动画（登录成功）
│   │   ├── DeleteAccountModal.tsx    # 账号删除确认
│   │   └── SecurityQuestionModal.tsx # 安全问题验证
│   ├── tournament/            # 赛事组件
│   │   ├── TournamentList.tsx        # 赛事列表
│   │   ├── TournamentDetail.tsx      # 赛事详情（含日历扩展）
│   │   ├── TeamBuilder.tsx           # 分队结果展示
│   │   └── HeroPickPanel.tsx         # 英雄选择面板
│   └── ui/                    # 通用 UI 组件
│       ├── Toast.tsx           # 消息提示
│       └── CalendarModal.tsx   # 日历时间选择器
│
├── lib/                       # 服务端库
│   ├── auth.ts                # 密码哈希 + requireAuth
│   ├── session.ts             # iron-session 配置 (wzyt_session, 90天)
│   ├── db.ts                  # Prisma 客户端单例
│   ├── permissions.ts         # 权限守卫 (requireSuperAdmin / requireTournamentAdmin)
│   ├── anti-bot.ts            # 反爬：5 UA 轮换 + 指数退避重试
│   ├── redis.ts               # Redis 缓存：get/set/del/hash, 1h TTL, 静默降级
│   ├── gicp.ts                # 官方 GICP API 客户端（MD5 签名）
│   ├── split.ts               # 分队算法核心
│   ├── heroes/
│   │   ├── sync.ts            # 英雄数据同步（爬虫 + GICP）
│   │   └── download-images.ts # 英雄/皮肤图片下载
│   ├── equipment/
│   │   └── sync.ts            # 装备数据同步
│   ├── monitor/
│   │   └── index.ts           # 轻量监控（新闻/英雄/皮肤/技能/装备）
│   └── sse/
│       └── heroes.ts          # SSE 广播（英雄同步进度推送）
│
├── themes/                    # 主题系统
│   ├── types.ts               # ThemeId / ThemeColors / ThemeConfig
│   ├── ThemeProvider.tsx       # 主题 Context Provider
│   └── ui-config.ts           # UI 配置（导航模式、Dock、Header 高度）
│
├── app/                       # Next.js App Router 页面与 API
│   ├── layout.tsx             # 根布局（字体、元数据、主题初始化）
│   ├── template.tsx           # 页面切换过渡动画（key={pathname}）
│   ├── loading.tsx            # 全局加载态
│   ├── not-found.tsx          # 自定义 404
│   ├── sitemap.ts             # SEO 站点地图
│   ├── page.tsx               # 首页
│   ├── heroes/                # 英雄图鉴 + 详情
│   ├── equipment/             # 装备图鉴 + 详情
│   ├── tournaments/           # 赛事列表 + 详情（含分队）
│   ├── me/                    # 个人空间
│   ├── login/                 # 登录
│   ├── register/              # 注册
│   ├── changelog/             # 更新日志
│   ├── monitor/               # 监控页面
│   ├── admin/                 # 后台（独立 layout，无 Header/Dock）
│   ├── debug/                 # 调试面板（仅需登录）
│   ├── m/                     # 移动端路由（re-export 主路由页面）
│   └── api/                   # API 路由（详见第 6 节）
│
├── middleware.ts              # 认证守卫 + 移动端 UA 重定向
```

---

## 4. 引擎层 (`src/engine/`)

引擎层是全项目共享的基础库，6 个文件统一从 `index.ts` 导出。

### 4.1 `constants.ts` — 常量

| 模块 | 内容 |
|------|------|
| `ROLES` | `["top", "jungle", "mid", "adc", "support"]` 五路分路常量 |
| `ROLE_LABELS` / `ROLE_COLORS` / `ROLE_BADGES` | 分路中文标签、颜色、徽章对象 |
| `CLASS_LABELS` / `CLASS_COLORS` / `CLASS_BADGES` | 职业（战士/法师/坦克/刺客/射手/辅助）标签、颜色、徽章 |
| `CLASS_TO_LANE` | 职业 → 默认分路映射 |
| `ROLE_FILTERS` / `CLASS_FILTERS` | 英雄列表筛选器选项 |
| `STAT_SHORT_LABELS` / `STAT_LONG_LABELS` | 属性短/长中文标签 |
| `STAT_PCT_KEYS` | 百分号属性键集合 |
| `DISPLAY_STATS` | 英雄详情默认展示的 8 个属性 |
| `TIER_LABELS` / `TIER_FILTERS` | 装备三级分级 |
| `CHAR_TAGS` / `CHAR_COLORS` | 装备特性标签及颜色 |

### 4.2 `types.ts` — 类型定义

| 类型 | 用途 |
|------|------|
| `HeroMeta` | 英雄元数据（称号、职业、图片、命格） |
| `HeroListItem` | 英雄列表项（含扁平化兼容字段） |
| `HeroSkill` | 英雄技能（名称/CD/消耗/描述/extraJson） |
| `HeroDetail` | 英雄详情（含 stats + effects + skills） |
| `EquipMeta` | 装备元数据（价格、等级、类型） |
| `EquipListItem` | 装备列表项 |
| `EquipDetail` | 装备详情（含 15 项属性和被动效果） |
| `SkillEffect` | 技能效果（伤害/护盾/治疗 + 加成 + 控制） |
| `PassiveEffect` | 被动效果（名称、描述、唯一性） |
| `DamageBonus` | 伤害加成（属性类型 + 比率） |
| `SkillPlugin` / `SkillInput` / `SkillOutput` | 技能管道类型 |

### 4.3 `data.ts` — 数据计算

- **`STAT_DEFS`** (15 键)：物理攻击、法术攻击、物理防御、法术防御、最大生命、最大法力、冷却缩减、攻击速度、移动速度、暴击率、物理吸血、物理穿透、法术穿透、物理穿透率、法术穿透率
- **`buildEquipmentStats()`**：装备属性 → `{ stat, value }[]`
- **`computeTier()`**：根据价格和名称计算装备等级
  - 名字含 `·` → 三级
  - total_price <= 400 → 一级
  - total_price <= 2000 → 二级
  - 其余 → 三级
- **`computeTags()`**：根据 item_type 和属性值生成特性标签
- **`parsePassives()`**：从 des2 文本正则提取被动效果列表
- **`parseSkillDamage()`**：正则解析技能描述中的伤害/护盾/治疗/控制，区分物理/法术/真实
- **`processSkill()`**：插件化加工技能数据，默认启用 `damageParserPlugin`

### 4.4 `animation.ts` — 动画预设

| 导出 | 用途 |
|------|------|
| `EASE_BOUNCE` / `EASE_OUT` / `EASE_IN` / `EASE_SMOOTH` | 缓动曲线 |
| `DUR_FAST` (0.12s) / `DUR_NORMAL` (0.2s) / `DUR_SLOW` (0.3s) / `DUR_PAGE` (0.4s) | 时长常量 |
| `GLASS_CARD` / `GLASS_SHADOW_TOP` / `GLASS_SHADOW_BOTTOM` | 毛玻璃卡片样式 |
| `cardStagger(index)` | 列表卡片错峰入场 |
| `childStagger(index)` | 子项错峰出入 |
| `pageEnter(stagger)` | 页面入场动画 |
| `BTN_TRANSITION` / `BTN_BOUNCE` / `BTN_PRESS` / `BTN_RELEASE` | 按钮反馈 |
| `dockPanel(isOpen)` | Dock 弹出面板动画 |

### 4.5 `combat.ts` — 伤害公式引擎

核心公式（社区验证版）：

```
免伤率 = 有效抗性 / (602 + 有效抗性)
有效抗性 = (总抗性 - 固定穿透) × (1 - 百分比穿透)  // 先固后百分比
最终伤害 = 攻击力 × 602 / (602 + 有效抗性)
```

| 导出 | 用途 |
|------|------|
| `HERO_STAT_PROFILES` | 按职业的默认属性模板 + 成长曲线（战士/法师/坦克/刺客/射手/辅助） |
| `calcFinalStats(base, growth, level, equips)` | 计算 15 级带装备的最终属性 |
| `calcSkillDamage({skill, stats, target})` | 计算单个技能伤害（含暴击、穿透、被动增幅/免伤） |
| `calcSkillDamageMulti()` | 批量计算多目标伤害 |
| `calcComboDamage({skills, stats, target})` | 计算技能连招总伤害 |

---

## 5. Hooks

### 5.1 `useAuth()`

```ts
function useAuth(): {
  user: { userId: number; username: string; role?: string; avatar?: string | null } | null;
  loaded: boolean;
  logout: () => Promise<void>;
}
```

挂载时调用 `GET /api/auth/me` 获取当前用户并检查封禁状态。`logout()` 调用 `POST /api/auth/logout` 后重定向到 `/login`。

### 5.2 `useAnnouncements(full?)`

```ts
function useAnnouncements(full?: boolean): {
  announcements: Announcement[];
  loaded: boolean;
  latestVersion: string | null;
}
```

- `full=false`：获取摘要列表（title + brief + date + slug）
- `full=true`：获取详情列表（含 content）
- `latestVersion`：取第一条带 version 字段的公告

### 5.3 `useHeroes(roleType?, heroType?)`

```ts
function useHeroes(roleType?: string, heroType?: string): {
  heroes: HeroListItem[];
  loading: boolean;
  error: boolean;
  refetch: () => void;
}
```

支持按分路和职业筛选，参数变化自动重新请求 `GET /api/heroes`。

### 5.4 `useHero(heroId)`

```ts
function useHero(heroId: string | number): {
  hero: HeroDetail | null;  // 含 stats + effects + skills
  loading: boolean;
  refetch: () => void;
}
```

### 5.5 `useEquipment()`

```ts
function useEquipment(): {
  items: EquipListItem[];
  loading: boolean;
  error: boolean;
  refetch: () => void;
}
```

### 5.6 `useEquipmentItem(itemId)`

```ts
function useEquipmentItem(itemId: string | number): {
  item: EquipDetail | null;
  loading: boolean;
  refetch: () => void;
}
```

### 5.7 `useRolePreferences()`

最复杂的 Hook，管理用户分路偏好和英雄战力。返回约 20 个状态和方法：

```ts
function useRolePreferences(): {
  prefs: Pref[];                                // 5 路偏好数组
  heroesByRole: Record<string, HeroEntry[]>;    // 按分路的英雄列表
  sharedRank: number;                           // 通用段位
  activeTab: string;                            // 当前 tab
  selHero / selHeroName / selPower: string;    // 当前选择
  saving: boolean;                              // 保存中
  animatingIdx: number | null;                  // FLIP 动画索引
  setActiveTab / setSelHero / setSelHeroName / setSelPower: setters;
  moveUp(i) / moveDown(i): void;                // 偏好排序（含 FLIP 动画）
  setSharedRankAndSync(r): void;                // 设置通用段位并同步
  setPeakScore(role, s) / setPeakRank(role, r): void;
  savePrefs(onSuccess, onError): void;           // 保存偏好到 API
  addHero(role, onSuccess, onError): void;       // 添加英雄战力
  removeHero(id, role, onSuccess): void;         // 删除英雄战力
};
```

---

## 6. API 路由

所有 API 路由均使用 `force-dynamic`，运行在 App Router Route Handlers 中。

### 6.1 认证 (`/api/auth/`)

| 方法 | 路由 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 注册（username + password） |
| POST | `/api/auth/login` | 登录（创建 session，检查 banned） |
| POST | `/api/auth/logout` | 登出（销毁 session） |
| GET | `/api/auth/me` | 获取当前用户（验证存在 + 封禁检查） |
| GET | `/api/auth/security-question` | 获取指定用户的安全问题（用于忘记密码） |
| POST | `/api/auth/reset-password` | 验证安全问题答案 + 重置密码 |
| POST | `/api/auth/change-password` | 已登录用户修改密码（需验证旧密码） |

### 6.2 英雄 (`/api/heroes`)

| 方法 | 路由 | 说明 |
|------|------|------|
| GET | `/api/heroes` | 英雄列表（支持 `role_type` / `hero_type` 筛选），Redis 缓存 1h |
| GET | `/api/heroes/[id]` | 英雄详情（含 skills + effects），Redis 缓存 1h |
| POST | `/api/heroes` | 触发全量同步（超管 only） |
| PUT | `/api/heroes/[id]` | 更新英雄分路（超管 only，写入 hero_lane_overrides） |
| GET | `/api/heroes/watch` | SSE 端点（同步进度推送） |

### 6.3 装备 (`/api/equipment`)

| 方法 | 路由 | 说明 |
|------|------|------|
| GET | `/api/equipment` | 装备列表，Redis 缓存 1h |
| GET | `/api/equipment/[id]` | 装备详情（含 15 项属性 + 被动），Redis 缓存 1h |

### 6.4 赛事 (`/api/tournaments`)

| 方法 | 路由 | 说明 |
|------|------|------|
| GET | `/api/tournaments/public` | 公开赛事列表（无需登录） |
| POST | `/api/tournaments` | 创建赛事（6 位随机 code） |
| GET | `/api/tournaments/[id]` | 赛事详情 |
| PUT | `/api/tournaments/[id]` | 更新赛事 |
| DELETE | `/api/tournaments/[id]` | 删除赛事（owner only） |
| POST | `/api/tournaments/[id]/join` | 加入赛事 |
| POST | `/api/tournaments/[id]/leave` | 退出赛事 |
| POST | `/api/tournaments/[id]/split` | 执行分队 |
| POST | `/api/tournaments/[id]/kick` | 踢出玩家（admin only） |
| POST | `/api/tournaments/[id]/extend` | 延长报名截止时间 |
| GET/PUT/DELETE | `/api/tournaments/[id]/admin` | 管理员 CRUD |
| POST | `/api/tournaments/[id]/admin/resign` | 管理员辞职 |
| POST | `/api/tournaments/join-by-code` | 通过房间 code 加入 |
| GET/PUT | `/api/tournaments/[id]/picks` | 英雄选择（分队后） |
| POST | `/api/tournaments/[id]/temp-application` | 申请临时席位 |
| PUT/DELETE | `/api/tournaments/[id]/temp-application/[appId]` | 审批临时申请 |
| POST | `/api/tournaments/[id]/temp-player` | 直接添加临时玩家（admin only） |

### 6.5 用户 (`/api/users/me` 和 `/api/me`)

| 方法 | 路由 | 说明 |
|------|------|------|
| GET | `/api/users/me/roles` | 获取分路偏好 |
| PUT | `/api/users/me/roles` | 保存分路偏好 |
| GET | `/api/users/me/heroes` | 获取英雄战力列表 |
| POST | `/api/users/me/heroes` | 添加英雄战力 |
| DELETE | `/api/users/me/heroes` | 删除英雄战力 |
| POST | `/api/me/avatar` | 上传头像（FormData, jpg/png/webp <2MB） |
| GET | `/api/avatars/[filename]` | 读取头像（公开, Cache-Control 24h） |

### 6.6 后台 (`/api/admin/`)

| 方法 | 路由 | 说明 |
|------|------|------|
| GET | `/api/admin/users` | 用户列表（超管） |
| PATCH | `/api/admin/users/[id]` | 封禁/解封/修改角色（超管，admin 不可操作） |
| DELETE | `/api/admin/users/[id]` | 删除用户（超管，admin 不可操作） |
| GET | `/api/admin/stats` | 仪表盘统计（用户数/赛事数/英雄数） |
| GET | `/api/admin/settings` | 获取爬取配置 |
| PUT | `/api/admin/settings` | 保存爬取配置 |
| GET | `/api/admin/sync-status` | 同步进度查询（前端轮询） |
| GET | `/api/admin/tournaments` | 所有赛事列表（超管） |
| DELETE | `/api/admin/tournaments?id=X` | 删除赛事（超管） |
| POST | `/api/admin/announcements` | 创建公告 |
| PUT | `/api/admin/announcements?id=X` | 更新公告 |
| DELETE | `/api/admin/announcements?id=X` | 删除公告 |

### 6.7 其他公开 API

| 方法 | 路由 | 说明 |
|------|------|------|
| GET | `/api/announcements` | 公告列表（支持 `?full=true`） |
| GET | `/api/announcements/[id]` | 公告详情 |
| GET | `/api/changelog` | 更新日志列表 |
| GET | `/api/official-news` | 官方新闻（GICP API 代理 + 缓存） |

---

## 7. 认证与中间件

### 7.1 Session 机制

- **库**：iron-session，Cookie-based 加密 session
- **Cookie 名**：`wzyt_session`
- **有效期**：90 天
- **SessionData**：`{ userId, username, role }`
- **安全**：生产环境 `secure: true`

### 7.2 中间件路由守卫

`src/middleware.ts` 按以下优先级处理请求：

1. **静态文件放行**：`/_next`, `/favicon`, `/public`, `/robots.txt`, `/sitemap.xml`
2. **API 路由**：检查是否为公开 API，非公开 API 需验证 session cookie（无 cookie 返回 401）
3. **移动端重定向**：检测 UA 中的移动设备标识 → 307 重定向到 `/m` 路由
4. **页面认证**：受保护路由（`/me`, `/admin`）无 session 时重定向到 `/login?redirect=原路径`

### 7.3 公开路径

| 类型 | 路径 |
|------|------|
| 页面 | `/`, `/login`, `/register`, `/heroes`, `/tournaments`, `/equipment`, `/changelog`, `/monitor`, `/debug` |
| API | `/api/auth/*`, `/api/official-news`, `/api/announcements`, `/api/changelog`, `/api/tournaments/public`, `/api/heroes`, `/api/equipment` |

### 7.4 自定义 404

`/src/app/not-found.tsx`：全屏居中 "404 页面不存在" + 返回首页按钮。

---

## 8. 数据同步

### 8.1 英雄同步 (`src/lib/heroes/sync.ts`)

**数据源**：
- 列表页：`https://pvp.qq.com/web201605/herolist.shtml`（HTML） + `herolist.json`
- 详情页：`https://pvp.qq.com/web201605/herodetail/{id}.shtml`（数字页优先）或拼音页
- 图片：`https://game.gtimg.cn/images/yxzj/img201606/heroimg/{id}/{id}.jpg`

**流程**：
1. 从 herolist.json 获取英雄列表（id + name + title + hero_type + skin_name）
2. 逐个请求详情页 HTML，解析技能（名称/CD/消耗/描述）、皮肤、基础属性
3. 计算 dataHash（skillsJson + skinsJson 的 MD5）判断是否需要更新
4. 技能走 pipeline 加工 → `extraJson.damage`
5. 命格检测：仅爬虫发现时才更新，不清除已有命格数据
6. 同步 hero_skills 拆表记录
7. 广播 SSE 变更通知

**配置**：所有爬取 URL 可通过 `/admin/settings` 动态配置，存储在 `KvCache key: config:crawl_urls`。

### 8.2 装备同步 (`src/lib/equipment/sync.ts`)

**数据源**：`https://pvp.qq.com/web201605/js/item.json`

**流程**：
1. 从 item.json 获取装备列表
2. 解析 des1（属性）→ 列存 atk/ap/def/... 共 11 项
3. 解析 des2（被动）→ passiveJson
4. 调用引擎 `computeTier()` + `computeTags()` + `buildEquipmentStats()` 计算分级/标签/属性
5. 写入 extraJson

### 8.3 监控系统 (`src/lib/monitor/index.ts`)

**触发**：node-cron 每 3 分钟执行一次 `runAllMonitors()`

**检测模块**：

| 模块 | 检测方式 | 变更处理 |
|------|---------|---------|
| news | GICP API 第一条标题对比 kv_cache | 清除官方新闻缓存 |
| heroes | herolist.json count + name 指纹 + 采样 | 触发全量英雄同步 + 图片下载 |
| skins | 每 5 个英雄抽样 skin_name 对比 | 触发全量英雄同步 |
| skills | 50% 随机抽样，完整爬取技能 + 皮肤计算 dataHash | 触发全量英雄同步 |
| items | item.json MD5 对比 | 触发装备同步 |

### 8.4 反爬机制 (`src/lib/anti-bot.ts`)

- **5 个 UA 轮换**：Chrome/Windows, Chrome/Mac, Firefox, Chrome/Linux
- **指数退避**：403/429/503 → 等待 (尝试次数+1)x3s + 随机 0-2s
- **最多 5 次重试**，全部失败后返回错误而非抛异常了

### 8.5 GICP API (`src/lib/gicp.ts`)

官方游戏社区接口，用于获取新闻：
- URL：`https://apps.game.qq.com/cmc/cross`
- 认证：MD5(PC_TOKEN + SOURCE + SERVICE_ID + timestamp) 签名
- 频道：hot(1760) / news(1761) / announcement(1762) / event(1763) / esports(1764)

---

## 9. 分队算法 (`src/lib/split.ts`)

算法分两阶段，专为 5v5 设计（必须 10 人）。

### 阶段一：分路分配（Role Assignment）

- 生成所有可能的分路组合：将 10 人分配到 5 路，每路 2 人（所有排列）
- 理论组合数：C(10,2)×C(8,2)×C(6,2)×C(4,2)×C(2,2) = 113,400 种

### 阶段二：队伍分配（Team Split）

- 对每种分路组合，生成红蓝两队（每路各 1 人）：32 种变体（2^5 掩码枚举）
- 对每种分配计算 battle strength（基于英雄战力 + peak score + 段位）

### 评分权重

| 权重 | 名称 | 值 | 说明 |
|------|------|-----|------|
| W_PREF | 偏好得分 | 500 | rank 1=5pts, rank 2=4pts... 主力分路额外+3 |
| W_COVER | 段位覆盖 | 50 | 有段位的玩家数 |
| W_STRENGTH | 实力均衡 | 15 | 两队总实力差取负 |
| W_RANK | 段位均衡 | 30 | 两队段位和差取负 |
| W_FAIRNESS | 公平惩罚 | 200 | 4th/5th 选择 + 无英雄战力分路惩罚 |

**实力计算**：
```
strength = (英雄战力 top3 平均 / 30) + (peak score / 7) + (roleRank * 15) + (peakRank * 10)
```

### 返回结果

```ts
interface SplitResult {
  teamRed: { userId: number; roleType: string }[];
  teamBlue: { userId: number; roleType: string }[];
  score: number;           // 综合评分
  strengthDiff: number;    // 实力差
  preferenceScore: number;  // 偏好得分
  rankDiff: number;        // 段位差
  rankCoverage: number;    // 段位覆盖
}
```

---

## 10. 双主题系统

### 10.1 主题切换

通过 URL hash 驱动：`#1` = 演武主题，`#2` = 厚玻璃主题。所有内部链接自动保留当前 hash。

| 特性 | 演武 #1 | 厚玻璃 #2 |
|------|---------|-----------|
| 定位 | 桌面主力 | 移动主力 + 桌面可选 |
| 基底色 | 石板灰 `#161920` | 浅灰 `#efeff2` |
| 强调色 | 暖铜金 `#a89068` | 系统蓝 `#4488f0` |
| 卡片风格 | 暗琉璃（顶部微光） | 厚毛玻璃（blur 28px + 多层阴影） |
| 圆角 | 6px | 16px |
| Dock | 仅移动端 | 桌面 + 移动端 |

### 10.2 技术实现

- **`ThemeProvider`**：Context 提供 `{ theme }` 值，`useLayoutEffect` 中设置 `data-theme` 属性
- **CSS 变量隔离**：所有颜色变量作用域在 `[data-theme]` 下，无全局污染
- **防 FOUC**：`<head>` 内联脚本在 DOM 渲染前读取 hash 设置 `data-theme`
- **`ThemeLayout`**：页面布局容器，注入 CSS 变量和应用全局样式
- **`ThemeColors`** 类型：bgRoot / bgNav / bgCard / border / text / gold / red / blue / green 等 20+ 色值

### 10.3 UI 配置 (`themes/ui-config.ts`)

- `UIConfig`：控制 headerNav 模式（full/compact）、mobileNav 模式（hamburger/dock）、dock 开关、header 高度
- `getUIConfig(theme?)`：根据主题 ID 返回对应 UI 配置

---

## 11. 权限模型

### 11.1 角色定义

| 角色 | 权限 |
|------|------|
| `admin` | 后台全功能：用户管理、赛事管理、英雄分路修正、系统设置、数据同步触发。前台 Header 显示「后台管理」入口 |
| `user` | 前台功能：英雄/装备图鉴、赛事参与（创建/加入/分队）、个人空间（分路偏好/英雄战力/头像）、调试面板 |

### 11.2 权限守卫 (`src/lib/permissions.ts`)

- **`requireSuperAdmin()`**：调用 `requireAuth()` 后检查 `role === "admin"`，否则抛出 `FORBIDDEN`
- **`requireTournamentAdmin(tournamentId)`**：检查用户是否属于该赛事的 tournament_admins 表（owner 或 co_owner）
- **`requireAuth()`**：验证 session 存在 + 用户未删除 + 未被封禁，被封禁用户抛 `BANNED`

### 11.3 Admin 账户保护

- 内置 admin 账号（`admin / admin12345678`）受保护
- 前端隐藏 admin 用户的封禁/删除按钮
- API 层 `PATCH/DELETE /api/admin/users/[id]` 拒绝操作 role="admin" 的用户
- 安全问题：`系统内置管理员` / `admin`

---

## 12. 数据库

### 12.1 数据库信息

- 数据库名称：`yanwutang_test`
- 生产数据库：`yanwutang`
- 位置：MySQL 8 @ `38.22.234.148:3306`

### 12.2 表结构概览

| 表 | 主要字段 | 说明 |
|---|---------|------|
| `users` | id, username, password_hash, role, avatar, banned, security_question, security_answer_hash | 用户（级联删除关联数据） |
| `heroes` | id, hero_id, name, title, role_type, hero_type, hero_type2, image_url, skins_json, skills_json, data_hash, mingge, mingge_name, mingge_related_id, base_json | 英雄数据 |
| `hero_skills` | id, hero_id, skill_index, name, cd, cost, desc, damage_type, data_hash, extra_json | 技能拆表（skillIndex: 0=被动, 1-4=主动） |
| `hero_lane_overrides` | hero_id (PK), role_type | 手动分路修正（同步不覆盖） |
| `equipment` | id, item_id, name, price, atk~lifesteal(11列), passive_json, components, data_hash, extra_json | 装备数据 |
| `tournaments` | id, code, name, deadline, status, is_public, announcement, split_result | 赛事 |
| `tournament_players` | id, tournament_id, user_id, role_type, is_temporary, is_spectator, temp_name | 参赛者 |
| `tournament_admins` | id, tournament_id, user_id, role (owner/co_owner) | 赛事管理员 |
| `tournament_picks` | id, tournament_id, user_id, team, role_type, hero_id, equip_json | 英雄选择 |
| `temp_player_applications` | id, tournament_id, applicant_id, temp_name, status | 临时席位申请 |
| `role_preferences` | id, user_id, role_type, preference_rank, role_rank, peak_score, peak_rank | 分路偏好 |
| `hero_powers` | id, user_id, role_type, hero_id, hero_name, power_score | 用户英雄战力 |
| `announcements` | id, title, version, brief, content, slug, published | 系统公告 |
| `kv_cache` | key (PK), value | 键值缓存（配置/进度/监控指纹） |
| `admin_operations` | id, tournament_id, admin_id, action, target_id | 操作审计日志 |

### 12.3 关系图

```
User 1──* RolePreference        User 1──* HeroPower
User 1──* TournamentPlayer      User 1──* TournamentAdmin
User 1──* TempPlayerApplication User 1──* AdminOperation

Tournament 1──* TournamentPlayer        Tournament 1──* TournamentAdmin
Tournament 1──* TempPlayerApplication   Tournament 1──* AdminOperation
Tournament 1──* TournamentPick

Hero 1──* HeroSkill
Hero 1──1 HeroLaneOverride
```

### 12.4 级联删除

- `User` 删除 → 级联删除所有 role_preferences, hero_powers, tournament_players, tournament_admins, temp_applications
- `Tournament` 删除 → 级联删除所有 players, admins, applications, operations, picks
- `Hero` 删除 → 级联删除所有 hero_skills
- `AdminOperation` 中的 admin → `onDelete: Restrict`（管理员不可直接删除）

---

## 13. 前端页面

| 路由 | 页面 | 说明 | 登录要求 |
|------|------|------|---------|
| `/` | 首页 | 公告展示 + 登录入口 + 参赛入口 | 否 |
| `/login` | 登录 | 登录/注册表单 + 忘记密码流程 + 玻璃碎裂动画 | 否 |
| `/register` | 注册 | 独立注册页面 | 否 |
| `/heroes` | 英雄图鉴 | 搜索 + 分路/职业筛选 + 命格切换 + 基础属性表 | 否 |
| `/heroes/[id]` | 英雄详情 | 技能列表 + 伤害数据（含加成）+ 被动 + 命格详情/切换 | 否 |
| `/equipment` | 装备图鉴 | 搜索 + 等级/特性筛选 | 否 |
| `/equipment/[id]` | 装备详情 | 属性值 + 被动效果 + 合成路径 | 否 |
| `/tournaments` | 赛事列表 | 公开赛事 + 我的赛事 + 创建/加入（code） | 参与需登录 |
| `/tournaments/[id]` | 赛事详情 | 参赛者列表 + 分队结果（TeamBuilder）+ 英雄选择（HeroPickPanel）+ 日历扩展 + 管理员面板 | 参与需登录 |
| `/me` | 个人空间 | AvatarUpload + RolePreferenceEditor + HeroPowerEditor | 是 |
| `/changelog` | 更新日志 | 公告列表 | 否 |
| `/changelog/[slug]` | 日志详情 | 单篇公告全文 | 否 |
| `/monitor` | 监控面板 | 监控事件实时展示（SSE）+ 手动触发检查 | 否 |
| `/admin` | 仪表盘 | 用户数/赛事数/英雄数统计卡片 | admin |
| `/admin/users` | 用户管理 | 封禁/解封/删除（admin 不可操作） | admin |
| `/admin/tournaments` | 房间管理 | 查看所有赛事 + 删除 | admin |
| `/admin/heroes` | 英雄分路 | 分路修正编辑器（实时保存，同步不覆盖） | admin |
| `/admin/settings` | 系统设置 | 爬取地址配置 + 手动同步触发 + 进度条 | admin |
| `/admin/announcements` | 公告管理 | 创建/编辑/删除公告 | admin |
| `/debug` | 调试面板 | 陀螺仪测试/登录动画测试/光球颜色调试 | 登录即可 |
| `/m/*` | 移动端路由 | 全部 re-export 主路由页面 + 移动端布局 | 同对应页面 |

### 13.1 移动端路由

`src/middleware.ts` 检测移动端 UA → 307 重定向到 `/m` 路径。`/m` 下所有页面通过 re-export 复用主路由的同名 `page.tsx`。`/m/admin/*`、`/m/debug/*` 同步 re-export。移动端使用独立 layout（Dock 导航 + 移动端 Header）。

### 13.2 页面动画

`src/app/template.tsx`：全局页面切换过渡，`key={pathname}` 确保每次导航重播淡入 + 上移动画（opacity 0→1, translateY 6→0, 0.18s ease-out）。

---

## 14. 关键文件索引

| 文件 | 用途 |
|------|------|
| `src/middleware.ts` | 认证守卫 + 移动端重定向 + API 保护 |
| `src/lib/session.ts` | iron-session 配置 |
| `src/lib/auth.ts` | 密码哈希 + requireAuth |
| `src/lib/db.ts` | Prisma 单例 |
| `src/lib/permissions.ts` | requireSuperAdmin + requireTournamentAdmin |
| `src/lib/split.ts` | 分队算法（113,400 组合枚举 + 加权评分） |
| `src/lib/heroes/sync.ts` | 英雄爬虫（cheerio + GBK + 反爬） |
| `src/lib/equipment/sync.ts` | 装备爬虫（item.json 解析） |
| `src/lib/monitor/index.ts` | 监控系统（5 模块 + 自动触发同步） |
| `src/lib/anti-bot.ts` | 反爬机制（5 UA + 指数退避） |
| `src/lib/gicp.ts` | GICP 官方 API 客户端 |
| `src/lib/redis.ts` | Redis 缓存工具（1h TTL, 静默降级） |
| `src/lib/sse/heroes.ts` | SSE 广播 |
| `src/engine/data.ts` | 装备分级/标签/被动/技能伤害解析 |
| `src/engine/combat.ts` | 伤害公式引擎 |
| `src/engine/animation.ts` | 动画预设 |
| `src/themes/ThemeProvider.tsx` | 主题 Provider |
| `src/app/template.tsx` | 页面切换过渡 |
| `src/app/layout.tsx` | 根布局 |
| `src/app/sitemap.ts` | SEO 站点地图 |
| `prisma/schema.prisma` | 数据库 Schema |
| `scripts/cron.ts` | Cron 定时任务入口 |
| `scripts/deploy.sh` | 部署脚本 |
