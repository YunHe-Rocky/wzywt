# Findings

## 2026-08-13 connection-chain audit

- Audit scope: browser/client fetch lifecycle, Next.js route adapters and auth, Prisma/MySQL lifecycle, Redis client/locks/cache invalidation, OCR outbound HTTP, media storage/streaming, cron/worker scheduling, and deploy health/rollback.
- Existing user changes and the unfinished Phase U map work are preserved; connection fixes must be isolated from unrelated UI/map edits.
- Previous local PASS results are historical evidence only. Current acceptance requires fresh checks against the present dirty worktree and explicit degraded-dependency/recovery coverage.
- High-risk SSE finding: every `/api/heroes/watch` browser connection owns its own delayed cycle and interval, so multiple tabs/components duplicate external monitor/scrape work. The abort handler clears only the interval, not the initial timeout; an aborted connection can still execute one cycle. There is no overlap guard or heartbeat.
- Client connection finding: `src/features/shared/client/api.ts` performs unbounded `fetch()` calls and cannot distinguish timeout, caller cancellation, offline/network failure, or invalid JSON. Direct page/hook fetches bypass even that thin adapter, creating stale-update and unhandled-rejection paths.
- Redis recovery finding: `ioredis.retryStrategy` stops reconnecting after three attempts. A Redis outage lasting beyond the first short retry window permanently degrades that process to caught command failures until restart, even after Redis recovers.
- Cron shutdown finding: scheduled callbacks are fire-and-forget and `stop()` immediately disconnects Prisma without awaiting in-flight monitor/sync/deadline work. PM2 reload can therefore interrupt active database/file/network operations and create noisy partial runs.
- OCR connection finding: the provider trusts `Content-Length` for its 5 MiB response limit, so a chunked/omitted-length response bypasses the cap; redirects are followed with the bearer token by default, and timeout/network/invalid-JSON failures escape as generic 500-class errors.
- Retry transport finding: `fetchWithRetry()` does not cancel/discard non-success response bodies before sleeping/retrying, which can prevent timely connection reuse under repeated 403/429/503 responses.
- Confirmed SSE protocol mismatch: the route emits `type: "check"` while the monitor page listens for `type: "monitor-check"`; check results never render.
- Confirmed monitor-button leak: `triggerCheck()` performs an ordinary `fetch()` against the never-ending SSE GET endpoint and does not consume or cancel the body. It opens another long-lived connection instead of running a bounded manual check.
- Confirmed manual-sync race: `POST /api/heroes` starts `syncHeroes()` outside `runExclusiveTask("hero-pipeline", ...)`, so repeated admin clicks and the cron monitor/daily sync can modify the same hero pipeline concurrently.
- Monitor correctness issue: upstream transport/schema errors are converted to `changed: false`, which is operationally indistinguishable from a healthy unchanged source. `checkHeroes()` also dereferences the first/last array element without validating a non-empty payload.
- Monitor amplification root cause: a single cycle could report `heroes`, `skins`, and `skills` changed, and `runMonitorAndScrape()` executed the same full hero sync plus image download once per module; the worker then downloaded images again. One cycle could therefore perform three full syncs and four image passes.
- Upload body-limit issue: screenshot/video/avatar routes checked only `Content-Length` before `formData()`, so HTTP/1.1 chunked uploads could bypass the application limit and be fully buffered. The shared limiter now counts actual streamed bytes before multipart parsing.
- Manual hero sync was tied to a fire-and-forget promise in the web process. It is now a persistent `KvCache` job consumed by the cron process under the same `hero-pipeline` lock, so a web reload no longer abandons the task and repeated clicks cannot start parallel pipelines.
- Fresh connection regression suite passes: browser timeout/cancel/network classification, streamed JSON/multipart limits, Redis retry continuity, OCR redirect policy, chunked response cap, invalid JSON, and connection failure mapping.
- Build-time Redis I/O was caused by eager client construction. The client is now lazy, globally reused, and starts only on the first command; a refused local connection fell back in 268 ms with one bounded retry.
- The retired Windows deploy script violated the release contract by stashing changes, running `db push`, and killing arbitrary Node processes. It now refuses execution and directs operators to the atomic Linux release workflow.
- Final production browser smoke passed against a dedicated port: `/monitor` rendered, SSE reached online state, and 12 concurrent readiness requests consistently failed closed with 503 while the isolated database was unavailable.
- Current local host has no isolated MySQL server. The present database migration/integration suite therefore remains delegated to the MySQL 8.4 CI service; no configured database was touched.

