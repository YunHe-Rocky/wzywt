# 王者演武堂

王者荣耀 5v5 朋友局与内战管理平台。把赛事报名、分路偏好、确定性分队、比赛档案和赛后交流放在同一个站点，支持电脑与手机访问，以及本地、局域网和云服务器部署。

[![CI](https://github.com/YunHe-Rocky/wzywt/actions/workflows/ci.yml/badge.svg)](https://github.com/YunHe-Rocky/wzywt/actions/workflows/ci.yml)

[部署手册](docs/operations/docker.md) · [产品规则](docs/product/product-rules.md) · [维护指南](docs/operations/maintenance.md) · [更新日志](CHANGELOG.md)

## 功能概览

| 能力 | 说明 |
| --- | --- |
| 赛事与报名 | 创建和加入房间、邀请码、临时玩家、分路偏好及房间管理 |
| 确定性分队 | 优先满足分路志愿，再比较双方估计强度；相同输入可复现，结果显示偏好与强度依据 |
| 比赛档案 | 截图上传、可选六图 OCR、人工校对、草稿恢复、战绩提交与争议处理 |
| 英雄与装备 | 英雄、技能、皮肤和装备资料，以及后台同步任务 |
| 赛后交流 | 战斗动态、受限额保护的视频上传、评论与点赞 |
| 管理与访问 | 用户、公告、赛事和同步管理，桌面页面与手机页面共享账号和数据 |

当前产品是一房一局：一个房间完成一次报名、一次分队和一场比赛档案。分队强度来自用户资料估计，不代表已校准的胜率。完整规则见 [房间、比赛与分队规则](docs/product/product-rules.md)。

## 部署与运行能力

- Docker Compose 分离 Web、Cron、MySQL、Redis 与可选 OCR；也可连接已有 MySQL/OCR，原生 PM2 路线继续保留。
- 自适应资源调度根据内存、CPU 和请求压力收缩内部任务，普通 API 与实时订阅分别限额，并回收空闲缓存和 Worker。
- 结构化日志包含请求、任务、进程和发布标识；健康检查区分存活与就绪，配合进程监督和有期限的优雅退出。
- 更新按构建、停写、备份、迁移、启动及电脑/手机入口检查执行；支持本地卷和经检查的 rclone/OSS 业务文件存储。

运行参数只维护在选定环境文件中，Compose 调用共享脚本生成配置。具体预算、恢复条件和验收边界见 [资源调度与自动恢复](docs/operations/resource-governor.md) 与 [部署手册](docs/operations/docker.md)。

当前内部版本：[v1.1.0 / WZYWT-REL-0005](docs/releases/v1.1.0.md)（小更新，实现源码已提交；代码版本不代表生产已部署）。版本号按「大更新.小更新.子更新」排列，下一子更新为 `v1.1.1`；上一已登记代码版本为 [v1.0.3](docs/releases/v1.0.3.md)。

## 技术栈

Next.js 15、TypeScript、Tailwind CSS、Prisma/MySQL、Redis、iron-session、PM2、node-cron。

## 容器部署

当前部署面向本地、局域网和云服务器容器，电脑和手机使用同一个站点。实施人员从 [Docker Compose 部署与运维手册](docs/operations/docker.md) 开始；容器职责和数据归属见 [Docker Compose 运行架构](docs/architecture/runtime-architecture.md)。

已安装 Node.js 24+ 和 Docker Desktop（Linux 容器）或 Docker Engine + Compose 2.20+ 时，可在项目根目录直接执行，无需宿主机先安装 npm 依赖、MySQL、Redis 或 Git：

```bash
node scripts/compose.mjs init
# 手机访问前，将 .env.docker 中 PUBLIC_ORIGIN 改为 http://本机局域网IP:8001
node scripts/compose.mjs check
node scripts/compose.mjs up
```

部署配置只维护 `.env.docker`（或 `--env-file` 指定的文件）。`compose.yaml` 保留服务、网络、挂载和健康检查，管理脚本直接调用共享配置生成环境变量及资源限额；无需再把应用参数复制到 YAML。日常操作统一使用 `node scripts/compose.mjs`。

`init` 生成随机凭据，已有配置不会覆盖。云服务器已经通过 rclone 挂载 OSS 时，在 `.env.docker` 设置以下变量；路径、权限、迁移和验收要求见[部署手册的 rclone/OSS 章节](docs/operations/docker.md#3-rclone--oss-前置检查)：

```dotenv
STORAGE_MODE=rclone
OSS_MOUNT_PATH=/mnt/oss
OSS_DATA_PATH=/mnt/oss/wzywt
COMPOSE_BACKUP_DIR=/mnt/oss/wzywt/backups
```

业务媒体/头像、Cron 英雄/皮肤文件与备份使用上述挂载目录；容器 MySQL 活动数据仍在本地数据库卷，外部 MySQL 保持已有存储，SQL 导出备份写入 OSS。实际路径由实施人员在部署时填写，不写死在项目中。

复用已有服务时，在 `.env.docker` 设置 `MYSQL_MODE=external`、`OCR_MODE=external`，填写现有连接信息；也可分别选择容器模式，OCR 可关闭。Nginx 继续使用宿主机现有安装。默认容器模式无需额外填写连接地址，详细步骤见 [部署手册的服务选择](docs/operations/docker.md#24-选择新建容器服务或复用已有服务)。

## 源码开发

下面是直接运行源码的方式：

最低使用 Node.js 24，不设版本上限（`.nvmrc` 默认选择 24，CI 验证 24/26）；MySQL 8.0/8.4 由 CI migration + integration 矩阵验证。依赖安装以 `package-lock.json` 为准。

```bash
npm ci
npx prisma generate
npx prisma migrate dev
npm run dev
```

开发服务固定使用 `http://127.0.0.1:8001`。先复制 `.env.example` 为 `.env`，再填写本地环境变量；禁止提交 `.env`。

虚拟机也支持完整构建部署：设置 `DEPLOY_ENVIRONMENT=local`、`HOST=0.0.0.0` 和 `PUBLIC_ORIGIN=http://虚拟机私网IP:8001`，运行原有 `scripts/deploy.sh` 即可，无需公网或证书。使用独立测试数据库、Redis 和 Session Secret，详见[本地开发与虚拟机测试](docs/operations/deploy.md#本地开发与虚拟机测试)。

## 源码与 PM2 环境变量

以下项目适用于直接运行源码和 PM2 部署。Compose 使用 `.env.docker`，以 [Compose 手册](docs/operations/docker.md#4-生成并填写部署配置)为准。

源码/PM2 生产必填项只有：

- `DATABASE_URL`：MySQL 连接字符串。
- `SESSION_SECRET`：至少 32 字符；生产缺失时应用拒绝启动。
- `PUBLIC_ORIGIN`：批准的 HTTPS 站点地址（如 `https://game.example.com`），供设备/登录跳转和公网发布验收使用，须与 Nginx/TLS 站点一致。

可选项：

- `DEPLOY_ENVIRONMENT`：默认 `production`（HTTPS）；`local` 允许内网 HTTP，并按协议自动设置登录 Cookie。
- `REDIS_URL` / `REDIS_REQUIRED`：Redis 与是否作为强制健康依赖。
- `MATCH_OCR_ENDPOINT` / `MATCH_OCR_TOKEN`：六图 OCR；未配置时识别入口 fail-closed。仓库 RapidOCR 支持六类结算截图结构化辅助识别，要求受支持的固定版式与六页输入，结果必须人工复核；[OCR 服务与验收说明](docs/operations/ocr.md)。
- `HEALTH_DETAILS_TOKEN`：可选内部 readiness 指标令牌，只通过请求头发送。
- `HOST` / `PORT`：仅在不用默认 `127.0.0.1:8001` 时设置。
- `MEDIA_STORAGE_DIR` / `AVATAR_DIR`：本地开发可覆盖；生产部署脚本自动指向 runtime 的持久化 shared 目录。
- `SEED_ADMIN_*` / `SEED_USER_PASSWORD`：仅开发 seed，禁止进入生产 `.env`。

部署路径、Git、PM2、命令位置、备份和 Nginx/TLS 不是普通应用 `.env` 必填项。完整说明见 [部署指南](docs/operations/deploy.md)。

## 数据库 Migration

开发环境使用 `npx prisma migrate dev` 创建 migration。生产环境只允许：

```bash
npx prisma migrate deploy
```

禁止在生产环境使用 `prisma db push`，禁止删除既有 migration。

## 验证

```bash
npm run check
npm run lint
npm run build
```

`test:integration` 只允许本机且库名以 `_ci`/`_test` 结尾的隔离库；完整门槛、数据库矩阵和日志/恢复路径见维护指南。

## 架构与部署

- [维护者权威入口](docs/operations/maintenance.md)
- [代码分层架构](docs/architecture/code-architecture.md)
- [Redis API 数据路径](docs/architecture/redis-api-data-path.md)
- [2026-10-18 审计修复处理记录](docs/audits/remediation-2026-10-18.md)
- [Docker Compose 运行架构](docs/architecture/runtime-architecture.md)
- [Docker Compose 部署与运维](docs/operations/docker.md)
- [房间、比赛与分队规则](docs/product/product-rules.md)
- [依赖与 overrides](docs/operations/dependencies.md)
- [原生 PM2 部署说明](docs/operations/deploy.md)
- [健康检查与告警](docs/operations/observability.md)
- [资源调度、内存回收与自动恢复](docs/operations/resource-governor.md)
- [Nginx 与 SSL/TLS](docs/operations/nginx-configuration.md)
- [安全问题报告](SECURITY.md)
- [正式版本登记](docs/releases/README.md)

容器部署使用：

```bash
node scripts/compose.mjs check
node scripts/compose.mjs update
```

明确采用原生 PM2、服务器已有代码和最小 `.env` 时使用：

```bash
bash scripts/deploy.sh --check
bash scripts/deploy.sh
```

两条路线不能在同一实例混用。PM2 脚本使用独立 release、数据库备份、`prisma migrate deploy`、原子切换、release-aware health 和失败回切；Compose 路线由 `scripts/compose.mjs` 管理容器、备份和迁移。Hero Sync 与代码发布解耦。`scripts/deploy-win.bat` 已停用。

## License

当前仓库未声明开源许可证。公开可见不等于允许复制、修改或再分发；是否开源及采用何种许可证由项目 Owner 决定。外部贡献前请先阅读 [贡献指南](CONTRIBUTING.md)，游戏素材与第三方数据的使用条件需单独核实。
