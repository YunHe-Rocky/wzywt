# Progress

## 2026-09-05 deployment simplification

- Started Phase Y after direct feedback that the deployment documentation is too difficult and internally inconsistent.
- Read the complete `planning-with-files` workflow, restored the existing root planning files, and appended rather than replaced the completed V2.1 history.
- Confirmed the worktree had no reported Git changes before this task. Initial managed-sandbox reads failed on the Chinese workspace path; continued with narrowly scoped read-only escalation.
- Read the primary deploy guide, `.env.example`, README, host-manifest example, PM2 config, deployment-script inventory, and prior deployment memory index. Focused script-to-document reconciliation is in progress.
- Applied the 7-file deployment simplification: minimal `.env.example`, short primary guide, separate advanced/Nginx indexes, Node/npm/npx/pm2 and custom mysqldump discovery, exact runtime-permission diagnostics, and redaction assertions.
- `npm.cmd run test:deploy` PASS with explicit exit 0. Coverage includes LF enforcement, minimal `.env` defaults, runtime endpoint redaction, normal activation, backup/migration, rollback, first-release failure, PM2 collision, and safe stop.
- Follow-up review identified one existing-server compatibility risk: a custom PM2 home must be discovered before advising removal of all `DEPLOY_*` values. Added sibling PM2-home discovery and regression coverage before finalizing docs.
- Final validation PASS: local Markdown links, exactly two active `.env.example` keys, `git diff --check`, architecture, typecheck, deployment regression (exit 0), and Next.js 15.5.23 production build (exit 0). Build retained only the existing `<img>` optimization warnings.
- The real Rocky Linux host was not mutated or freshly exercised from this workspace. The remaining deployment acceptance step is to rotate exposed credentials, reduce the server `.env` with a backup, and run `bash scripts/deploy.sh --check` there before any release.


## 2026-08-15 faction-cohesive tactic colors

- Phase X completed from user feedback that one faction must not use colors with excessive hue differences.
- Replaced global cross-spectrum tactic colors with faction-scoped semantic member tokens while preserving historical colorKey values and route/marker/draft behavior.
- Added permanent test:next-stage assertions for both exact five-color faction palettes.
- PASS: architecture, typecheck, next-stage tests, lint (0 errors / 18 existing warnings), diff check, and production build.
- Production Chrome on isolated port 8016 PASS: red and blue each rendered five unique route colors and five matching marker colors; console errors 0. The task-owned server was stopped and port 8001 was untouched.
## 2026-08-15 tactic-board interaction and layer privacy

- Phase W started from direct user feedback: marking feels delayed and illogical; owner and ordinary members must not see another participant's annotations until match data is formally submitted.
- Restored the existing project planning files and preserved all prior completed phases and unrelated work.
- Loaded `ui-ux-pro-max` and `planning-with-files`; initial sandboxed reads and the direct workspace patch failed because the managed PowerShell helper could not apply deny-read ACLs on the Chinese workspace path. Patches now use generated unified diffs applied by Git.
- Implemented server-side owner filtering for routes and markers before `SUBMITTED`; owner/admin access does not bypass it. `SUBMITTED` removes the filter, returns all team annotations, sets `canDraw=false`, and rejects every layer/route/marker mutation.
- Replaced click-by-click route input with Pointer Capture drag sampling, coalesced-event fallback, one-stroke history, live draft rendering, and explicit editable/private versus published/read-only UI states.
- Updated domain tests and the database-backed E2E specification for owner/member pre-submit isolation, drag sampling, post-submit visibility, and write lock. The configured database is remote, so the mutating database E2E was not executed locally.
- Final PASS: architecture, typecheck, next-stage tests, E2E syntax, lint (0 errors / 18 existing warnings), diff check, and production build.
- Production Chrome smoke on isolated port 8015 with intercepted APIs PASS: 11 pointer-sampled/saved route points, 2 published review routes, 375px overflow 0, console errors 0. The test server was stopped; the existing 8001 process was untouched.

