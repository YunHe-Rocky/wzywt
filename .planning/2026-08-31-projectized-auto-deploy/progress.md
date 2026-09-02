# Progress

## 2026-08-31 final

- Implemented safe project env parsing, project/package/ref binding, bounded global command and systemd discovery, PM2 ownership checks, deployment lock, immutable remote-ref release, backup-before-migration, atomic activation, exact PM2/health verification, durable PM2 save, and verified rollback.
- Added configurable PM2 app names/port and documented the complete production `.env` contract, preflight and activation transaction.
- Added CI shell syntax and deployment regression gates.
- Full fake-host matrix PASS with native symlinks: env non-execution, parser/state checks, systemd alternatives, check-only preflight, repeat deployment, first deployment, PM2 activation rollback, health rollback, first-deploy cleanup, failed release cleanup, and foreign PM2 ownership rejection.
- `node --check` for both helpers PASS; ecosystem default and override assertions PASS; deploy CLI env whitelist PASS; real `.env` emitted zero deployment records and was not modified.
- `npm run check` PASS: architecture, typecheck, core, Markdown, next-stage, connections and resource scheduler.
- `npm run lint` PASS.
- `npm run build` PASS; existing `<img>` optimization warnings remain and no new error was introduced.
- `git diff --check` PASS; forbidden deploy pattern scan found no eval, env sourcing, production db push, fuser, or root scan.
- Real production deployment/activation was not executed because no Rocky Linux target, SSH context, production config values or maintenance authorization were supplied.

## 2026-09-01 identity-independent host deployment

- Bound every invocation to `pwd -P == script project root == configured DEPLOY_SOURCE_DIR`; removed the fixed `/opt/yanwutang` fallback and absolute-script-from-arbitrary-cwd behavior.
- Decoupled deployment identity from `package.json` name. PM2 names and database backup prefixes now derive from the configured project name, while user, group, PM2 home, host and production port are explicit project configuration.
- Added command path/version inspection and a versioned host manifest for custom commands plus systemd LoadState/ActiveState/SubState/MainPID/User/FragmentPath, PID file, lock file and TCP endpoint checks.
- Host inspection is read-only. Legacy auto-start/global-command settings now fail with migration guidance; full deployment persists a non-secret host snapshot before release mutation, including failure evidence.
- PM2 acceptance now requires positive live PIDs, matching PM2 PID files and Linux OS-user ownership. Safe stop verifies project ownership first and confirms stopped/PID=0; broad port killing was removed.
- Database backup filenames and retention are project-scoped. The legacy SSL installer/auto-Nginx stop-start entrypoint was retired, and the Nginx file became a project/host/port template.
- Native-symlink fake-host matrix PASS: renamed package/project, wrong cwd rejection, real TCP listener, version mismatch snapshot, systemd user/PID/PID-file/lock/port failures, first/repeat activation, PM2/health rollback, foreign ownership, and exact safe stop.
- Shell/Node/JSON syntax PASS; formal cross-platform `npm run test:deploy` PASS; `npm run check` PASS; ESLint PASS with 0 errors and 17 existing `<img>` warnings; production build PASS; `git diff --check`, untracked-whitespace and forbidden-mutation scans PASS.
- No real Rocky Linux deployment, global service maintenance, migration, PM2 switch, Nginx reload or external business-flow acceptance was executed because no target/session/maintenance authorization was supplied.

## 2026-09-01 Rocky Linux CRLF incident

- Reproduced the production `pipefail` failure from the local artifact bytes: `deploy.sh` has 582 CRLF pairs and no LF-only newlines; three other deployment Shell scripts are also CRLF.
- Confirmed `.gitattributes` is absent and Git has no text/eol rule for `scripts/deploy.sh`; tracked blobs are LF while the Windows worktree is CRLF.
- No production migration, PM2 activation or service mutation has been authorized or performed after the parser failure.

