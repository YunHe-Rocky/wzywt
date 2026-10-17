# Docker Compose 部署与运维手册

本文是本地、局域网和云服务器容器部署的唯一实施入口。实施人员从项目根目录执行本文命令。系统结构和数据归属见 [Docker Compose 运行架构](../architecture/runtime-architecture.md)。未采用容器、明确使用 PM2 时才阅读 [原生 PM2 部署](deploy.md)。

配置只填写 `.env.docker`，自定义位置通过 `--env-file` 指定。`compose.yaml` 负责服务拓扑、网络、挂载、依赖和健康检查；管理脚本调用共享配置，生成环境变量、启动参数和资源限额。后续调整应用参数时直接修改环境文件，无需在 YAML 中再维护一份。

每次操作自动合并所选存储配置与内存中的运行配置，不生成第二份凭据文件。部署入口统一使用 `node scripts/compose.mjs`；单独执行 `docker compose up` 会提示使用管理脚本，以免遗漏资源限额和部署门禁。查看状态、日志和停止同样使用本文命令。

自适应资源供给、订阅独立限额、缓存/Worker 回收、高压排空及日志验收见 [资源调度与自动恢复](resource-governor.md)。首次部署同时核对 `.env.docker` 的各服务限额、`RESOURCE_*`、`SPLIT_WORKER_*` 与宿主预留。

### 服务容量与预检

以下为可调整的默认上限，代码来源为 [共享容器配置](../../scripts/compose-runtime.mjs)，未经过目标服务器峰值验收：

| 服务 | 内存上限配置 / 默认 | CPU 默认 | PID 上限 |
|---|---|---|---|
| web | `WEB_MEMORY_LIMIT=1g` | `WEB_CPU_LIMIT=2.0` | 256 |
| cron / 手工同步容器 | `CRON_MEMORY_LIMIT=768m` | `CRON_CPU_LIMIT=1.0` | 128 |
| mysql | `MYSQL_MEMORY_LIMIT=1g` | `MYSQL_CPU_LIMIT=1.0` | 256 |
| redis | `REDIS_MEMORY_LIMIT=768m` | `REDIS_CPU_LIMIT=0.5` | 128 |
| 可选 ocr | `OCR_MEMORY_LIMIT=2g` | `OCR_CPU_LIMIT=2.0` | 128 |
| migrate | `MIGRATE_MEMORY_LIMIT=512m` | 1.0 | 128 |
| storage-init | `STORAGE_INIT_MEMORY_LIMIT=128m` | 0.5 | 64 |
| mysql-client | `MYSQL_CLIENT_MEMORY_LIMIT=256m` | 1.0 | 64 |

`check/up/update/sync-heroes` 从当前 Docker daemon 读取 MemTotal，在构建/停写前核对：所选常驻服务限额之和 + 最大一次性任务 + `COMPOSE_MEMORY_RESERVE_MB`（默认 1024）+ `COMPOSE_EXTERNAL_MEMORY_MB`（默认 0）。默认无 OCR 的 check 预算为 5120 MiB，含 OCR 为 7168 MiB；手工同步增加一个 Cron 容器的预算。Docker Desktop 按其虚拟机容量核对。预留不是内核预占，构建峰值、其他项目容器及同机外部 MySQL/OCR 也要计入；外部服务的同机占用填写在 `COMPOSE_EXTERNAL_MEMORY_MB`，远程服务无需计入本机。

Redis 的 `REDIS_MAXMEMORY=256mb` 是数据上限；容器上限至少为数据上限两倍加 64 MiB，以留 AOF/fork 和进程空间。MySQL 新容器默认 `MYSQL_BUFFER_POOL_SIZE=256M`、`MYSQL_MAX_CONNECTIONS=50`，预检按池大小与连接数检查最低余量。这些估算不能替代实际查询/识别负载测试。不要通过把预留改为 0 来掩盖超配；先按实测调整服务限额或增加 Docker/宿主容量。`status/logs/down` 和备份仍可用于故障维护。

全新部署、无 OCR、无同机其他服务的 4 GiB Docker 环境，可以从以下规划配置开始验收；其预算正好为 4096 MiB，仍须通过实际峰值测试：

```dotenv
WEB_MEMORY_LIMIT=768m
CRON_MEMORY_LIMIT=512m
MYSQL_MEMORY_LIMIT=768m
REDIS_MEMORY_LIMIT=512m
REDIS_MAXMEMORY=128mb
COMPOSE_MEMORY_RESERVE_MB=1024
```

