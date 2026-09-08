# 王者演武堂

王者荣耀 5v5 朋友局/内战组织工具，提供赛事房间、报名、临时玩家、分路偏好、英雄战力与确定性分队。

## 技术栈

Next.js 15、TypeScript、Tailwind CSS、Prisma/MySQL、Redis、iron-session、PM2、node-cron。

## 本地启动

最低使用 Node.js 24，不设版本上限（`.nvmrc` 默认选择 24，CI 验证 24/26）；MySQL 8.0/8.4 由 CI migration + integration 矩阵验证。依赖安装以 `package-lock.json` 为准。

```bash
npm ci
npx prisma generate
npx prisma migrate dev
npm run dev
```

开发服务固定使用 `http://127.0.0.1:8001`。先复制 `.env.example` 为 `.env`，再填写本地环境变量；禁止提交 `.env`。

虚拟机也支持完整构建部署：设置 `DEPLOY_ENVIRONMENT=local`、`HOST=0.0.0.0` 和 `PUBLIC_ORIGIN=http://虚拟机私网IP:8001`，运行原有 `scripts/deploy.sh` 即可，无需公网或证书。使用独立测试数据库、Redis 和 Session Secret，详见[本地开发与虚拟机测试](docs/operations/deploy.md#本地开发与虚拟机测试)。

## 环境变量

生产必填项只有：

- `DATABASE_URL`：MySQL 连接字符串。
- `SESSION_SECRET`：至少 32 字符；生产缺失时应用拒绝启动。
- `PUBLIC_ORIGIN`：批准的 HTTPS 站点地址（如 `https://game.example.com`），供设备/登录跳转和公网发布验收使用，须与 Nginx/TLS 站点一致。

可选项：

- `DEPLOY_ENVIRONMENT`：默认 `production`（HTTPS）；`local` 允许内网 HTTP，并按协议自动设置登录 Cookie。
- `REDIS_URL` / `REDIS_REQUIRED`：Redis 与是否作为强制健康依赖。
- `MATCH_OCR_ENDPOINT` / `MATCH_OCR_TOKEN`：六图 OCR；未配置时识别入口 fail-closed。自建 RapidOCR 的[单图预览服务与 Bash 启动说明](docs/operations/ocr.md)已提供，尚不可替代正式六图服务。
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
- [房间、比赛与分队规则](docs/product/product-rules.md)
- [依赖与 overrides](docs/operations/dependencies.md)
- [部署说明](docs/operations/deploy.md)
- [健康检查与告警](docs/operations/observability.md)
- [Nginx 与 SSL/TLS](docs/operations/nginx-configuration.md)
- [安全问题报告](SECURITY.md)
- [正式版本登记](docs/releases/README.md)

服务器已有代码和最小 `.env` 后，日常发布只有：

```bash
bash scripts/deploy.sh --check
bash scripts/deploy.sh
```

脚本使用独立 release、数据库备份、`prisma migrate deploy`、PM2 原子切换、release-aware health 和失败回滚。Hero Sync 与代码发布解耦。`scripts/deploy-win.bat` 已停用。

## License

当前仓库未声明开源许可证。公开可见不等于允许复制、修改或再分发；是否开源及采用何种许可证由项目 Owner 决定。外部贡献前请先阅读 [贡献指南](CONTRIBUTING.md)，游戏素材与第三方数据的使用条件需单独核实。