- Added `.gitattributes` rules for `*.sh` and `*.bash` with `eol=lf`, then byte-normalized the six current deployment Shell scripts without changing their UTF-8 content.
- Added `scripts/check-shell-line-endings.mjs`; `check:shell-eol`, `test:deploy`, the aggregate `check` command and Linux CI now fail on any CR byte before deployment tests.
- Added documented, bounded `/opt/wzywt` recovery: backup only top-level Shell scripts, normalize them, reject residual CR, run `bash -n`, and keep source `/opt/wzywt` separate from runtime `/opt/wzywt-runtime`.
- Initial validation PASS: helper syntax, `npm run check:shell-eol`, Git `text eol=lf` attributes, tracked worktree EOL state, and `bash -n scripts/*.sh`.

- Full `npm run test:deploy` PASS after the LF gate, including renamed projects, command version checks, systemd PID/user/lock/port evidence, activation, rollback and PM2 ownership.
- Aggregate `npm run check` PASS, including the new LF gate, architecture, typecheck, core, Markdown, next-stage, connections and resource scheduling.
- ESLint PASS with 0 errors and 17 existing `<img>` warnings; production `next build` PASS.
- Final audit PASS: every current deployment Shell file has CR=0; `git diff --check` passed; new files have no trailing whitespace; package and CI wiring match; actual `.env` remains unmodified and untracked Secret content was not inspected or printed.
- Git emitted a non-fatal pre-existing warning that `docs/spec.md` may be converted to CRLF on a future checkout; it is outside the Shell deployment-entrypoint scope and did not fail `git diff --check`.
- No real production backup, migration, PM2 switch, systemd mutation or Nginx reload was performed in this local repair.

- Verified all 33 currently tracked `scripts` files use Git mode 100644. Corrected the server recovery text to restore top-level script files to 0644 because deployment is invoked through Bash; LF gate and `git diff --check` remained PASS.


## 2026-09-01 ordinary-env deployment simplification

- User rejected the deployment-parameter-heavy interface because project `.env` is an ordinary application environment. Reframed the primary UX as `cd <project> && bash scripts/deploy.sh`, with advanced `DEPLOY_*` values optional.
- Initial audit confirmed project name, user/group, PM2 home and PM2 names are already derivable; base-directory and port handling plus examples/documentation are the main remaining sources of unnecessary operator input.

- Defined deterministic zero-config defaults for runtime base, standard PORT/HOST, package-derived identity, current user/group, PM2 home/names and Git upstream. Identified `stop.sh` and ecosystem config as required consumers of the same defaults.


- Implemented ordinary PORT/HOST parsing, sibling runtime-base inference, Git upstream inference, built-in Node/PM2 version ranges, optional systemctl discovery and automatic DATABASE_URL/REDIS_URL endpoint checks with redacted snapshots.
- Updated ecosystem and stop defaults and added an ordinary-env, non-`source` test scenario; initial matrix exposed and fixed a Windows explicit-path normalization mismatch and a generated test-marker typo.

- Full fake-host matrix PASS with an ordinary `.env` containing no `DEPLOY_*`: non-`source` root inferred `<source>-runtime`, package identity, current user/group, PM2 home/names, PORT/HOST and origin/main upstream; database endpoint and standard systemd MainPID were discovered automatically.
- Existing explicit override, renamed project, version rejection, PID/lock, activation, rollback, first release and PM2 ownership coverage remained PASS.

- Replaced the deployment-heavy `.env.example` with ordinary HOST/PORT/database/session/Redis/storage/OCR settings only; advanced overrides remain supported but are absent from the normal template.
- Rewrote `docs/deploy.md` to lead with `cd <project>`, `bash scripts/deploy.sh --check`, and `bash scripts/deploy.sh`; documented automatic facts, safety transaction, optional advanced overrides, stop and CRLF recovery in plain language.
- Updated CI syntax coverage and the technical spec to use ordinary PORT and automatic runtime/systemd discovery.

