# 王者演武堂 — 功能与技术规格说明书

> 版本 V2.0.1 / 2026年7月
> 王者荣耀 5v5 内战分队系统 · Next.js 14 全栈应用

---

## 一、项目定位

王者演武堂是一套面向王者荣耀玩家的 5v5 内战分队系统。核心卖点是**自动均衡分队**——基于玩家的分路偏好、段位、英雄战力等多维数据，通过组合优化算法生成实力最接近的红蓝两队。系统同时提供英雄图鉴、装备图鉴、赛事管理、实时监控和后台管理等完整功能。

### 技术栈

| 层级 | 选型 |
|------|------|
| 前端框架 | Next.js 14 App Router + TypeScript |
| CSS | Tailwind CSS + CSS 变量双主题 |
| 数据库 | MySQL (Prisma 5 ORM) |
| 缓存 | Redis (ioredis, 1h TTL, silent fallback) |
| 认证 | iron-session (cookie) + bcryptjs |
| 爬虫 | cheerio + iconv-lite + node-cron |
| 实时推送 | SSE (Server-Sent Events) |
| 部署 | Rocky Linux + Nginx 1.30.2 + PM2 + acme.sh |
| 端口 | 开发 8001 / 生产 8081 |

---

## 二、认证系统

### 2.1 用户模型

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Int (PK) | 自增主键 |
| username | VARCHAR(32) UNIQUE | 用户名 |
| password_hash | VARCHAR(255) | bcrypt 哈希 |
| security_question | VARCHAR(255)? | 安全问题 |
| security_answer_hash | VARCHAR(255)? | 答案 bcrypt 哈希 |
| role | VARCHAR(16) | admin / user (默认 user) |
| avatar | VARCHAR(255)? | 头像文件名 |
| banned | BOOLEAN | 封禁标记 (默认 false) |
| created_at | DATETIME | 注册时间 |

### 2.2 注册流程

```
POST /api/auth/register
```

| 参数 | 要求 |
|------|------|
| username | 唯一，最长 32 字符 |
| password | 至少 11 位 |
| securityQuestion | 安全问题 (必填) |
| securityAnswer | 答案 (必填) |

密码和答案均使用 bcrypt (salt rounds=10) 哈希存储，明文不落盘。

### 2.3 登录流程

```
POST /api/auth/login
```

1. 接收 username + password
2. bcrypt 验证密码哈希
3. 检查 `banned` 字段：被封禁用户返回 403 "您的账户已被封禁"
4. 创建 iron-session：
   - cookie 名：`wzyt_session`
   - 有效期：90 天 (`maxAge: 60*60*24*90`)
   - session 数据：`{ userId, username, role }`
   - 生产环境启用 `secure: true` (HTTPS only)
5. 前端触发 `GlassShatter` 裂纹震碎动画
6. 动画完成后跳转：admin 角色 → `/admin`，普通用户 → 首页

### 2.4 登出

```
POST /api/auth/logout
```

销毁 session，清除 cookie。

### 2.5 忘记密码 (两步流程)

**第一步** — 查询安全问题：

```
GET /api/auth/security-question?username=xxx
```

返回该用户的安全问题文本。

**第二步** — 验证答案并重置：

```
POST /api/auth/reset-password
{ username, securityAnswer, newPassword }
```

服务器验证 `securityAnswer` 与 `securityAnswerHash` 匹配后，更新 password_hash。先验答案再进密码设置步骤，答案错误停留在第二步。

### 2.6 修改密码

```
POST /api/auth/change-password
{ securityAnswer, newPassword }
```

需登录状态 + 安全问题答案验证。

### 2.7 注销账户

```
POST /api/auth/delete-account
{ securityAnswer }
```

安全问题验证通过后，级联删除用户所有关联数据（分路偏好、英雄战力、赛事记录、管理员关系等）。不可逆操作。

### 2.8 中间件认证守卫

`src/middleware.ts` 拦截所有请求：

| 路径类型 | 行为 |
|----------|------|
| 公开页面 | `/` `/login` `/register` `/heroes` `/tournaments` `/changelog` `/monitor` `/debug` `/equipment` — 直接放行 |
| 受保护页面 | `/me` `/admin` — 无 session 重定向到 `/login?redirect=原路径` |
| 公开 API | `/api/auth` `/api/official-news` `/api/announcements` `/api/tournaments/public` `/api/heroes` `/api/equipment` — 直接放行 |
| 受保护 API | 其余所有 `/api/*` — 无 session 返回 401 |
| 静态文件 | `/_next` `/favicon*` `/public` `/robots.txt` `/sitemap.xml` — 直接放行 |

`GET /api/auth/me` 额外检查：验证用户存在 + 封禁状态，被封禁用户自动销毁 session。

---

## 三、权限系统

### 3.1 角色定义

| role | 说明 |
|------|------|
| admin | 超级管理员，登录后访问 `/admin` 后台。内置账号 `admin / admin12345678` |
| user | 普通用户，无后台权限 |

### 3.2 权限函数

**`requireSuperAdmin()`** — API 层超管校验 (`src/lib/permissions.ts`)：
1. 调用 `requireAuth()` 获取当前登录用户
2. 检查 `user.role === "admin"`
3. 不满足抛出 `Error("FORBIDDEN")`

**`requireTournamentAdmin(tournamentId)`** — 赛事管理员校验：
1. 获取当前登录用户
2. 查询 `tournament_admins` 表确认该用户在赛事中有 admin 记录
3. 不满足抛出 `Error("FORBIDDEN")`

### 3.3 Admin 保护机制

- admin 用户在后台用户列表中，封禁/删除按钮隐藏（前端保护）
- `DELETE /api/admin/users/[id]` 检查目标 role，admin 用户拒绝操作（API 层保护）
- admin 用户的 `banned` 字段即便被设为 true，登录时仍可能进入系统（role 优先检查）

---

## 四、个人空间 (`/me`)

### 4.1 头像上传

