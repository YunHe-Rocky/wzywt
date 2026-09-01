# 王者演武堂 — 一键部署

部署不要求把普通 `.env` 改成运维配置表。项目名、目录、用户、PM2、命令和 Git 分支都由脚本自动识别。

## 1. 用户只需要这样做

服务器已有项目代码和普通 `.env` 时：

```bash
cd /opt/wzywt
bash scripts/deploy.sh --check
bash scripts/deploy.sh
```

`--check` 只检查，不备份、不迁移、不创建 release、不切换 PM2。它通过后再执行第二条正式部署命令。

脚本通过 Bash 调用，不需要 `chmod -R`，也不需要把 `.ts`、`.mjs` 设为可执行。

如果源码树不干净，预检会列出最多 20 条精确 Git 状态，并区分脚本权限变化和未跟踪文件。它只给出检查/恢复提示，不会自动 stash、reset、checkout 或删除文件。

当前服务器若刚执行过 `chmod a+x -R scripts`，先恢复仓库记录的普通文件权限：

```bash
cd /opt/yanwutang
git diff --summary -- scripts
find scripts -maxdepth 1 -type f -exec chmod 0644 {} +
git status --short
```

只有确认输出中没有真实内容修改后才能继续。根目录传输用 ZIP 已由 `/*.zip` 忽略；更推荐把后续安装包保存在项目目录之外，例如 `/opt/deploy-packages`。

## 2. `.env` 仍然只是应用环境

普通项目配置如下，不需要任何 `DEPLOY_*`：

```dotenv
PORT=8001
HOST=127.0.0.1

DATABASE_URL="mysql://APP_USER:URL_ENCODED_PASSWORD@127.0.0.1:3306/APP_DB?connection_limit=10&connect_timeout=5&pool_timeout=10"
SESSION_SECRET="至少32位随机字符串"

REDIS_URL="redis://127.0.0.1:6379"
REDIS_REQUIRED=0

MEDIA_STORAGE_DIR=
AVATAR_DIR=
MATCH_OCR_ENDPOINT=
MATCH_OCR_TOKEN=
```

- `DATABASE_URL` 是部署、备份和 migration 必需的应用配置。
- Redis 未配置就跳过；配置但 `REDIS_REQUIRED=0` 时不可用会告警；设为 `1` 时不可用会阻止部署。
- 媒体路径留空时，脚本自动放到项目 shared 运行目录，不需要用户计算路径。
- `.env` 不会被复制进 Git release；新 release 只建立指向原文件的软链接。

默认自动读取当前项目根的 `.env`。特殊情况下仍可显式指定：

```bash
bash scripts/deploy.sh --check --env-file /secure/path/project.env
```

## 3. 脚本自动识别什么

| 项目事实 | 自动规则 |
|---|---|
| 源码目录 | 必须等于当前 `pwd -P` 和脚本反推的项目根 |
| 项目名 | `package.json.name` 清理为安全名称 |
| release 运行目录 | 源码名为 `source` 时使用父目录；否则使用相邻的 `<源码目录>-runtime` |
| `/opt/wzywt` | 自动得到 `/opt/wzywt-runtime` |
| 用户和组 | 当前实际执行用户的 `id -un` / `id -gn` |
| PM2 home | 当前用户的 `PM2_HOME`，否则 `$HOME/.pm2` |
| PM2 进程名 | `<项目名>-web`、`<项目名>-cron` |
| 地址和端口 | 普通 `HOST` / `PORT`，缺省为 `127.0.0.1:8001` |
| Git remote/branch | 当前分支 upstream；其次当前分支；最后 `origin/main` |
| 全局命令 | 显式路径、`command -v`、npm global prefix、标准路径，范围有界 |
| 数据库/Redis | 从普通 `DATABASE_URL` / `REDIS_URL` 只提取 host 和 port，不记录账号密码 |
| 本地 systemd | 自动尝试 MySQL/MariaDB/Redis 常见 unit，并核对 ActiveState、SubState、MainPID 和 `/proc` |

