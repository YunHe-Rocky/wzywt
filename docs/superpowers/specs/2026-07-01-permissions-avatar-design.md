# 权限系统 + 头像功能 设计

2026-07-01

## 权限系统

### User 表变更

- 新增 `role` 字段：`enum('super_admin', 'user')`，默认 `'user'`
- 内置超管账号：`admin / admin`，role = `super_admin`

### 三级权限

| 操作 | 超管 | 房管 | 个人 |
|------|:--:|:--:|:--:|
| 用户管理（列表/封禁/删除） | ✓ | | |
| 系统公告 CRUD | ✓ | | |
| 手动触发英雄/装备同步 | ✓ | | |
| 查看监控面板 | ✓ | | |
| 删除任意赛事 | ✓ | | |
| 创建赛事 | | ✓ | |
| 管理自己赛事的参与者/分队/设置 | | ✓ | |
| 查看/加入公开赛事 | ✓ | ✓ | ✓ |
| 管理个人资料/战力/偏好 | | | ✓ |
| 上传头像 | | | ✓ |

### 实现

- Middleware：保持现有登录态检查，不新增角色校验
- API 守卫函数：
  - `requireSuperAdmin()` — 从 session 查 DB role，非 super_admin 返回 403
  - `requireTournamentAdmin(tournamentId)` — 检查是否为该赛事 owner/co_owner
- 前端：超管后台在 `src/app/admin/` 下（复用已有目录），受保护页面

---

## 头像系统

### 存储

本地文件系统，目录 `/data/uploads/avatars/`（git 仓库外）

### 数据库

User 表新增 `avatar` 字段（VARCHAR 255，nullable），存文件名

### API

- `POST /api/me/avatar` — 接收 FormData（单文件），校验格式(jpg/png/webp)、大小(<2MB)，重命名为 `${userId}_${timestamp}.ext`，存本地，更新 User.avatar
- `GET /api/avatars/[filename]` — 公开读取，返回文件流 + Cache-Control

### 前端

- Header 导航栏：`<img>` 替代首字母 `<span>`，加载失败 fallback 为首字母
- 编辑入口：Header 下拉菜单"更换头像" → `<input type="file">` → 前端裁切 200x200 → POST
- 个人空间页：`/me` 顶部增加大头像展示区（点击也可更换）

### 部署注意

- 服务器需手动创建 `/data/uploads/avatars/` 目录并设置 nginx 不拦截该路径