| 项 | 说明 |
|----|------|
| API | `POST /api/me/avatar` (FormData) |
| 格式 | jpg / png / webp |
| 大小 | < 2MB |
| 存储 | `/data/uploads/avatars/` (仓库外) |
| 读取 | `GET /api/avatars/[filename]` (公开, Cache-Control: 24h) |
| 回退 | Header 中加载失败显示用户名首字母 |

### 4.2 游戏身份

`PATCH /api/me/profile { gameNickname, gameId }`

- `gameNickname` 最长 32 字符，`gameId` 最长 64 字符，空字符串归一化为 `null`。
- owner/co_owner 可在赛事成员列表查看所有成员（含自己）的站内账号、UID、游戏昵称和游戏 ID。
- 普通成员与访客的赛事详情响应不包含游戏昵称和游戏 ID。

### 4.3 段位设置

| 字段 | 说明 |
|------|------|
| 当前段位 | 11级：青铜 → 白银 → 黄金 → 铂金 → 钻石 → 星耀 → 王者 → 无双王者 → 荣耀王者 → 传奇王者 |
| 历史最高 | 同上 11 级 |
| 巅峰分 (peakScore) | 历史最高 ≥ 最强王者时启用，最低 1200；否则禁用并保存为 0 |
| 巅峰段位 (peakRank) | 同上 11 级 |

### 4.4 分路偏好

`GET/PUT /api/users/me/roles`

5 路排序设置，`preference_rank` 1-5 (1=最擅长)，每路可设：
- `role_rank` — 该分路的当前段位 (0-10，0 表示无段位)
- `peak_score` — 该分路巅峰分
- `peak_rank` — 该分路巅峰段位

`peak_rank >= 7`（最强王者）才具备巅峰赛资格。客户端加载、段位切换和保存时均执行归一化，PUT API 再次校验：有资格时 `peak_score >= 1200`，无资格时强制为 0。五路 `peak_rank` 统一为历史最高段位。

5 路：对抗路 (top)、打野 (jungle)、中路 (mid)、发育路 (adc)、游走 (support)

### 4.5 英雄战力

`GET/POST/DELETE /api/users/me/heroes`

| 规则 | 说明 |
|------|------|
| 每分路 | 最多 3 个英雄 |
| 搜索 | 拼音首字母/全拼/中文名/英雄 ID |
| 存储 | 按分路分组，记录 heroId + heroName + powerScore |
| 精度 | powerScore 必须为 1-999999 的整数，存储与展示不做百位取整 |

### 4.5 分路段位自动计算

系统根据每分路前 5 个英雄的**原始战力**总和除以 1000 自动计算分路段位；英雄战力不做中间取整，最终段位固定向下取整为非负整数。

---

## 五、赛事系统

### 5.1 数据模型

| 表 | 关键字段 |
|-----|---------|
| tournaments | id, code(6位邀请码), name, deadline, status, isPublic, announcement, split_result(JSON) |
| tournament_players | tournament_id, user_id, role_type, isSpectator, isTemporary, tempName |
| tournament_admins | tournament_id, user_id, role (owner/co_owner) |
| tournament_picks | tournament_id, user_id, team(red/blue), role_type, hero_id, equip_json |
| temp_player_applications | tournament_id, applicant_id, temp_name, status(pending/approved/rejected) |
| admin_operations | tournament_id, admin_id, action, target_id, created_at |

### 5.2 赛事状态机

```
recruiting → locked → completed → finished
```

| 状态 | 说明 | 触发条件 |
|------|------|----------|
| recruiting | 招募中 | 创建后默认状态，可加入/退出 |
| locked | 已锁定 | 管理员锁房或截止时间到期（cron 每分钟检查） |
| completed | 已分队 | 管理员执行分队操作后 |
| finished | 已结束 | 管理员手动结束 |

### 5.3 创建赛事

`POST /api/tournaments`

| 参数 | 说明 |
|------|------|
| name | 赛事名称 (≤64字符) |
| deadline | 截止时间（日历选择日期，双滚轮选择小时和 5 分钟粒度的分钟） |
| isPublic | 是否公开 (公开赛事出现在 `/tournaments` 列表) |
| announcement | 赛事公告 (可选) |

创建后自动生成 6 位邀请码 (`code`)，创建者自动成为 `owner`。

### 5.4 加入赛事

| 方式 | API |
|------|-----|
| 公开列表 | `GET /api/tournaments/public` → 点击加入 |
| 邀请码 | `POST /api/tournaments/join-by-code { code, roleType, isSpectator? }` |
| 详情页 | `POST /api/tournaments/[id]/join` |

加入时选择分路 (`roleType`)，可选观战 (`isSpectator`)。观战玩家不参与分队。

### 5.5 赛事管理

| 操作 | API | 权限 | 说明 |
|------|-----|------|------|
| 分队 | `POST /api/tournaments/[id]/split` | owner/co_owner | ≥10 人可分队，结果存库刷新不丢 |
| 踢人 | `POST /api/tournaments/[id]/kick` | owner/co_owner | 不能踢除 owner |
| 延长截止 | `POST /api/tournaments/[id]/extend` | owner/co_owner | 延长截止时间 |
| 公开切换 | `PUT /api/tournaments/[id]` | owner/co_owner | 切换 isPublic |
| 任命管理 | `POST /api/tournaments/[id]/admin` | owner | 任命/撤销 co_owner |
| 退出 | `POST /api/tournaments/[id]/leave` | 玩家本人 | owner 不可退出；退出后无有效成员则删除房间 |
| 观战切换 | `POST /api/tournaments/[id]/join` | 玩家本人 | 更新 isSpectator 状态 |
| 临时玩家 | `POST /api/tournaments/[id]/temp-player` | owner/co_owner | 添加非注册临时玩家 (仅名称) |
| 处理申请 | `POST /api/tournaments/[id]/temp-application/[appId]` | owner/co_owner | 审批临时玩家加入申请 |
| 取消赛事 | `DELETE /api/tournaments/[id]` | owner | 取消整个赛事 |
| 查看成员身份 | `GET /api/tournaments/[id]` | owner/co_owner | 返回全员站内账号、UID、游戏昵称、游戏 ID |