已有实例调整 Redis 数据上限前，先核对当前数据量、AOF/重写开销和业务峰值；过小的 `noeviction` 上限会拒绝新写入。不得为套用示例清空已有 Redis 数据。开启 OCR 或同机有其他服务时重新计算容量。

### 已有容器的资源限额维护

日常 `up/update` 保留数据服务的 `--no-recreate`，不会为应用更新重建或升级数据库。若已运行的 MySQL/Redis 没有限额，或实际限额超过当前配置，部署会在停止 Web/Cron 前拒绝继续。仅修改环境文件不会改变旧容器的内核限额。

先执行备份，保存成功的备份目录、镜像 ID 和容器 ID；使用实际环境文件路径，OSS 模式继续由管理脚本检查挂载：

```bash
node scripts/compose.mjs backup
node scripts/compose.mjs status
```

随后在维护窗口停止 Web/Cron，使用 `docker stats --no-stream <容器ID>` 观察 MySQL/Redis 当前占用，并结合近期峰值确认它们能容纳于目标上限，保留至少 20% 与 64 MiB 中较大的空余。容纳不下时先提高配置并重新执行 `check`，避免把实际内存压到目标限额以下。通过 Docker 的 `update` 调整现有容器，不更换镜像、不删除卷。下面是模板默认值示例，容器 ID 和数值必须对应本次配置：

```bash
docker stop --time 310 <原来运行的web容器ID> <原来运行的cron容器ID>
docker update --memory 1g --memory-swap 2g --cpus 1 --pids-limit 256 <mysql容器ID>
docker update --memory 768m --memory-swap 1536m --cpus 0.5 --pids-limit 128 <redis容器ID>
```