自动发现的 systemd unit 不存在时，只要配置的 TCP endpoint 真实可达即可，兼容容器或远程服务。若发现了已加载 unit，但 unit 状态、PID 与端口事实冲突，则停止部署。

## 4. 部署前检查

预检按顺序确认：

1. 当前目录确实是脚本所属 Git 项目，生产源码树不是 dirty 状态。
2. Git remote/ref 有效，命令真实存在；Node 默认接受 20/22/24/26，PM2 默认要求 6 或更高。
3. 数据库端口可连接；Redis 按普通 `.env` 的 required 规则处理。
4. 本地标准 systemd unit 若存在，则必须 active、running/listening、MainPID 有效。
5. 已存在的同名 PM2 应用必须属于当前项目、当前 release 和当前 OS 用户。
6. 任何其他用户、其他 cwd 或未知进程都不会被脚本接管或按端口杀死。

预检输出会直接展示脚本发现的项目名、源码目录、运行目录、用户、PM2 名、端口、Git ref、命令版本和脱敏服务 endpoint。用户不需要预先回答这些问题。

## 5. 正式部署做什么

```text
有界发现命令与服务
→ 保存脱敏宿主快照
→ 锁定项目部署
→ fetch 当前 upstream
→ 从精确 commit archive 新 release
→ npm ci / Prisma validate / production build
→ mysqldump 逻辑备份
→ prisma migrate deploy
→ 原子切换 current
→ 只 startOrReload 本项目两个 PM2 应用
→ 校验 PM2 PID、PID 文件、cwd、用户和 release id
→ 校验 /api/health 属于新 release
→ pm2 save
```

生产始终使用 `prisma migrate deploy`，禁止 `prisma db push`。数据库备份失败不会执行 migration，build 失败也不会触碰运行服务。

PM2、health 或 `pm2 save` 失败时，脚本把 `current` 和本项目 PM2 回切到旧 release，并重新验证旧 health。数据库 migration 后不会自动覆盖式恢复备份；这需要停写窗口和人工判断，避免抹掉 migration 后的新写入。

## 6. 服务版本不对怎么办

脚本不会替用户自动安装、升级、start、enable 或覆盖 MySQL、Redis、Nginx、Node、PM2。

版本或状态不符合时，它会在应用备份、migration 和切换前停止。正式部署会把以下脱敏证据保存到运行目录的 `shared/host-snapshots`：

- 命令实际路径和版本输出；
- 数据库/Redis endpoint，不含用户名、密码或完整 URL；
- 可发现 systemd unit 的状态、MainPID、User、FragmentPath；
- 项目名、源码目录、运行目录和执行用户。

需要额外核对自定义 systemd unit、PID 文件或 lock 文件时，可使用 `docs/deploy-host.example.json`。这是特殊宿主的高级能力，不是普通部署必填项。

PM2 等命令可能先输出 banner；检查器会保留有界完整输出，但只显示和记录实际匹配版本规则的非空行。

### MySQL 命令能登录，但预检报告 TCP `ECONNREFUSED`

`mysql -u USER -p` 未指定 `-h` 时通常通过 Unix Socket 登录；应用 `DATABASE_URL` 的 `127.0.0.1:3306` 使用 TCP，两者不是同一条连接链。先执行只读诊断：

```bash
ss -lntp | grep -E ':3306[[:space:]]' || true
mysql -NBe "SHOW VARIABLES WHERE Variable_name IN ('port','bind_address','skip_networking','socket');"
systemctl list-units --type=service --all | grep -Ei 'mysql|maria' || true
systemctl list-unit-files | grep -Ei 'mysql|maria' || true
```

- 没有 3306 listener，或 `skip_networking=ON`：应用 TCP 当前不可用，保持停止部署。
- listener 只绑定其他地址：让 MySQL 的受控监听地址与 `DATABASE_URL` 一致，不要靠跳过检查掩盖。
- unit 名不是 `mysqld/mysql/mariadb`：endpoint 连通仍可部署；若还要求 PID/lock/unit 精确证据，再使用高级宿主清单。

