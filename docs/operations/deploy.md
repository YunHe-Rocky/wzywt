# 王者演武堂部署指南

正常部署只维护一份很小的 `.env`，然后运行一次预检和一次发布。项目路径、运行目录、当前用户、Git 分支、PM2 名称、Node 工具链、媒体目录、备份目录和健康检查参数都由脚本发现或使用项目默认值，不要重复写进 `.env`。

> 如果数据库密码、Redis 密码或 `SESSION_SECRET` 曾经发到聊天、工单或公开日志中，请先轮换。仓库里只能放变量名和示例，不能放真实值。

## 1. 第一次部署

服务器需要已经具备 Git、Node.js、npm、PM2、MySQL 客户端（含 `mysqldump`）和可连接的 MySQL。Redis 是可选项。宿主软件的一次性安装不属于每次应用发布；版本与安装方式见 [宿主准备与高级覆盖](deploy-advanced.md#宿主准备)。

进入项目根目录：

```bash
cd /opt/apps/wzywt
cp .env.example .env
chmod 600 .env
```

填写三个生产必填值：

```dotenv
DATABASE_URL="mysql://APP_USER:URL_ENCODED_PASSWORD@127.0.0.1:3306/APP_DB?connection_limit=10&connect_timeout=5&pool_timeout=10"
SESSION_SECRET="至少 32 字符的新随机值"
PUBLIC_ORIGIN="https://game.example.com"
```

如果使用 Redis，再增加：

```dotenv
REDIS_URL="redis://127.0.0.1:6379/0"
REDIS_REQUIRED=0
```

- `REDIS_REQUIRED=0`：Redis 临时不可用时降级运行并告警。
- `REDIS_REQUIRED=1`：Redis 不可用就停止发布。
- 使用 Nginx/HTTPS 时不需要写 `HOST`、`PORT` 或 `SESSION_COOKIE_SECURE`；默认监听 `127.0.0.1:8001`，生产 Cookie 默认启用 Secure。
- `PUBLIC_ORIGIN` 必须与实际公网域名、证书和 Nginx 站点一致；包含非默认端口（如有），不含路径、查询参数或账号信息。设备与登录跳转只使用它，忽略请求中的 Host/转发头。生产环境缺失或格式错误时，需要重定向的页面返回 503；先补齐配置再发布。
- 媒体目录无需填写；部署脚本自动使用相邻 runtime 目录中的 `shared/media`，不会放进随发布替换的 release。容量门槛、媒体清单、异地备份与空目录恢复见 [媒体容量、备份与恢复](media-operations.md)。
- 数据库备份默认写入 `<runtime>/shared/mysql-bak`；若要使用独立磁盘目录，按[高级部署覆盖](deploy-advanced.md#自动发现与可选覆盖)设置 `DEPLOY_DB_BACKUP_DIR`，并确保部署用户拥有该目录。
- `.env` 是纯文本赋值文件，URL 直接写 `https://...`，不能写成 `[https://...](https://...)`。

然后执行：

```bash
bash scripts/deploy.sh --check
bash scripts/deploy.sh
```

`--check` 只检查，不创建 release、不备份、不迁移、不重启 PM2。它通过后再运行第二条命令。

端口预检通过不等于密码正确。正式发布在 `npm ci` 后、build/备份/migration/切换前，用本次 release 的 ioredis 执行认证和 `PING`。`REDIS_REQUIRED=1` 时失败立即终止并报告 `WRONGPASS`、`NOAUTH`、`NOPERM` 等原因。Web 与 Cron 均从所选 `.env` 明确注入 Redis 配置，覆盖 PM2 缓存的旧值；移除配置也会清除旧值。

## 本地开发与虚拟机测试

改代码时使用 `npm run dev`（同时运行定时任务则用 `npm run dev:all`），访问 `http://localhost:8001`。开发模式可以不设置 `PUBLIC_ORIGIN`，跳转会使用当前请求地址。

在虚拟机中测试完整构建和发布流程时，使用同一个部署脚本，在 `.env` 中设置：

```dotenv
DEPLOY_ENVIRONMENT=local
HOST=0.0.0.0
PORT=8001
PUBLIC_ORIGIN=http://192.168.1.73:8001
```

把示例 IP 换成虚拟机实际地址。`0.0.0.0` 是监听地址，不能填进 `PUBLIC_ORIGIN`。宿主机和手机需能访问虚拟机的 8001 端口；无需公网、域名、Nginx 或证书。获取 Git 源码和 npm 依赖仍需要网络。

仍须配置独立测试用的 `DATABASE_URL` 和至少 32 字符的 `SESSION_SECRET`；使用 Redis 时也要与生产隔离。然后执行：

```bash
bash scripts/deploy.sh --check
bash scripts/deploy.sh
```

`DEPLOY_ENVIRONMENT=local` 允许 localhost、IPv4 私网/回环、IPv6 回环/ULA 地址使用 HTTP；普通公网域名/IP 仍要求 HTTPS。正式构建继续使用 `NODE_ENV=production`。HTTP 登录 Cookie 自动不带 Secure，HTTPS 自动带 Secure；删除与协议冲突的旧 `SESSION_COOKIE_SECURE` 覆盖即可。

内网发布同样执行数据库备份、migration、release 身份核对、桌面/手机跳转验收和失败回滚。此模式不会绕过脏源码检查，也不会执行测试 seed。需要单独复验入口时：

```bash
DEPLOY_ENVIRONMENT=local node scripts/public-entry-smoke.mjs http://192.168.1.73:8001 预期的完整releaseId
```

切回公网时，删除 `DEPLOY_ENVIRONMENT` 或设为 `production`，把 `PUBLIC_ORIGIN` 改为 HTTPS，并将监听地址按 Nginx 布局恢复为 `127.0.0.1`。配置优先级是当前命令环境高于所选 `.env`，切换前也要清理终端中旧的同名变量。

自动化验证：`npm run test:local-deploy` 检查地址策略和 Cookie；`npm run test:deploy` 覆盖内网发布及验收失败回滚；`npm run test:e2e:local` 在构建后启动 HTTP 服务并运行真实浏览器登录/刷新/退出和桌面、手机回归。浏览器测试要求显式允许的本机 `_ci`/`_test` 数据库及 Playwright 浏览器，CI 已同时接入 HTTP 与 HTTPS 流程。

## 2. 现有服务器怎样精简 `.env`

保留这些真实应用配置：

- `DATABASE_URL`
- `SESSION_SECRET`
- `PUBLIC_ORIGIN`
- 实际使用时的 `REDIS_URL` / `REDIS_REQUIRED`
- 实际使用时的 `MATCH_OCR_ENDPOINT` / `MATCH_OCR_TOKEN`
- 只有确实修改默认监听时才保留 `HOST` / `PORT`

正常情况下可以从 `.env` 删除：

- 自动发现无误时的高级 `DEPLOY_*` 覆盖；内网测试保留 `DEPLOY_ENVIRONMENT=local`。脚本也会识别既有的相邻 `<源码目录>-pm2`。删完先运行 `--check`，确认它打印的 PM2 home 和进程名仍指向当前应用；不一致时只保留对应的 `DEPLOY_PM2_HOME` 或进程名覆盖。
- `MEDIA_STORAGE_DIR`、`AVATAR_DIR`；默认目录正是 `<runtime>/shared/media` 和其 `avatars` 子目录。
- 除 `PUBLIC_ORIGIN` 以外的旧 `PUBLIC_*`、`NGINX_*`、`TLS_*`、`MYSQL_SERVICE`、`REDIS_SERVICE`、`PM2_SYSTEMD_SERVICE`、`MYSQL_BACKUP_*`；应用发布脚本不读取这些字段。
- 空的 `SEED_*`；生产部署不运行测试 seed。

删除这些行不会修改已经安装的 Nginx、证书、MySQL、Redis 或 PM2。它只是不再让一份应用 `.env` 假装控制实际上不会读取它的宿主设施。

## 3. 脚本会自动处理什么

| 项目 | 默认行为 |
|---|---|
| 源码与项目名 | 使用当前项目根和 `package.json.name` |
| runtime | 使用相邻的 `<源码目录>-runtime` |
| Linux 用户/组 | 使用当前执行部署的用户及其主组 |
| Git | 使用当前分支的 upstream；否则回退到当前分支、`origin/main` |
| Web | 监听 `127.0.0.1:8001` |
| PM2 | 优先复用已有的相邻 `<源码目录>-pm2`；否则使用当前用户的 `$HOME/.pm2`。进程名为 `<项目名>-web` / `<项目名>-cron` |
| Node 工具链 | 优先 PATH，也识别 `/opt/runtime/NodeJS/node-v*/bin` 等项目既有布局；npm/npx/pm2 从同一工具链派生 |
| 持久化 | 自动创建 runtime 下的 release、备份、日志、媒体和头像目录 |
| 数据库 | build 成功后先 `mysqldump`，再执行 `prisma migrate deploy` |
| 切换 | 原子更新 `current`，只 reload 本项目的两个 PM2 进程 |
| 验收 | 核对 PM2 PID/cwd/用户/release；内部 health 通过后，再从 `PUBLIC_ORIGIN` 验证同一 release 的 health、桌面/手机认证与设备跳转 |
| 失败 | 激活失败自动回到旧 release；保留失败现场和脱敏诊断 |

生产环境始终禁止 `prisma db push`。数据库备份失败不会迁移，build 失败不会触碰当前运行服务。部署前会验证 runtime 文件系统可用空间，默认门槛为 2 GiB；`DEPLOY_MIN_FREE_BYTES` 只在确有容量规划时覆盖。

应用回切不会撤销已经成功执行的 migration，也不会自动导入旧 SQL。扩展/兼容/回填/收缩策略、release/备份保留边界和空环境演练步骤见 [发布兼容与恢复手册](recovery-and-release.md)。

## 4. 目录权限只处理一次

大多数已有服务器不需要这一步。只有首次部署提示 runtime 目录不可创建时，在项目根执行一次：

```bash
runtime_dir="$(pwd -P)-runtime"
sudo install -d -m 0750 -o "$(id -un)" -g "$(id -gn)" "$runtime_dir"
```

随后仍用普通应用用户运行 `deploy.sh`，不要长期用 root 部署，也不要对源码或 `/opt` 执行 `chmod -R 777`、`chown -R`。如果 runtime 已存在但归属错误，按预检打印的精确路径修复该目录本身；详见 [权限排查](deploy-advanced.md#权限问题)。

## 5. 日常更新

之后每次更新只有：

```bash
cd /opt/apps/wzywt
bash scripts/deploy.sh --check
bash scripts/deploy.sh
```

脚本从当前 upstream fetch 精确 commit 并建立独立 release。它不会自动 stash、reset、checkout、删除源码文件、启动系统级 MySQL/Redis/Nginx，也不会接管其他用户或其他 cwd 的 PM2 进程。

## 6. 发布后确认

```bash
curl --fail http://127.0.0.1:8001/api/health
pm2 status
readlink -f "$(pwd -P)-runtime/current"
```

发布脚本只有在站点 health 的 releaseId 和桌面/手机 Location 全部匹配时才标记完成；入口探测失败会触发应用回滚。不会自动跟随重定向，也不会跳过 TLS 验证。可以单独重跑同一探测：

```bash
node scripts/public-entry-smoke.mjs https://你的域名 预期的完整releaseId
```

首次配置或变更 Nginx/证书时，使用独立的 [Nginx 与 SSL/TLS 指南](nginx-configuration.md)；日常应用发布不重复碰它们。

这组公网探测不使用账号；真实登录仍须在发布验收中以专用测试账号确认登录、刷新保留、退出与再次访问受保护页。CI 的真实 Nginx HTTPS + Chromium 桌面/Android 模拟 + WebKit iPhone 模拟覆盖 Cookie 保存、旧 sessionVersion 与退出后的私有资源拒绝访问；它不等同于 iOS Safari/Android 真机验收。详见 [入口修复验收](../reviews/entry-hotfix-acceptance-2026-09-06.md)。

## 7. 出错时看哪里

先读终端最后一条 `[deploy] ERROR`。脚本会给出实际发现的项目、路径、用户、PM2、监听地址、Git ref、命令版本和脱敏服务 endpoint，不会输出数据库/Redis密码或完整连接串。

- runtime 权限、非标准工具路径、dirty source、CRLF、MySQL Socket/TCP 差异、特殊 systemd unit：看 [宿主准备与高级覆盖](deploy-advanced.md)。
- Nginx、证书、HTTPS、公网健康检查：看 [Nginx 与 SSL/TLS 指南](nginx-configuration.md)。
- 特殊宿主确实需要 PID/lock/unit 证据时：看 [`deploy-host.example.json`](deploy-host.example.json)。
- 安全停止本项目：在项目根运行 `bash scripts/stop.sh`。
- 媒体低空间、配额、归档和恢复演练：看 [媒体容量、备份与恢复](media-operations.md)。
- 数据库 migration 的回滚边界、release 保留和空环境恢复决策：看 [发布兼容与恢复手册](recovery-and-release.md)。

高级覆盖不是第二张必填表。只有自动发现错了一个事实，才覆盖那一个事实。

### Redis 命令行 PONG，但应用 WRONGPASS

这说明手输凭据可用，而应用使用的用户名/密码被拒绝。可用项目工具隐藏输入原始密码，自动 URL 编码并验证，只有收到 `PONG` 才原子更新 `.env` 中的 `REDIS_URL`（保留其他配置与 `.env` 符号链接）。默认账户使用 `--username default`，ACL 账户替换为实际用户名。工具不会修改 Redis 服务端密码，也不会降低 `REDIS_REQUIRED`。

```bash
node scripts/redis-doctor.mjs --env-file .env --set-password --username default
```

源码目录没有 `node_modules` 时，加 `--dependencies` 指向已安装依赖的完整 release 目录，可以使用保留的失败 release；不要假设回滚后的 `current` 就是失败版本。只运行诊断时去掉 `--set-password --username default`。工具不回显密码或完整连接串。

```bash
node scripts/redis-doctor.mjs --env-file .env --dependencies /absolute/path/to/installed/release --set-password --username default
```

修复配置后重跑发布以更新 PM2。若 releaseId 中的 commit 一直没变，检查 `[deploy] ref=` / `fetch` 所指分支：把修复推送到开发分支不等于部署分支已包含修复。先合并到部署分支并更新源码；新部署脚本会在构建前拒绝缺少 Redis 检查工具的旧 release。
