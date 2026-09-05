# 王者演武堂

王者荣耀 5v5 朋友局/内战组织工具，提供赛事房间、报名、临时玩家、分路偏好、英雄战力与确定性分队。

## 技术栈

Next.js、TypeScript、Tailwind CSS、Prisma/MySQL、Redis、iron-session、PM2、node-cron。

## 本地启动

```bash
npm ci
npx prisma generate
npx prisma migrate dev
npm run dev
```

开发服务固定使用 `http://127.0.0.1:8001`。先复制 `.env.example` 为 `.env`，再填写本地环境变量；禁止提交 `.env`。

## 环境变量

生产必填项只有：

- `DATABASE_URL`：MySQL 连接字符串。
- `SESSION_SECRET`：至少 32 字符；生产缺失时应用拒绝启动。

可选项：

- `REDIS_URL` / `REDIS_REQUIRED`：Redis 与是否作为强制健康依赖。
- `MATCH_OCR_ENDPOINT` / `MATCH_OCR_TOKEN`：六图 OCR；未配置时识别入口 fail-closed。
- `HOST` / `PORT`：仅在不用默认 `127.0.0.1:8001` 时设置。
- `MEDIA_STORAGE_DIR` / `AVATAR_DIR`：本地开发可覆盖；生产部署脚本自动指向 runtime 的持久化 shared 目录。
- `SEED_ADMIN_*` / `SEED_USER_PASSWORD`：仅开发 seed，禁止进入生产 `.env`。

部署路径、Git、PM2、命令位置、备份和 Nginx/TLS 不是普通应用 `.env` 必填项。完整说明见 [部署指南](docs/deploy.md)。

## 数据库 Migration

开发环境使用 `npx prisma migrate dev` 创建 migration。生产环境只允许：

```bash
npx prisma migrate deploy
```

禁止在生产环境使用 `prisma db push`，禁止删除既有 migration。

## 验证

```bash
npm run check:architecture
npm run typecheck
npm run test:core
npm run test:next-stage
npm run test:connections
npm run lint
npm run build
```

## 架构与部署

- [代码分层架构](docs/code-architecture.md)
- [部署说明](docs/deploy.md)
- [Nginx 与 SSL/TLS](docs/nginx-configuration.md)

服务器已有代码和最小 `.env` 后，日常发布只有：

```bash
bash scripts/deploy.sh --check
bash scripts/deploy.sh
```

脚本使用独立 release、数据库备份、`prisma migrate deploy`、PM2 原子切换、release-aware health 和失败回滚。Hero Sync 与代码发布解耦。`scripts/deploy-win.bat` 已停用。

## License

当前仓库未声明开源许可证。是否开源及采用何种许可证由项目 Owner 决定。
