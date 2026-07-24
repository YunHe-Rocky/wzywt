# 王者演武堂 -- 技术文档 V2.0.1

> 王者荣耀 5v5 内战分队系统。Next.js 14 全栈应用，综合分路/段位/偏好/英雄战力自动均衡分队。
> 当前版本 2026年7月

---

## 一、项目概述

王者演武堂是一个为王者荣耀玩家提供 5v5 内战自动分队服务的全栈 Web 应用。核心功能包括：

- **玩家档案**：段位设置、五路偏好排序、英雄战力管理
- **房间系统**：创建赛事房间、加入码/公开招募、临时玩家申请
- **智能分队**：四层权重算法自动将 10 名玩家分为红蓝两队
- **英雄图鉴**：119+ 英雄数据爬取，含技能、皮肤、基础属性、命格
- **装备图鉴**：全装备数据入库，含属性、被动效果、合成路径
- **后台管理**：用户管理、赛事管理、英雄分路管理、系统设置
- **官方资讯**：GICP 游戏社区平台接口获取官方新闻

---

## 二、技术栈详情

| 层级 | 技术 | 版本 | 用途 |
|------|------|------|------|
| 框架 | Next.js | 14.2.35 | App Router 全栈框架，全部 API 使用 `force-dynamic` |
| 语言 | TypeScript | 5.9.3 | 严格模式类型检查 |
| 样式 | Tailwind CSS | 3.4.18 | 原子化 CSS + CSS 变量双主题 |
| CSS | CSS Variables | -- | globals.css 1312 行，`@layer base/components` 双层架构 |
| 数据库 | MySQL | 8.x | 远程 `38.22.234.148:3306`，数据库名 `yanwutang_test` |
| ORM | Prisma | 5.22.0 | Schema 定义 + 迁移 + 类型化客户端 |
| 认证 | iron-session | 8.0.4 | Cookie session，90 天有效期 |
| 密码 | bcryptjs | 3.0.3 | 10 轮哈希 |
| HTML 解析 | cheerio | 1.2.0 | 爬取官方英雄详情页 |
| 编码转换 | iconv-lite | 0.7.2 | GBK/UTF-8 自动检测与解码 |
| 队列调度 | node-cron | 4.5.0 | 定时任务（3分钟监控 / 整点截止检查 / 每日同步） |
| 实时推送 | SSE | -- | 原生 Server-Sent Events，英雄数据变更广播 |
| 进程守护 | PM2 | -- | `yanwutang-web` + `yanwutang-cron` 双进程 |
| SSL | acme.sh + Let's Encrypt | -- | 免费 HTTPS 证书自动续期 |
| 缓存 | Redis | ioredis 5.11.1 | 1h TTL 缓存层，silent fallback |
| 拼音 | pinyin | 4.0.0 | 英雄搜索拼音匹配 |
| 浏览器模拟 | playright | 1.61.1 | 安装用于反爬兜底（未直接调用） |
| 并发 | concurrently | 10.0.3 | `dev:all` 同时启动 Web + Cron |
| 运行时 | tsx | 4.22.4 | TypeScript 脚本执行器 |

---

## 三、引擎层详解（`src/engine/`）

引擎层是前端与 API 共用的无副作用逻辑层，`package.json` 中通过 `@/engine` 别名引用 `src/engine/index.ts`。

### 3.1 常量（`constants.ts`）

| 常量 | 类型 | 说明 |
|------|------|------|
| `ROLES` | `readonly tuple` | `["top", "jungle", "mid", "adc", "support"]` |
| `ROLE_LABELS` | `Record<string, string>` | 对抗路/打野/中路/发育路/游走 |
| `ROLE_COLORS` | `Record<string, string>` | 五路专属色彩 |
| `ROLE_BADGES` | `Record<string, {label, color}>` | 标签组件数据 |
| `CLASS_LABELS` | `Record<number, string>` | 1-6 对应战士/法师/坦克/刺客/射手/辅助 |
| `CLASS_COLORS` | `Record<number, string>` | 职业色彩 |
| `CLASS_TO_LANE` | `Record<number, string>` | 职业到分路映射 |
| `ROLE_FILTERS` / `CLASS_FILTERS` | array | 下拉筛选选项 |
| `STAT_SHORT_LABELS` / `STAT_LONG_LABELS` | records | 属性短/长中文标签 |
| `STAT_PCT_KEYS` | `Set<string>` | 百分比单位的属性键集合 |
| `DISPLAY_STATS` | `readonly tuple` | 装备卡片显示属性列表 |
| `TIER_LABELS` / `TIER_FILTERS` | records | 装备等级（一级/二级/三级） |
| `CHAR_TAGS` / `CHAR_COLORS` | records | 装备特性标签（物理/法术/防御等） |

### 3.2 属性与装备（`data.ts`）

**STAT_DEFS**（15 键属性定义）：

| 键 | 中文 | 单位 | 键 | 中文 | 单位 |
|----|------|------|----|------|------|
| `atk` | 物理攻击 | fixed | `cdReduce` | 冷却缩减 | percent |
| `ap` | 法术攻击 | fixed | `atkSpeed` | 攻击速度 | percent |
| `def` | 物理防御 | fixed | `moveSpeed` | 移动速度 | percent |
| `mdef` | 法术防御 | fixed | `critRate` | 暴击率 | percent |
| `hp` | 最大生命 | fixed | `lifesteal` | 物理吸血 | percent |
| `mp` | 最大法力 | fixed | `armorPen` | 物理穿透 | fixed |
| | | | `magicPen` | 法术穿透 | fixed |
| | | | `armorPenPct` | 物理穿透率 | percent |
| | | | `magicPenPct` | 法术穿透率 | percent |

**核心函数**：

| 函数 | 说明 |
|------|------|
| `buildEquipmentStats(equip)` | 将 11 个数值属性转为 `{stat, value}[]` 数组，过滤值为 0 的项 |
| `computeTier(price, name, itemType?)` | 价格分段：`<=400` 一级，`<=2000` 二级，`>2000` 或含`·`为三级，移速装备特殊处理 |
| `computeTags(itemType, stats)` | 装备标签自动生成：itemType 映射大类别 + 有值属性映射子标签 |
| `parsePassives(des2)` | 正则解析装备被动效果：`(唯一)?被动[-名称]?: 描述`，去重，默认命名 |
| `parseSkillDamage(desc, damageType?)` | 正则提取技能伤害公式：基础值（`/`分隔等级）+ 加成（`+X%物理攻击`等）+ 护盾/治疗/CC |
| `processSkill(skill)` | 插件化技能加工管道，`damageParserPlugin` 解析伤害数据写入 `extraJson` |

### 3.3 伤害公式引擎（`combat.ts`）

基于社区验证的王牌荣耀伤害公式（NGA/官方WIKI）：

```
免伤率 = 有效抗性 / (602 + 有效抗性)
有效抗性 = (总抗性 - 固定穿透) * (1 - 百分比穿透)    // 先固后百分比
最终伤害 = 攻击力 * 602 / (602 + 有效抗性)
暴击伤害 = 基础伤害 * 暴击效果(默认200%)
真实伤害 = 无视抗性
```

