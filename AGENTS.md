# 王者演武堂开发指南

王者荣耀 5v5 内战分队系统，基于 Next.js 14、TypeScript、Prisma/MySQL、Redis 与 PM2。

## 架构边界

唯一权威说明：[docs/code-architecture.md](docs/code-architecture.md)。

依赖方向：

```text
app / web → features → core
features → lib
```

- `src/app`：Next.js 页面与 API 适配。
- `src/web`：React UI、主题、布局和交互。
- `src/features`：业务用例与领域服务。
- `src/core`：纯算法；禁止依赖 React、Next.js、Prisma、Redis、文件系统或网络。
- `src/lib`：数据库、Session、Redis 等基础设施。
- 禁止把业务逻辑重新塞回 API Route，禁止跨层反向依赖。

## 常用命令

```bash
npm run dev
npm run dev:all
npm run build
npm run cron
npm run sync-heroes
npx prisma generate
npx prisma migrate dev
```

开发端口固定为 `8001`。

## 验证命令

```bash
npm run check:architecture
npm run typecheck
npm run test:core
npm run lint
npm run build
```

不得通过删除测试、关闭架构检查、`continue-on-error` 或大面积 `any` 掩盖失败。

## 数据库与 Secret

- Schema 变更必须提交新的 Prisma migration。
- 生产环境只允许 `prisma migrate deploy`，禁止 `db push`。
- 禁止删除或改写既有 migration。
- 禁止提交 `.env`、数据库备份、管理员凭据、Session Secret、Token 或真实生产连接信息。
- 测试 seed 在生产环境必须拒绝运行；管理员 seed 凭据只从 `SEED_ADMIN_*` 读取。

## 部署

使用 `scripts/deploy.sh`：基于 `main` 构建独立 release，备份成功后执行 migration，原子切换 PM2，并通过 `/api/health` 验证和回滚。

- dirty production tree 必须人工处理，禁止自动 stash。
- Hero Sync 与发布解耦。
- Nginx/证书细节见 [docs/deploy.md](docs/deploy.md)。
