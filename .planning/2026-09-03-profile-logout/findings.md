# 点击“我的”后退出发现

## Initial context

- 用户反馈真实站点中可以登录，但点击功能栏“我的”后退出，需要以桌面和移动现场证据判断。
- 线上 release 为 `20260903044304-99de8ee21a3e-422497`，仍不包含本地未提交的认证确认修复。

## Local implementation

- Dock 的“我的”只导航到 `/me` 或 `/m/me`，没有调用 logout；清 Session 的读取路径在 `/api/auth/me` 与 `requireAuth()`。
- 本地已增加登录/注册后的 `/api/auth/me` 同用户确认、旧鉴权请求取消和缺 Session 错误提示。
- 本地 production 浏览器回归覆盖两种动效、登录后点击“我的”进入 `/me`、缺 Session 拒绝假登录。

## Live desktop evidence

- 首页、登录页、health 与匿名 auth/me 均可达；匿名点击“我的”预期重定向到 `/login?redirect=/me`。
- 新账号注册 200，浏览器保存 `wzyt_session`，`secure=false`、`HttpOnly=true`、`SameSite=Lax`。
- 点击“我的”进入 `/me`；auth/me、roles、heroes 均 200，同一用户保持登录，“个人空间”和用户菜单可见。
- console/page error 均为 0，临时账号 cleanup 200。

## Live mobile evidence

- iPhone UA 访问 `/register` 正确进入 `/m/register`；注册后进入 `/m`。
- 清空 Cookie 后以同一账号重新登录返回 200，非 Secure HTTP Session Cookie 正确保存。
- 点击移动底栏“我的”进入 `/m/me`；auth/me、roles、heroes 均 200，同一用户保持登录。
- “个人空间”和用户菜单可见，登录入口不可见；console/page error 均为 0，cleanup 200。
- 因此新账号的真实桌面与移动全链均正常；当前故障收敛到用户当前浏览器/特定账号状态，或尚未命中的间歇性请求故障。

## Cleanup boundary

- 首个错误断言脚本留下一个随机 `codex_` 账号；凭据随进程丢失，且没有合法 SSH/数据库读取权限可安全定位，暂未删除。
- 后续现场账号脚本均把删除放在 `finally` 并已达到 cleanup 200。

