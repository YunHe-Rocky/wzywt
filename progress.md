# Progress

## 2026-08-12

- 已以 UTF-8 读取任务书目录与关键要求。
- 已确认分支、HEAD、dirty worktree 和既有用户改动范围。
- 已建立 V2.1 planning 文件。
- 当前进行 Phase A 代码盘点。
- Phase A 已加入 sessionVersion migration、生产 Session fail-fast、实时权限校验、密码重置持久化限流和一次性 token。
- 首次 Prisma/TS 校验因 PowerShell 禁止执行 `npx.ps1` 未运行，改用 `.cmd` 入口重试。
- Phase A 验证：`prisma validate` PASS、`prisma generate` PASS、`tsc --noEmit` PASS、Next production build PASS（存在既有 lint warning）。
- build 产物生成后出现宿主 Node `uv_os_get_passwd ENOMEM` 与 webpack cache EPERM 警告，组合命令最终 exit 0；后续测试拆分运行确认退出码。
- Phase A 完成，进入 Phase B 部署可靠性。
- Phase B 完成 release-directory 部署脚本、无 shell eval 数据库备份、显式 migration baseline、PM2 原子切换、health check 与回滚。
- `node --check scripts/db-backup.mjs`、`tsc --noEmit`、`git diff --check` PASS；本机无 bash，Shell 语法运行验证待 Linux CI。
- 进入 Phase C 分队算法。
- Phase C 完成 `types/metrics/search` 分层；旧算法已由新模块替换，不再保留权重混合和方案数组。
- 新增标准十人、四人打野、志愿压倒战力、第二志愿、BalanceScore、signature、100 次 deterministic、mutation、缺失数据测试。
- `tsc --noEmit` PASS；`test:core` 使用宿主 shim 后 PASS（3.1s）。
- 进入 Phase D Split API 并发安全与 Split Result V2。
- Phase D 移除 Split `$executeRawUnsafe`，增加玩家快照、Serializable transaction、conditional update、同事务操作日志和 409 conflict。
- Split Result 升级到 version 2，包含每人 preferenceRank、PreferenceSummary、BalanceSummary；UI 显示第一/第二/第三志愿命中摘要。
- Phase D `tsc --noEmit` 与 `git diff --check` PASS；Split route 无 unsafe raw SQL。
- 进入 Phase E Tournament / DB。
- Phase E 新增 Tournament 统一纯校验器：正整数 ID、trim/长度、合法未来 deadline、boolean isPublic、公告长度与 partial update。
- 邀请码改为 `crypto.randomInt` + P2002 最多 5 次重试；临时用户内部名改为 `randomBytes`。
- deadline 修改后在事务内执行 capacity reconcile；新增四个查询索引及独立 migration。
- `prisma validate/generate`、`tsc --noEmit`、`test:core` PASS。
- 进入 Phase F Cron / Redis。
- Phase F 删除 worker 与维护脚本中的 Linux `drop_caches`；保留仅重载应用自身进程的低内存操作。
- 新增 Redis `SET NX PX` + token Lua release 分布式锁，并以进程内 Set fallback；Hero Sync/monitor 共用 pipeline lock。
- 初始同步等待 monitor 结束且 6 小时内成功过则跳过；成功时间写入 KvCache。
- Redis pattern 删除改为 SCAN 分页，所有 fallback 增加 60 秒限频告警；`tsc --noEmit` PASS。
- 进入 Phase G Markdown / 文档。
- Phase G 首页、功能说明、changelog detail 与后台预览统一使用 `MarkdownContent`；移除其余 parser。
- Renderer 支持标题、粗斜体、代码、列表、引用、分割线、表格与安全链接；禁止 javascript URL，raw HTML/JS 由 React 转义。
- Markdown SSR 安全测试 PASS；`tsc --noEmit` PASS。
- 新增 README，补充 `.env.example`；AGENTS/CLAUDE 精简为架构入口；文档清除真实数据库 IP 与固定管理员凭据。
- 进入 Phase H CI / 测试矩阵 / 收尾审计。
## 2026-08-12 Phase H 完成

- 新增 GitHub Actions MySQL 隔离服务与 migration/architecture/typecheck/core/markdown/integration/lint/build 门禁。
- 新增并发容量与重复分队 integration test；本机无隔离 MySQL，未对现有远程库执行。
- Next.js 升级至 15.5.23，修复 async request API 兼容，npm audit 为 0 vulnerabilities。
- 全部 `$queryRawUnsafe` / `$executeRawUnsafe` 与宽泛认证 catch 已从运行时代码清除。
- Prisma format/validate/generate、architecture、typecheck、core、markdown、lint、production build、SESSION_SECRET fail-fast、audit、diff check 全部通过。
- lint 保留 18 个既有 warning；Windows webpack cache EPERM 与本机 Redis fallback 不影响 build exit code 0。

## 2026-08-12 Phase I 完成

- 下载并校验 MySQL Community Server 8.4.11 ZIP，在纯 ASCII 临时目录启动隔离 MySQL 3307。
- 从空库执行全部 7 个 migration；修复历史 FK 名称，并新增 legacy schema reconciliation migration。
- `prisma migrate status` 为 up to date，schema diff 为零；数据库并发 integration test PASS。
- 使用 production build、Chrome 和本地临时 admin 执行 UI E2E，登录、后台 Markdown、日历时间滚轮和房间预览截图全部 PASS。
- `deploy.sh`、`mysql-backup.sh` 通过 Git Bash `bash -n`。
- 最终 `check`、lint、build、integration、migration status/diff、audit、diff-check 全部通过；lint 仅 18 个既有 warning。
- 修正旧部署文档中的 `db push`、旧仓库地址和明文备份示例，使其与 release/migrate/rollback 实现一致。
- 已停止 E2E Web 与隔离 MySQL，并删除本轮约 540 MB MySQL 下载、解压和数据临时文件；保留测试截图。
- 无 SSH target、生产凭据及待轮换值，未执行线上管理员凭据/SESSION_SECRET 轮换、Firewall 和正式 release。
