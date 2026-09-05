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

只填写两个生产必填值：

```dotenv
DATABASE_URL="mysql://APP_USER:URL_ENCODED_PASSWORD@127.0.0.1:3306/APP_DB?connection_limit=10&connect_timeout=5&pool_timeout=10"
SESSION_SECRET="至少 32 字符的新随机值"
```

如果使用 Redis，再增加：

```dotenv
REDIS_URL="redis://127.0.0.1:6379/0"
REDIS_REQUIRED=0
```

- `REDIS_REQUIRED=0`：Redis 临时不可用时降级运行并告警。
- `REDIS_REQUIRED=1`：Redis 不可用就停止发布。
- 使用 Nginx/HTTPS 时不需要写 `HOST`、`PORT` 或 `SESSION_COOKIE_SECURE`；默认监听 `127.0.0.1:8001`，生产 Cookie 默认启用 Secure。
- 媒体目录无需填写；部署脚本自动使用相邻 runtime 目录中的 `shared/media`，不会放进随发布替换的 release。
- `.env` 是纯文本赋值文件，URL 直接写 `https://...`，不能写成 `[https://...](https://...)`。

然后执行：

```bash
bash scripts/deploy.sh --check
bash scripts/deploy.sh
```

`--check` 只检查，不创建 release、不备份、不迁移、不重启 PM2。它通过后再运行第二条命令。

## 2. 现有服务器怎样精简 `.env`

保留这些真实应用配置：

- `DATABASE_URL`
- `SESSION_SECRET`
- 实际使用时的 `REDIS_URL` / `REDIS_REQUIRED`
- 实际使用时的 `MATCH_OCR_ENDPOINT` / `MATCH_OCR_TOKEN`
- 只有确实修改默认监听时才保留 `HOST` / `PORT`

正常情况下可以从 `.env` 删除：

- 全部 `DEPLOY_*`；脚本会按现场事实推导，也会识别既有的相邻 `<源码目录>-pm2`。删完先运行 `--check`，确认它打印的 PM2 home 和进程名仍指向当前应用；不一致时只保留对应的 `DEPLOY_PM2_HOME` 或进程名覆盖。
- `MEDIA_STORAGE_DIR`、`AVATAR_DIR`；默认目录正是 `<runtime>/shared/media` 和其 `avatars` 子目录。
- `PUBLIC_*`、`NGINX_*`、`TLS_*`、`MYSQL_SERVICE`、`REDIS_SERVICE`、`PM2_SYSTEMD_SERVICE`、`MYSQL_BACKUP_*`；应用发布脚本不读取这些字段，把它们留在 `.env` 只会造成误解。
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
| 验收 | 核对 PM2 PID/cwd/用户/release，并验证新 release 的 `/api/health` |
| 失败 | 激活失败自动回到旧 release；保留失败现场和脱敏诊断 |

生产环境始终禁止 `prisma db push`。数据库备份失败不会迁移，build 失败不会触碰当前运行服务。

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

内部 health 通过只证明应用及其依赖正常。公网还要验证域名、TLS、Nginx、登录和 Secure Cookie：

```bash
curl --fail --proto '=https' --tlsv1.2 https://你的域名/api/health
```

首次配置或变更 Nginx/证书时，使用独立的 [Nginx 与 SSL/TLS 指南](nginx-configuration.md)；日常应用发布不重复碰它们。

## 7. 出错时看哪里

先读终端最后一条 `[deploy] ERROR`。脚本会给出实际发现的项目、路径、用户、PM2、监听地址、Git ref、命令版本和脱敏服务 endpoint，不会输出数据库/Redis密码或完整连接串。

- runtime 权限、非标准工具路径、dirty source、CRLF、MySQL Socket/TCP 差异、特殊 systemd unit：看 [宿主准备与高级覆盖](deploy-advanced.md)。
- Nginx、证书、HTTPS、公网健康检查：看 [Nginx 与 SSL/TLS 指南](nginx-configuration.md)。
- 特殊宿主确实需要 PID/lock/unit 证据时：看 [`deploy-host.example.json`](deploy-host.example.json)。
- 安全停止本项目：在项目根运行 `bash scripts/stop.sh`。

高级覆盖不是第二张必填表。只有自动发现错了一个事实，才覆盖那一个事实。