## 2026-08-13 connection-chain audit

- Manual monitor checks now queue in MySQL and are consumed only by cron, eliminating Web/cron heavy-task races when Redis is unavailable.
- Readiness now covers DB, writable media storage, current-release cron heartbeat, and optionally required Redis; deploy injects the release identity.
- Follow-up typecheck exposed only test-environment readonly typing; corrected with `Reflect` environment mutation.
- Started Phase V at user request. Restored existing planning files, preserved the unfinished map Phase U as pending, and recorded full-chain acceptance criteria.
- Loaded the planning, code-review, and webapp-testing workflows. Recovered prior V2.1 connection/deployment context, but will freshly verify the current worktree.
- Inventoried connection primitives across tracked and untracked TypeScript/JavaScript. Confirmed high-risk per-SSE-client scheduling/leak behavior and an unbounded shared browser request adapter; deeper Redis/cron/storage inspection is in progress.
- Confirmed Redis stops reconnecting after three attempts, cron shutdown disconnects Prisma before in-flight tasks settle, OCR response limits are bypassable for chunked bodies and may leak authorization across redirects, and retry responses are not explicitly released.
- Reproduced by code path the SSE event-name mismatch, the manual monitor button's leaked GET stream, and the unlocked manual hero-sync race. These are now selected for implementation and regression coverage.
- Implemented bounded browser API requests, continuous-but-fail-fast Redis recovery, bounded/no-redirect OCR parsing, response-body cleanup on retry, bounded request-body readers, persistent monitor snapshots, shared SSE heartbeats/polling, deduplicated monitor sync work, queued manual hero sync, and cron drain-on-shutdown. First typecheck found two narrow compile errors; both were corrected for rerun.
- `npm run typecheck` PASS after the first corrections. Added `test:connections` to local `check` and CI; the new connection regression suite PASS.
- Completed the full inbound/outbound connection repair: streamed request limits, multipart video streaming, browser cancellation/timeouts, OCR and upstream response caps, safe retries, SSE fan-out/backpressure, persistent cron queues, renewable DB leases, Redis recovery, current-release heartbeat readiness, and shutdown drain.
- Retired the unsafe Windows deploy entry, made port preflight non-destructive, aligned non-Next scripts with Next env loading, and documented bounded Prisma pool/connect settings.
- Final validation PASS: architecture, typecheck, core, Markdown, next-stage and connection tests, Prisma validate, script syntax, diff check, production build, and production Chrome smoke. Lint remains 0 errors and 18 pre-existing warnings.
- Fresh production build made no Redis connection; lazy Redis import stayed at `wait`, and the first refused command returned fallback in 268 ms.
- Removed the 280 MB incomplete MySQL download and local smoke artifacts. A locked 398 MB stale `.next` cache remains isolated under `.cache`; no unknown Node process was terminated.

## 2026-08-12 next-stage development

- 2026-08-13: Phase Q started after mobile readability feedback; replace the ten stacked player cards with a compact semantic result table, keep editing and 375px no-overflow acceptance.
- 2026-08-13: Phase Q complete. Replaced player cards with one semantic table containing red/blue row groups, aligned columns, readable submitted-state text, editable controls, an internal horizontal scroll region, sticky side/slot cells and accessible labels/caption.
- 2026-08-13: typecheck, next-stage tests and production build PASS; lint remains 0 errors/18 pre-existing warnings. Production browser fixture verified 10 rows, two team groups, sticky column, 375px portrait and 812px landscape without document overflow or console errors; screenshot saved as `.cache/test-artifacts/next-stage/match-mobile-table.png`.
- 2026-08-13: Phase R complete. Moved the result table ahead of evidence, renamed the screenshot area to `数据依据`, collapsed it by default for complete/submitted matches, and retained automatic expansion when fewer than six images exist. Browser visual acceptance shows `6/6 · COMPLETED`, no document overflow, and no console errors.
- 2026-08-13: Phase S complete. Replaced the abstract tactic SVG with a project-owned canyon map containing three lanes, cross-river, red/blue bases, 18 lane towers, buff/neutral camps, bushes, jungle walls, Lord and Tyrant pits. Production component screenshots confirm route/marker contrast on 1440px desktop and 375px mobile with no document overflow or console errors; SVG XML and diff checks pass.
- 2026-08-13: Phase T complete. Used built-in image editing on the user-provided screenshot to remove the left dark panel, top navigation, bottom-right control and all floating overlay icons, reconstruct the hidden terrain, and produce a complete 1254x1254 PNG drawing canvas. Integrated `/images/tactic-map-canyon.png`, removed the superseded abstract SVG, and verified production desktop/mobile route overlays without overflow or console errors.

