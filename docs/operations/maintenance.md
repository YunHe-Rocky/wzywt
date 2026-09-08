# 维护者权威入口

本页给新维护者提供唯一入口；具体领域细节链接到对应权威文件，不复制第二套配置。

## 1. 受支持基线

| 层 | 仓库基线 | 验证位置 |
| --- | --- | --- |
| Node.js | 最低 24，不设上限；`.nvmrc` 默认选择 24 | CI Node 24/26 矩阵，`deploy.sh --check` |
| npm | 10.x 或 11.x，且必须使用 lockfile | `package.json.engines`、`npm ci` |
| Next.js | 15.x；精确安装版本由 lockfile 决定 | `package-lock.json`、build |
| MySQL | 8.0 与 8.4 | CI migration + integration 矩阵 |
| Redis | 可选；`REDIS_REQUIRED=1` 时缺配置/不可用均阻断 readiness | health 与连接测试 |

Node.js 24 是开发默认版本；部署仅要求 Node >=24，不因更高大版本或 Current 状态拒绝部署。CI 覆盖 24/26；允许更高版本不代表所有未来版本均已验证，兼容性以依赖安装、测试、构建和健康检查结果为准。调整 Node/Next/MySQL 的验证范围时，同步更新本表和 CI 矩阵。

## 2. 权威来源

- 依赖版本：`package-lock.json`；版本范围和命令：`package.json`。
- 数据库事实：`prisma/schema.prisma` 与 `prisma/migrations/`；`docs/architecture/database.md` 仅为历史阅读概览。
- 环境变量：`.env.example`。Next Web 和 cron 从部署 runtime 的 `shared/.env` 读取应用变量；`scripts/deploy-env.mjs` 只解析部署预检允许的白名单，不能把任意宿主变量塞进应用 `.env`。
- 代码边界：`docs/architecture/code-architecture.md`。
- 房间/比赛/分队产品规则：`docs/product/product-rules.md`。
- 发布、回切、恢复：`docs/operations/deploy.md` 与 `docs/operations/recovery-and-release.md`。
- 媒体备份：`docs/operations/media-operations.md`；探针与告警：`docs/operations/observability.md`。
- override 原因和升级方式：`docs/operations/dependencies.md`。

任务评审稿、临时计划、回归截图和本地输出不是长期权威文档，不应链接为生产操作依据。

## 3. 从空环境启动与验证

安装 Node 24 或更高版本与 MySQL 8.0/8.4，复制 `.env.example` 为未提交的 `.env`，填写隔离数据库和新生成的 Session Secret，然后：

```bash
npm ci
npx prisma generate
npx prisma migrate dev
npm run dev
```

提交前运行 `npm run check`、`npm run lint`、`npm run build`。数据库集成测试必须同时满足本机地址、数据库名以 `_ci`/`_test` 结尾和 `ALLOW_INTEGRATION_TEST_DATABASE=1`，避免误清理真实数据。

## 4. 发布、日志与恢复

生产只运行：

```bash
bash scripts/deploy.sh --check
bash scripts/deploy.sh
```

发布脚本固定执行 `npm ci`、构建、SQL 备份、`prisma migrate deploy`、原子切换、release-aware readiness；不会自动 stash/reset、反向 migration 或导入旧库。定位故障时先看本次终端的 `[deploy] ERROR`、runtime 的 `shared/deploy-logs`，再用 `pm2 status` 与 `pm2 logs <本项目进程名> --lines 200`。公共 liveness 不能证明依赖就绪，切流只看 readiness。

应用回切不等于数据库回滚。失败后先按 `docs/operations/recovery-and-release.md` 判断旧 release 是否兼容新 schema；只有人工确认数据恢复会覆盖当前事实时，才从已校验 SQL/媒体清单重建。恢复演练必须记录备份集、校验和、RPO、RTO 和未覆盖范围。
