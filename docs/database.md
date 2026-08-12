# 数据库文档

MySQL `<DB_NAME>` @ `<DB_HOST>:3306`

---

## users — 用户

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT | 主键，自增 |
| username | VARCHAR(32) | 唯一，登录用户名 |
| password_hash | VARCHAR(255) | bcrypt 加密的密码 |
| security_question | VARCHAR(255) | 找回密码的安全问题，可为空 |
| security_answer_hash | VARCHAR(255) | 安全问题答案的 bcrypt 哈希 |
| role | VARCHAR(16) | 角色：`admin` 管理员 / `user` 普通用户（默认） |
| avatar | VARCHAR(255) | 头像文件名，存储在 `/data/uploads/avatars/` |
| game_nickname | VARCHAR(32) | 游戏昵称，可为空 |
| game_id | VARCHAR(64) | 游戏 ID，可为空 |
| is_temporary | BOOLEAN | 是否为赛事补位占位账号；后台用户统计排除，房间过期后删除 |
| banned | BOOLEAN | 封禁标记（默认 false），封禁后无法登录 |
| created_at | DATETIME | 注册时间 |

**关联**：级联删除所有关联数据（偏好、战力、赛事记录等）

---

## heroes — 英雄

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT | 主键，自增 |
| hero_id | INT | 唯一，游戏内英雄 ID（ename） |
| name | VARCHAR(64) | 英雄名称 |
| title | VARCHAR(64) | 英雄称号，如"齐天大圣" |
| role_type | VARCHAR(16) | 分路：top/jungle/mid/adc/support |
| hero_type | INT | 主职业类别（1战士 2法师 3坦克 4刺客 5射手 6辅助） |
| hero_type2 | INT | 副职业类别，0 表示无 |
| image_url | VARCHAR(255) | 英雄头像图片 URL |
| skins_json | TEXT | 皮肤列表 JSON：`[{name, index}]` |
| skills_json | TEXT | 技能列表 JSON：`[{name, cd, cost, desc}]`（旧格式，逐步迁移到 hero_skills 表） |
| data_hash | VARCHAR(64) | 技能+皮肤的 MD5，用于检测数据变更 |
| mingge | BOOLEAN | 是否有命格形态 |
| mingge_name | VARCHAR(64) | 命格形态名称 |
| mingge_related_id | INT | 关联命格英雄的 hero_id |
| base_json | JSON | 基础属性：hp/mp/atk/ap/def/mdef/atkSpeed/moveSpeed/critRate 及每级成长值 |
| updated_at | DATETIME | 最后更新时间 |

**关联**：hero_skills（一对多）

---

## hero_skills — 英雄技能

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT | 主键，自增 |
| hero_id | INT | 关联 heroes.hero_id |
| skill_index | INT | 技能序号：0=被动，1-4=主动技能 |
| name | VARCHAR(64) | 技能名称 |
| cd | VARCHAR(32) | 冷却时间 |
| cost | VARCHAR(32) | 法力消耗 |
| desc | TEXT | 技能描述原文 |
| damage_type | VARCHAR(8) | 伤害类型：physical/magic/true |
| data_hash | VARCHAR(64) | 描述 MD5，检测变更 |
| extra_json | JSON | 扩展数据：`{damage: [{base, ad_bonus, ap_bonus, ...}]}` |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

**关联**：heroes（多对一，级联删除）

---

## hero_lane_overrides — 英雄分路修正

| 字段 | 类型 | 说明 |
|------|------|------|
| hero_id | INT | 主键，关联 heroes.hero_id |
| role_type | VARCHAR(16) | 手动指定的分路 |

**说明**：爬虫同步不会覆盖此表。超管通过后台英雄管理页修改分路，写入此表。API 返回英雄时优先使用此表的分路。

---

## hero_secondary_lanes — 英雄附属分路

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT | 主键，自增 |
| hero_id | INT | 关联 `heroes.hero_id`，英雄删除时级联删除 |
| role_type | VARCHAR(16) | 附属分路：top/jungle/mid/adc/support |

**约束**：`(hero_id, role_type)` 唯一。仅 admin 可通过后台维护；主分路不能重复出现在附属分路中。

---

## hero_powers — 用户英雄战力

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT | 主键，自增 |
| user_id | INT | 关联 users.id |
| role_type | VARCHAR(16) | 分路 |
| hero_id | INT | 关联 heroes.hero_id |
| hero_name | VARCHAR(64) | 英雄名称（冗余） |
| power_score | INT | 战力值 |

**关联**：users（多对一，级联删除）
**唯一约束**：(user_id, hero_id, role_type)

---

## role_preferences — 用户分路偏好

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT | 主键，自增 |
| user_id | INT | 关联 users.id |
| role_type | VARCHAR(16) | 分路 |
| preference_rank | INT | 优先级（1=最优先，5=最末） |
| role_rank | INT | 段位（1-11，青铜→传奇王者） |
| peak_score | INT | 巅峰分数 |
| peak_rank | INT | 巅峰段位 |

**关联**：users（多对一，级联删除）
**唯一约束**：(user_id, role_type)

---