- Read the complete guide structure and current architecture document.
- Confirmed `main...origin/main`; the only pre-existing untracked item is the user-provided next-stage guide.
- Restored the completed prior plan and appended phases J-P instead of replacing earlier work.
- Phase J architecture inventory is in progress.
- Initial parallel inspection failed because PowerShell `Get-ChildItem -Filter` does not accept an array; switched to explicit literal paths.
- Completed the ten-point pre-development repository inventory required by the guide.
- Phase J complete; started Phase K schema and migration work.
- Added match/player/stat/screenshot/recognition/dispute, combat post/video/like/comment, and tactic room/layer/route/marker Prisma models.
- Extended `AdminOperation` with optional `matchId` and structured `details` for correction audit trails.
- `prisma format` PASS; `prisma validate` PASS.
- Added forward-only migration `20260812140000_add_match_posts_and_tactics`; isolated database execution remains part of final validation.
- Creating new subdirectories below the legacy `src/features` tree was denied by its inherited ACL; two escalation reviews did not complete. Continued with domain-named feature files in writable existing directories.
- Completed the writable part of Phase K/L infrastructure: schema, forward migration, structured API errors, MIME/signature validation, and an opaque-key local media storage adapter.
- Security review explicitly rejected adding the required domain file under `src/features`; stopped rather than placing business logic in the wrong architectural layer. Awaiting explicit user authorization to repair that directory ACL.
- User explicitly requested full completion after the ACL risk was explained.
- Granted the current sandbox account Modify only on the project `src/features` tree. Existing protected files were left unchanged; new domain directories are writable.
- Phase K complete: Prisma format/validate/generate and baseline typecheck all PASS after the schema and forward-only migration changes.
- Phase L started.
- Added pure match constants, split snapshot parsing, OCR payload narrowing, fuzzy nickname comparison, duplicate metric conflict detection, and PASS/WARNING/FAIL consistency classification.
- Added match manager/viewer authorization, match draft creation from the immutable split snapshot, permanent red/blue tactic-room creation, match list/detail queries, six-slot screenshot upload/replacement, and super-admin original-image retrieval.
- Added configurable HTTP OCR execution with 90-second timeout, raw/normalized result separation, cross-image validation, non-binding member recommendations, and fail-closed error persistence.
- Completed match confirmation and submit transactions, required-field checks, exact six-image gate, 10-player/red-blue constraints, duplicate-member protection, dispute throttling, and versioned super-admin corrections with structured `AdminOperation` audit.
- Completed protected combat posts with local opaque media keys, authenticated Range streaming, idempotent likes, comments/rate limits, moderation, and recoverable media cleanup.
- Completed private tactic-room services with owner-only layer management, normalized geometry, fixed slot colors, owner-only route/marker mutations, optimistic revisions, and historical persistence.
- Typecheck PASS after Phases L-M-N.
- Added all match, OCR, screenshot, submit, dispute/correction, tactic, combat-post, authenticated video, like, and comment API routes plus typed feature client APIs.
- UI/UX Pro Max recommendations were applied selectively: preserved the repository's existing tokens/fonts while choosing progressive disclosure, 44px controls, visible labels, fixed six-slot status, responsive data tabs, and pointer-plus-keyboard tactic interactions.
- `src/web` legacy ACL blocks creating the required React feature components. Page route directories are writable, but putting full UI logic in `src/app` would violate the authoritative architecture, so UI implementation is paused pending explicit ACL authorization.
- Current validation: typecheck PASS; lint PASS with the same 18 existing warnings; architecture command was host-blocked by the known Node 26 `uv_os_get_passwd ENOMEM` issue.
- 2026-08-13: repaired the writable boundary for `src/web`; implemented the match archive entry/workspace, six fixed screenshot slots, OCR review, ten-player confirmation, final submission, disputes, audited corrections, protected combat feed/detail, and private SVG tactic board for desktop/mobile routes.
- 2026-08-13: added next-stage domain/media/range/tactic regression coverage, expanded MySQL integration coverage for archive constraints, likes, rooms and route ownership uniqueness, wired CI, and documented persistent media/OCR/Nginx/backup production operations.
- 2026-08-13: cleared both new tactic-board Hook warnings. Prisma validate, architecture, typecheck, core, Markdown, next-stage tests and diff check pass; lint is back to the 18 pre-existing warnings with zero errors.
- 2026-08-13: production build PASS. Recreated the official MySQL 8.4.10 Windows ZIP in the isolated temp directory via validated Range chunks (280672277 bytes, SHA-256 `3B950DB31C33FB59252568C012BD9EE5FAC50811E778CA7C8F1A0DC91686CD6F`). `Start-Process` hit the known host `Path`/`PATH` collision after data initialization; switching to the recorded `.NET ProcessStartInfo` path.
- 2026-08-13: all 8 migrations deployed to isolated MySQL 8.4.10; `migrate status` is current, schema diff is zero, and expanded database integration tests PASS.
- 2026-08-13: production Chrome regression PASS for login, archive creation, six signature-validated uploads, OCR fail-closed, ten-player confirmation/submission, admin original image, team-private tactics, protected Range video, like/comment, anonymous denial, cross-team denial, and 375px overflow checks. Console/page errors were empty.
- 2026-08-13: visually inspected desktop tactic and full mobile match screenshots; preserved existing visual tokens, 44px controls and responsive layout. Mobile internal links now retain the `/m` prefix.
- 2026-08-13: final architecture, typecheck, core, Markdown, next-stage, integration, lint, production build, Prisma status/diff, and diff checks PASS. Lint remains at 18 pre-existing warnings and zero errors.
- 2026-08-13: E2E fixtures verified at zero; stopped ports 8001/3307 and removed isolated MySQL plus temporary media directories. Real OCR vendor accuracy and production deployment remain explicit environment operations requiring endpoint/target credentials.


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
- Phase U 完成：弃用生成式峡谷图，使用用户原图的确定性 viewport 裁切，并把战术板改为 1500×870 横向画布。
- 新增统一比赛时钟、播放/拖动/关键时间跳转、时间图层自动跟随、图层时间编辑、兵线波次、Buff/普通野怪/暴君/主宰/风暴龙王推演表。
- 验证 PASS：typecheck、architecture、专项测试、lint（0 error/18 个既有 warning）、production build、Chrome 桌面与 375px 移动视觉回归；浏览器无 console error、移动端无页面横向溢出。
- Phase V-UX 完成：时间轴压缩为单行控制和六个状态摘要；完整资源表默认折叠；图层切换改为地图上方横向阶段条。
- 绘制主工具只保留路线、点位、文字、撤销、重做和保存；图层管理、精确坐标及删除操作移入“图层与精确编辑”。
- Chrome fixture 验收 PASS：桌面与 375px 手机无页面横向溢出，两个高级区域默认折叠，文字模式即时出现输入框，移动工具触控高度不低于 42px，无 console error。