### 5.6 层级权限

```
owner > co_owner > player
```

只有 owner 可以任命/撤销 co_owner 和取消赛事。co_owner 拥有除任命管理和取消赛事外的所有管理权限。

补位账号标记为 `users.is_temporary=true`，不进入后台用户管理和用户统计。截止任务处理 recruiting/locked 过期房间时删除补位账号，由外键级联清理成员与战力记录。

房间生命周期保证至少存在一名非观战成员和一名 owner。成员退出/被踢后若有效成员归零，事务内直接删除房间；房主注销或被后台删除时，其拥有的房间同步删除。公开列表过滤历史空房间，cron 定期物理清理零成员或无 owner 的遗留记录。

### 5.7 临时玩家系统

非注册用户的参与机制：
1. 申请人发起 `POST /api/tournaments/[id]/temp-application { tempName }`
2. 管理员在申请列表中审批 (approve/reject)
3. 通过后以 `isTemporary=true + tempName` 加入玩家列表
4. 临时玩家参与分队计算（用默认段位和空战力）

### 5.8 英雄选择 (TournamentPick)

分队完成后，每路选手可为自己的位置选择英雄和装备方案：
- `POST/GET /api/tournaments/[id]/picks` — 提交/查看选择
- 按 team (red/blue) + role_type 分组展示
- 装备方案以 JSON 数组存储 `[itemId, itemId, ...]`

---

## 六、分队算法

`src/lib/split.ts` — 两阶段组合优化 + 五维评分

### 6.1 实力计算

每个玩家在某分路上的战斗实力 (`computeStrength`) 由四部分组成：

| 组件 | 公式 | 最大贡献 |
|------|------|----------|
| 英雄战力 | (该分路前 3 英雄平均战力) / 30 | ~400 |
| 巅峰分 | peakScore / 7 | ~357 |
| 当前段位 | roleRank × 15 | 135 |
| 巅峰段位 | peakRank × 10 | 90 |
| **合计** | | **~1000** |

### 6.2 阶段一：分路分配

将 10 名玩家分配到 5 个分路，每路恰好 2 人。

```
5 路 × 每路选 2 人 = C(10,2) × C(8,2) × C(6,2) × C(4,2) × C(2,2) = 113,400 种方案
```

通过递归组合枚举全部方案，不剪枝。

### 6.3 阶段二：红蓝分队

每种分路分配方案中，5 路各有 2 人，通过 5 位 bitmask (32 种方式) 决定谁去红队谁去蓝队，每次计算两队实力差，取差值最小的分队方式。

### 6.4 五维评分函数

```
总分 = 偏好分×350 + 段位覆盖×50 + (-实力差)×30 + (-段位差)×15 + (-罚分)×200
```

| 维度 | 权重 | 说明 |
|------|------|------|
| 偏好满足 | ×350 | rank 1 = 5分, rank 5 = 1分; 最强分路额外 +3 |
| 段位覆盖 | ×50 | 有段位的人匹配到对应分路的数量 |
| 实力均衡 | ×30 (负) | 两队实力总和的差值，越小越好 |
| 段位均衡 | ×15 (负) | 两队段位总和的差值，越小越好 |
| 公平罚分 | ×200 (负) | 4/5 位偏好扣分；0 战力被分到该路的罚分 (按玩家实力加权) |

### 6.5 实力差判定

| 实力差 | 判定 |
|--------|------|
| ≤200 | 完美均衡 |
| ≤500 | 基本均衡 |
| >500 | 需人工调整 |

### 6.6 技术细节

- 仅支持恰好 10 人分队，多余人员静默排除
- 分队结果 (split_result JSON) 存入数据库，刷新不丢失
- 已分队不可重新分队（状态保护）

---

## 七、英雄图鉴

### 7.1 数据来源

| 数据源 | URL |
|--------|-----|
| 英雄列表 JSON | `pvp.qq.com/web201605/js/herolist.json` |
| 英雄列表页 | `pvp.qq.com/web201605/herolist.shtml` |
| 英雄详情页 | `pvp.qq.com/web201605/herodetail/{id}.shtml` |
| 英雄图片 | `game.gtimg.cn/images/yxzj/img201606/heroimg/{id}/{id}.jpg` |
| 皮肤图片 | `game.gtimg.cn/images/yxzj/img201606/skin/hero-info/{id}/{id}-bigskin-{idx}.jpg` |

所有爬取 URL 可通过 `/admin/settings` 配置，存储在 `kv_cache key: config:crawl_urls`。

### 7.2 Hero 模型

| 字段 | 类型 | 说明 |
|------|------|------|
| hero_id | INT UNIQUE | 官方 ID |
| name | VARCHAR(64) | 英雄名称 |
| title | VARCHAR(64) | 称号 |
| role_type | VARCHAR(16) | 分路 (官方映射 + 手动修正) |
| hero_type | INT | 主职业 (1战士/2法师/3坦克/4刺客/5射手/6辅助) |
| hero_type2 | INT | 副职业 |
| image_url | VARCHAR(255) | 头像图片 |
| skins_json | TEXT? | 皮肤列表 JSON |
| skills_json | TEXT | 技能 JSON (逐步迁移至 hero_skills 表) |
| base_json | JSON? | 基础属性 (hp/mp/atk/ap/def/mdef/atkSpeed/moveSpeed/每级成长) |
| data_hash | VARCHAR(64)? | 数据指纹 (技能+皮肤的 MD5) |
| mingge | BOOLEAN | 是否有命格形态 |
| mingge_name | VARCHAR(64)? | 命格形态名称 |
| mingge_related_id | INT? | 命格关联的英雄 ID |

### 7.3 HeroSkill 模型

| 字段 | 类型 | 说明 |
|------|------|------|
| hero_id | INT (FK) | 关联英雄 |
| skill_index | INT | 0=被动 1-4=主动技能 |
| name | VARCHAR(64) | 技能名称 |
| cd | VARCHAR(32) | 冷却时间 |
| cost | VARCHAR(32) | 消耗 (蓝量/能量) |
| desc | TEXT | 技能描述 |
| damage_type | VARCHAR(8)? | 伤害类型 (physical/magic/true) |
| data_hash | VARCHAR(64) | 数据指纹 |
| extra_json | JSON? | 扩展：伤害公式解析结果 (base_damage, ad_bonus, ap_bonus...) |

