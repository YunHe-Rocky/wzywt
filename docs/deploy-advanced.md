# 部署宿主准备与高级覆盖

本文只处理首次宿主准备和少数异常情况。普通发布请回到 [部署指南](deploy.md)，不要把本页变量整表复制进 `.env`。

原则只有一个：先运行 `bash scripts/deploy.sh --check`，自动发现不适用时，只修它点名的那一项。

## 宿主准备

部署脚本不会安装或升级全局软件。服务器需要：

- Git、tar、curl、flock、realpath、mktemp；
- Node.js 20/22/24/26 与匹配的 npm/npx；
- PM2 6 或更高版本；
- 可连接的 MySQL，以及与服务端兼容的 `mysqldump`；
- 可选 Redis；
- Nginx/证书只在需要公网 HTTPS 时准备，见 [Nginx 与 SSL/TLS 指南](nginx-configuration.md)。

先用实际应用用户登录并确认：

```bash
id
command -v git node npm npx pm2 mysqldump
node --version
pm2 --version
```

脚本优先使用 PATH，也识别以下常见自托管布局：

- `/opt/runtime/NodeJS/bin/*`
- `/opt/runtime/NodeJS/node-v*-linux-x64/bin/*`
- `/opt/middleware/NodeJS/bin/*`
- `/opt/middleware/NodeJS/node-v*-linux-x64/bin/*`
- `/opt/middleware/Mysql/mysql/bin/mysqldump`
- 已有的相邻 `<源码目录>-pm2`（目录中存在 PM2 的 `dump.pm2`、`pids` 或 `logs`）

如果 Node 位于完全不同的位置，首次启动时 `.env` 还没有被 Node 解析，因此要把工具链加入 PATH，或只对该命令提供启动覆盖：

```bash
DEPLOY_NODE_BIN=/custom/node/bin/node bash scripts/deploy.sh --check
```

Node 启动后，npm、npx 和 pm2 会优先从同一个 `bin` 目录解析。长期使用非标准目录时，更推荐在应用用户的受控 PATH 中配置一次，而不是把带版本号的四条绝对路径长期复制进 `.env`。

## 权限问题

正常部署只需要应用用户可写相邻 runtime，不需要它改写 `/opt`、Nginx 或系统服务。

首次 runtime 不存在且 `/opt/apps` 由 root 管理时：

```bash
cd /opt/apps/wzywt
runtime_dir="$(pwd -P)-runtime"
sudo install -d -m 0750 -o "$(id -un)" -g "$(id -gn)" "$runtime_dir"
```

之后用普通应用用户运行部署。不要使用：

```text
chmod -R 777 ...
chown -R ... /opt
sudo bash scripts/deploy.sh
```

如果 runtime 已存在但不可写，先核对：

```bash
namei -l "$(pwd -P)-runtime"
find "$(pwd -P)-runtime" -maxdepth 2 -printf '%M %u:%g %p\n'
```

只修预检指出的 runtime 路径，不递归改源码、其他应用或整个 `/opt`。源码树权限变化会制造 Git mode diff，反而阻止安全发布。

## 自动发现与可选覆盖

以下变量仍受脚本支持，用于兼容历史机器；它们不是普通 `.env` 模板。

| 类别 | 可选覆盖 | 何时使用 |
|---|---|---|
| 身份/目录 | `DEPLOY_PROJECT_NAME`, `DEPLOY_BASE_DIR`, `DEPLOY_SOURCE_DIR`, `DEPLOY_RUN_USER`, `DEPLOY_RUN_GROUP` | 历史 PM2 名必须保留，或 runtime 不在默认相邻目录 |
| Git | `DEPLOY_REMOTE`, `DEPLOY_BRANCH` | detached HEAD、非 upstream 发布分支 |
| Web | `DEPLOY_WEB_HOST`, `DEPLOY_WEB_PORT`, `DEPLOY_HEALTH_URL` | 确实不用默认的 `127.0.0.1:8001` |
| Health | `DEPLOY_HEALTH_ATTEMPTS`, `DEPLOY_HEALTH_INTERVAL_SECONDS`, `DEPLOY_HEALTH_TIMEOUT_SECONDS` | 冷启动经过实测确实更慢 |
| PM2 | `DEPLOY_PM2_HOME`, `DEPLOY_PM2_CONFIG`, `DEPLOY_PM2_WEB_NAME`, `DEPLOY_PM2_CRON_NAME` | 既有 PM2 home 不在自动识别的相邻目录，或历史进程名不同 |
| 工具 | `DEPLOY_NODE_BIN`, `DEPLOY_NPM_BIN`, `DEPLOY_NPX_BIN`, `DEPLOY_PM2_BIN`, `DEPLOY_GIT_BIN`, `DEPLOY_TAR_BIN`, `DEPLOY_CURL_BIN`, `DEPLOY_FLOCK_BIN`, `DEPLOY_MYSQLDUMP_BIN`, `DEPLOY_SYSTEMCTL_BIN` | 工具不在 PATH 或脚本内置搜索目录 |
| 版本 | 对应的 `DEPLOY_*_VERSION_PATTERN` | 组织明确锁定版本范围；值是正则表达式 |
| 宿主证据 | `DEPLOY_HOST_MANIFEST` | 自定义 unit、PID/lock 文件或额外命令验证 |