**核心函数**：

| 函数 | 说明 |
|------|------|
| `calcFinalStats(base, growth, level, equips)` | 1-15级属性计算，含装备加成、穿透、冷却上限40% |
| `calcSkinDamage({skill, stats, target, level?, critRate?, dmgAmp?, dmgReduce?})` | 单技能对人伤害 |
| `calcSkillDamageMulti(...)` | 多目标批量计算 |
| `calcComboDamage({skills, stats, target})` | 连招总伤害 |

**HERO_STAT_PROFILES**：6 种职业的基础属性与成长模板。

### 3.4 动画预设（`animation.ts`）

| 导出 | 类型 | 说明 |
|------|------|------|
| `EASE_BOUNCE` | string | `cubic-bezier(0.34, 1.56, 0.64, 1)` 弹性曲线 |
| `EASE_OUT/SMOOTH/IN` | string | 常用缓动曲线 |
| `DUR_FAST/NORMAL/SLOW/PAGE` | string | `0.12s/0.2s/0.3s/0.4s` |
| `GLASS_CARD` | CSSProperties | 毛玻璃卡片基础样式 |
| `GLASS_SHADOW_TOP/BOTTOM` | CSSProperties | 卡片阴影预设 |
| `cardStagger(index, baseDelay?)` | Function | 列表卡片错峰入场 |
| `childStagger(index, delayPerItem?)` | Function | 子项 enter/exit/base 三状态 |
| `pageEnter(stagger?)` | Function | 页面入场动画 |
| `BTN_TRANSITION/BOUNCE/PRESS/RELEASE` | CSSProperties | 按钮交互反馈 |
| `dockPanel(isOpen)` | Function | Dock 弹出面板 transform/origin/transition |

---

## 四、目录结构