## equipment — 装备

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT | 主键，自增 |
| item_id | INT | 唯一，游戏内装备 ID |
| name | VARCHAR(64) | 装备名称 |
| price | INT | 价格 |
| image_url | VARCHAR(255) | 装备图标 URL |
| atk | INT | 物理攻击 |
| ap | INT | 法术攻击 |
| def | INT | 物理防御 |
| mdef | INT | 法术防御 |
| hp | INT | 生命值 |
| mp | INT | 法力值 |
| cd_reduce | INT | 冷却缩减（%） |
| atk_speed | INT | 攻速（%） |
| move_speed | INT | 移速 |
| crit_rate | INT | 暴击率（%） |
| lifesteal | INT | 物理吸血（%） |
| passive_json | JSON | 被动效果：`[{name, desc, unique}]` |
| components | JSON | 合成路径：`[itemId, ...]` |
| data_hash | VARCHAR(64) | 数据 MD5 |
| extra_json | JSON | 扩展：tags/tier/stats 等 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

---

## tournaments — 赛事

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT | 主键，自增 |
| code | VARCHAR(8) | 唯一邀请码，6 位数字 |
| name | VARCHAR(64) | 赛事名称 |
| deadline | DATETIME | 报名截止时间 |
| status | VARCHAR(16) | recruiting（招募）/ locked（锁定）/ completed（完成）/ finished（结束） |
| is_public | BOOLEAN | 是否公开可见 |
| announcement | TEXT | 赛事公告内容 |
| split_result | JSON | 分队结果：`{teamRed: [...], teamBlue: [...], strengthDiff, preferenceScore}` |
| created_at | DATETIME | 创建时间 |

**关联**：tournament_players / tournament_admins / tournament_picks

---

## tournament_players — 参赛者

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT | 主键，自增 |
| tournament_id | INT | 关联 tournaments.id |
| user_id | INT | 关联 users.id |
| role_type | VARCHAR(16) | 报名时选择的分路 |
| is_temporary | BOOLEAN | 是否临时玩家（非注册用户） |
| is_spectator | BOOLEAN | 是否观战（不参与分队） |
| temp_name | VARCHAR(32) | 临时玩家名称 |

**唯一约束**：(tournament_id, user_id)
**关联**：tournaments / users（级联删除）

---

## tournament_admins — 赛事管理员

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT | 主键，自增 |
| tournament_id | INT | 关联 tournaments.id |
| user_id | INT | 关联 users.id |
| role | VARCHAR(16) | owner（房主）/ co_owner（协管） |

**唯一约束**：(tournament_id, user_id)
**关联**：tournaments / users（级联删除）

---

## tournament_picks — 英雄选择

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT | 主键，自增 |
| tournament_id | INT | 关联 tournaments.id |
| user_id | INT | 关联 users.id |
| team | VARCHAR(4) | 红方 red / 蓝方 blue |
| role_type | VARCHAR(16) | 分路 |
| hero_id | INT | 选择的英雄 ID |
| equip_json | JSON | 装备方案：`[itemId, ...]` |

**唯一约束**：(tournament_id, user_id)
**关联**：tournaments（级联删除）

---

## temp_player_applications — 临时玩家申请

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT | 主键，自增 |
| tournament_id | INT | 关联 tournaments.id |
| applicant_id | INT | 申请人 users.id |
| temp_name | VARCHAR(32) | 临时玩家名称 |
| status | VARCHAR(16) | pending / approved / rejected |
| created_at | DATETIME | 申请时间 |

**唯一约束**：(tournament_id, applicant_id)
**关联**：tournaments（级联删除）

---

## admin_operations — 管理操作日志

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT | 主键，自增 |
| tournament_id | INT | 关联 tournaments.id |
| admin_id | INT | 执行操作的管理员 users.id |
| action | VARCHAR(32) | 操作类型：create/split/edit/kick 等 |
| target_id | INT | 操作目标用户 ID，可为空 |
| created_at | DATETIME | 操作时间 |

---

## announcements — 系统公告

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT | 主键，自增 |
| title | VARCHAR(128) | 公告标题 |
| version | VARCHAR(32) | 版本号，如 2.0.0 |
| brief | VARCHAR(255) | 摘要，列表页展示 |
| content | TEXT | 正文（Markdown 格式） |
| slug | VARCHAR(64) | 唯一 URL 标识，如 `v2-update` |
| published | BOOLEAN | 是否发布（默认 true），false=草稿 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

---

## kv_cache — 键值缓存

| 字段 | 类型 | 说明 |
|------|------|------|
| key | VARCHAR(64) | 主键 |
| value | TEXT | JSON 字符串 |

**已有缓存键**：

| key | 用途 |
|-----|------|
| `config:crawl_urls` | 爬取地址配置（超管可修改） |
| `sync:heroes:progress` | 英雄同步进度（轮询用） |
| `heroes:list` | 英雄列表缓存（1h TTL，Redis 优先） |

---

## 表关系总览

```
users
  ├── hero_powers (1:N)
  ├── role_preferences (1:N)
  ├── tournament_players (1:N)
  ├── tournament_admins (1:N)
  └── temp_player_applications (1:N)

heroes
  └── hero_skills (1:N, hero_id)

tournaments
  ├── tournament_players (1:N)
  ├── tournament_admins (1:N)
  ├── tournament_picks (1:N)
  ├── temp_player_applications (1:N)
  └── admin_operations (1:N)

独立表：equipment / announcements / kv_cache / hero_lane_overrides
```