媒体路径也支持 `MEDIA_STORAGE_DIR` / `AVATAR_DIR`，但必须位于项目 runtime 的 `shared` 内。普通部署不要设置；默认值已经是持久化安全路径。

`DEPLOY_REQUIRED_COMMANDS`、`DEPLOY_REQUIRED_SYSTEMD_SERVICES`、`DEPLOY_AUTO_START_SERVICES` 是已禁用的危险旧设置，脚本会主动拒绝。

## Dirty source

部署脚本只从精确 Git commit 建 release，因此生产源码必须干净。它会打印最多 20 条状态，但不会自动 stash、reset、checkout 或删除文件。

```bash
git status --short
git diff --
git diff --cached --
```

如果只是曾经执行 `chmod -R` 导致脚本 mode 变化，在确认没有内容修改后，仅恢复顶层脚本的普通文件权限：

```bash
git diff --summary -- scripts
find scripts -maxdepth 1 -type f -exec chmod 0644 {} +
git status --short
```

不要把部署 ZIP 放在源码树；放到 `/opt/deploy-packages` 等独立目录。

## CRLF 错误

Rocky Linux 若在第 2 行报告 `pipefail` 无效，Shell 文件被复制成了 Windows CRLF。先备份，再只修 `.sh` / `.bash`：

```bash
backup_dir="/var/backups/wzywt-shell-$(date -u +%Y%m%dT%H%M%SZ)"
sudo install -d -m 0700 "$backup_dir"
sudo find scripts -maxdepth 1 -type f \( -name '*.sh' -o -name '*.bash' \) \
  -exec cp -p -t "$backup_dir" -- {} +
find scripts -maxdepth 1 -type f \( -name '*.sh' -o -name '*.bash' \) \
  -exec sed -i 's/\r$//' {} +
bash -n scripts/*.sh
npm run check:shell-eol
```

仓库的 `.gitattributes` 与 `npm run check:shell-eol` 会阻止该问题再次进入提交。

## MySQL 命令能登录，但 TCP 预检失败

`mysql -u USER -p` 默认可能使用 Unix Socket，而应用的 `127.0.0.1:3306` 使用 TCP，两者不是同一条链。只读核对：

```bash
ss -lntp | grep -E ':3306[[:space:]]' || true
mysql -NBe "SHOW VARIABLES WHERE Variable_name IN ('port','bind_address','skip_networking','socket');"
systemctl list-units --type=service --all | grep -Ei 'mysql|maria' || true
```

endpoint 可达时，自定义/容器化服务不要求存在标准 systemd unit；如果发现了已加载 unit 但 unit、PID 与端口事实冲突，预检会停止。确需额外证据时，复制并填写 [`deploy-host.example.json`](deploy-host.example.json)，再只设置 `DEPLOY_HOST_MANIFEST`。

## 发布与回滚边界

发布顺序固定为：archive → install/build → backup → `prisma migrate deploy` → 原子切换 → PM2 验证 → release-aware health → `pm2 save`。

PM2、health 或 `pm2 save` 失败时，应用和 `current` 会回到旧 release。数据库 migration 不会自动用备份覆盖恢复，因为 migration 后可能已经出现新写入；数据库回退需要停写窗口和人工判断。

失败 release 与脱敏诊断保存在 `<runtime>/shared/deploy-logs`，宿主快照保存在 `<runtime>/shared/host-snapshots`。日志不应包含完整数据库/Redis URL、密码、Session Secret 或 Token。