唯一约束：`[hero_id, skill_index]`

### 7.4 官方职业转分路映射

| 官方职业 | 分路 |
|----------|------|
| 1 战士 | top (对抗路) |
| 2 法师 | mid (中路) |
| 3 坦克 | top (对抗路) |
| 4 刺客 | jungle (打野) |
| 5 射手 | adc (发育路) |
| 6 辅助 | support (游走) |

### 7.5 手动分路修正

`hero_lane_overrides` 表：hero_id + role_type。外部同步**不覆盖**此表数据，保证手动修正的持久性。

### 7.6 英雄列表页 (`/heroes`)

| 功能 | 说明 |
|------|------|
| 分路筛选 | 全部/对抗路/打野/中路/发育路/游走 |
| 职业筛选 | 全部/战士/法师/坦克/刺客/射手/辅助 |
| 搜索 | 拼音首字母/全拼/中文名/英雄 ID 实时过滤 |
| 卡片 | 头像 + 名称 + 称号 + 分路标签(彩色) + 职业标签(彩色) |
| 命格徽章 | `mingge=true` 显示特殊徽章标记 |
| 网格布局 | 响应式自适应列数 |

### 7.7 英雄详情页 (`/heroes/[id]`)

| 模块 | 说明 |
|------|------|
| 英雄信息 | 大图 + 名称 + 称号 + 标签 |
| 技能展示 | 被动 + 4 主动技能，每个技能显示 CD/消耗/描述，自动解析伤害公式 |
| 皮肤切换 | 皮肤列表缩略图，点击切换显示 |
| 基础属性 | 1 级 / 15 级对比表格 (HP/MP/ATK/AP/DEF/MDEF/攻速/移速) |
| 命格切换 | `minggeRelatedId` 存在时，显示切换到命格形态的按钮，跳转到关联英雄页 |

### 7.8 英雄选择器 (`HeroSelect`)

可复用组件，用于个人空间英雄战力选择等场景：
- 拼音首字母/全拼/中文/ID 模糊搜索
- 下拉列表 + 英雄头像
- 支持多选/单选模式

---

## 八、装备图鉴

### 8.1 数据来源

`pvp.qq.com/web201605/js/item.json` — 约 120 件装备。

### 8.2 Equipment 模型

| 字段 | 类型 | 说明 |
|------|------|------|
| item_id | INT UNIQUE | 官方装备 ID |
| name | VARCHAR(64) | 装备名称 |
| price | INT | 价格 |
| image_url | VARCHAR(255)? | 图标 |
| atk/ap/def/mdef/hp/mp | INT | 基础属性 |
| cd_reduce | INT | 冷却缩减 (%) |
| atk_speed | INT | 攻速 (%) |
| move_speed | INT | 移速 |
| crit_rate | INT | 暴击率 (%) |
| lifesteal | INT | 物理吸血 (%) |
| passive_json | JSON? | 被动效果 [{name, desc, unique}] |
| components | JSON? | 合成路径 [itemId, ...] |
| extra_json | JSON? | {itemType, tier, tags, stats} |
| data_hash | VARCHAR(64)? | 数据指纹 |

### 8.3 装备列表页 (`/equipment`)

| 功能 | 说明 |
|------|------|
| 等级筛选 | 全部/一级/二级/三级 |
| 特性筛选 | 物理/法术/防御/打野/辅助/移速 + 物攻/法强/物防/法防/生命/法力/冷却/攻速/暴击/吸血 |
| 搜索 | 装备名称模糊搜索 |
| 卡片 | 图标 + 名称 + 价格 + 属性列表 + 被动效果 |

### 8.4 装备详情页 (`/equipment/[id]`)

完整属性表 + 合成路径 + 被动效果详情。

### 8.5 等级与特性自动计算

| 计算 | 逻辑 |
|------|------|
| tier (等级) | 名称含"·"→3级; price≤400→1级; price≤2000→2级; 否则→3级 |
| tags (特性) | item_type 映射基础分类 + 非零属性映射对应标签 |

### 8.6 被动效果解析

正则提取描述中的"唯一被动-xxx：描述文本"，自动拆分为 name/desc/unique 结构。

---

## 九、伤害公式引擎

`src/engine/combat.ts` — 社区验证版伤害计算，用于英雄详情页展示理论伤害。

### 9.1 核心公式

```
免伤率 = 有效抗性 / (602 + 有效抗性)
有效抗性 = (总抗性 - 固定穿透) × (1 - 百分比穿透)  ← 先固后百分比
最终伤害 = 攻击力 × (1 - 免伤率)
暴击伤害 = 基础伤害 × 暴击效果 (默认 200%)
真实伤害 = 无视抗性
```

### 9.2 属性模板

按职业预设 1 级基础属性 + 每级成长：
- 战士：高血量高攻，均衡防御
- 法师：低血量，高魔防成长
- 坦克：最高血量，最高物防
- 刺客：中血量，最高攻速
- 射手：中血量，最高暴击
- 辅助：均衡型

### 9.3 技能伤害解析

从技能描述的全文文本中正则提取：
- 基础伤害：`造成(\d+(/\d+)*)点(物理/法术/真实)伤害`
- 加成系数：`(+X%物理攻击)` `(+X%法术攻击)` 等
- 护盾/回复：独立解析
- 控制效果：击飞/眩晕/减速/沉默/嘲讽/压制/定身/石化及持续时间

### 9.4 关键博弈点

| 拐点 | 说明 |
|------|------|
| 穿透拐点 | 对方护甲 > 500 时百分比穿透收益开始超固定穿透 |
| 护甲拐点 | 约 800 护甲后堆血量更划算 |

---

## 十、命格系统

### 10.1 数据结构

Hero 表三个命格字段：