```
王者演武堂/
├── prisma/
│   └── schema.prisma               # 数据库 Schema（15 张表）
├── public/
│   ├── robots.txt                  # SEO：允许所有爬虫
│   └── icon.svg                    # 网站图标
├── scripts/
│   ├── deploy.sh                   # 一键生产部署（备份→拉取→安装→构建→PM2）
│   ├── deploy-win.bat              # Windows 部署脚本
│   ├── setup-ssl.sh                # acme.sh SSL 证书配置
│   ├── mysql-backup.sh             # 数据库手动备份
│   ├── memory-cleanup.sh           # 内存清理
│   ├── stop.sh                     # 停止所有服务
│   ├── cron.ts                     # 定时任务主程序（PM2 独立进程）
│   ├── kill-port.ts                # 开发前清理端口占用
│   ├── seed-db.ts                  # 数据库种子
│   ├── seed-test-data.ts           # 测试数据种子
│   ├── seed-announcements.ts       # 公告种子
│   ├── seed-hero-base.ts           # 英雄基础属性种子
│   ├── clean-db.ts / clean-test-data.ts / reset-db.ts  # 数据库清理
│   ├── migrate-announcements.ts    # 公告数据迁移
│   ├── migrate-mingge.ts           # 命格关联绑定迁移
│   ├── migrate-skills.ts           # 技能拆表迁移
│   ├── migrate-skill-damage.ts     # 技能伤害提取迁移
│   ├── download-hero-images.ts     # 英雄图片下载
│   ├── download-equipment-images.ts# 装备图片下载
│   └── test_split.py               # 分队算法验证脚本（Python）
├── src/
│   ├── middleware.ts               # 全局中间件：手机UA跳转、公开/受保护路由、API Cookie检查
│   ├── engine/                     # 逻辑引擎层（UI无关）
│   │   ├── index.ts                # 统一导出
│   │   ├── types.ts                # 全部 TypeScript 类型定义
│   │   ├── constants.ts            # 分路/职业/属性/装备常量
│   │   ├── data.ts                 # 属性定义、装备计算、技能解析、处理管道
│   │   ├── combat.ts               # 伤害公式引擎
│   │   └── animation.ts            # 动画预设（缓动/卡片/按钮/Dock）
│   ├── hooks/                      # 数据 Hooks（与 UI 解耦）
│   │   ├── useAuth.ts              # 登录态：{user, loaded, logout}
│   │   ├── useAnnouncements.ts     # 公告列表 + 最新版本号
│   │   ├── useRolePreferences.ts   # 段位/分路/英雄战力 CRUD + FLIP 动画状态
│   │   ├── useHeroes.ts            # 英雄列表（支持分路/职业筛选）
│   │   ├── useHero.ts              # 单个英雄详情
│   │   ├── useEquipment.ts         # 装备列表
│   │   └── useEquipmentItem.ts     # 单个装备详情
│   ├── components/
│   │   ├── layout/
│   │   │   ├── ThemeLayout.tsx      # 全局布局：登录/管理后台全屏，其余 Header+Dock
│   │   │   ├── Header.tsx           # 顶部导航（双主题自适应 + 用户下拉菜单）
│   │   │   ├── alternate/Dock.tsx   # 底部导航（双主题：演武移动端 + 厚玻璃全端）
│   │   │   ├── BackgroundOrbs.tsx   # 三颗动态光球（鼠标驱赶 + 陀螺仪 + 接近度感应）
│   │   │   ├── CursorLighting.tsx   # 厚玻璃主题鼠标跟随阴影
│   │   │   └── PageEntrance.tsx     # 页面入场封装组件
│   │   ├── auth/
│   │   │   ├── AuthForm.tsx          # 登录/注册表单（含忘记密码流程）
│   │   │   ├── GlassShatter.tsx      # 登录成功裂纹震碎动画
│   │   │   ├── SecurityQuestionModal.tsx  # 安全问题设置/验证弹窗
│   │   │   └── DeleteAccountModal.tsx     # 注销账号确认弹窗
│   │   ├── hero/
│   │   │   ├── HeroGrid.tsx          # 英雄图鉴网格 + 分路/职业筛选
│   │   │   ├── HeroDetail.tsx        # 英雄详情（技能/皮肤/命格切换/装备编辑器）
│   │   │   ├── HeroSelect.tsx        # 英雄搜索下拉（拼音匹配 + Portal）
│   │   │   └── EquipSelect.tsx       # 装备选择器
│   │   ├── me/
│   │   │   ├── RolePreferenceEditor.tsx  # 段位 + 五路偏好排序编辑器
│   │   │   ├── HeroPowerEditor.tsx       # 英雄战力管理（分路Tab/添加/删除）
│   │   │   └── AvatarUpload.tsx          # 头像上传组件
│   │   ├── tournament/
│   │   │   ├── TournamentList.tsx     # 赛事房间列表
│   │   │   ├── TournamentDetail.tsx   # 赛事详情（报名/分队/管理）
│   │   │   ├── TeamBuilder.tsx        # 分队结果可视化
│   │   │   └── HeroPickPanel.tsx      # 英雄选择面板
│   │   ├── home/
│   │   │   ├── LoginReveal.tsx        # 首页登录弹窗触发
│   │   │   └── JoinBattle.tsx         # 加入赛事入口
│   │   ├── admin/
│   │   │   ├── AdminSidebar.tsx       # 后台侧边栏（w-44 紧凑布局）
│   │   │   └── MobileAdminLayout.tsx  # 移动端后台布局
│   │   └── ui/
│   │       ├── Toast.tsx              # Toast 通知系统（success/error/loading）
│   │       └── CalendarModal.tsx      # 日历时间选择弹窗（Portal 渲染）
│   ├── themes/
│   │   ├── ThemeProvider.tsx          # Context Provider，设置 data-theme 属性
│   │   ├── types.ts                   # ThemeId/ThemeColors/ThemeConfig 类型
│   │   └── ui-config.ts              # UI 配置常量
│   ├── lib/
│   │   ├── db.ts                     # Prisma 单例（globalThis 防热重载重复创建）
│   │   ├── session.ts                # iron-session 配置：wzyt_session, 90天
│   │   ├── auth.ts                   # hashPassword/verifyPassword/requireAuth
│   │   ├── permissions.ts            # requireSuperAdmin / requireTournamentAdmin
│   │   ├── redis.ts                  # Redis 缓存层：get/set/del/hash，1h TTL，silent fallback
│   │   ├── anti-bot.ts               # 反爬：5 UA 轮换 + 指数退避重试
│   │   ├── gicp.ts                   # GICP 官方资讯API（MD5签名认证）
│   │   ├── split.ts                  # 分队算法：四层权重组合优化
│   │   ├── heroes/
│   │   │   ├── sync.ts               # 全量英雄同步（herolist.json + 详情页 cheerio）
│   │   │   └── download-images.ts    # 英雄/皮肤图片从 CDN 下载到本地
│   │   ├── equipment/
│   │   │   └── sync.ts               # 装备同步（item.json 解析，15属性 + 被动提取）
│   │   ├── monitor/
│   │   │   └── index.ts              # 轻量监控：五模块独立检测变化 → 触发同步
│   │   └── sse/
│   │       └── heroes.ts             # SSE 客户端管理 + 广播
│   └── app/
│       ├── layout.tsx                # 根布局：ThemeProvider → ToastProvider → 光球 → 光标 → ThemeLayout
│       ├── template.tsx              # 页面切换过渡动画（key={pathname}）
│       ├── loading.tsx               # 路由级骨架屏
│       ├── not-found.tsx             # 自定义 404 页面
│       ├── globals.css               # 全局样式（1312行）：双主题变量 + @layer + 动画 + 响应式
│       ├── sitemap.ts                # 动态生成 sitemap.xml
│       ├── page.tsx                  # 首页
│       ├── login/page.tsx            # 登录页（GlassShatter 动画）
│       ├── register/page.tsx         # 注册页
│       ├── me/page.tsx               # 个人空间
│       ├── heroes/page.tsx           # 英雄图鉴
│       ├── heroes/[id]/page.tsx      # 英雄详情
│       ├── equipment/page.tsx        # 装备图鉴
│       ├── equipment/[id]/page.tsx   # 装备详情
│       ├── tournaments/page.tsx      # 赛事列表
│       ├── tournaments/[id]/page.tsx # 赛事详情
│       ├── changelog/page.tsx        # 更新日志列表
│       ├── changelog/[slug]/page.tsx # 更新日志详情
│       ├── monitor/page.tsx          # 监控看板
│       ├── admin/layout.tsx          # 后台独立布局（无 Header/Dock）
│       ├── admin/page.tsx            # 仪表盘
│       ├── admin/users/page.tsx      # 用户管理
│       ├── admin/tournaments/page.tsx# 房间管理
│       ├── admin/heroes/page.tsx     # 英雄分路管理
│       ├── admin/settings/page.tsx   # 系统设置
│       ├── admin/announcements/page.tsx # 公告管理
│       ├── debug/layout.tsx          # 调试面板布局
│       ├── debug/page.tsx            # 调试面板首页
│       ├── debug/login-effect/page.tsx   # 登录特效测试
│       ├── debug/orb-colors/page.tsx     # 光球颜色测试
│       ├── api/                      # 42 个 API 路由（全部 force-dynamic）
│       │   ├── auth/login/route.ts           # POST 登录
│       │   ├── auth/register/route.ts        # POST 注册
│       │   ├── auth/logout/route.ts          # POST 登出
│       │   ├── auth/me/route.ts              # GET 当前用户 / DELETE 注销账号
│       │   ├── auth/change-password/route.ts # POST 修改密码
│       │   ├── auth/security-question/route.ts # GET/PUT 安全问题
│       │   ├── auth/reset-password/route.ts  # POST 忘记密码重置
│       │   ├── announcements/route.ts        # GET 公告列表 / POST 创建
│       │   ├── announcements/[id]/route.ts   # GET 详情 / PUT 编辑 / DELETE 删除
│       │   ├── changelog/route.ts            # GET 更新日志
│       │   ├── heroes/route.ts               # GET 列表 / POST 手动同步
│       │   ├── heroes/[id]/route.ts          # GET 详情
│       │   ├── heroes/watch/route.ts         # GET SSE 监听
│       │   ├── equipment/route.ts            # GET 装备列表
│       │   ├── equipment/[id]/route.ts       # GET 装备详情
│       │   ├── tournaments/route.ts          # GET 我的赛事 / POST 创建
│       │   ├── tournaments/public/route.ts   # GET 公开赛事
│       │   ├── tournaments/[id]/route.ts     # GET 详情 / PUT 编辑 / DELETE 删除
│       │   ├── tournaments/[id]/join/route.ts          # POST 加入
│       │   ├── tournaments/join-by-code/route.ts       # POST 编号加入
│       │   ├── tournaments/[id]/leave/route.ts         # POST 退出
│       │   ├── tournaments/[id]/kick/route.ts          # POST 踢人
│       │   ├── tournaments/[id]/split/route.ts         # POST 执行分队
│       │   ├── tournaments/[id]/picks/route.ts         # GET/POST 英雄选择
│       │   ├── tournaments/[id]/extend/route.ts        # POST 延期
│       │   ├── tournaments/[id]/temp-player/route.ts   # POST 添加临时玩家
│       │   ├── tournaments/[id]/temp-application/route.ts      # GET/POST 临时玩家申请
│       │   ├── tournaments/[id]/temp-application/[appId]/route.ts # PUT 审核
│       │   ├── tournaments/[id]/admin/route.ts          # GET/POST/PUT/DELETE 管理员
│       │   ├── tournaments/[id]/admin/resign/route.ts   # POST 辞职
│       │   ├── users/me/roles/route.ts      # GET/PUT 角色偏好
│       │   ├── users/me/heroes/route.ts     # GET/POST/DELETE 英雄战力
│       │   ├── me/avatar/route.ts           # POST 头像上传
│       │   ├── avatars/[filename]/route.ts  # GET 头像读取
│       │   ├── official-news/route.ts       # GET 官方新闻（GICP）
│       │   ├── admin/stats/route.ts         # GET 仪表盘统计
│       │   ├── admin/users/route.ts         # GET 用户列表
│       │   ├── admin/users/[id]/route.ts    # PUT 封禁/解封 / DELETE 删除
│       │   ├── admin/tournaments/route.ts   # GET 全部房间
│       │   ├── admin/settings/route.ts      # GET/PUT 系统配置
│       │   ├── admin/sync-status/route.ts   # GET 同步进度
│       │   └── admin/announcements/route.ts # GET/POST 公告管理
│       └── m/                         # 移动端路由（re-export 主路由页面）
│           ├── layout.tsx             # 移动端专属 Layout
│           ├── page.tsx               # /m → 首页
│           ├── login/page.tsx         # /m/login
│           ├── register/page.tsx      # /m/register
│           ├── me/page.tsx            # /m/me
│           ├── heroes/page.tsx        # /m/heroes
│           ├── heroes/[id]/page.tsx   # /m/heroes/[id]
│           ├── equipment/page.tsx     # /m/equipment
│           ├── equipment/[id]/page.tsx# /m/equipment/[id]
│           ├── tournaments/page.tsx   # /m/tournaments
│           ├── tournaments/[id]/page.tsx # /m/tournaments/[id]
│           ├── admin/layout.tsx       # /m/admin (MobileAdminLayout)
│           ├── admin/page.tsx         # /m/admin
│           ├── admin/users/page.tsx
│           ├── admin/tournaments/page.tsx
│           ├── admin/heroes/page.tsx
│           ├── admin/settings/page.tsx
│           ├── admin/announcements/page.tsx
│           ├── debug/layout.tsx
│           └── debug/page.tsx
```

