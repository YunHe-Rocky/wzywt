# 王者演武堂 — 功能与技术说明

## 功能

### 认证
注册/登录，Cookie session 认证。已登录访问登录页自动跳转首页。

### 个人空间
- 分路偏好：五路拖拽排序 + 每路段位（青铜~荣耀王者）
- 英雄战力：每路选 1-3 个擅长英雄，拼音模糊搜索，填战力值

### 赛事
- 创建：起名 + 日历选截止时间 + 公开/私有 + 公告
- 加入：6 位房间号
- 管理：分队、踢人、延长截止、切换公开、任命次房主
- 分队：≥10 人可分队，取 10 人 5v5，多余静默排除。结果存库刷新不丢，分过后不可改

### 英雄图鉴
- 130 英雄网格，职业+分路双色标签，双筛选项（职业/分路）
- 详情页：4 技能 (CD/消耗/描述) + 多皮肤切换
- 英雄选择器：拼音首字母/全拼/中文/ID 搜索
- 管理页 `/admin/heroes`：分路手动修正，即时写库，外部同步不覆盖

### 实时监控 `/monitor`
- 三模块独立监控官方数据源，轻量检查不爬站
- 变化时自动触发对应爬虫，SSE 推送到所有在线页面
- 图鉴、详情页收到推送自动刷新

## 数据模型

| 表 | 关键字段 |
|----|---------|
| users | id, username, password_hash |
| tournaments | id, code, name, deadline, status, isPublic, announcement, split_result(JSON) |
| tournament_players | tournament_id, user_id, role_type, isSpectator |
| tournament_admins | tournament_id, user_id, role(owner/co_owner) |
| role_preferences | user_id, role_type, preference_rank, role_rank |
| hero_powers | user_id, role_type, hero_id, hero_name, power_score |
| heroes | hero_id, name, title, role_type, hero_type, hero_type2, image_url, skins_json, skills_json |
| hero_lane_overrides | hero_id, role_type |
| kv_cache | key, value (监控状态) |
| admin_operations | tournament_id, admin_id, action (冷却追踪) |
| temp_player_applications | tournament_id, applicant_id, status |

## API 路由

| 路由 | 方法 | 说明 |
|------|------|------|
| /api/auth/register | POST | 注册 |
| /api/auth/login | POST | 登录 |
| /api/auth/logout | POST | 登出 |
| /api/auth/me | GET | 当前用户 |
| /api/heroes | GET | 英雄列表 (?role_type=&hero_type=) |
| /api/heroes/[id] | GET | 英雄详情 |
| /api/heroes/[id] | PATCH | 修正分路 (需登录) |
| /api/heroes/watch | GET | SSE 实时监控 |
| /api/tournaments | GET/POST | 赛事列表/创建 |
| /api/tournaments/[id] | GET/PUT/DELETE | 赛事详情/修改/取消 |
| /api/tournaments/[id]/join | POST | 加入 |
| /api/tournaments/[id]/leave | POST | 退出 |
| /api/tournaments/[id]/split | POST | 分队 (管理员) |
| /api/tournaments/[id]/kick | POST | 踢人 |
| /api/tournaments/[id]/extend | POST | 延长截止 |
| /api/tournaments/[id]/admin | POST | 任命/撤销次房主 |
| /api/tournaments/join-by-code | POST | 房间号加入 |
| /api/tournaments/public | GET | 公开赛事列表 |
| /api/users/me/roles | GET/PUT | 分路偏好 |
| /api/users/me/heroes | GET/POST/DELETE | 英雄战力 |
| /api/official-news | GET | 官方公告 |
| /api/changelog | GET | 更新日志 |

## 分队算法

`src/lib/split.ts` — 四层权重:
1. 段位覆盖 ×100: 有段位的人匹配到对应分路
2. 段位均衡 ×50: 两队段位总和尽量接近
3. 偏好满足 ×10: 满足高优先级偏好
4. 战力均衡 ×1: 两队巅峰战力接近

## 爬虫

### 英雄同步 (`src/lib/heroes/sync.ts`)
- 源: `pvp.qq.com/web201605/js/herolist.json` + 详情页
- 编码: GBK/UTF-8 自动检测
- 并发: 8 并行 + 重试 + 10s 超时
- 更新不覆盖 role_type (手动修正保留)

### 监控 (`src/lib/monitor/index.ts`)
- News: 对比新闻标题
- Heroes: 对比数量 + 首尾名称 + 采样
- Skins: 对比每个英雄皮肤名列表
- 变化时触发对应爬虫

### 反爬 (`src/lib/anti-bot.ts`)
- Tier 1: 5 UA 轮换 + 浏览器请求头 + 指数退避重试
- Tier 2: Playwright 无头浏览器降级

## 部署

- Rocky Linux + Nginx 反代 + PM2 守护
- 开发端口 8001（`npm run dev`），生产端口 8081（`ecosystem.config.js`）
- Nginx 代理域名 80/443 → 127.0.0.1:8081
- SSE 长连接: proxy_buffering off + 86400s 超时
- 详见 `docs/deploy.md` 和 `docs/yanwutang.conf`