| 字段 | 说明 |
|------|------|
| mingge | 该英雄是否有命格形态 |
| mingge_name | 命格形态名称 (如"心魔六耳") |
| mingge_related_id | 命格形态对应的另一个英雄 ID |

### 10.2 爬虫检测

从详情页 HTML 检测：
1. 搜索"命格"关键词
2. 正则提取命格名称：`命格：心魔六耳` / `命格形态：心魔六耳` 等模式
3. 仅在爬虫**正面检测到**时更新 mingge，不覆盖已有数据

### 10.3 前端展示

- 英雄列表卡片：命格英雄显示特殊徽章
- 详情页：`minggeRelatedId` 存在时，显示"切换到命格形态"按钮

---

## 十一、数据同步与监控

### 11.1 英雄同步 (`src/lib/heroes/sync.ts`)

**触发方式：**
| 方式 | 说明 |
|------|------|
| cron 启动 | 启动 5s 后全量同步 |
| 每日定时 | 每天 06:00 全量同步 (无条件) |
| 监控触发 | 每 3 分钟巡检，发现变化自动触发 |
| 超管手动 | `/admin/settings` 页面手动触发 |

**同步流程：**
1. 获取英雄列表（herolist.shtml 与 herolist.json 取并集，避免命格/新英雄只存在 JSON 时丢失）
2. 并发 8 并行爬取详情页（数字页优先，拼音页兜底）
3. 解析：技能 + 官方 JSON 最新皮肤名称 + 命格；皮肤保存 bigskin/mobileskin/heroimg 候选
4. GBK/UTF-8/GB2312 编码自动检测
5. 计算 dataHash (MD5: 技能+皮肤) 用于变化检测
6. 写入 hero_skills 拆表（先删后插）
7. 按固定 heroId 恢复孙悟空(167) ↔ 心魔六耳(549)关系并清除 Redis 缓存
8. daily/initial 同步后立即刷新本地图片；fallback 来源升级后覆盖旧文件

**同步策略：**
- 新英雄：INSERT
- 已有英雄：对比 dataHash，有变化则 UPDATE（保留 role_type）
- 命格：仅在正面检测到时更新，不清除已有数据

### 11.2 装备同步 (`src/lib/equipment/sync.ts`)

1. 请求 item.json
2. 兼容嵌套数组和对象两种 JSON 格式
3. 正则解析属性值 (des2 字段)
4. 自动计算 tier / tags / passives
5. upsert 入库

### 11.3 实时监控 (`src/lib/monitor/index.ts`)

五模块独立监控，轻量检查 (不爬详情页)：

| 模块 | 方法 | 检测内容 |
|------|------|----------|
| news | GICP API 取最新公告标题 | 对比 kv_cache 中的 news_last_title |
| heroes | herolist.json | 数量 + 首尾名称 + 每 20 个采样 + 命格英雄额外采样 |
| skins | herolist.json | 全量 skin_name 与数据库批量比较，避免抽样漏报 |
| skills | herolist.json → 爬详情页 | 50% 随机采样，完整爬取→计算 dataHash 对比 |
| items | item.json | 整体 MD5 指纹对比 |

### 11.4 SSE 推送

`GET /api/heroes/watch` — Server-Sent Events 长连接：
- 后台监控发现变化时广播 MonitorEvent
- 前端图鉴、详情页收到推送后自动刷新数据
- Nginx 配置：`proxy_buffering off` + 86400s 超时

### 11.5 反爬机制 (`src/lib/anti-bot.ts`)

| 策略 | 说明 |
|------|------|
| UA 轮换 | 5 个真实浏览器 UA (Chrome/Firefox, Win/Mac/Linux) |
| 请求头 | 完整的 Accept/Accept-Language/Cache-Control |
| 退避重试 | 403/429/503 → 等待 3s/6s/9s/12s + 随机抖动 |
| 超时 | 10s 请求超时，最多 5 次重试 |
| 降级 | 理论上支持 Playwright 无头浏览器降级 (Tier 2，已预留) |

### 11.6 Cron 定时任务 (`scripts/cron.ts`)

| 任务 | 频率 | 说明 |
|------|------|------|
| 初始全量同步 | 启动 5s 后 | 首次填充数据库 |
| 每日全量同步 | 06:00 | 无条件完整同步 |
| 监控巡检 | 每 3 分钟 | 轻量检查 → 变化则触发同步 |
| 截止时间检查 | 每 1 分钟 | recruiting → locked (deadline 已到) |
| 内存检查 | 每 30 分钟 | < 150MB 时 drop page cache |

---

## 十二、双主题系统

### 12.1 主题架构

| 主题 | Hash | 数据属性 | 定位 |
|------|------|----------|------|
| 演武 #1 | `#1` | `data-theme="yanwu"` | 桌面主力 |
| 厚玻璃 #2 | `#2` | `data-theme="alternate"` | 移动主力 + 桌面可选 |

无 hash 默认 #1。所有内部链接 (`<Link>`) 自动保留当前 hash。

### 12.2 主题差异对照

| 维度 | #1 演武 | #2 厚玻璃 |
|------|---------|-----------|
| 基底色 | `#161920` (石板灰) | `#efeff2` (浅灰) |
| 强调色 | `#a89068` (暖铜金) | `#4488f0` (系统蓝) |
| 卡片 | 暗琉璃渐变 (顶部微光) | 62%白 + backdrop-blur 28px + 多层阴影 |
| 圆角 | 6px | 16px |
| Header 高度 | 56px | 34px (桌面) |
| Dock | 仅移动端 | 桌面 + 移动端常驻 |
| 光球色 | 暖金/琥珀 | 青绿 `#00e5a0` + 亮蓝 `#4488ff` + 紫罗兰 `#7c5cfc` |

### 12.3 CSS 变量全隔离

所有颜色/圆角/边框/阴影统一通过 CSS 变量控制，变量定义在 `data-theme` 选择器下。20+ 变量：
`--bg-root` `--bg-nav` `--bg-card` `--bg-hover` `--bg-input` `--border` `--border-light` `--text` `--text-secondary` `--text-muted` `--gold` `--gold-light` `--gold-dim` `--red` `--blue` `--green` `--radius-sm` `--radius` `--radius-lg`