---

## 五、核心模块详解

### 5.1 爬虫（`lib/heroes/sync.ts`）

**数据来源**：

| 来源 | URL | 用途 |
|------|-----|------|
| 英雄列表 HTML | `herolist.shtml` | 获取英雄 ID 与名称（优先） |
| 英雄列表 JSON | `herolist.json` | 补充 title、hero_type、id_name |
| 英雄详情页 | `herodetail/{id}.shtml` | 技能、皮肤、命格解析 |
| 英雄图片 CDN | `game.gtimg.cn/.../heroimg/{id}/{id}.jpg` | 英雄头像 |
| 皮肤图片 CDN | `game.gtimg.cn/.../skin/hero-info/{id}/{id}-bigskin-{idx}.jpg` | 皮肤大图 |

**URL 配置**：全部爬取地址可通过 `/admin/settings` 页面动态配置，存储于 `kv_cache key: config:crawl_urls`，运行时从数据库读取，未配置时使用默认值。

**处理流程**：

1. `fetchHeroList()` -- 爬取 `herolist.shtml` 获取 `<a href="herodetail/ID.shtml">` 的 ID+名称映射，再拉取 `herolist.json` 补充 title/hero_type/id_name
2. 8 个一批并发 `fetchDetail(cfg, heroId, idName)` -- **数字页优先**（`{heroId}.shtml`），拼音页兜底（`{idName}.shtml`）
3. `parseSkills(html)` -- cheerio 三级解析策略：
   - 标准页：`.skill-show .show-list`（提取 name/cd/cost/desc）
   - 预览页：`.detail-js` 的 `<b>` 标题 + 描述块
   - 新版 HTML：`skill-name` + `skill-desc` 类名匹配
4. `parseSkins(html)` -- 正则提取 `data-imgname` 属性，`|` 分隔，`&` 截断
5. `parseMingGe(html)` -- 关键词检测"命格"，正则提取名称
6. 图片探测：优先 `bigskin-1`，HEAD 请求检测存在性，回退到 heroimg
7. 计算 `dataHash = MD5(skills + skins)` 用于变更检测
8. Upsert 英雄 → 同步 `hero_skills` 拆表（`processSkill` 插件管道增强）
9. 清除 Redis 缓存（单个英雄 + 列表）

**同步进度**：通过回调 `SyncProgress {phase, current, total, message}` 写入 KvCache，前端轮询 `/api/admin/sync-status` 展示进度条。

### 5.2 装备同步（`lib/equipment/sync.ts`）

1. 从 `item.json` 拉取全部装备（兼容嵌套数组/对象两种格式）
2. `parseStats(des2)` -- 正则提取 11 种属性数值
3. 调用引擎函数：`computeTier` 确定等级，`computeTags` 确定标签，`buildEquipmentStats` 构建属性数组，`parsePassives` 提取被动效果
4. Upsert 装备表（15 个属性列 + passiveJson + extraJson）
5. 清除 Redis 缓存

### 5.3 反爬（`lib/anti-bot.ts`）

| 机制 | 说明 |
|------|------|
| UA 池 | 5 个 Chromium/Firefox UA，随机轮换 |
| `fetchWithRetry()` | 最多 5 次重试 |
| 退避策略 | 403/429/503 时等待 `(attempt+1)*3s + rand(0-2s)`，即 3s/6s/9s/12s/15s |
| 编码检测 | 试解码 GBK → UTF-8 → GB2312，检查是否含中文字符 |
| 请求头 | 自动添加 `Accept/Accept-Language/Cache-Control/Referer` |
| Playwright 兜底 | 已安装 Playwright（未在 fetchWithRetry 中直接调用，预留兜底方案）

### 5.4 监控（`lib/monitor/index.ts`）

**五模块独立检测**，3 分钟周期执行：

| 模块 | 检测方式 | 变化判定 |
|------|----------|----------|
| `news` | GICP API 取第一条标题 | 与 `kv_cache.news_last_title` 对比 |
| `heroes` | 拉取 herolist.json | 数量变化 / 首尾英雄名变化 / 抽样+命格英雄对比 |
| `skins` | 拉取 herolist.json | 每 5 个英雄抽样的 skin_name 字段对比 |
| `skills` | 50% 随机抽样，实际爬取详情页 | 页面技能+皮肤的 MD5 hash 对比 |
| `items` | 拉取 item.json | 全文 MD5 hash 对比 |

**检测到变化时**：触发 `runMonitorAndScrape()` 执行对应同步任务，完成后下载图片。

**SSE 广播**：监控事件通过 `onMonitorEvent()` 注册监听器，`/api/heroes/watch` SSE 端点实时推送。

### 5.5 分队算法（`lib/split.ts`）

**约束条件**：10 人分 5 路，每路 2 人（每队各 1 人）。

**两阶段搜索**：

1. **角色分配**（`generateRoleAssignments`）：将 10 个 userId 分配到 5 个 roleType，每路 2 人（组合枚举）
2. **队伍切分**（`evaluateTeamSplit`）：对每种角色分配，用 5-bit mask 枚举 32 种红蓝分配，使队伍强度差最小化

**四层评分权重**：