`--memory-swap` 是内存加 swap 的总额；示例保持新建容器默认的两倍内存总额，有不同 swap 策略时按现场策略设置。外部 MySQL 不执行上述命令；已运行的 OCR 可同样按配置维护。`docker update` 不应用 MySQL 启动参数变更，buffer pool/连接数的运行值须另行核对，涉及重建时应固定同一镜像版本并按数据库维护流程操作。命令语义见 [Docker update](https://docs.docker.com/reference/cli/docker/container/update/)；Redis 数据上限以外的内存见 [Redis 官方说明](https://redis.io/docs/latest/develop/reference/eviction/)。

确认数据服务 healthy 后重新执行 `node scripts/compose.mjs check` 和 `update`，管理脚本会读取实际内存、CPU/PID 限额再次核对。失败时先保留日志和备份，确认数据服务健康后用 `docker start <原来运行的web容器ID> <原来运行的cron容器ID>` 恢复旧进程；有意停止的服务继续保持停止。操作期间不得执行 `down --volumes`，不得更换数据库镜像版本或删除 MySQL/Redis 活动数据。整个过程属于有计划维护，不由普通发布隐式执行。

## 1. 交付目标

完成部署后应满足：

- 电脑与手机访问同一个 `PUBLIC_ORIGIN`，手机自动进入移动页面；
- 只有 Web 端口对宿主机发布，Compose 内的 MySQL、Redis 和 OCR 不发布端口；
- Web、Cron、Redis 均健康，选用的 MySQL 可连接，Cron 产生当前 release 的新心跳；
- 生产 schema 由 `prisma migrate deploy` 管理；
- 业务媒体、头像及 Cron 英雄/皮肤文件写入选择的持久存储；
- 每次更新前生成 SQL、媒体和爬虫文件的一致性备份；
- OSS 模式下，rclone 未挂载时应用拒绝写入本地同名目录。

## 2. 实施前准备

### 2.1 主机要求

| 项目 | 要求 |
| --- | --- |
| 操作系统 | Linux 云服务器，或 Windows Docker Desktop 的 Linux 容器模式 |
| Node.js | 24 或以上，只用于运行管理脚本 |
| Docker | Docker Engine/Desktop 已启动，可运行 Linux 容器 |
| Docker Compose | 2.20 或以上，使用 `docker compose` 子命令 |
| 网络 | 首次构建可访问镜像源与 npm；OCR 首次构建需要下载模型 |
| 源码 | 完整项目目录；压缩包或 Git checkout 均可 |
| OSS 模式 | rclone 已在同一台 Linux 主机挂载，Docker 使用本机 `unix://` Engine |

在项目根目录执行只读检查：

```bash
node --version
docker version
docker compose version
docker info --format '{{.ServerVersion}}'
```

Node 主版本应不小于 24，Compose 应不小于 2.20，最后一条必须返回 Docker Server 版本。若 Docker 需要 `sudo`，先按服务器规范把实施账号加入允许管理 Docker 的组，再重新登录；不要只给单条命令临时加 `sudo`，否则 `.env.docker`、备份和锁目录可能出现混合属主。

### 2.2 选择访问方式

实施前只选择其中一种：

| 场景 | `DEPLOY_ENVIRONMENT` | `PUBLIC_ORIGIN` | `BIND_ADDRESS` | 外部入口 |
| --- | --- | --- | --- | --- |
| 仅本机 | `local` | `http://localhost:8001` | `127.0.0.1` | 本机浏览器 |
| 局域网电脑和手机 | `local` | `http://服务器局域网IP:8001` | `0.0.0.0` | 防火墙放行 TCP 8001 |
| 公网域名 | `production` | `https://实际域名` | `127.0.0.1` | 宿主 Nginx/网关代理到 8001，并负责 TLS |

`PUBLIC_ORIGIN` 必须是浏览器真正打开的地址，不能填 `0.0.0.0`、Compose 服务名、手机自己的 localhost，也不能带额外路径。公网部署要求 HTTPS，反向代理配置参考 [Nginx 与 TLS](nginx-configuration.md)。

### 2.3 选择存储模式

| 模式 | 使用场景 | 活动业务文件 | 备份默认位置 |
| --- | --- | --- | --- |
| `volume` | 本机、开发、未接入 OSS | Docker 命名卷 | `data/docker-backups` |
| `rclone` | 云服务器已经挂载 OSS | `<OSS_DATA_PATH>` | `<OSS_DATA_PATH>/backups` |

容器 MySQL 的活动数据保留在 `mysql-data` 本地 Docker 卷；外部 MySQL 沿用已有数据库的本地存储；Redis 保留在 `redis-data` 卷。OSS 存放业务文件、Cron 文件和数据库导出备份；不要把 MySQL 活动数据直接放到 rclone/FUSE。

### 2.4 选择新建容器服务或复用已有服务

只增加两个模式选择，填入同一个 `.env.docker`。Nginx 使用 2.2 节已有的 `BIND_ADDRESS` / `PUBLIC_ORIGIN`，不另设模式变量。

| 配置 | 值 | 行为 |
| --- | --- | --- |
| `MYSQL_MODE` | `container`（默认） / `external` | 创建 MySQL 容器 / 连接已有 MySQL |
| `OCR_MODE` | `off` / `container` / `external` | 关闭识别 / 创建 OCR 容器 / 连接已有 OCR |

两项可以独立选择，例如容器 MySQL 配合宿主机 OCR。Redis 继续由 Compose 提供。

- 使用容器 MySQL 时，不用填写 `MYSQL_HOST`，自动连接 `mysql:3306`。
- 选择外部 MySQL 时，复用 `MYSQL_DATABASE`、`MYSQL_USER`、`MYSQL_PASSWORD`；`MYSQL_HOST` 留空默认是 `host-machine`，`MYSQL_PORT` 默认 3306。远程数据库填写实际可达地址。`MYSQL_ROOT_PASSWORD` 不需要，管理脚本不启动、停止或升级外部数据库。
- OCR 选择 `container` 时，自动配置内部地址；选择 `external` 时，只需填写已有的 `MATCH_OCR_ENDPOINT` 和 `MATCH_OCR_TOKEN`。选 `off` 时清空 endpoint。
- `OCR_MODE` 留空兼容旧配置：`--ocr` 或内部 `http://ocr:8010/recognize` 选择容器服务，其他已填 endpoint 选择外部服务，未填则关闭。新部署建议明确填写模式；`init --ocr` 会写入 `OCR_MODE=container`，以后不必重复传参数。模式与 `--ocr` 冲突会报错。

`host-machine` 是容器访问 Docker 宿主机的固定别名，由 Compose 的 `host-gateway` 映射。容器里的 `localhost` / `127.0.0.1` 指容器自身，不能用来填写外部数据库或 OCR 地址。宿主机服务必须监听容器可达的接口，并允许实际 Docker 网段访问。

### 2.5 复用同机 MySQL、Nginx、OCR 的最小配置

先按 4.1 节生成配置，再替换下列项目；数据库和 OCR 的密码使用现有值，Session Secret 保留生成值：

```dotenv
MYSQL_MODE=external
MYSQL_HOST=
MYSQL_PORT=3306
MYSQL_DATABASE=实施人员填写现有业务库
MYSQL_USER=实施人员填写专用账户
MYSQL_PASSWORD=实施人员填写现有密码
MYSQL_ROOT_PASSWORD=

OCR_MODE=external
MATCH_OCR_ENDPOINT=http://host-machine:8011/recognize
MATCH_OCR_TOKEN=实施人员填写现有OCR令牌

BIND_ADDRESS=127.0.0.1
PUBLIC_ORIGIN=https://实施人员填写实际域名
DEPLOY_ENVIRONMENT=production
```

宿主 Nginx 网站代理到 `http://127.0.0.1:8001`，证书和站点管理见 [Nginx 配置](nginx-configuration.md)。不使用公网域名时按 2.2 节选本地或局域网入口。

MySQL 需要事先建立业务库和专用账户，允许应用容器来源连接，并授予该库的 schema migration、表读写与 SQL 导出权限。导出包含 routines、triggers、events；相关权限不足会阻止更新，不会跳过备份。服务端绑定到 Docker 可达接口，防火墙只放行实际 Docker 来源。`MYSQL_IMAGE` 也用于临时客户端，默认 MySQL 8.4；现有服务版本不同时选择经验证兼容的客户端版本，例如 MySQL 8.0 使用 `MYSQL_IMAGE=mysql:8.0`。

配置填写单行实际值，不引用其他变量。已有密码含 `$`、`#` 或空格时，使用单引号保留字面值，例如 `MYSQL_PASSWORD='实际密码'`；管理脚本会处理传入 Compose 时的 `$` 转义。不要把真实凭据放进命令参数或验收记录。

仓库原生 OCR 管理器默认只监听 `127.0.0.1:8010`。复用这种服务时，使用 [宿主 OCR 代理模板](nginx-ocr-host.conf.template)，将容器入口转给现有回环 OCR，无需改变 OCR 进程监听方式。Linux 上查看 Docker 宿主网关地址：

```bash
docker network inspect bridge --format '{{(index .IPAM.Config 0).Gateway}}'
```

把结果填入模板的 `__DOCKER_HOST_IP__`，安装到现有 Nginx 的 include 目录，执行 `nginx -t` 成功后 reload。模板只在 Docker 宿主网关 IP 的 8011 端口监听，转发 `/health` 和 `/recognize`，保留 Bearer 令牌。主机重启时应让 Docker 网关接口先于该 Nginx 监听可用。若 Docker 使用自定义 host-gateway、rootless 网络或 Docker Desktop，需要按实际宿主可达入口配置；不能假设 Linux 的 `bridge` 地址存在。已有容器可达 OCR 则直接填写其 endpoint，不需要这个代理。

执行第 5 节的 `check` 和 `up`。`check` 只校验配置；`up/update` 会从容器网络检查外部数据库连接及 OCR 六图协议，失败时保持现有 Web/Cron 运行。OCR 健康检查不执行识别，令牌正确性和实际六图识别仍需在网站验收。

模式切换只改变连接和进程管理方式，不搬迁数据。已有容器库切换到外部库之前，必须先独立备份、导入并核对；只改模式会连接另一个数据库。迁移期间暂停该业务库的其他写入者。外部数据库和 OCR 的系统备份、版本升级与启停由现有服务管理流程负责；此处 SQL 备份仅覆盖选定业务库。

## 3. rclone / OSS 前置检查

使用 `volume` 模式可跳过本节。

先确定实际挂载点。以下命令中的路径由实施人员按服务器填写：

```bash
export WZYWT_OSS_MOUNT='/实际/rclone/挂载点'
findmnt -T "$WZYWT_OSS_MOUNT" -o TARGET,FSTYPE,SOURCE,OPTIONS
```

`FSTYPE` 应显示 `fuse.rclone`。只看到目录存在不代表 OSS 已挂载。

rclone 挂载必须允许 Docker 和 uid/gid `1000:1000` 读写，并支持同目录写入、读取、重命名和删除。若需调整现有 rclone 服务，可参考下列参数；不要在已有挂载仍运行时再启动第二个挂载进程：

```bash
rclone mount REMOTE:BUCKET/PREFIX /实际/rclone/挂载点 \
  --allow-other \
  --uid 1000 --gid 1000 \
  --dir-perms 0770 --file-perms 0660 \
  --vfs-cache-mode full \
  --cache-dir /var/cache/rclone/wzywt
```

`--cache-dir` 放在服务器本地磁盘，并为最大视频、备份和上传重试保留足够空间。非 root FUSE 使用 `--allow-other` 时，宿主机通常需要在 `/etc/fuse.conf` 允许 `user_allow_other`。OSS 凭据只放在宿主 rclone 配置中，不写入 `.env.docker`，也不传入应用容器。参数语义见 [rclone mount 官方文档](https://rclone.org/commands/rclone_mount/)。

生产主机应让 rclone 服务先于应用容器可用。若服务器重启时 Docker 先创建了绑定容器，应用会因文件系统类型检查失败而持续退出；rclone 恢复后执行本手册的 `up`，重建绑定关系并重新验收。

## 4. 生成并填写部署配置

### 4.1 首次生成

不启用 OCR：

```bash
node scripts/compose.mjs init
```

需要随本次部署启用 OCR：

```bash
node scripts/compose.mjs init --ocr
```

命令生成 `.env.docker`，为 MySQL、Session 和 OCR 生成互不相同的随机凭据，并拒绝覆盖已有文件。设置文件权限：

```bash
chmod 600 .env.docker
```

不要把 `.env.docker` 提交到 Git、聊天或工单。把它另存到受控的私密凭据保管位置；自动备份不包含该文件。

### 4.2 必须确认的配置

打开 `.env.docker`，确认以下项目。默认容器模式的密码与 Secret 保留 `init` 生成值；复用已有服务时按 2.4–2.5 节填写现有凭据：

```dotenv
COMPOSE_PROJECT_NAME=wzywt
APP_RELEASE_ID=release-YYYYMMDD-NN

MYSQL_DATABASE=wzywt
MYSQL_USER=wzywt
MYSQL_PASSWORD=<保留自动生成值>
MYSQL_ROOT_PASSWORD=<保留自动生成值>
SESSION_SECRET=<保留自动生成值>

DEPLOY_ENVIRONMENT=local
PUBLIC_ORIGIN=http://实际访问地址:8001
SESSION_COOKIE_SECURE=
BIND_ADDRESS=0.0.0.0
PORT=8001
```

`APP_RELEASE_ID` 每次发布使用可追踪的新值，例如日期加构建号或短提交号。公网域名场景按 2.2 节改为 `production`、HTTPS 地址和 `BIND_ADDRESS=127.0.0.1`。

已有 MySQL 卷初始化后，不要只修改 `MYSQL_DATABASE`、`MYSQL_USER` 或密码。MySQL 镜像初始化变量不会修改现有数据库账户；凭据轮换需要先在数据库内完成，再同步 env。

### 4.3 OSS 配置由实施人员填写

在 `.env.docker` 填入服务器真实路径：

```dotenv
STORAGE_MODE=rclone
OSS_MOUNT_PATH=/实际/rclone/挂载点
OSS_DATA_PATH=/实际/rclone/挂载点/wzywt
COMPOSE_BACKUP_DIR=/实际/rclone/挂载点/wzywt/backups
```

只有 `OSS_MOUNT_PATH` 必须明确填写。`OSS_DATA_PATH` 留空时自动使用 `<OSS_MOUNT_PATH>/wzywt`；`COMPOSE_BACKUP_DIR` 留空时自动使用 `<OSS_DATA_PATH>/backups`。

约束如下：

- 所有路径使用 Linux 绝对路径；含空格时用引号包裹；
- 路径值中不写 `${其他变量}`；
- `OSS_DATA_PATH` 必须是挂载点下的专用子目录，不能等于挂载点；
- 备份目录不能放进 `media` 或 `heroes` 业务目录；
- 终端中的同名环境变量优先于 `.env.docker`，部署终端不要残留旧的覆盖值；
- 自定义配置文件时，每条命令都带相同的 `--env-file /绝对/路径`。

实际目录映射：

| 数据 | OSS 主机路径 | 容器路径 |
| --- | --- | --- |
| 截图、视频、头像 | `<OSS_DATA_PATH>/media` | `/app/data/media` |
| 英雄图片及 `.source` 记录 | `<OSS_DATA_PATH>/heroes/images` | `/app/public/heroes/images` |
| 皮肤图片及 `.source` 记录 | `<OSS_DATA_PATH>/heroes/skins` | `/app/public/heroes/skins` |
| SQL、媒体、爬虫文件备份 | `COMPOSE_BACKUP_DIR` | 不挂入 Web，由宿主管理脚本写入 |

未使用 OSS 时保持：

```dotenv
STORAGE_MODE=volume
OSS_MOUNT_PATH=
OSS_DATA_PATH=
COMPOSE_BACKUP_DIR=
```

## 5. 首次部署

在项目根目录依次执行：

```bash
node scripts/compose.mjs check
node scripts/compose.mjs up
node scripts/compose.mjs status
```

OSS 模式必须在挂载 OSS 的同一台 Linux 主机执行。管理脚本会自动叠加 `compose.oss.yaml`；不要手工复制 Compose 文件，也不要把 OSS 凭据传进容器。

`check` 验证 Docker、Compose、Secret、访问地址、OCR 配置和 OSS 挂载，不改变容器。`up` 执行：

1. 构建 Web、Cron、迁移和存储检查镜像；
2. 使用 `--no-recreate` 启动并等待容器 MySQL（若选用）、Redis；
3. 创建持久目录并以应用用户执行写入→重命名→读回检查；
4. 检查选用的外部 MySQL/OCR，再停止现有 Web/Cron 写入；
5. 生成 SQL、媒体和英雄/皮肤文件备份；
6. 执行 `prisma migrate deploy`；
7. 启动 Web、Cron 和可选 OCR，等待健康检查；
8. 验证 `PUBLIC_ORIGIN` 的 releaseId、桌面/手机跳转与登录入口。

使用 `OCR_MODE=container` 后，普通 `check/up/update` 自动带上 OCR；旧的显式参数方式仍可使用：

```bash
node scripts/compose.mjs check --ocr
node scripts/compose.mjs up --ocr
```

已有 `.env.docker` 后再启用 OCR，需要保留原 Secret，并配置：

```dotenv
MATCH_OCR_ENDPOINT=http://ocr:8010/recognize
OCR_MODE=container
MATCH_OCR_INTERNAL_HOST=ocr
MATCH_OCR_TOKEN=<至少32字符且无空白的私密值>
```

OCR 是辅助识别，结果仍需人工核对。能力范围见 [OCR 说明](ocr.md)。

## 6. 上线验收清单

### 6.1 容器和健康

```bash
node scripts/compose.mjs status
node scripts/compose.mjs logs web
```

看完日志按 `Ctrl+C` 退出。验收时应看到：

- `redis`、`web`、`cron` 为 running/healthy；容器模式的 `mysql` 同样健康，外部模式不应新建 `mysql` 服务；
- `storage-init`、`migrate` 为成功退出的一次性任务或已由临时容器完成；
- 启用 OCR 时 `ocr` 为 running/healthy；
- Web 日志无数据库、Redis、媒体目录或 Session 配置错误；
- Cron 日志出现当前 release 的任务启动/心跳，无持续重启。

发生问题时分别查看：

```bash
node scripts/compose.mjs logs web
node scripts/compose.mjs logs cron
node scripts/compose.mjs logs mysql
node scripts/compose.mjs logs redis
node scripts/compose.mjs logs ocr
```

迁移通过临时容器执行，失败详情以 `up/update` 当前终端为准；临时容器删除后不一定出现在历史日志列表中。

### 6.2 浏览器验收

电脑和手机都打开 `.env.docker` 中完全相同的 `PUBLIC_ORIGIN`：

- 电脑进入桌面页面，手机进入 `/m` 页面；
- 登录、刷新、退出正常，登录后 Cookie 可以保持；
- 创建或查看一项实际业务数据；
- 上传一份小型测试媒体并确认能再次打开；
- 运行一次英雄同步并确认 Web 无需重启即可读取新文件：

```bash
node scripts/compose.mjs sync-heroes
```

### 6.3 备份与 OSS 验收

```bash
node scripts/compose.mjs backup
```

命令输出一个精确备份目录。该目录应包含：

```text
database.sql
media.tar.gz
hero-assets.tar.gz
manifest.json
```

检查清单但不要输出 `.env.docker`：

```bash
ls -lh /命令输出的精确备份目录
sed -n '1,120p' /命令输出的精确备份目录/manifest.json
```

`complete: true` 证明文件已写入挂载文件系统；`remoteUploadVerified: false` 表示尚未证明 rclone 已把 VFS 缓存上传到 OSS。随后在 OSS 控制台或远端执行 `rclone lsf/check`，确认同一备份目录的四个对象存在且大小合理。只读取挂载目录不能作为远端上传证据。

OSS 同时存业务主文件和备份时，应在 OSS 控制台启用合适的版本控制、生命周期和保留策略。若要防范账号或存储桶级误删，把备份复制到独立存储桶、账号或区域。

### 6.4 交付记录

实施人员可复制 [实施交付记录模板](deployment-record-template.md)，并保存以下记录，凭据内容除外：

- 部署时间、实施人、主机名和源码版本/提交号；
- Node、Docker、Compose 和 rclone 版本；
- `APP_RELEASE_ID`、`PUBLIC_ORIGIN`、存储模式及路径；
- `status` 结果和电脑/手机验收结果；
- 最近备份目录、`manifest.json` 和 OSS 远端核验结果；
- 防火墙、反向代理、TLS 和 OCR 是否启用；
- 尚未执行的恢复演练或现场验收项目。

## 7. 日常运维

| 操作 | 命令 |
| --- | --- |
| 配置预检 | `node scripts/compose.mjs check` |
| 首次启动 | `node scripts/compose.mjs up` |
| 应用更新 | `node scripts/compose.mjs update` |
| 查看全部状态 | `node scripts/compose.mjs status` |
| 跟踪 Web 日志 | `node scripts/compose.mjs logs web` |
| 跟踪 Cron 日志 | `node scripts/compose.mjs logs cron` |
| 一致性备份 | `node scripts/compose.mjs backup` |
| 手动同步英雄 | `node scripts/compose.mjs sync-heroes` |
| 停止并移除容器、保留数据 | `node scripts/compose.mjs down` |

可用 `--env-file PATH` 选择配置，`--backup-dir PATH` 临时覆盖备份目录，`--ocr` 启用 OCR profile。例如：

```bash
node scripts/compose.mjs status --env-file /etc/wzywt/production.env
node scripts/compose.mjs backup --env-file /etc/wzywt/production.env --backup-dir /独立备份路径
```

不要给 `down` 增加 `--volumes`。管理脚本会拒绝未知参数，普通停止不会删除卷或备份。

## 8. 发布更新

1. 把完整新源码放到项目目录，确认 `.env.docker` 未被覆盖。
2. 将 `APP_RELEASE_ID` 更新为新的可追踪值。
3. 检查 rclone、磁盘空间和维护窗口。
4. 执行预检和更新：

```bash
node scripts/compose.mjs check
node scripts/compose.mjs update
node scripts/compose.mjs status
```

已填写 `OCR_MODE` 时不必添加参数；旧配置也可在 `check/update` 加 `--ocr` 选择容器 OCR。外部 OCR 不加该参数。更新期间 Web/Cron 会暂停写入，当前方案不承诺零停机。

更新脚本先完成构建，再停止 writer。构建失败不会影响现有容器；备份失败会阻止 migration，并恢复更新前正在运行的 Web/Cron。migration 或激活开始后失败时，Web/Cron 保持停止并打印备份目录，实施人员应按第 11 节处理。

普通更新不会替换 MySQL/Redis 容器。调整 `MYSQL_IMAGE`、`REDIS_IMAGE`、数据库版本或数据服务配置属于独立维护操作，必须先完成并验证备份，再按目标版本升级手册执行。

## 9. 从命名卷迁移到 OSS

修改 env 不会自动搬迁旧数据。以下步骤保持现有 MySQL 存储（容器卷或外部库）和 Redis 卷，只迁移媒体和 Cron 文件。

1. 保持当前 `.env.docker` 为 `STORAGE_MODE=volume`，确认 rclone 已挂载。
2. 查看状态并记录 Web/Cron 容器 ID，随后停止这两个容器，防止备份完成后产生新文件：

```bash
node scripts/compose.mjs status
docker stop --time 310 <web容器ID> <cron容器ID>
```

3. 将迁移备份写到服务器本地的专用目录，避免尚未验证的 OSS 参与源备份：

```bash
node scripts/compose.mjs backup --backup-dir /服务器本地/迁移备份目录
```

由于 Web/Cron 原本已停止，备份命令不会把它们重新启动。记录命令输出的精确时间戳备份目录。

4. 在 OSS 挂载下准备目标目录：

```bash
export WZYWT_OSS_DATA='/实际/rclone/挂载点/wzywt'
mkdir -p "$WZYWT_OSS_DATA/media" "$WZYWT_OSS_DATA/heroes/images" "$WZYWT_OSS_DATA/heroes/skins" "$WZYWT_OSS_DATA/backups"
```

5. 使用第 3 步的精确目录解包；不要使用模糊的 `latest` 或通配符：

```bash
tar -xzf /精确/迁移备份目录/media.tar.gz -C "$WZYWT_OSS_DATA/media"
tar -xzf /精确/迁移备份目录/hero-assets.tar.gz -C "$WZYWT_OSS_DATA/heroes"
```

6. 核对文件数量和抽样文件，再按 4.3 节把 `.env.docker` 改为 `STORAGE_MODE=rclone`。
7. 执行：

```bash
node scripts/compose.mjs check
node scripts/compose.mjs up
node scripts/compose.mjs status
```

8. 完成第 6 节全部验收，并从 OSS 远端核验新文件和备份。
9. 保留原命名卷和第 3 步本地迁移备份，直到新存储经过稳定运行和恢复抽样。本文不自动删除旧卷。

## 10. rclone 中断和服务器重启

发现 OSS 挂载中断时：

1. 暂停会产生写入的外部操作；查看状态和日志：

```bash
node scripts/compose.mjs status
node scripts/compose.mjs logs web
node scripts/compose.mjs logs cron
```

2. 修复宿主 rclone 服务，并用 `findmnt -T /实际挂载点` 确认 `fuse.rclone`。
3. 使用 `node scripts/compose.mjs check` 验证路径和配置。
4. 执行 `node scripts/compose.mjs up`，让 Compose 重新建立绑定并完成备份、migration 和入口验收。

`status`、`logs` 和 `down` 在挂载不可用时仍可执行。不要在挂载缺失期间手工创建业务目录或绕过检查启动 Web/Cron，否则可能把文件写入服务器本地的同名目录。

## 11. 故障处理

### 预检失败

按错误修复 Docker、Compose 版本、Secret、`PUBLIC_ORIGIN`、OCR 或 rclone 挂载。`check` 不构建镜像、不停止应用、不执行迁移。

### 构建失败

现有 Web/Cron 保持运行。修复源码、网络或镜像源后重新执行 `update`。

### 备份失败

migration 不会开始，脚本恢复更新前正在运行的 Web/Cron。检查命令打印的 `.partial` 文件、磁盘/VFS 缓存空间、rclone 状态和容器日志，再重新备份。

### migration 或启动失败

脚本会保持 Web/Cron 停止并打印备份目录。不要直接导入旧 SQL，也不要把旧镜像当成 schema 回滚。先保留终端错误，检查 Prisma `_prisma_migrations`、源码 migration 和新旧 release 的 schema 兼容性，再参考 [发布与恢复边界](recovery-and-release.md) 决定向前修复、兼容回切或人工恢复。

### 部署锁存在

错误提示 `.cache/compose-deploy.lock` 时，先确认没有另一个 `compose.mjs` 更新或备份进程。只有确认原进程已经退出后，才在当前项目根目录执行：

```bash
rmdir .cache/compose-deploy.lock
```

随后重新运行原命令。不要在另一个部署仍运行时删除锁。

### 恢复边界

日常管理脚本不会自动覆盖数据库或反向 migration。恢复必须使用与备份 schema 匹配的源码/镜像，先在独立 Compose 项目和新卷中演练 SQL 导入、媒体解包、健康检查及抽样，再决定是否切换生产。没有恢复演练记录时，只能确认“备份已生成”，不能确认“恢复能力已验证”。

## 12. 已验证范围与现场责任

仓库测试覆盖配置解析、Secret/地址策略、两种存储模式、挂载缺失、路径逃逸、写入/重命名/读回、备份门禁、迁移失败、桌面/手机入口和共享英雄图片热读取。Compose 配置也在 CI 中解析。

仓库测试不能替代目标服务器现场验证。实施人员仍需在实际云服务器确认：

- Docker Engine 能构建并启动全部容器；
- rclone 的真实 OSS、权限、VFS 缓存和远端上传正常；
- MySQL migration 在目标数据量下完成；
- 域名、TLS、防火墙、电脑和手机网络路径正常；
- 上传媒体、Cron 同步、备份和远端对象核验通过；
- 至少完成一次隔离恢复演练并记录 RPO/RTO。