修改 MySQL 配置属于独立宿主维护：先备份实际配置，验证语法，再显式 restart 和复查 listener；应用部署脚本不会自动执行这些动作。

## 7. 高级覆盖不是必填表

只有自动发现不适用于特殊宿主时，才临时使用以下覆盖：

| 覆盖 | 用途 |
|---|---|
| `DEPLOY_PROJECT_NAME` | 保持历史 PM2 名或使用不同部署名 |
| `DEPLOY_BASE_DIR` | 改变自动推导的 `<源码>-runtime` |
| `DEPLOY_REMOTE` / `DEPLOY_BRANCH` | detached HEAD 或特殊发布分支 |
| `DEPLOY_WEB_HOST` / `DEPLOY_WEB_PORT` | 覆盖普通 `HOST` / `PORT` |
| `DEPLOY_PM2_*` | 使用非默认 PM2 home、命令或进程名 |
| `DEPLOY_*_BIN` | 使用不在 PATH/标准目录中的命令 |
| `DEPLOY_*_VERSION_PATTERN` | 收紧或扩展该项目允许的版本 |
| `DEPLOY_HOST_MANIFEST` | 自定义 unit、PID、lock、端口证据 |

这些值可以在维护命令的进程环境中临时传入，不需要污染普通项目 `.env`。

## 8. 改名、换用户、换端口

- 改项目名：修改 `package.json.name` 后，新默认 PM2 名随之变化。若旧 PM2 仍存在，所有权检查会停止，不会猜测删除旧进程。
- 换用户：用目标用户执行部署即可；脚本自动使用该用户的组和 PM2 home。其他用户的 PM2 不会被接管。
- 换端口：只改普通 `.env` 的 `PORT`，PM2 参数、应用环境和 health URL一起变化；Nginx upstream 是宿主配置，仍需独立备份、`nginx -t` 和显式 reload。

安全停止同样不需要部署参数表：

```bash
cd /opt/wzywt
bash scripts/stop.sh
```

它先执行同一套所有权预检，再只停止当前项目的精确 Web/Cron 名，不使用 `fuser -k`。

## 9. CRLF 现场恢复

若 Rocky Linux 报：

```text
set: pipefail: 无效的选项名
```

说明脚本被复制成 Windows CRLF。该错误发生在第 2 行，尚未进入备份、migration 或 PM2。先备份并只修复 Shell 文件：

```bash
cd /opt/wzywt
test "$(pwd -P)" = "/opt/wzywt"

backup_dir="/var/backups/wzywt-shell-$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m 0700 "$backup_dir"
find scripts -maxdepth 1 -type f \( -name '*.sh' -o -name '*.bash' \) \
  -exec cp -p -t "$backup_dir" -- {} +
find scripts -maxdepth 1 -type f \( -name '*.sh' -o -name '*.bash' \) \
  -exec sed -i 's/\r$//' {} +

if grep -Il $'\r' scripts/*.sh scripts/*.bash 2>/dev/null; then
  echo 'Shell 脚本仍含 CR，停止部署' >&2
  exit 1
fi

find scripts -maxdepth 1 -type f -exec chmod 0644 {} +
bash -n scripts/*.sh
bash scripts/deploy.sh --check
```

仓库已通过 `.gitattributes` 和 `npm run check:shell-eol` 强制 Shell 使用 LF，防止再次复制错误字节。

## 10. 发布后验证

部署成功后至少检查：

```bash
cd /opt/wzywt
bash scripts/deploy.sh --check
pm2 status
curl --fail "http://127.0.0.1:8001/api/health"
readlink -f /opt/wzywt-runtime/current
```

内部 health 通过仍不等于完整业务通过。正式域名还要验证 TLS、登录、赛事创建/加入/分队、管理员操作、上传/OCR、受保护视频、评论点赞和回滚演练。