- Final formal matrix PASS: ordinary `.env` auto-discovery, pwd/source identity, renamed projects, command versions, runtime/systemd evidence, activation, rollback and PM2 ownership.
- Aggregate `npm run check` PASS; ESLint PASS with 0 errors and 17 existing `<img>` warnings; production `npm run build` PASS.
- Final audit PASS: `git diff --check`, new-file trailing whitespace, all Shell CR-byte counts, ordinary `.env.example`, secret-safe runtime inspection and forbidden runtime mutation patterns.
- The actual `.env` remained unmodified. No real production deployment, service start/restart/enable, migration, PM2 activation or Nginx reload was performed.
- Unrelated pre-existing image and legacy config deletions remain untouched in the dirty worktree.

## 2026-09-01 production dirty-tree follow-up

- Production evidence reached the clean-source gate and stopped before backup, migration or PM2 activation.
- The operator had recursively granted execute permission to `scripts`; a root-level deployment ZIP may also be untracked. Exact classification and safer diagnostics are being implemented.
- Real credentials were pasted into the conversation; they are treated as exposed and will not be repeated or persisted.

- Added bounded dirty-source diagnostics that print status entries, classify untracked paths and tracked script mode changes, and provide non-mutating recovery/review commands.
- Both preflight and deployment-lock rechecks now use the same fail-closed diagnostic function.
- Added a root-only ZIP ignore for transport archives plus a simulated chmod-and-ZIP regression scenario; validation is in progress.
- Dirty-source regression PASS: exact modified/untracked entries, script mode-change classification, bounded permission recovery hint, no automatic cleanup, and stop-before-backup were all asserted.

- Dirty-tree follow-up final validation PASS: deployment matrix, aggregate project check, Bash syntax, lint with 0 errors and 17 existing warnings, production build, diff check, ZIP ignore, env preservation, LF bytes and no automatic Git cleanup.
- No production backup, migration, PM2 activation, service mutation or credential rotation was executed. Exposed production credentials require operator-side rotation.
- Unrelated existing image and legacy-config deletions remain untouched.

## 2026-09-01 PM2 banner and MySQL TCP follow-up

- Production preflight exposed one false-negative PM2 version parse and one real MySQL TCP refusal; no backup, migration, PM2 activation or service mutation occurred.

- Implemented per-line command version matching with a persisted matched `versionLine`, bounded full output and first-line failure fallback.
- Updated the success deployment fixture to emit a PM2 banner before a valid 6.7.1 version; validation is in progress.

- PM2 banner deployment regression PASS: a valid 6.7.1 line after banner text was logged/persisted, while 5.0.0 still failed before backup.
- Node/Bash syntax and targeted diff checks passed.
- PM2 banner 修复全量验证 PASS：`npm run test:deploy`、`npm run check`、lint（0 error，17 条既有 `<img>` warning）和 production build 均通过。
- 最终审计 PASS：`git diff --check`、Node 语法、先前 Bash 语法、全部 `scripts/*.sh` LF、`.env` 未修改、运行脚本无自动 systemd 启停；部署文档新增 MySQL TCP 只读诊断。
- 生产 MySQL `127.0.0.1:3306` 的 `ECONNREFUSED` 仍是有效阻塞。未在生产机执行备份、migration、PM2 激活、服务变更或凭据轮换；既有无关删除保持未动。
## 2026-09-01 Node 26 CommonJS/ESM backup follow-up

- 生产构建完成后在 `create database backup` 入口停止：Node 26 拒绝从 CommonJS `@next/env` 使用 `loadEnvConfig` 命名导入。
- 失败发生在备份脚本加载期；数据库备份、migration、current 原子切换和 `wangzhe-yanwutang-web`/`wangzhe-yanwutang-cron` 激活均未完成。
- Replaced named `@next/env` imports in backup, hero sync and Cron env loading with CommonJS-compatible default import/destructuring.
- Added a real installed-module interoperability gate before the fake-host deployment matrix; Node syntax and TypeScript checks PASS.
- Full `npm run test:deploy` PASS, retaining ordinary env, renamed project, command/service evidence, two-process activation, rollback and PM2 ownership coverage.
- Aggregate `npm run check` PASS across Shell EOL, architecture, typecheck, core, Markdown, next-stage, connections and resources.
- ESLint PASS with 0 errors and 17 existing `<img>` warnings; production `npm run build` PASS on Next.js 15.5.23.
- Final Node 26 audit PASS: no production named import from CommonJS `@next/env`, Node syntax PASS, `.env` unchanged, all Shell files remain LF, and `git diff --check` PASS.
- Production retry requires syncing the five changed/new runtime-test files into a clean source tree, then rerunning `bash scripts/deploy.sh --check` and the full deploy; the previous failed release never reached backup, migration or PM2 activation.