| 层 | 权重 | 说明 |
|----|------|------|
| 偏好满足 | `W_PREF = 500` | 基于 `preferenceRank`：rank1 +5，主力角色 +3，4/5 偏好/无英雄惩罚 |
| 段位覆盖 | `W_COVER = 50` | 有段位的玩家数量（越大越好） |
| 段位均衡 | `W_RANK = 30` | 两队段位总和差的惩罚（越小越好） |
| 战力均衡 | `W_STRENGTH = 15` | 两队战力总和的差的惩罚（越小越好） |
| 公平性惩罚 | `W_FAIRNESS = 200` | 跨位置 + 低熟练度惩罚 |

**战力计算**（`computeStrength`）：前三位英雄战力均值/30 + 巅峰分/7 + 当前段位*15 + 历史巅峰段*10，理论上限约 1000。

最终评分公式：

```
score = pref * 500 + coverage * 50 - strengthDiff * 15 - rankDiff * 30 - penalty * 200
```

### 5.6 Redis 缓存（`lib/redis.ts`）

| API | 说明 |
|-----|------|
| `cacheGet<T>(domain, id)` | JSON.parse 返回，失败返回 null |
| `cacheSet(domain, id, data, ttl?)` | 默认 TTL 3600s（1小时） |
| `cacheDel(domain, id)` | 删除单个键 |
| `cacheDelPattern(pattern)` | KEYS + DEL 批量 |
| `cacheHGet/HSet(domain, id)` | Hash 操作 |

**容错设计**：所有操作 try/catch 包裹，Redis 不可用时静默降级，不抛异常。

**连接配置**：最多 2 次请求重试，连接失败最多 3 次 retry（200ms/400ms/800ms），5s 连接超时。

### 5.7 权限（`lib/permissions.ts`）

| 函数 | 说明 |
|------|------|
| `requireAuth()` | 从 session 读 userId，校验用户存在 + 封禁状态，返回 `{userId, username, role}` |
| `requireSuperAdmin()` | `requireAuth()` + 检查 `role === "admin"`，否则抛出 `"FORBIDDEN"` |
| `requireTournamentAdmin(tournamentId)` | `requireAuth()` + 检查 `tournament_admin` 表记录 |

---

## 六、API 路由完整列表

### 6.1 认证

| 方法 | 路径 | 说明 | 请求体 | 返回 |
|------|------|------|--------|------|
| GET | `/api/auth/me` | 获取当前用户 | -- | `{user: {userId, username, role, avatar} \| null}` |
| DELETE | `/api/auth/me` | 注销账号 | `{answer}` | `{ok: true}` |
| POST | `/api/auth/login` | 登录 | `{username, password}` | `{user: {userId, username, role}}` |
| POST | `/api/auth/register` | 注册 | `{username, password, securityQuestion?, securityAnswer?}` | `{user: {userId, username}}` |
| POST | `/api/auth/logout` | 登出 | -- | `{ok: true}` |
| POST | `/api/auth/change-password` | 修改密码 | `{currentPassword, newPassword}` | `{ok: true}` |
| GET | `/api/auth/security-question` | 查询安全问题 | `?username=` | `{username, securityQuestion}` |
| PUT | `/api/auth/security-question` | 设置安全问题 | `{question, answer}` | `{ok: true}` |
| POST | `/api/auth/reset-password` | 忘记密码重置 | `{username, securityAnswer, newPassword}` | `{ok: true}` |

### 6.2 用户

| 方法 | 路径 | 说明 | 请求体 | 返回 |
|------|------|------|--------|------|
| GET | `/api/users/me/roles` | 获取偏好 | -- | `{preferences: [{roleType, preferenceRank, roleRank, peakScore, peakRank}]}` |
| PUT | `/api/users/me/roles` | 保存偏好 | `{preferences: [{role_type, preference_rank, role_rank, peak_score, peak_rank}]}` | `{ok: true}` |
| GET | `/api/users/me/heroes` | 获取英雄战力 | -- | `{heroPowers: {top: [], jungle: [], ...}}` |
| POST | `/api/users/me/heroes` | 添加英雄战力 | `{roleType, heroId, heroName, powerScore}` | `{id, heroId, heroName, powerScore}` |
| DELETE | `/api/users/me/heroes` | 删除英雄战力 | `?id=` | `{ok: true}` |
| POST | `/api/me/avatar` | 上传头像 | FormData (jpg/png/webp <2MB) | `{avatar: "filename"}` |
| GET | `/api/avatars/[filename]` | 读取头像 | -- | 图片二进制流（Cache-Control: 24h） |

### 6.3 英雄

| 方法 | 路径 | 说明 | 参数 | 返回 |
|------|------|------|------|------|
| GET | `/api/heroes` | 英雄列表 | `?role_type= &hero_type=` | `HeroListItem[]` |
| GET | `/api/heroes/[id]` | 英雄详情 | `?related=`（命格切换） | `HeroDetail` |
| POST | `/api/heroes` | 超管手动同步 | -- | 同步结果 |
| GET | `/api/heroes/watch` | SSE 同步进度 | -- | `text/event-stream` |

### 6.4 装备

| 方法 | 路径 | 说明 | 返回 |
|------|------|------|------|
| GET | `/api/equipment` | 装备列表 | `EquipListItem[]` |
| GET | `/api/equipment/[id]` | 装备详情 | `EquipDetail` |

### 6.5 赛事

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/tournaments` | 我的赛事 + 公开可报名赛事 | 需登录 |
| POST | `/api/tournaments` | 创建赛事 | 需登录 |
| GET | `/api/tournaments/public` | 公开赛事列表 | 公开 |
| GET | `/api/tournaments/[id]` | 赛事详情（含玩家/管理员/分队结果） | 需登录 |
| PUT | `/api/tournaments/[id]` | 编辑赛事 | 管理员 |
| DELETE | `/api/tournaments/[id]` | 删除赛事 | 管理员 |
| POST | `/api/tournaments/[id]/join` | 加入赛事 | 需登录 |
| POST | `/api/tournaments/join-by-code` | 通过编号加入 | 需登录 |
| POST | `/api/tournaments/[id]/leave` | 退出赛事 | 需登录 |
| POST | `/api/tournaments/[id]/kick` | 踢出玩家 | 管理员 |
| POST | `/api/tournaments/[id]/split` | 执行分队 | 管理员 |
| POST | `/api/tournaments/[id]/extend` | 延期 | 管理员 |
| GET | `/api/tournaments/[id]/picks` | 获取英雄选择 | 需登录 |
| POST | `/api/tournaments/[id]/picks` | 保存英雄选择 | 需登录 |
| POST | `/api/tournaments/[id]/temp-player` | 添加临时玩家 | 管理员 |
| GET | `/api/tournaments/[id]/temp-application` | 申请列表 | 管理员 |
| POST | `/api/tournaments/[id]/temp-application` | 提交申请 | 需登录 |
| PUT | `/api/tournaments/[id]/temp-application/[appId]` | 审核申请 | 管理员 |
| GET | `/api/tournaments/[id]/admin` | 管理员列表 | 需登录 |
| POST | `/api/tournaments/[id]/admin` | 添加管理员 | owner |
| PUT | `/api/tournaments/[id]/admin` | 修改管理员角色 | owner |
| DELETE | `/api/tournaments/[id]/admin` | 移除管理员 | owner |
| POST | `/api/tournaments/[id]/admin/resign` | 辞去管理员 | 管理员自身 |

### 6.6 后台管理

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/admin/stats` | 仪表盘统计 | 超管 |
| GET | `/api/admin/users` | 用户列表 | 超管 |
| PUT | `/api/admin/users/[id]` | 封禁/解封/改角色 | 超管 |
| DELETE | `/api/admin/users/[id]` | 删除用户 | 超管 |
| GET | `/api/admin/tournaments` | 全部赛事 | 超管 |
| GET | `/api/admin/settings` | 获取系统配置 | 超管 |
| PUT | `/api/admin/settings` | 更新系统配置 | 超管 |
| GET | `/api/admin/sync-status` | 同步进度 | 超管 |
| GET | `/api/admin/announcements` | 公告列表 | 超管 |
| POST | `/api/admin/announcements` | 创建公告 | 超管 |