## 2026-08-12 next-stage baseline

- The source guide requires three domains: permanent match records, protected combat-post video, and team-private tactics.
- Reuse `Tournament`, `TournamentPlayer`, `TournamentAdmin`, `TournamentPick`, `Hero`, and `AdminOperation`; extend audit storage because the current operation row cannot represent before/after values and correction reasons.
- Owner/co-owner roles are stored in `TournamentAdmin.role`; live user/admin/banned checks are enforced by `requireAuth()` and `requireSuperAdmin()`.
- Tournament APIs are rooted at `src/app/api/tournaments/[id]`; business logic belongs in `src/features/*/server`, pure validation in `src/core`, storage infrastructure in `src/lib`, and React/client adapters in `src/web` and `src/features/*/client`.
- Existing upload handling is avatar-only and directly filesystem-backed. New media needs a reusable storage interface, signature/MIME validation, opaque keys, compensation deletion, and authenticated streaming.
- No OCR or video-processing dependency currently exists. The first release should model recognition as an untrusted, replaceable adapter and preserve human confirmation; it must not fabricate OCR values.
- CI already runs Prisma validation/migrations, architecture, typecheck, core/markdown/integration tests, lint, and build.
- `splitResult` version 2 carries `teamRed/teamBlue` user IDs and assigned roles, so it is the authoritative immutable membership snapshot source when a match draft is created.
- The tournament detail already centralizes post-split UI; new entry points can be added there while larger match/tactics interfaces live in dedicated business components and pages.
- Tactic coordinates must use versioned normalized `[0,1]` geometry; route ownership is the authenticated member ID, not merely team membership.
- Combat video must stream only through an authenticated Range-capable route; storage keys stay opaque and never appear as filesystem paths.
- Prisma validates the new relation graph with one `InternalMatch` per tournament, exactly one stat row per player, six screenshot types enforced by service plus `(matchId,type)` uniqueness, idempotent likes, and `(matchId,side)` tactic rooms.
- Existing architecture checks allow feature server modules to use `lib`, but forbid React/Web imports; storage therefore lives in `src/lib/storage`, while domain validation stays in `src/features/*/model.ts` or `src/core` when I/O-free.
- The OCR provider is deliberately fail-closed: without `MATCH_OCR_ENDPOINT` it returns 503, never fabricates scores or zero values. Its six-image response is normalized, cross-checked, persisted separately from official stats, and enriched only with non-binding member recommendations.
- Screenshot replacement is transactional at the database boundary; new-file DB failures are compensated immediately, while failed old-file deletions enter a persistent `KvCache` cleanup queue.


## 2026-08-12 基线

- 当前分支为 `main`，HEAD `84a3f5c`。
- 工作区已有 14 个用户侧文档/旧 planning 文件删除，另有未跟踪 `docs/wzywt_v2.1_codex_refactor.md`；本轮必须避开这些既有改动。
- 任务书共 47 节，要求按 Phase A-H 执行。
- `package.json` 尚无 `typecheck`、统一 `check`、CI 脚本；Playwright 当前在 `dependencies`。
- 项目已有 `src/core/team-balancing`、`features/tournaments/server/capacity.ts`、`MarkdownContent.tsx` 与架构检查脚本，可优先增量修复。
- 根目录存在 `.env` 和 `.env.gh_token`；只检查跟踪状态与 ignore 规则，不读取或输出 Secret 内容。
- `requireAuth()` 原先仅在 Session 缺少 role 时查询数据库，是封禁、降权与改密后旧 Session 不失效的根因。
- 固定管理员凭据出现在多个 Git 历史 commit 中；当前代码清理后仍必须人工轮换生产管理员密码和安全答案。
- Git 历史文件名未发现 `.env` 或数据库备份被跟踪；`.env` 与 `.env.gh_token` 当前均被 ignore。
- 旧分队算法用单一权重混合志愿和战力，并一次性 materialize 113,400 个分路方案；其 32 个红蓝方案还只按总战力差提前筛选。
- 新算法使用流式 DFS、10×5 指标预计算、严格字典序志愿比较、完整 BalanceScore、稳定 signature；未知实力采用本场已知实力中位数。
## 最终验证补充

