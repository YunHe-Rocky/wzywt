# Findings

## Root causes fixed

- Documented clone path and source default disagreed, so a documented first deployment could not find `.git`.
- Shared `.env` was linked but deployment identity, paths and services were hardcoded rather than project-configured.
- PM2 activation errors happened after `current` switched but before the old release rollback path.
- HTTP status alone did not independently prove health belonged to the new `APP_RELEASE_ID`.
- PATH-only PM2/mysqldump lookup and fixed PM2 names/port did not support projectized/global installations safely.

## Final invariants

- Only whitelisted deploy/path keys are parsed; duplicate and multiline deployment keys fail. Unknown Secret lines are neither emitted nor evaluated.
- Process environment overrides env file values; CLI chooses env file; project/package identity must match.
- Source is clean, branch/ref and configured remote are validated, and fetch writes the exact remote-tracking ref used by archive.
- Runtime media paths stay below shared; `current` stays a symlink into releases; concurrent deployments are locked.
- Required commands and systemd alternatives are parsed into arrays without glob expansion and discovered only through explicit bounded candidates.
- Existing same-name PM2 processes must resolve to current; unexpected PM2 apps below the project base fail preflight.
- New PM2 apps must be online on the exact release with the exact release id. Health must return `ok=true`, the exact release id and no failed checks.
- Activation, state, health and save failures restore and revalidate the old release. First-deploy failure removes only the proven-unowned configured project apps/link.
- Automatic deployment never calls the legacy broad port-killing stop script.

## Evidence boundary

- Local native-symlink fake-host matrix validates control flow and rollback without touching real services.
- Production service identity, credentials, data backup, migration, external HTTPS and post-deploy business flows remain server-run acceptance steps.

## Identity-independent follow-up findings

- `package.json` name is build metadata, not a safe host ownership boundary. The physical source root plus explicit deployment identity is authoritative.
- A configurable port is not enough if ecosystem, health URL, Nginx, stop scripts, backup prefixes and PM2 names keep independent defaults. One project env must own the full mapping.
- `systemctl is-active` alone is insufficient. A useful service proof combines exact loaded unit, active/substate, MainPID, service user, live `/proc`, optional service-native PID/lock files and an actual endpoint connection.
- Application deployment must never repair a missing/wrong global service by installing or starting it. Version mismatch should preserve evidence and fail before application/data mutation.
- Application rollback and service/data restore are different transactions. Old release rollback is automatic; database restore after migration and global service restoration are deliberately manual because concurrent writes and other projects make generic automatic restore unsafe.
- PM2 `online` is only a label. PID, PM2 PID file, cwd, release id and OS uid are independently required after activation.
- Changing Linux users requires an operator handoff: stop the old user's exact PM2 apps, migrate ownership, set the new PM2 home, then preflight as the new user. The deployer must not guess with `sudo -u` or kill the old user's processes.
- TLS/Nginx installation is global host maintenance. Rendering a template, backing up the existing site/certs, `nginx -t`, and explicit reload belong outside the app release transaction.

## Rocky Linux CRLF incident findings

- The server error `set: pipefail` with a leading carriage-return symptom is explained by `scripts/deploy.sh` containing 582 CRLF pairs and zero lone LF bytes; the first bytes include `bash 0D 0A set -Eeuo pipefail 0D 0A`.
- `scripts/test-deploy.sh`, `scripts/memory-cleanup.sh`, and `scripts/mysql-backup.sh` are also CRLF in the current Windows worktree. `setup-ssl.sh` and `stop.sh` are LF.
- The repository has no `.gitattributes`; `git check-attr` reports unspecified text/eol and `git ls-files --eol` confirms index LF but Windows working-tree CRLF.
- A parser-level CRLF failure happens before deployment can take its own host snapshot or backup. Prevention must therefore be enforced by repository line-ending policy plus a pre-deploy byte check, while an already copied production tree needs an explicit one-time normalization.