### 6.7 公开接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/announcements` | 公告列表（`?full=true` 含正文） |
| GET | `/api/announcements/[id]` | 公告详情 |
| GET | `/api/changelog` | 更新日志 |
| GET | `/api/official-news` | 官方新闻（GICP API） |

---

## 七、数据库

**连接**：MySQL 8.x `38.22.234.148:3306`，数据库 `yanwutang_test`。

### 7.1 表结构总览（15 张表）

#### users -- 用户表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK AUTO | 主键 |
| username | VARCHAR(32) UNIQUE | 用户名 |
| password_hash | VARCHAR(255) | bcryptjs 10 轮哈希 |
| security_question | VARCHAR(255) NULL | 安全问题 |
| security_answer_hash | VARCHAR(255) NULL | 答案哈希 |
| role | VARCHAR(16) DEFAULT "user" | `user` / `admin` |
| avatar | VARCHAR(255) NULL | 头像文件名 |
| banned | BOOLEAN DEFAULT false | 封禁标记 |
| created_at | DATETIME | 注册时间 |

#### tournaments -- 赛事表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK AUTO | 主键 |
| code | VARCHAR(8) UNIQUE | 6位数字加入码 |
| name | VARCHAR(64) | 赛事名称 |
| deadline | DATETIME | 截止时间 |
| status | VARCHAR(16) DEFAULT "recruiting" | recruiting/locked/finished |
| is_public | BOOLEAN DEFAULT false | 是否公开招募 |
| announcement | TEXT NULL | 公告内容 |
| split_result | JSON NULL | 分队结果 |
| created_at | DATETIME | 创建时间 |

#### tournament_players -- 参赛者表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK AUTO | 主键 |
| tournament_id | INT FK | 赛事ID（级联删除） |
| user_id | INT FK | 用户ID（级联删除） |
| role_type | VARCHAR(16) NULL | 分路偏好 |
| is_temporary | BOOLEAN DEFAULT false | 是否临时玩家 |
| is_spectator | BOOLEAN DEFAULT false | 是否观众 |
| temp_name | VARCHAR(32) NULL | 临时玩家名 |

唯一约束：`(tournament_id, user_id)`

#### tournament_admins -- 赛事管理员表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK AUTO | 主键 |
| tournament_id | INT FK | 赛事ID（级联删除） |
| user_id | INT FK | 用户ID（级联删除） |
| role | VARCHAR(16) | `owner` / `co_owner` |

唯一约束：`(tournament_id, user_id)`

#### temp_player_applications -- 临时玩家申请表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK AUTO | 主键 |
| tournament_id | INT FK | 赛事ID |
| applicant_id | INT FK | 申请人ID |
| temp_name | VARCHAR(32) NULL | 临时玩家名 |
| status | VARCHAR(16) DEFAULT "pending" | pending/approved/rejected |
| created_at | DATETIME | 申请时间 |

唯一约束：`(tournament_id, applicant_id)`

#### heroes -- 英雄表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK AUTO | 主键 |
| hero_id | INT UNIQUE | 官方英雄ID |
| name | VARCHAR(64) | 英雄名称 |
| title | VARCHAR(64) | 称号 |
| role_type | VARCHAR(16) | 分路 |
| hero_type | INT DEFAULT 0 | 职业类型 1-6 |
| hero_type2 | INT DEFAULT 0 | 第二职业类型 |
| image_url | VARCHAR(255) | 头像URL |
| skins_json | TEXT NULL | 皮肤JSON |
| skills_json | TEXT | 技能JSON（已迁移到 hero_skills） |
| data_hash | VARCHAR(64) NULL | MD5 变更检测 |
| mingge | BOOLEAN DEFAULT false | 是否有命格 |
| mingge_name | VARCHAR(64) NULL | 命格形态名称 |
| mingge_related_id | INT NULL | 关联命格英雄ID |
| base_json | JSON NULL | 基础属性 `{hp, mp, atk, ap, def, mdef, ...}` |
| updated_at | DATETIME | 更新时间 |

#### hero_skills -- 技能拆表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK AUTO | 主键 |
| hero_id | INT FK | 英雄ID（级联删除） |
| skill_index | INT | 0=被动, 1-4=主动 |
| name | VARCHAR(64) | 技能名称 |
| cd | VARCHAR(32) | 冷却时间 |
| cost | VARCHAR(32) | 消耗 |
| desc | TEXT | 技能描述 |
| damage_type | VARCHAR(8) NULL | physical/magic/true |
| data_hash | VARCHAR(64) | MD5 变更检测 |
| extra_json | JSON NULL | 伤害解析结果 `{damage: [{base, type, bonuses}]}` |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

唯一约束：`(hero_id, skill_index)`

#### equipment -- 装备表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK AUTO | 主键 |
| item_id | INT UNIQUE | 官方装备ID |
| name | VARCHAR(64) | 装备名称 |
| price | INT DEFAULT 0 | 价格 |
| image_url | VARCHAR(255) NULL | 图标URL |
| **15 属性列** | INT DEFAULT 0 | atk/ap/def/mdef/hp/mp/cdReduce/atkSpeed/moveSpeed/critRate/lifesteal |
| passive_json | JSON NULL | `[{name, desc, unique}]` |
| components | JSON NULL | 合成路径 |
| data_hash | VARCHAR(64) NULL | MD5 |
| extra_json | JSON NULL | `{itemType, tier, tags, stats}` |
| created_at / updated_at | DATETIME | 时间戳 |

#### 其余表

| 表 | 主要字段 | 说明 |
|----|----------|------|
| `role_preferences` | user_id, role_type, preference_rank, role_rank, peak_score, peak_rank | 用户五路偏好，唯一(user_id, role_type) |
| `hero_powers` | user_id, role_type, hero_id, hero_name, power_score | 用户英雄战力，唯一(user_id, hero_id, role_type) |
| `hero_lane_overrides` | hero_id (PK), role_type | 手动分路修正，同步不覆盖 |
| `kv_cache` | key (PK VARCHAR 64), value TEXT | 键值缓存（爬取配置、同步进度、新闻/装备 hash） |
| `announcements` | title, version, brief, content, slug (UNIQUE), published | 系统公告 |
| `admin_operations` | tournament_id, admin_id, action, target_id | 管理员操作日志 |
| `tournament_picks` | tournament_id, user_id, team, role_type, hero_id, equip_json | 英雄选择记录，唯一(tournament_id, user_id) |