## 2026-09-01 activation failure observability follow-up

- Confirmed the repeated 503 incident was obscured by `curl --fail`, suppressed health-verifier output and automatic deletion of the failed first release.
- Added structured health attempt output, bounded project-only PM2 web/Cron log capture, durable health/PM2 diagnostics, and activation-stage failed-release preservation while retaining safe PM2 cleanup or previous-release rollback.
- Deployment regression matrix PASS: Node 26 native env loading, real TSX Cron env loading, 503 `cron=failed` evidence, fixture Cron bootstrap log, diagnostic persistence, failed release retention, first-release cleanup and old-release rollback.
- Phase 28 full project validation is in progress.- Phase 28 final validation PASS: full deploy matrix, aggregate project check, ESLint (0 errors / 17 existing image warnings), production Next.js build, Node syntax, Bash syntax, Shell LF gate and `git diff --check`.
- Updated deployment documentation with automatic 503/PM2 diagnostic paths, failed-release preservation, first-release cleanup and previous-release rollback semantics.
- Final audit shows only the seven intended deployment/planning/documentation files modified; `.env`, credentials and unrelated source files were not changed.
- One final audit command initially used `bashPath=` instead of PowerShell `$bashPath=`; it made no workspace write beyond the already-applied docs update, and the corrected Node/Bash/diff audit passed.
## 2026-09-01 HTTP LAN authentication and catalog follow-up

- Host-side TCP, curl and real Chrome acceptance proved the deployed page is reachable and rendered; diagnosis moved from network/PM2 to authentication and data activation.
- Confirmed production Secure Cookie over plain HTTP blocks session persistence, live heroes are populated, live equipment is empty, and equipment has no initial Cron bootstrap.
- Phases 29-31 started to add an explicit secure-cookie override, empty-only equipment bootstrap and regression coverage while preserving secure production defaults.- Implemented secure-by-default session cookie resolution with an explicit `SESSION_COOKIE_SECURE=0` escape hatch for trusted HTTP-only LAN deployments; invalid values fail closed.
- Added empty-only equipment bootstrap ten seconds after Cron startup, protected by the existing distributed/database task lock; non-empty databases log a skip instead of resyncing on every restart.
- Added pure configuration/bootstrap policy tests and documented the HTTP-versus-HTTPS boundary in `.env.example` and `docs/deploy.md`.
- Initial typecheck found the project `ProcessEnv` declaration made a `Pick` field required; replaced it with an explicit optional interface. A generated documentation transform interpreted PowerShell backtick-zero as NUL; removed the byte, restored UTF-8 text, and `git diff --check` passed.
- Targeted architecture, typecheck and connection tests PASS; Phase 31 full validation is in progress.- Phase 31 final validation PASS: aggregate check, full deployment matrix, architecture, typecheck, connection/resource/business tests, ESLint with zero errors, production Next.js build and diff checks.
- Live production evidence remains read-only: `/api/heroes` is populated, `/api/equipment` is empty, and protected resource access is anonymous until the new cookie configuration is deployed. No user account, password, production row or credential was read or mutated.
- Server rollout requires adding `SESSION_COOKIE_SECURE=0` to the HTTP-only trusted-LAN `.env`, syncing this code through Git, and rerunning the normal deployment. Cron will bootstrap equipment only when its table is empty.