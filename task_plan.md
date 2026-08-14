# WZYWT V2.1 重构计划

## Goal

按 `docs/wzywt_v2.1_codex_refactor.md` 将安全、部署、分队算法、并发、稳定性、文档与 CI 要求落实为生产级代码，并以真实检查结果交付。

## Constraints

- 保留当前 `main` 工作区已有文档删除和未跟踪任务书，不覆盖、不提交。
- 不使用生产 `db push`，Schema 变更必须生成 migration。
- `src/core` 保持纯函数，不依赖 React、Next.js、Prisma、Redis 或 I/O。
- 志愿满意度严格字典序优先，禁止锁位置和随机 tie-breaker。

## Phases

- [completed] Phase A：盘点并修复 Session、权限、默认凭据、密码重置、敏感文件
- [completed] Phase B：修复部署、备份、health check、rollback
- [completed] Phase C：重构分队算法与核心回归测试
- [completed] Phase D：修复 Split API 并发与结果 V2
- [completed] Phase E：Tournament 校验、邀请码、生命周期、索引与临时玩家
- [completed] Phase F：Cron、Redis、同步锁与可观测性
- [completed] Phase G：Markdown、架构文档、README、环境变量与敏感信息清理
- [completed] Phase H：CI、测试矩阵、全量验证、CHANGELOG 与交付报告
- [completed] Phase I：执行隔离数据库 integration、Shell 语法、Playwright E2E 与可安全确认的生产前置检查

## Next-stage development (2026-08-12)

Goal: implement the first release described by `docs/王者演武堂_下一阶段开发指导_Codex版.md`: permanent match records, protected combat posts/video, and team-private tactics without changing the existing split algorithm.

- [completed] Phase J: inventory architecture and define reusable domain boundaries
- [completed] Phase K: add Prisma models, constraints, indexes, and a forward-only migration
- [completed] Phase L: implement storage, match validation/recognition normalization, confirmation, submission, disputes, and audited corrections
- [completed] Phase M: implement protected combat posts, video streaming, likes, comments, and moderation
- [completed] Phase N: implement team-private tactic rooms, layers, routes, markers, ownership rules, and persistence
- [completed] Phase O: add API adapters and client/UI flows for all three domains
- [completed] Phase P: add tests, wire CI, run the complete validation matrix, and document production operations
- [completed] Phase Q: refactor the mobile match result into a readable responsive table and complete visual regression acceptance
- [completed] Phase R: demote original screenshots to a progressive-disclosure evidence section and make match results the primary content
- [completed] Phase S: replace the abstract tactic background with a project-owned, canyon-structured tactical map and visually verify route contrast
- [completed] Phase T: process the user-provided canyon screenshot into a complete standalone drawing canvas, integrate it, and verify real route overlays
- [completed] Phase U: replace the rejected generated map with a deterministic real-map crop, add one match clock for layer visibility, minion waves, objectives, buffs, and jungle camps, then complete browser acceptance
- [completed] Phase V-UX: simplify tactic-board interaction into clock, stage, draw; collapse resource details, layer administration, coordinates, and destructive actions; verify desktop and mobile usability
- [completed] Phase V: audit and repair the complete connection chain (browser/client, Next.js API, Session, Prisma/MySQL, Redis, OCR/media integrations, cron, health/deploy), add deterministic failure/recovery tests, and rerun production-grade validation

## Phase V acceptance criteria

- Inventory every outbound/inbound connection boundary and document ownership, timeout, cancellation, retry, pooling, and failure semantics.
- Fix reproducible correctness, security, availability, race, leak, stale-state, and reconnect defects without weakening architecture or tests.
- Validate unavailable Redis/OCR/media dependencies fail safely and recover; validate database and HTTP paths with real local services where supported.
- Pass architecture, typecheck, core/domain/integration tests, lint, production build, browser E2E, and connection-specific regression tests; report any production-only checks not actually performed.

## Errors Encountered

| Phase V first typecheck: removed `ServiceError` import still used by multipart validation; SSE cleanup inferred `() => undefined` | 1 | Restored the import and explicitly typed cleanup as `() => void` before rerunning typecheck |