- Next.js 15.5.23 的动态 route params 需 Promise，官方 codemod 修改 17 个动态 API route；移动端 re-export 保持原样。
- 安全公告通过 Next.js 15.5.23 + postcss 8.5.23 + sharp 0.35.3 + nanoid 3.3.18 + undici 7.29.0 清零，无需引入 Next.js 16 的全仓迁移风险。
- Git 历史仍包含旧固定管理员凭据文本，代码清理不能撤销已泄露凭据；生产环境必须轮换管理员密码与安全答案。
- `package.json` 的 0.1.0 与产品 CHANGELOG 版本体系不同，按任务书保留，避免制造第二套发布版本。
- 历史数据库曾依赖 `prisma db push`，现有 migration 无法从空库重建当前 schema；reconciliation migration 是 fresh install 与既有库 baseline 兼容的必要桥梁。
- production Secure Cookie 在 `http://127.0.0.1` 的 Chrome E2E 中不会随 API 请求发送；本地 E2E 改用可信来源 `http://localhost:8001`。
- 本机没有生产 SSH alias、目标参数或轮换值；线上 Secret、管理员凭据、Firewall 和 release 属于需要明确目标与凭据的外部操作。
- 新功能浏览器回归验证了 API envelope 和 React async event 生命周期不能只靠 typecheck 覆盖；E2E 已固定这两类回归。
- 生产模式缺少 `MEDIA_STORAGE_DIR` 会在首次媒体写入时 fail-fast；部署文档和 `.env.example` 已将其列为必填持久化目录。
- OCR endpoint 未配置时识别任务持久化失败状态并返回 503，不允许绕过识别直接正式提交；真实供应商识别准确率必须在提供 endpoint/token 后另行验收。
- 移动赛果的根本阅读问题是每名选手独立卡片导致同类数值无法纵向比较；语义表格按队伍分组并固定阵营列后，页面保持 375px 无溢出，完整宽度由局部表格滚动承载。
- 原始截图属于录入依据和争议追溯材料，不应占据赛果主视觉；赛果表前置，截图改为状态摘要加渐进披露，缺图时才自动展开。
- 用户明确提供了峡谷截图并要求用于绘制；停止使用被否定的生成式地图，改为项目内保存原图并通过 SVG viewport 确定性裁掉左侧及顶部 UI，不再重绘地形。
- 战术图层已有 `startTime/endTime`，统一比赛时钟直接复用该模型；兵线属于固定周期，龙与野怪必须从实际击杀时刻计算重生，因此本地推演记录按比赛和阵营隔离保存。
- 默认时间规则集中在 `src/features/tactics/timeline.ts`：兵线首波 0:10/33 秒一波、野区首刷 0:30、Buff 击杀后 90 秒、普通野怪 70 秒、双龙 2:00/击杀后 240 秒、19:30 离场、风暴龙王 20:00/击杀后 180 秒；版本变化只需校正一个规则表。
- 战术板易用性问题来自同时展开四套操作。新的默认路径仅保留“时间 → 阶段 → 绘制”，资源明细、击杀记录、图层管理、坐标输入和删除动作均使用渐进披露。
- 文字标记原来依赖页面底部输入框，用户容易找不到；文字模式现在就地显示输入框，填写后直接点击地图落点。