- `/opt/wzywt` is a valid physical source root because `pwd -P` and the script-derived root agree. It must use a distinct release base such as `/opt/wzywt-runtime`; configuring both roots as `/opt/wzywt` correctly fails closed.
- `chmod a+x -R scripts` is unrelated to the parser failure and is too broad. All 33 currently tracked top-level `scripts` files use Git mode 0644, including Shell entrypoints invoked as `bash scripts/deploy.sh`; restore those files to 0644 instead of recursively granting execute permission.


## Ordinary-env one-command deployment findings

- The previous example made ordinary application `.env` repeat facts already discoverable from `pwd`, `package.json`, `id`, `HOME`, `command -v` and Git. This is an operator override surface, not an acceptable default user interface.
- Current code already derives project name, current user/group, PM2 home and PM2 names when overrides are absent. The unnecessary hard blockers are mainly a non-`source` directory requiring `DEPLOY_BASE_DIR` and the port requiring `DEPLOY_WEB_PORT` instead of normal `PORT` plus a safe default.
- Host manifests and exact binary/version overrides remain useful for regulated or unusual hosts, but they should be optional advanced controls rather than fields copied into every project's ordinary `.env`.
- Safe automation should infer one deterministic value and proceed; it should stop only when discovered facts conflict, ownership is foreign, source is dirty, a dependency is missing/incompatible, backup fails, migration fails or activation health cannot be proven.

- Deterministic defaults are available: non-`source` roots use the sibling `<source>-runtime`; this maps `/opt/wzywt` to `/opt/wzywt-runtime` without colliding with the Git tree. A root named `source` keeps the established parent-base layout.
- Normal `PORT` should control ecosystem args, exported process state and health; the project fallback is 8001. `HOST` may override the safe loopback default without using Linux's ambient `HOSTNAME` variable.
- Git remote and branch can be derived from the current branch's upstream, then the current branch, and only finally `origin/main`. An explicit advanced override remains available for detached or unusual release workflows.
- `stop.sh` must share the same base/name/user inference as deploy; otherwise one-command deploy followed by stop would regress into requiring deployment-only env fields.
- The test harness currently supplies every advanced value. It needs an additional ordinary-env case with only application env plus fake binary overrides, while retaining explicit override cases for ambiguity and failure coverage.

## Production dirty-tree incident findings

- Both clean-source gates currently collapse every Git status into the generic error `production source tree is dirty; resolve it manually`; the operator cannot see paths, status classes or safe next steps.
- The server operator ran recursive execute permission changes immediately before the failure. All tracked top-level scripts are intended to remain mode 0644 and Shell entrypoints are invoked through Bash.
- A deployment ZIP is also present inside the production project root and may independently appear as an untracked path unless ignored; exact server status was not supplied, so the code must classify rather than assume.
- `.env` is an ignored runtime input and its contents must never be included in dirty-tree diagnostics. Pasted database, Redis and Session credentials are treated as exposed and must not be copied into repository records.

- Git index evidence confirms every currently tracked top-level script uses mode 100644.
- `.gitignore` already excludes `.env`, `node_modules`, build output and TypeScript artifacts, but it does not exclude a root-level deployment ZIP.
- Safe UX is diagnostic rather than mutating: list bounded porcelain status, classify untracked paths and script mode changes, provide review/recovery hints, then fail closed.
- Root-only `/*.zip` is a narrow intentional ignore for transport archives; arbitrary nested ZIPs remain visible to the clean-source gate.
- The lock-time recheck must use the same diagnostic function so a race is explained without weakening the transaction.

- Final dirty-tree implementation evidence: both checks call one bounded classifier, the fake-host regression proves stop-before-backup, and the root ZIP ignore is matched by Git.
- The operator recovery for the observed server state is to restore top-level script files to 0644, inspect `git status --short`, and proceed only when no real content changes remain.

## PM2 banner and MySQL TCP incident findings

