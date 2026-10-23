# 王者演武堂开发指南

王者荣耀 5v5 内战分队系统，基于 Next.js 15、TypeScript、Prisma/MySQL、Redis 与 PM2。

## 当前部署与客户端约定

- 当前以本地、局域网和 Docker Compose 容器化部署为主，同时支持电脑和手机页面。
- 容器入口为 `node scripts/compose.mjs`，配置为 `compose.yaml` / `.env.docker`，操作说明见 `docs/operations/docker.md`。
- 通用应用配置按白名单继承根目录 `.env`，`.env.docker` 只维护容器专用配置和差异；优先级为进程环境 > Docker 配置 > `.env` > 默认值。显式空值清空继承；不要把原生数据库/Redis 地址或宿主文件路径带入容器。
- Compose 只维护拓扑；运行参数由 `scripts/compose-runtime.mjs` 调用共享环境和资源模块生成，通过标准输入合入。不要在 YAML 重新抄写应用环境、资源默认值或宿主发布逻辑。Docker/PM2 启动命令共用 `scripts/runtime-command.mjs`。
- 容器运行职责、数据归属和 OSS 边界见 `docs/architecture/runtime-architecture.md`；实施人员只从 `docs/operations/docker.md` 开始，不拼接历史部署文档。
- Web、Cron、MySQL、Redis、可选 OCR 按独立运行职责拆容器；电脑和手机共享同一 Web 服务、数据库和登录规则。
- Compose 支持 `MYSQL_MODE=container|external`、`OCR_MODE=off|container|external`；复用已有服务时不管理外部进程。Nginx 沿用宿主配置，连接信息复用现有 env，不增加重复变量。
- 新增配置或发布流程必须验证本地 HTTP、局域网 PUBLIC_ORIGIN、电脑/手机跳转与 Cookie；不能默认要求公网域名或 HTTPS。
- 更新必须先构建、再停止写入并备份数据库/媒体/爬虫文件、再迁移和启动；日常停止不得删除持久卷。
- 原生/PM2 转容器统一使用 `compose.mjs export-native/import-native`；源 Web/Cron 停写后导出 SQL、媒体、头像与校验清单，目标空存储导入并核验，不能把 `.env` 继承当作数据迁移。外部 MySQL 只复用与导出身份一致的源库，不自动导入覆盖。
- 原生迁入和普通容器发布均须在启动前核对媒体引用与实际文件；迁入失败保留未完成标记和报告，不删卷、不自动导回旧 SQL、不清除缺失引用，也不自动转换旧视频。
- rclone/OSS 只承载业务文件、爬虫文件和导出备份；容器 MySQL/Redis 活动数据使用本地 Docker 卷，外部 MySQL 保持已有存储。挂载未就绪时必须阻止应用写入本地同名目录。
- 保留现有原生开发与 PM2 发布方式；生产数据库仍只能使用 `prisma migrate deploy`。

## 架构边界

唯一权威说明：[docs/architecture/code-architecture.md](docs/architecture/code-architecture.md)。

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

开发端口固定为 `8001`。最低运行时为 Node.js 24，不设版本上限；`.nvmrc` 默认选择 24，CI 验证 Node 24/26。数据库兼容门槛由 CI 的 MySQL 8.0/8.4 矩阵验证。

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

当前容器路线使用 `node scripts/compose.mjs`，实施、验收和故障处理以 `docs/operations/docker.md` 为准。只有明确采用原生 PM2 时才使用 `scripts/deploy.sh`：基于 `main` 构建独立 release，备份成功后执行 migration，原子切换 PM2，并通过 `/api/health` 验证和回切。

- dirty production tree 必须人工处理，禁止自动 stash。
- Hero Sync 与发布解耦。
- 公网 Nginx/证书细节见 [docs/operations/nginx-configuration.md](docs/operations/nginx-configuration.md)。