| Error | Attempt | Resolution |
|---|---:|---|
| 初次组合读取输出被截断且 Markdown 显示乱码 | 1 | 改为 UTF-8 分段读取 |
| PowerShell `Get-ChildItem -Filter` 传入数组失败 | 1 | 改用显式文件列表循环 |
| `.planning` ACL 拒绝新建隔离计划目录 | 1 | 使用 skill 兼容的仓库根目录 planning 文件 |
| PowerShell execution policy 禁止 `npx.ps1` | 1 | Windows 下改用 `npx.cmd` / `npm.cmd` |
| build 完成后 Node/tsx 报 `uv_os_get_passwd ENOMEM`，webpack cache rename EPERM | 1 | 构建本体返回 0 且产物生成；后续测试命令单独运行，避免组合命令掩盖退出码 |
| 当前 Windows 宿主没有 `bash`，无法执行 `bash -n` | 1 | `db-backup.mjs` 通过 `node --check`，TS 通过；Shell 语法需在 Linux CI/部署前验证 |
| `npm run test:core` 被 Node 26 `uv_os_get_passwd ENOMEM` 阻断 | 1 | 使用仓库已有 Windows sandbox userinfo shim 复跑，测试 PASS；不把 shim 写入生产/CI |
| Markdown SSR 测试报 `React is not defined` | 1 | 统一 Renderer 显式导入 React，兼容独立 tsx SSR 测试与 Next 编译 |
| integration test 使用 top-level await，不兼容当前 tsconfig module | 1 | 包装为 async `main()`，保持脚本与项目编译配置一致 |
| Next.js 16 强制全仓动态路由异步参数，首次 build 失败 | 1 | 回退到兼容的 15.5.23，锁定修复版传递依赖并用官方 codemod 完成 15.x 所需迁移 |
| 本机无 Docker/MySQL 隔离实例 | 1 | 未连接现有远程库；并发 integration test 纳入 MySQL service CI 执行 |
| PowerShell 下载 MySQL 官方 ZIP 时连接被关闭 | 1 | 改用 curl.exe 分段重试下载并校验官方 MD5，不重复 Invoke-WebRequest |
| `Start-Process` 启动临时 MySQL 因环境同时含 `Path`/`PATH` 失败 | 1 | 改用 .NET `ProcessStartInfo`，不复制冲突环境字典 |
| Windows PowerShell 的 `ProcessStartInfo` 没有 `ArgumentList` | 1 | 使用经过双引号转义的 `Arguments` 字符串，保持所有路径为已解析固定路径 |
| MySQL Windows 组件将含中文的 `basedir` 截断为 `D:\` | 1 | 将临时运行目录迁移到 `%TEMP%\wzywt-mysql-ci` 纯 ASCII 路径 |
| 空库 `migrate deploy` 在第二个 migration P3018 | 1 | 修正历史 migration 删除的 FK 名称与 init 实际创建名称不一致问题，并从空库重跑 |
| FK 修复后 migration 因历史 `db push` 字段缺失再次失败 | 1 | 增加 reconciliation migration，空库 7 个 migration 全部通过且 schema diff 为零 |
| 并行检查中的绝对 `NODE_OPTIONS --require` 路径被 PowerShell 转义 | 1 | 使用仓库忽略目录下的相对测试 shim，串行复跑全部检查 |
| E2E 登录后等待旧 `/admin` 跳转超时 | 1 | 按当前产品规则改为等待 `/?_from=login`，再主动访问后台页面 |
| E2E 公告表单等待不存在的日期 `01/02/03` 超时 | 1 | 删除与当前公告表单无关的旧断言，保留 Markdown 编辑器和预览断言 |
| E2E 仍断言日历含两个 `<select>` | 1 | 按当前无障碍实现改为断言两个 `role=listbox` 时间滚轮 |
| production E2E 的 API 请求在 `http://127.0.0.1` 不发送 Secure Cookie | 1 | base URL 改为可配置并默认使用浏览器认可的可信本地来源 `http://localhost:8001` |
| E2E 截图写入 `.planning` 被 ACL 拒绝 | 1 | 截图迁移到已忽略且可写的 `.cache/test-artifacts` |
| 生产操作缺少可验证 SSH target、凭据和待轮换 Secret | 1 | 仅完成生产前置检查与部署文档修复；禁止猜测目标或生成无法交付的新凭据 |
| `src/features` 旧目录 ACL 拒绝创建新子目录，自动权限复核两次未完成 | 2 | 保持架构边界，改用 `src/features/<domain>.ts` 与既有 `tournaments/server` 中的领域服务文件，不等待或绕过权限 |
| 向 `src/features` 新增领域文件被安全复核明确拒绝 | 3 | 按安全边界停止对该目录的写入；需要用户明确授权修复该目录 ACL 后才能继续 Phase L-N |
| `icacls /T` 只更新了 `src/features` 根和部分目录，48 个旧对象仍拒绝递归 ACL 修改 | 1 | 用户已明确授权；不触碰旧对象，利用根目录新增的继承权限创建四个独立业务域继续开发 |
| `src/web` 与 `src/web/components` 均拒绝新增 UI 领域目录，ACL 审批未返回 | 3 | 已完成所有可写的服务端/API/client 工作；为遵守 app→web 分层，停止把复杂 UI 塞进 app，等待用户明确授权修复 `src/web` ACL |
| `check:architecture` 被 Node 26 `uv_os_get_passwd ENOMEM` 阻断 | 1 | 与既有宿主问题一致；待 ACL 解除后使用仓库忽略目录中的 userinfo shim 复跑，不修改生产代码 |
| 首轮新功能浏览器回归发现列表响应 envelope、异步表单引用、动态 ID 与 FK 清理问题 | 1 | 分别修复 UI 解包、提前保存 form、使用 API 返回 ID，并按依赖顺序清理；全流程复跑 PASS |
| Node 26 在成功生成生产路由后触发 libuv 退出 assertion | 1 | 使用工作区内置 Node 24 执行相同 production build，exit code 0 |
| 最终 E2E 截图上传返回 500 | 1 | 验收启动命令误用 `MEDIA_ROOT`；改为产品要求的 `MEDIA_STORAGE_DIR` 后六图上传及完整浏览器回归 PASS |
| Webapp skill bundled Python lacks `playwright` | 1 | 按既有项目依赖使用 Node Playwright，仍遵循 production server、network idle、DOM reconnaissance、console 和截图验收流程 |
| Chrome 直接打开本地 SVG 时 GPU sandbox 崩溃 | 1 | 改用应用 production server 提供静态 SVG，再由项目 Playwright 截图验证 |
| 战术板视觉 fixture 的 Header 用户请求访问空数据库返回 500 | 1 | 补充 `/api/auth/me` 浏览器路由 fixture，与战术接口一并隔离 |
| PowerShell 当前进程没有 `System.Drawing.Image` 类型 | 1 | 改用工作区内置 Python Pillow 只读校验生成图片尺寸和格式 |
| API route inventory initially used incompatible PowerShell `Get-Content` binding for `FileInfo` | 1 | Retried with `-LiteralPath ([string]$file.FullName)` and completed the inventory |
| Combined monitor patch matched a partially changed file and failed verification | 1 | Re-read exact file state, restored the cycle module, and applied smaller verified patches |
| Health patch was rejected because it transiently deleted the probe route | 1 | Updated `/api/health` in place so the deployment probe remained present |
| Phase V typecheck found readonly `process.env.NODE_ENV` writes in a regression test | 1 | Replaced direct assignment and deletion with typed `Reflect` operations |
| First production browser smoke reached a stale helper-spawned server and observed the wrong 500/200 responses | 1 | Verified port ownership, avoided the Windows helper child-process leak, and moved to a direct Node-owned server harness |
| PowerShell `Start-Process` failed on inherited `Path`/`PATH` duplicates | 1 | Replaced it with a Node `spawn` harness using an explicit child process and deterministic cleanup |
| Architecture check rejected direct `@next/env` import from `scripts/cron.ts` | 1 | Moved env initialization into the cron feature before its database dependencies; the script still imports only the worker |
| Port preflight on IPv4 loopback returned Windows `EACCES` while Next binds the dual-stack wildcard | 1 | Changed the non-destructive preflight to bind the same wildcard address as Next.js |
| Production build attempted Redis connections while collecting routes | 1 | Enabled lazy connection plus one bounded offline retry, and cached the client globally; a fresh build completed with zero Redis I/O |
| Final `tsx` gate could not call Windows `os.userInfo()` in the managed host | 2 | Used an ignored `.cache` preload shim only for local verification; production code and CI commands were unchanged |
| Cleanup of the stale `.next` backup hit locked webpack cache files | 1 | Removed all other temporary artifacts and left the remaining cache isolated under `.cache`; did not terminate the unknown process that may own the files |
