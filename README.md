# 王者演武堂

王者荣耀 5v5 朋友局/内战组织工具，提供赛事房间、报名、临时玩家、分路偏好、英雄战力与确定性分队。

## 技术栈

Next.js 14、TypeScript、Tailwind CSS、Prisma 5、MySQL、Redis、iron-session、PM2、node-cron。

## 本地启动

```bash
npm ci
npx prisma generate
npx prisma migrate dev
npm run dev
```

开发服务固定使用 `http://127.0.0.1:8001`。先复制 `.env.example` 为 `.env`，再填写本地环境变量；禁止提交 `.env`。

## 环境变量

- `DATABASE_URL`：MySQL 连接字符串。
- `SESSION_SECRET`：至少 32 字符；生产环境缺失时应用拒绝启动。
- `REDIS_URL`：Redis 连接字符串；不可用时缓存与 Cron 锁降级并输出限频告警。
- `AVATAR_DIR`：头像文件目录。
- `MEDIA_STORAGE_DIR`：比赛原图与演武视频的持久化目录；生产环境必填，必须位于 release 目录之外。
- `MATCH_OCR_ENDPOINT`：可选的六图 OCR HTTPS 服务地址；未配置时识别入口 fail-closed。
- `MATCH_OCR_TOKEN`：可选 OCR Bearer Token，只保存在生产 `.env`。
- `SEED_ADMIN_*`：仅开发 seed 使用的管理员凭据，禁止写入仓库。

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

部署脚本使用 release directory、数据库备份、migration、PM2 原子切换、health check 与失败回滚。Hero Sync 与代码发布解耦。
`scripts/deploy-win.bat` 已停用；生产发布只允许使用文档约定的 `scripts/deploy.sh`。

## License

当前仓库未声明开源许可证。是否开源及采用何种许可证由项目 Owner 决定。