### 12.4 防 FOUC

`src/app/layout.tsx` 内的内联 `<script>` 在 HTML 解析前读取 `location.hash` 并设置 `data-theme` 属性，确保首帧即正确主题。

### 12.5 关键文件

| 文件 | 说明 |
|------|------|
| `src/themes/ThemeProvider.tsx` | React Context + data-theme 设置 |
| `src/themes/types.ts` | ThemeId / ThemeColors 类型 |
| `src/themes/ui-config.ts` | UI 布局配置 (headerHeight/dock 开关) |
| `src/app/globals.css` | 所有 CSS 变量 + 双主题样式 |
| `src/components/layout/Dock.tsx` | 底部导航 (根据主题控制显示) |
| `src/components/layout/Header.tsx` | 顶部导航 |

### 12.6 背景光球系统 (`BackgroundOrbs`)

三颗动态光球，CSS 变量全作用域在 `.bg-orbs-container` 内部：
- **鼠标驱赶**：反向逃逸，力曲线 `0.5/(1+dist×4)`
- **手机陀螺仪**：倾斜驱赶 + 摇晃打散
- **接近度感应**：贴近变亮变清晰
- **性能**：rAF 节流 60fps，CSS transition 桌面 `0.8s ease-out` / 移动端 `0.12s linear`
- **尺寸**：桌面固定 px，移动端 vw 比例

---

## 十三、移动端

### 13.1 UA 检测

`src/middleware.ts` — 正则匹配移动端 UA：

```
/Android|iPhone|iPad|iPod|webOS|BlackBerry|Windows Phone|Mobile/i
```

命中后 307 重定向到 `/m` 路由。API 请求不触发重定向。

### 13.2 /m 路由架构

`src/app/m/` 下每个页面 re-export 主路由的同名页面：

```
src/app/m/page.tsx → export { default } from "@/app/page"
src/app/m/login/page.tsx → export { default } from "@/app/login/page"
...
```

所有功能完全一致，仅布局和组件可能根据屏幕尺寸响应式调整。后台管理 `/m/admin/*` 和调试 `/m/debug/*` 同步 re-export。

### 13.3 移动布局差异

- **主题 #1**：Header 56px + 移动端 Dock 显示
- **主题 #2**：Header 34px + Dock 常驻
- 光球尺寸使用 vw 比例

---

## 十四、后台管理系统

`/admin` 使用独立 layout (server component)，从 ThemeLayout 中排除（无 Header/Dock）。包含 `AdminSidebar` (w-44 紧凑布局，bg-nav 材质)。

### 14.1 仪表盘 (`/admin`)

`GET /api/admin/stats` — 统计概览：

| 统计项 | 说明 |
|--------|------|
| 用户数 | users 表 COUNT |
| 赛事数 | tournaments 表 COUNT |
| 英雄数 | heroes 表 COUNT |

### 14.2 用户管理 (`/admin/users`)

| API | 说明 |
|-----|------|
| `GET /api/admin/users` | 用户列表 (分页 + 搜索) |
| `POST /api/admin/users` | 新增用户 (admin only) |
| `DELETE /api/admin/users/[id]` | 删除用户 (admin 不可删) |

- admin 用户前端隐藏封禁/删除按钮
- API 层拒绝操作 admin 用户
- 支持封禁/解封切换

### 14.3 房间管理 (`/admin/tournaments`)

| API | 说明 |
|-----|------|
| `GET /api/admin/tournaments` | 全部赛事列表 |
| `DELETE /api/admin/tournaments?id=X` | 删除赛事 (级联删除关联数据) |

### 14.4 英雄分路管理 (`/admin/heroes`)

| API | 说明 |
|-----|------|
| `GET /api/heroes` | 全部英雄 (含当前分路) |
| `PATCH /api/heroes/[id] { roleType, secondaryRoleTypes }` | 修正主分路与附属分路，仅 admin |

- 修改即时写入 `hero_lane_overrides` 表
- 附属分路写入 `hero_secondary_lanes`，主分路会从附属分路中自动剔除
- 外部同步不覆盖手动修正
- 支持 FLIP 重排动画

### 14.5 系统公告管理 (`/admin/announcements`)

| API | 说明 |
|-----|------|
| `GET /api/admin/announcements` | 公告列表 |
| `POST /api/admin/announcements` | 创建公告 |
| `PATCH /api/admin/announcements/[id]` | 编辑公告 |
| `DELETE /api/admin/announcements/[id]` | 删除公告 |

公告模型：title, version, brief, content, slug, published, created_at, updated_at

### 14.6 系统设置 (`/admin/settings`)

| 功能 | 说明 |
|------|------|
| 爬取地址配置 | hero_list_page, hero_list_json, hero_detail_base, hero_img_base, skin_img_base — 存储在 kv_cache |
| 手动同步 | 触发英雄+装备同步，SSE 推送进度 |
| 同步进度条 | 轮询 `/api/admin/sync-status` 展示实时进度 |

---

## 十五、调试面板 (`/debug`)

独立于后台，仅需登录即可访问（非超管也可用）。中间件公开路径。

| 子页面 | 说明 |
|--------|------|
| `/debug` | 基础调试工具 |
| `/debug/login-effect` | 登录 GlassShatter 动画预览与调试 |
| `/debug/orb-colors` | 光球配色预览与调试 |

---

## 十六、公告与更新日志

### 16.1 系统公告

`GET /api/announcements` — 公开接口，返回已发布公告列表。
`GET /api/announcements/[id]` — 单篇公告详情。

前端 `useAnnouncements(full?)` hook：
- `full=false`：仅返回 latestVersion 用于 Header 版本号显示
- `full=true`：返回完整公告列表

### 16.2 更新日志 (`/changelog`)

公告表复用为更新日志 (通过 `slug` 标识)。分类展示：
- `/changelog` — 列表页，按时间倒序
- `/changelog/[slug]` — 详情页

### 16.3 官方新闻

