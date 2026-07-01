# 王者演武堂 架构文档

## 项目概述

王者荣耀 5v5 内战分队系统，Next.js 14 全栈应用。

## 引擎 `src/engine/`

应用引擎，全项目共享基础。两个文件：

### `data.ts` — 数据层

| 模块 | 功能 |
|---|---|
| 常量 | ROLES / ROLE_LABELS / CLASS_LABELS / STAT_LABELS / TIER_LABELS / CHAR_TAGS |
| 类型 | HeroListItem / HeroDetail / EquipListItem / EquipDetail |
| 属性 | STAT_DEFS(15键) / buildEquipmentStats |
| 装备 | computeTier / computeTags / parsePassives |
| 技能 | parseSkillDamage（正则提取伤害公式） |
| 管道 | processSkill（插件化加工技能数据） |

**装备分级逻辑**（`computeTier`）：
- 名字含 `·` → 三级
- total_price ≤ 400 → 一级
- total_price ≤ 2000 → 二级
- 其余 → 三级

**特性标签**：`item_type` 映射 + stats 推断（moveSpeed 除外，移速是装备分类不是属性标签）

| item_type | 标签 |
|---|---|
| 1 | 物理 |
| 2 | 法术 |
| 3 | 防御 |
| 4 | 移速（仅鞋子） |
| 5 | 打野 |
| 7 | 辅助 |

### `animation.ts` — 动画层

缓动曲线、毛玻璃样式、错峰入场、按钮反馈、Dock 面板动画。

## Hooks `src/hooks/`

| Hook | 用途 |
|---|---|
| useAuth | 认证状态（含 role/avatar） |
| useAnnouncements | 公告列表 |
| useRolePreferences | 段位/分路/英雄战力 |

## API

### 端点

| 端点 | 说明 |
|---|---|
| GET /api/heroes | 英雄列表（支持 role_type / hero_type 筛选） |
| GET /api/heroes/:id | 英雄详情（含 skills + effects） |
| POST /api/heroes | 触发全量同步（超管） |
| GET /api/equipment | 装备列表 |
| GET /api/equipment/:id | 装备详情 |
| GET /api/announcements | 公告 |
| POST/PUT/DELETE /api/announcements | 公告管理（超管） |
| GET /api/admin/users | 用户列表（超管） |
| PATCH/DELETE /api/admin/users/:id | 用户管理（超管） |
| GET/PUT /api/admin/settings | 爬取配置（超管） |
| GET /api/admin/stats | 后台统计（超管） |
| GET /api/admin/sync-status | 同步进度（超管） |
| POST /api/me/avatar | 头像上传 |
| GET /api/avatars/:filename | 头像读取（公开） |

## 数据同步

### 装备 `src/lib/equipment/sync.ts`

- 来源：`https://pvp.qq.com/web201605/js/item.json`
- 解析 des1（属性）→ 列存 atk/ap/def/...
- 解析 des2（被动）→ passiveJson
- 计算 tier / tags / statsJson → extraJson

### 英雄 `src/lib/heroes/sync.ts`

- 爬虫 + GICP API
- 技能同步时走 pipeline 加工 → extraJson.damage
- 命格检测（仅爬虫发现时才更新，不清除已有）

## 前端页面

| 页面 | 路由 | 说明 |
|---|---|---|
| 首页 | / | 公告 + 登录入口 |
| 图鉴·英雄 | /heroes | 搜索 + 分路/职业筛选，命格切换，基础属性表 |
| 图鉴·装备 | /equipment | 搜索 + 等级/特性筛选 |
| 英雄详情 | /heroes/:id | 技能 + 伤害数据 + 被动 + 命格 |
| 赛事 | /tournaments | 赛事列表/详情/分队 |
| 个人空间 | /me | 头像 + 分路段位 + 英雄战力 |
| 登录 | /login | 含忘记密码流程 |
| 后台 | /admin | 仪表盘/用户/房间/英雄/设置（超管） |
| 调试 | /debug | 陀螺仪/登录动画/光球测试（登录可用） |

## 权限模型

| 角色 | 权限 |
|------|------|
| admin | 后台全功能 + 前台 Header 显示「后台管理」入口 |
| user | 前台功能 + 个人空间 + 赛事参与 + 调试面板 |

admin 账号：`admin / admin12345678`（种子脚本创建，安全问题 `系统内置管理员` / `admin`）

## 数据库

MySQL `yanwutang` / `yanwutang_test` @ 38.22.234.148

核心表：users / heroes / hero_skills / equipment / announcements / tournaments / kv_cache