- Production PM2 execution succeeded but reported `-------------` as the captured version line; the actual numeric version is emitted later after PM2 banner text.
- Database inspection reached `127.0.0.1:3306` from DATABASE_URL and received ECONNREFUSED. A successful `mysql -u ... -p` invocation without `-h` uses the local Unix Socket by default and does not contradict the failed TCP probe.
- The runtime inspector correctly refused deployment. The safe next step is read-only listener/config/unit discovery, not automatic systemctl mutation or weakening the endpoint check.

- Inspector root cause: `versionOutput` contains bounded combined stdout/stderr, but an anchored pattern is tested once against the whole block and the console always prints its first line.
- Safe correction: normalize non-empty output lines, match the unchanged regex against each line, persist the matched `versionLine`, retain the bounded full output, and use the first line only as no-match diagnostic fallback.
- Regression must cover a PM2 banner followed by a valid 6.x line and retain the existing 5.x rejection before backup.
- Final evidence: valid PM2 output may contain leading banners, but the matched numeric version line is now used for acceptance, logging and host snapshots; invalid 5.x output remains rejected.
- The server's remaining failure is not a deployment-parser defect: application connectivity requires TCP at the exact DATABASE_URL endpoint. Socket-only MySQL access is insufficient, and service configuration/restart remains an explicit operator maintenance action.
## Node 26 CommonJS/ESM backup incident findings

- Production Node 26.8.1 reports that `@next/env` is CommonJS and does not expose `loadEnvConfig` as a reliable ESM named export; the current backup entry therefore fails before executing backup logic.
- The deployment transaction still failed closed at the correct boundary: no successful backup means no migration, release switch, PM2 activation or health acceptance.
- Global audit found the same named import in exactly three production paths: `scripts/db-backup.mjs`, `scripts/sync-heroes.ts`, and `src/features/cron/load-env.ts`; `.planning` contains one non-production historical fixture.
- `scripts/deploy-env.mjs` uses its own bounded parser and does not import `@next/env`, so deployment metadata parsing is outside this failure.
- The fake deployment archive replaces `db-backup.mjs`, so the existing deployment matrix cannot detect real `@next/env` interoperability without an additional installed-module regression.
- Final correction is intentionally broader than the observed backup crash: backup, Cron and hero sync now share the same CommonJS-safe import form, while a direct installed-module gate prevents the fake deployment archive from hiding future Node interoperability regressions.

## Activation failure observability findings

- Existing health polling used `curl --fail` and suppressed the release verifier, so 503 responses produced repeated generic curl errors while the useful JSON body and failed check names were hidden.
- The EXIT trap deleted every non-current failed release. On a first deployment, rollback removes `current`, so the only built artifact was immediately deleted and later release-local Prisma/log inspection necessarily resolved to an empty path.
- Safe diagnostics do not require dumping `pm2 jlist`, which may contain environment secrets. Bounded `pm2 logs <project-app> --nostream --lines 40` calls scope output to the two derived project process names.
- Activation failure is a distinct boundary from build/backup/migration failure: preserve only after entering atomic activation, while pre-activation failures continue to clean incomplete releases.
- The deployment matrix now proves structured 503 output (`cron=failed`), bounded Cron log capture, durable diagnostic files, failed release retention, first-release PM2 cleanup, and previous-release rollback.
## HTTP LAN authentication and empty catalog findings

- Live host-side curl and Chrome proved `192.168.33.133:8001` is reachable and `/tournaments` renders. The browser remained anonymous and the protected resource endpoint returned 401.
- `src/lib/session.ts` hard-codes `secure: NODE_ENV === production`; browsers do not persist Secure cookies over plain `http://192.168...`, so a valid credential response cannot establish the next authenticated request on this deployment shape.
- Live `/api/heroes` returns about 58 KB of hero records, so the hero database is populated. `/api/equipment` returns `[]`, while the page resource scheduler requires authentication; these are separate failures.
- Cron schedules equipment sync only at 06:30 daily and has no empty-database bootstrap, so a first deployment after that time remains empty until the next day or a manual sync.