`GET /api/official-news` — 代理转发王者荣耀官方 GICP API，返回最新公告/新闻数据。

---

## 十七、SEO 与页面元数据

| 文件/配置 | 说明 |
|-----------|------|
| `src/app/layout.tsx` metadata | title: "王者演武堂", description: "王者荣耀内战分队系统" |
| `favicon.ico` | 应用图标 |
| `robots.txt` | 爬虫白名单 |
| `sitemap.xml` | 站点地图 |
| `not-found.tsx` | 自定义 404 页面 |
| canonical | 页面规范 URL (防止重复索引) |

---

## 十八、安全

### 18.1 密码安全

- bcrypt 10 轮哈希，明文不落盘
- 远程 MySQL 连接，凭据通过环境变量注入
- 安全问题和答案同样 bcrypt 哈希

### 18.2 会话安全

- iron-session 加密 cookie (`wzyt_session`)
- 生产环境 `secure: true` (仅 HTTPS)
- 90 天有效期
- 服务端 session 密封 (seal)，客户端无法篡改

### 18.3 封禁机制

- User.banned 字段
- 登录时检查：被封禁返回 403
- `GET /api/auth/me` 检查：被封禁自动销毁 session
- admin 用户不可被封禁/删除

### 18.4 权限保护

- 所有受保护 API 端点在中间件/函数层双重校验
- 赛事操作验证归属权 (tournament_admins)
- Admin 用户受前端 + API 双重保护

### 18.5 输入校验

- 用户名最长 32 字符，UNIQUE 约束
- 密码长度要求 ≥ 11 位
- 头像：格式白名单 (jpg/png/webp) + 大小限制 (2MB)
- API 层统一错误处理

---

## 十九、前端架构

### 19.1 核心 Hooks

| Hook | 提供 |
|------|------|
| `useAuth()` | `{ user: { userId, username, role?, avatar? }, loaded, logout }` |
| `useAnnouncements(full?)` | `{ announcements, loaded, latestVersion }` |
| `useRolePreferences()` | 段位/分路/英雄 state + API 方法 + FLIP 动画状态 |

### 19.2 全局组件

| 组件 | 说明 |
|------|------|
| ThemeLayout | 根布局，排除 /admin 路径 |
| Header | 顶部导航 (含用户菜单/头像/修改密码/注销) |
| Dock | 底部导航栏 (根据主题和屏幕尺寸决定显示) |
| BackgroundOrbs | 三颗动态背景光球 |
| CursorLighting | 鼠标跟随光照效果 |
| PageEntrance | 页面进入动画包装器 |
| Toast | 全局消息提示 (ToastProvider + useToast) |
| GlassShatter | 登录成功裂纹震碎动画 |
| CalendarModal | 通用日历选择弹窗 (Portal 渲染, 响应式) |
| SecurityQuestionModal | 安全问题验证弹窗 (修改密码/注销) |
| DeleteAccountModal | 注销账户确认弹窗 |

### 19.3 页面动画

- `src/app/template.tsx`：全局页面切换过渡，`key={pathname}` 确保每次导航重播
- `.stagger-enter` CSS 类：直接子元素错峰浮现 (0.15s 间隔)
- 英雄分路编辑器：FLIP 重排动画

### 19.4 登录动画 (GlassShatter)

卡片裂纹扩散后震碎为三角碎片飞散坠落：
1. 初始裂纹从中心向外随机扩散
2. 震碎阶段卡片裂为多个三角形碎片 (Delaunay 三角剖分)
3. 碎片带有原卡片纹理，飞散旋转坠落
4. 动画完成后触发路由跳转

### 19.5 用户菜单

Header 用户头像点击展开下拉菜单：
- 个人空间 (`/me`)
- 修改密码 (弹出 SecurityQuestionModal)
- 注销账户 (弹出 DeleteAccountModal)
- 后台管理 (仅 role=admin 显示)
- 调试面板 (`/debug`)
- 切换主题
- 登出

---

## 二十、开发与部署

### 20.1 本地开发

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

### 20.2 部署

`bash scripts/deploy.sh` — 完整部署流程：
SSL 证书 → git pull → npm install → prisma generate → 英雄同步 → npm run build → pm2 restart

### 20.3 服务器配置

| 组件 | 路径/配置 |
|------|-----------|
| Nginx | `/opt/Nginx/nginx.1.30.2/` |
| 站点配置 | `conf.d/sites/` |
| SSL | Let's Encrypt + acme.sh |
| PM2 | `ecosystem.config.js` (生产端口 8081) |
| 代理 | 80/443 → 127.0.0.1:8081 |
| SSE | `proxy_buffering off` + `proxy_read_timeout 86400s` |
| MySQL | 38.22.234.148:3306, 数据库 yanwutang_test |
| Redis | 同上服务器，密码认证 |

### 20.4 环境变量

| 变量 | 说明 |
|------|------|
| DATABASE_URL | MySQL 连接字符串 |
| SESSION_SECRET | iron-session 加密密钥 (≥32 字符) |
| SESSION_SECURE | 是否启用 secure cookie (生产: "true") |
| REDIS_URL | Redis 连接字符串 |

---

## 二十一、API 路由完整列表

### 21.1 认证模块

| 路由 | 方法 | 说明 | 权限 |
|------|------|------|------|
| /api/auth/register | POST | 注册 | 公开 |
| /api/auth/login | POST | 登录 | 公开 |
| /api/auth/logout | POST | 登出 | 登录 |
| /api/auth/me | GET | 当前用户信息 + 封禁检查 | 登录 |
| /api/auth/security-question | GET | 查询安全问题 (?username=) | 公开 |
| /api/auth/reset-password | POST | 重置密码 | 公开 (需答案) |
| /api/auth/change-password | POST | 修改密码 | 登录 |
| /api/auth/delete-account | POST | 注销账户 | 登录 |

### 21.2 个人空间

