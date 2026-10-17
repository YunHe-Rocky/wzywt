# 维护者权威入口

本页给新维护者提供权威索引。容器实施人员直接使用 `docs/operations/docker.md`；只有明确采用原生 PM2 时才使用 `docs/operations/deploy.md`。

## 1. 受支持基线

| 层 | 仓库基线 | 验证位置 |
| --- | --- | --- |
| Node.js | 最低 24，不设上限；`.nvmrc` 默认选择 24 | CI Node 24/26 矩阵，`deploy.sh --check` |
| npm | 10.x 或 11.x，且必须使用 lockfile | `package.json.engines`、`npm ci` |
| Next.js | 15.x；精确安装版本由 lockfile 决定 | `package-lock.json`、build |
| MySQL | 8.0 与 8.4 | CI migration + integration 矩阵 |
| Redis | 可选；`REDIS_REQUIRED=1` 时缺配置/不可用均阻断 readiness | health 与连接测试 |
| Docker Compose | 2.20 或以上 | `compose.mjs check`、容器 CI |

Node.js 24 是开发默认版本；部署仅要求 Node >=24，不因更高大版本或 Current 状态拒绝部署。CI 覆盖 24/26；允许更高版本不代表所有未来版本均已验证，兼容性以依赖安装、测试、构建和健康检查结果为准。调整 Node/Next/MySQL 的验证范围时，同步更新本表和 CI 矩阵。

## 2. 权威来源

- 依赖版本：`package-lock.json`；版本范围和命令：`package.json`。
- 数据库事实：`prisma/schema.prisma` 与 `prisma/migrations/`；`docs/architecture/database.md` 仅为历史阅读概览。
- 容器环境变量：`.env.docker.example` 生成私有 `.env.docker`；容器操作与 OSS 路径以 `docs/operations/docker.md` 为准。
- 容器运行配置：`scripts/compose-runtime.mjs` 调用 `docker/runtime-env.mjs`，管理脚本通过标准输入把配置合入拓扑；资源默认值由共享模块读取，`compose.yaml` 不再抄写应用环境与资源参数。Docker/PM2 启动命令共用 `scripts/runtime-command.mjs`。
- 原生 PM2 环境变量：`.env.example`。Next Web 和 cron 从部署 runtime 的 `shared/.env` 读取应用变量；`scripts/deploy-env.mjs` 只解析部署预检允许的白名单。
- 代码边界：`docs/architecture/code-architecture.md`。
- 房间/比赛/分队产品规则：`docs/product/product-rules.md`。
- 容器运行职责：`docs/architecture/runtime-architecture.md`；容器部署、更新和备份：`docs/operations/docker.md`。
- PM2 发布：`docs/operations/deploy.md`；共同的 schema 恢复边界：`docs/operations/recovery-and-release.md`。
- 媒体备份：`docs/operations/media-operations.md`；探针与告警：`docs/operations/observability.md`。
- 资源预算、普通访问/实时订阅供给、缓存/Worker 回收、高压排空与恢复：[资源调度运行手册](resource-governor.md)。Docker 容量预检及旧容器限额维护以 [容器部署入口](docker.md) 为准。
- override 原因和升级方式：`docs/operations/dependencies.md`。

任务评审稿、临时计划、回归截图和本地输出不是长期权威文档，不应链接为生产操作依据。

## 3. 从空环境启动与验证

当前容器部署从以下文档开始：

```bash
node scripts/compose.mjs init
# 按 docs/operations/docker.md 填写 .env.docker
node scripts/compose.mjs check
node scripts/compose.mjs up
```

源码开发环境安装 Node 24 或更高版本与 MySQL 8.0/8.4，复制 `.env.example` 为未提交的 `.env`，填写隔离数据库和新生成的 Session Secret，然后：

```bash
npm ci
npx prisma generate
npx prisma migrate dev
npm run dev
```

提交前运行 `npm run check`、`npm run lint`、`npm run build`。数据库集成测试必须同时满足本机地址、数据库名以 `_ci`/`_test` 结尾和 `ALLOW_INTEGRATION_TEST_DATABASE=1`，避免误清理真实数据。

修改 Compose 拓扑、共享配置或入口时，另外运行 `npm run test:compose:model`，通过真实 Compose CLI 检查 12 种数据库/OCR/存储组合、特殊字符凭据和资源预算。该命令需要 Compose CLI，无需启动容器；实际启动、备份和桌面/手机入口仍由容器 CI 与目标主机验收。

## 4. 发布、日志与恢复

Compose 实例只运行：

```bash
node scripts/compose.mjs check
node scripts/compose.mjs update
node scripts/compose.mjs status
```

完整验收、OSS、日志和备份见 `docs/operations/docker.md`。

PM2 实例只运行：

```bash
bash scripts/deploy.sh --check
bash scripts/deploy.sh
```

两条路线都不会自动反向 migration 或导入旧库。Compose 故障先保留 `compose.mjs` 当前终端输出，再查看 `status` 和对应服务日志；PM2 故障先看 `[deploy] ERROR`、runtime 的 `shared/deploy-logs`、`pm2 status` 与本项目日志。公共 liveness 不能证明依赖就绪，切流只看 readiness。

应用回切不等于数据库回滚。失败后先按 `docs/operations/recovery-and-release.md` 判断旧 release 是否兼容新 schema；只有人工确认数据恢复会覆盖当前事实时，才从已校验 SQL/媒体清单重建。恢复演练必须记录备份集、校验和、RPO、RTO 和未覆盖范围。