---

## 八、前端架构

### 8.1 组件树

```
<html data-theme="yanwu">
  <ThemeProvider>
    <ToastProvider>
      <BackgroundOrbs />      ← 固定定位光球（z-index: 0）
      <CursorLighting />      ← 鼠标跟随阴影
      <ThemeLayout>
        ├─ /login, /register, /admin/*, /debug/*
        │   └─ <main> 直接渲染（全屏，无 Header/Dock）
        └─ 其余页面
            ├─ <LoginReveal />  ← 首页登录引导弹窗
            ├─ <Header />       ← 顶部导航（sticky, z-index: 100）
            ├─ <main className="main-content">{children}</main>
            └─ <Dock />         ← 底部导航（取决于主题）
      </ThemeLayout>
    </ToastProvider>
  </ThemeProvider>
</html>
```

### 8.2 页面清单

| 路由 | 页面 | 说明 |
|------|------|------|
| `/` | 首页 | 公告 + 赛事入口 + 官方新闻 |
| `/login` | 登录页 | AuthForm + GlassShatter 动画 |
| `/register` | 注册页 | AuthForm 注册模式 |
| `/me` | 个人空间 | 头像上传 + 段位偏好 + 英雄战力 |
| `/heroes` | 英雄图鉴 | 网格 + 分路/职业筛选 |
| `/heroes/[id]` | 英雄详情 | 技能/皮肤/命格/装备编辑器 |
| `/equipment` | 装备图鉴 | 列表 + 标签筛选 |
| `/equipment/[id]` | 装备详情 | 属性/被动/合成路径 |
| `/tournaments` | 赛事列表 | 我的赛事 + 公开可报名 |
| `/tournaments/[id]` | 赛事详情 | 报名/分队/管理/选英雄 |
| `/changelog` | 更新日志 | 公告列表 |
| `/changelog/[slug]` | 日志详情 | Markdown 渲染 |
| `/monitor` | 监控看板 | SSE 实时状态 |
| `/admin` | 仪表盘 | 用户数/赛事数/英雄数 |
| `/admin/users` | 用户管理 | 列表/封禁/删除 |
| `/admin/tournaments` | 房间管理 | 全部赛事 |
| `/admin/heroes` | 分路管理 | FLIP 重排动画编辑 |
| `/admin/settings` | 系统设置 | 爬取URL + 同步进度条 |
| `/admin/announcements` | 公告管理 | CRUD |
| `/debug` | 调试面板 | 仅需登录 |
| `/debug/login-effect` | 登录特效测试 | 独立测试页 |
| `/debug/orb-colors` | 光球颜色测试 | 视觉调试 |

全部页面在 `/m/` 下有对应的移动端路由。

### 8.3 Hooks API 签名

**useAuth**

```ts
function useAuth(): {
  user: { userId: number; username: string; role?: string; avatar?: string | null } | null;
  loaded: boolean;
  logout: () => Promise<void>;
}
```

**useAnnouncements**

```ts
function useAnnouncements(full?: boolean): {
  announcements: { date: string; title: string; version: string | null; brief: string; slug: string; content?: string }[];
  loaded: boolean;
  latestVersion: string | null;
}
```

**useRolePreferences**

```ts
function useRolePreferences(): {
  prefs: { roleType: string; preferenceRank: number; roleRank: number; peakScore: number; peakRank: number }[];
  heroesByRole: Record<string, { id: number; heroId: number; heroName: string; powerScore: number }[]>;
  sharedRank: number; activeTab: string; selHero: string; selHeroName: string; selPower: string;
  saving: boolean; animatingIdx: number | null;
  setActiveTab: (t: string) => void;
  setSelHero: (v: string) => void;
  setSelHeroName: (v: string) => void;
  setSelPower: (v: string) => void;
  moveUp: (i: number) => void;
  moveDown: (i: number) => void;
  setSharedRankAndSync: (r: number) => void;
  setPeakScore: (role: string, s: number) => void;
  setPeakRank: (role: string, r: number) => void;
  savePrefs: (onSuccess: () => void, onError: (msg: string) => void) => Promise<void>;
  addHero: (role: string, onSuccess: () => void, onError: (msg: string) => void) => Promise<void>;
  removeHero: (id: number, role: string, onSuccess: () => void) => Promise<void>;
}
```

**useHeroes / useHero / useEquipment / useEquipmentItem**

```ts
function useHeroes(roleType?: string, heroType?: string): { heroes: HeroListItem[]; loading: boolean; error: boolean; refetch: () => void }
function useHero(heroId: string | number): { hero: HeroDetail | null; loading: boolean; refetch: () => void }
function useEquipment(): { items: EquipListItem[]; loading: boolean; error: boolean; refetch: () => void }
function useEquipmentItem(itemId: string | number): { item: EquipDetail | null; loading: boolean; refetch: () => void }
```

### 8.4 弹窗系统

| 组件 | 说明 |
|------|------|
| `SecurityQuestionModal` | 安全问题设置/验证，两步流程：输入问题+答案 → 确认 |
| `DeleteAccountModal` | 注销账号确认，输入安全答案验证身份 |
| `CalendarModal` | 时间选择器，Portal 渲染，独立于父组件 DOM |
| 忘记密码弹窗 | AuthForm 内联三步流程：输入用户名 → 验证安全问题 → 设置新密码 |

### 8.5 Toast 通知系统

```ts
function useToast(): {
  toast: (message: string, type?: "success" | "error" | "loading") => void;
  success: (msg: string) => void;
  error: (msg: string) => void;
  loading: (msg: string) => void;
}
```

- **success**：绿色边框，2.5s 自动消失
- **error**：红色边框，5s 自动消失
- **loading**：金色边框，8s 自动消失
- **动画**：`toast-in` 滑入 / `toast-out` 滑出（200ms）
- **位置**：固定右上角 `top: 72px, right: 24px`，移动端 `left: 12px, right: 12px` 全宽
- **堆叠**：flex column + 8px gap，z-index: 9999

---

## 九、CSS 架构

### 9.1 总体结构

