# R01 / R02 入口修复验收

本记录对应 `wzywt-codex-review-2026-09-06.md` 的首批 R01、R02。其余 R03–R12 不在本批完成声明内。实现基于当前工作区，保留之前未提交的改动。

## 修复内容

- 设备和认证重定向共用固定 `PUBLIC_ORIGIN`。生产要求 HTTPS origin；缺失、路径、凭据、查询或协议配置错误时，重定向页面返回 503。客户端 Host / Forwarded 头不能覆盖批准地址。
- `/me`、`/admin`、`/m/me` 回跳保留 pathname + search。登录表单通过 URL 解析及同源校验拒绝反斜杠、协议跨域和控制字符；转场参数通过 URLSearchParams 添加，保留 query/hash。
- `npm run test:entry` 汇总设备路由、登录回跳、公网探测、auth-session 和 resources，已接入 `check` 与 CI。
- 公网 smoke 验证 health 的完整 releaseId、桌面/手机 Location、query 和 API/静态入口。部署只有在内部与公网检查都通过后才保存 PM2 并宣布完成；公网失败进入应用回滚。
- CI 使用独立 Nginx HTTPS 代理，Next 上游固定端口 8001，并用内部 Host 复现反代情形。Playwright 管理 Chromium 桌面、Android 模拟和 WebKit iPhone 模拟；测试账号只能写入明确批准的 loopback `_ci` / `_test` 数据库。
- 真实认证测试包含 Secure/HttpOnly Cookie、实际 Set-Cookie 的 SameSite=Lax、刷新保留、租约过期恢复、退出、重新登录、sessionVersion 撤销后私有资源拒绝读取/续期，以及真实登录响应丢失 Cookie 的错误提示。视觉 mock 单独执行，并移除固定 Windows Chrome 路径。

## 部署配置变化

在应用 `.env` 加入实际站点地址，例如：

```dotenv
PUBLIC_ORIGIN=https://game.example.com
```

域名和端口须与 Nginx/TLS 站点一致。不要沿用示例域名；不要关闭 Secure Cookie 来适配错误公网地址。首次部署前先准备可达的 Nginx/TLS，再运行原有 `deploy.sh --check` 和 `deploy.sh`。发布进程须能经 DNS/公网入口访问该 origin。

手工重跑无凭据公网验收：

```bash
node scripts/public-entry-smoke.mjs https://game.example.com EXPECTED_FULL_RELEASE_ID
```

脚本不自动跟随跳转、不忽略 TLS 证书错误，不把可选 Redis 的 degraded 隐藏为 ok。

## 本地验证

使用 Node 24.19.0，实际执行了：

- 先观察 `/me?tab=history` 回归因 localhost origin / query 丢失而失败，修复后通过。
- 入口测试、公网探测故障用例、会话/资源测试、架构、typecheck、core 通过。
- lint 0 errors、18 条既有 img warning；生产 build 退出码 0。
- 从空库对本轮独立 MySQL 8.4.11 实例执行全部 9 个现有 migration，通过；没有修改 migration。
- 本地真实 Nginx 1.28.0 HTTPS → Next → MySQL 链路上，Chromium 桌面、Android 模拟、WebKit iPhone 模拟的认证/租约用例通过。
- 视觉登录转场普通/减少动画及丢失会话提示通过。
- `BASH_BIN=D:\Git\bin\bash.exe` 下完整部署模拟通过，包含普通 `.env` 发现、激活、PM2 所有权以及公网探测失败回滚；Shell LF 与语法检查通过。未在本机运行 Linux 原生 PM2 服务。

Windows WebKit 的 Cookie 属性读取接口在独立探针中，将 `addCookies({sameSite: "Lax"})` 读为 `None`。测试因此检查实际响应的 `SameSite=Lax`，同时继续断言真实 Cookie 保存、刷新及权限行为。切页前等待 network-idle，避免取消中的请求被 WebKit 上报为页面错误。

独立只读代码复核发现并修复了部署校验早于最终 Node 24 选择的问题，以及测试数据库 IPv6 loopback 名称不一致。

## 复跑浏览器链路

需要构建产物、Node 24、Nginx、OpenSSL、Playwright 浏览器，以及已迁移的专用本地测试库。`8001`、`8443` 必须空闲。设置以下环境后运行：

```bash
npx playwright install chromium webkit
DATABASE_URL='mysql://TEST_USER:TEST_PASSWORD@127.0.0.1:3306/entry_test' \
SESSION_SECRET='test-only-session-secret-at-least-32-characters' \
E2E_ALLOW_TEST_DATABASE=1 npm run test:e2e:proxy
```

Windows 可设置 `NGINX_BIN`、`OPENSSL_BIN` 的绝对路径。`E2E_BROWSER_PATH` 仅覆盖 Chromium；WebKit 使用 Playwright 管理版本。`E2E_PROJECTS` 可选 `chromium-desktop,chromium-android,webkit-iphone` 的子集，默认执行全部。启动器创建临时证书、关闭自己启动的进程并清理临时文件，恢复测试前的资讯缓存。

## 发布完成边界

本轮没有执行生产部署、修改生产配置或验证真实公网 releaseId，也没有读取生产 Redis 日志。GitHub 的新 CI 需要提交后运行；本地 Windows/Git Bash 的完整发布模拟不能替代生产 Linux 上的实际发布与恢复验收。

公网发布前，仍需专用测试账号完成真实登录、刷新、退出和受保护页访问；真实 iOS Safari / Android 浏览器检查 360/390/430 CSS px、横竖屏、软键盘与安全区。浏览器模拟不等于真机视觉验收。