| 路由 | 方法 | 说明 | 权限 |
|------|------|------|------|
| /api/me/avatar | POST | 上传头像 (FormData) | 登录 |
| /api/avatars/[filename] | GET | 读取头像 | 公开 |
| /api/users/me/roles | GET | 获取分路偏好 | 登录 |
| /api/users/me/roles | PUT | 更新分路偏好 | 登录 |
| /api/users/me/heroes | GET | 获取英雄战力 | 登录 |
| /api/users/me/heroes | POST | 添加英雄战力 | 登录 |
| /api/users/me/heroes | DELETE | 删除英雄战力 | 登录 |

### 21.3 英雄图鉴

| 路由 | 方法 | 说明 | 权限 |
|------|------|------|------|
| /api/heroes | GET | 英雄列表 (?role_type=&hero_type=) | 公开 |
| /api/heroes/[id] | GET | 英雄详情 | 公开 |
| /api/heroes/[id] | PATCH | 修正分路 | 登录 |
| /api/heroes/watch | GET | SSE 实时监控 | 公开 |

### 21.4 装备图鉴

| 路由 | 方法 | 说明 | 权限 |
|------|------|------|------|
| /api/equipment | GET | 装备列表 (?tier=&tag=&q=) | 公开 |
| /api/equipment/[id] | GET | 装备详情 | 公开 |

### 21.5 赛事

| 路由 | 方法 | 说明 | 权限 |
|------|------|------|------|
| /api/tournaments | GET | 我的赛事列表 | 登录 |
| /api/tournaments | POST | 创建赛事 | 登录 |
| /api/tournaments/public | GET | 公开赛事列表 | 公开 |
| /api/tournaments/join-by-code | POST | 邀请码加入 | 登录 |
| /api/tournaments/[id] | GET | 赛事详情 | 登录 |
| /api/tournaments/[id] | PUT | 修改赛事 | owner/co_owner |
| /api/tournaments/[id] | DELETE | 取消赛事 | owner |
| /api/tournaments/[id]/join | POST | 加入/更新信息 | 登录 |
| /api/tournaments/[id]/leave | POST | 退出赛事 | 玩家本人 |
| /api/tournaments/[id]/split | POST | 分队 | owner/co_owner |
| /api/tournaments/[id]/kick | POST | 踢人 | owner/co_owner |
| /api/tournaments/[id]/extend | POST | 延长截止 | owner/co_owner |
| /api/tournaments/[id]/admin | POST | 任命/撤销 co_owner | owner |
| /api/tournaments/[id]/admin/resign | POST | 管理员辞职 | co_owner |
| /api/tournaments/[id]/temp-player | POST | 添加临时玩家 | owner/co_owner |
| /api/tournaments/[id]/temp-application | POST | 发起临时玩家申请 | 登录 |
| /api/tournaments/[id]/temp-application/[appId] | PUT | 审批申请 | owner/co_owner |
| /api/tournaments/[id]/picks | GET | 查看英雄选择 | 登录 |
| /api/tournaments/[id]/picks | POST | 提交英雄选择 | 登录 |

### 21.6 后台管理

| 路由 | 方法 | 说明 | 权限 |
|------|------|------|------|
| /api/admin/stats | GET | 仪表盘统计 | admin |
| /api/admin/users | GET | 用户列表 | admin |
| /api/admin/users/[id] | DELETE | 删除用户 | admin |
| /api/admin/tournaments | GET | 全部赛事 | admin |
| /api/admin/tournaments | DELETE | 删除赛事 | admin |
| /api/admin/announcements | GET/POST | 公告管理 | admin |
| /api/admin/announcements/[id] | PATCH/DELETE | 编辑/删除公告 | admin |
| /api/admin/settings | GET/PUT | 系统设置 | admin |
| /api/admin/sync-status | GET | 同步进度查询 | admin |
| /api/admin/sync-heroes | POST | 手动同步英雄 | admin |

### 21.7 其他公开 API

| 路由 | 方法 | 说明 | 权限 |
|------|------|------|------|
| /api/announcements | GET | 公告列表 | 公开 |
| /api/announcements/[id] | GET | 公告详情 | 公开 |
| /api/official-news | GET | 官方新闻代理 | 公开 |
| /api/changelog | GET | 更新日志列表 | 公开 |

---

## 二十二、数据库缓存层

### 22.1 Redis 配置

| 项 | 配置 |
|----|------|
| 库 | ioredis |
| TTL | 3600s (1 小时) |
| 策略 | silent fallback — Redis 不可用时所有操作静默返回 null，不影响业务 |

### 22.2 缓存操作

| 函数 | 说明 |
|------|------|
| cacheGet(domain, id) | 读取缓存 |
| cacheSet(domain, id, data, ttl?) | 写入缓存 |
| cacheDel(domain, id) | 删除单 key |
| cacheDelPattern(pattern) | 通配符批量删除 |
| cacheHGet(domain, id) | 读取 Hash |
| cacheHSet(domain, id, data, ttl?) | 写入 Hash |

### 22.3 缓存键域

| domain | 示例 key | 用途 |
|--------|----------|------|
| hero | hero:105 | 英雄详情缓存 |
| heroes | heroes:list | 英雄列表缓存 |
| item | item:1111 | 装备详情缓存 |
| items | items:list | 装备列表缓存 |

同步完成后自动清除对应缓存。

---

## 二十三、KvCache 表

通用键值存储，直接映射 MySQL：

| key | 用途 |
|-----|------|
| config:crawl_urls | 爬取地址配置 (JSON) |
| news_last_title | 新闻监控指纹 |
| items_hash | 装备数据指纹 |
| official_news | 官方新闻缓存 |
| 同步进度 key | 同步进度推送 |

---

## 二十四、版本历史

| 版本 | 日期 | 主要变更 |
|------|------|----------|
| V2.0.1 | 2026-07 | 装备图鉴完整实现、双主题系统、伤害公式引擎、SSE 实时监控、Redis 缓存层、移动端 /m 架构、后台管理 6 页面、安全系统完善 |
| V2.0.0 | 2026-06 | 命格系统、技能拆表、临时玩家系统、英雄选择、UI 重构 |
| V1.x | 2025-2026 | 核心分队算法、英雄图鉴、赛事管理、认证系统、基础 UI |