```
globals.css (1312行)
├── @tailwind base/components/utilities
├── :root { --var }                          ← 默认主题 (#1 演武)
├── @layer base { * { scrollbar }, body, ::selection, input/select/textarea }
├── @layer components {
│   ├── .header-bar / .header-inner / .header-brand / .header-nav / .nav-link
│   ├── .user-btn / .user-avatar / .dropdown-menu / .dropdown-item
│   ├── .login-btn / .btn-primary / .btn-danger / .btn-ghost / .btn-subtle
│   ├── .card / .card-red / .card-blue / .card-interactive
│   ├── .badge / .section-title / .skeleton / .divider / .energy-line
│   └── .modal-backdrop / .modal-card / .modal-glow
│       ├── [data-theme="yanwu"] 覆盖 .modal-backdrop / .modal-card / .modal-glow
│       ├── [data-theme="yanwu"] 全局覆盖（卡片/Header/导航/表单/按钮/下拉/徽章/光球/骨架屏）
│       └── [data-theme="yanwu"] .auth-card / .auth-input（毛玻璃登录卡片）
├── @layer utilities {
│   └── .main-content { max-width + padding + animation }
├── @keyframes role-expand-in / role-item-in / role-item-out / rank-pop
├── @keyframes stagger-item-in / page-enter-yanwu / page-enter-alt
├── @keyframes entry-brand-yanwu / entry-card-yanwu / entry-brand-alternate / entry-card-alternate
├── @keyframes curtain-* / effect-* / crack-line-in / glass-burst (GlassShatter 动画)
├── @keyframes shimmer / toast-in / toast-out / fade-in / slide-up / slide-in
├── @keyframes glow-pulse / nav-glow-pulse / energy-flow / scale-in
├── .bg-orbs-container / .bg-orb / .bg-orb--1/2/3
├── @keyframes orb-float-1/2/3 / orb-breathe
├── @media (max-width: 768px) { 移动端覆盖 }
└── @media (prefers-reduced-motion: reduce) { 禁用动画 + 隐藏光球 }
```

### 9.2 双主题 CSS 变量

**演武主题（:root -- 默认桌面主题）**：

| 类别 | 变量 | 默认值 |
|------|------|--------|
| 基底 | `--bg-root` | `#161920`（石板灰深色） |
| 卡片 | `--bg-card` | `rgba(255,255,255,0.04)` 暗琉璃 |
| 强调色 | `--gold` | `#a89068`（暖铜金） |
| 圆角 | `--radius` | `6px` |
| 光球 | `--orb-1/2/3` | 暖金色系 |
| Header | 56px，底部金色能量线动画 |
| Dock | 仅移动端显示 |

**厚玻璃主题（`[data-theme="yanwu"]` 覆盖）**：

| 类别 | 变量 | 覆盖值 |
|------|------|--------|
| 基底 | `--bg-root` | `#efeff2`（浅灰） |
| 卡片 | `--bg-card` | `rgba(255,255,255,0.45)` + blur(6px) 厚毛玻璃 |
| 强调色 | `--gold` | `#4488f0`（系统蓝） |
| 圆角 | `--radius` | `16px` |
| 光球 | `--orb-1/2/3` | `#00e5a0` / `#4488ff` / `#7c5cfc` |
| Header | 34px，紧凑布局，无能量线 |
| Dock | 桌面 + 移动端均显示 |

### 9.3 动画关键帧（37 个）

| 分类 | 关键帧名 | 用途 |
|------|----------|------|
| 列表动画 | `role-expand-in`, `role-item-in/out`, `rank-pop`, `stagger-item-in` | 分路编辑器 FLIP 动画 |
| 页面过渡 | `page-enter-yanwu`, `page-enter-alt` | 页面入场 |
| 品牌动画 | `entry-brand-yanwu/alternate`, `entry-card-yanwu/alternate` | 首页品牌动画 |
| 登录特效 | `curtain-*`, `effect-*`, `crack-line-in`, `glass-burst` | GlassShatter 裂纹震碎 |
| 通用 | `shimmer`, `toast-in/out`, `fade-in`, `slide-up/in`, `scale-in` | 骨架屏/Toast/浮现 |
| 氛围 | `glow-pulse`, `nav-glow-pulse`, `energy-flow` | Header 呼吸光效 |
| 光球 | `orb-float-1/2/3`, `orb-breathe` | 背景光球移动呼吸 |

### 9.4 无障碍支持

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;       /* 几乎禁用所有动画 */
    transition-duration: 0.001ms !important;
  }
  .bg-orbs-container { display: none; }            /* 隐藏光球 */
  .bg-orb { display: none; }
  .stagger-enter > * { opacity: 1; transform: none; animation: none; }
}
```

---

## 十、部署架构

```
用户浏览器
    │
    ├─ HTTPS (443) ─── acme.sh + Let's Encrypt 自动续期
    │
Nginx (/opt/Nginx/nginx.1.30.2/)
    │  conf.d/sites/
    │  └─ 反向代理到 localhost:8081
    │
Next.js 生产服务 (PM2: yanwutang-web)
    │  localhost:8081 (生产) / localhost:8001 (开发)
    │  ecosystem.config.js 管理
    │
├─ MySQL 8.x (38.22.234.148:3306)  ─── 数据库 yanwutang
├─ Redis (localhost:6379)            ─── 缓存层
└─ PM2: yanwutang-cron               ─── 定时任务进程
       ├─ 启动 5s 后全量同步英雄
       ├─ 每 3 分钟监控（五模块检测变化）
       ├─ 每天 06:00 全量同步
       ├─ 每分钟检查赛事截止
       └─ 每 30 分钟内存检查（<150MB 释放缓存）
```

**服务器**：Rocky Linux  
**部署命令**：`bash scripts/deploy.sh`

部署流程：停止旧服务 → Git pull → MySQL 备份（保留最近 10 个） → npm install → Prisma generate → Prisma db push → 数据迁移 → 英雄同步 → npm build → PM2 start

---

## 十一、SEO

| 文件 | 说明 |
|------|------|
| `public/robots.txt` | 允许所有爬虫，指向 sitemap |
| `src/app/sitemap.ts` | Next.js 动态生成：首页/英雄/装备/赛事/公告，baseUrl `https://ywt.yunhe.ink` |
| `public/icon.svg` | 矢量网站图标 |
| `layout.tsx metadata` | `title: "王者演武堂"`, `description: "王者荣耀内战分队系统"` |
| `not-found.tsx` | 自定义 404 页面（金色 404 + 返回首页按钮） |
| `html lang="zh-CN"` | 根元素语言声明 |

---

## 十二、无障碍（Accessibility）

| 特性 | 实现方式 |
|------|----------|
| 模态框焦点管理 | SecurityQuestionModal / DeleteAccountModal 打开时自动聚焦第一个输入框 |
| ARIA 属性 | 模态框 `role="dialog"`, `aria-modal="true"`, `aria-labelledby` |
| 减少动画 | `@media (prefers-reduced-motion: reduce)` 禁用全部动画并隐藏光球 |
| 表单自动完成 | 登录表单 `autocomplete="username"` / `autocomplete="current-password"` |
| 语义化 HTML | `<main>`, `<nav>`, `<button>`, `<header>` |
| 键盘导航 | 按钮、表单元素原生支持；Dropdown 菜单支持 Escape 关闭 |
| 颜色对比 | 浅色主题高对比度文字（`#111` on `#efeff2`）；深色主题适中对比 |
| 焦点指示器 | `input:focus` 蓝色 border + box-shadow（`rgba(68,136,240,0.12)`） |
| 跳过动画 | `template.tsx` 使用 CSS transition，无 JS 阻塞 |
| 滚动条 | `scrollbar-width: thin`，浅色/深色独立配色 |
