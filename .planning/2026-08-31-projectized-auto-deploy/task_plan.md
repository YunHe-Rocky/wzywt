# 项目化自动部署与激活计划

## Goal

优化 `scripts/deploy.sh`：在不猜测生产凭据、不修改真实 `.env`、不使用 `prisma db push` 的前提下，能够按项目配置发现并校验所需全局服务，使用项目 `.env` 完成 release 构建、migration、PM2 激活、健康检查与失败回滚。

## Scope and constraints

- 将“全局搜索服务”落实为有界的命令发现、PM2 项目进程所有权检查，以及 `.env` 显式列出的 systemd 服务候选发现；禁止 `find /` 或模糊启动所有匹配服务。
- 生产只允许 `prisma migrate deploy`，备份成功后才迁移。
- dirty production tree 必须拒绝，禁止自动 stash。
- `.env` 只解析白名单部署配置与少量非敏感运行路径，不回显、复制到 Git 或生成真实 Secret。
- PM2 切换与 `/api/health` 必须保持 release-aware、可回滚。
- 保留用户已有工作区改动，不清理或覆盖无关文件。

## Phases

- [completed] Phase 1：盘点当前脚本、部署文档、env 约定、PM2 配置和工作区状态
- [completed] Phase 2：定义项目化 env 契约、全局服务发现与 fail-closed 激活流程
- [completed] Phase 3：实现脚本、示例配置、文档及可离线回归检查
- [completed] Phase 4：运行 shell/架构/typecheck/相关测试与差异审计，记录未执行的生产边界

## Final acceptance

- [completed] 脚本从自身源码根和项目 env 定位 source/base/shared/current/releases，不再使用错误的 `/opt/yanwutang` source 默认值。
- [completed] `.env` 只经白名单 parser 读取部署键；真实本机 `.env` 向 parser 输出 0 个部署记录，且文件零差异。
- [completed] PM2、mysqldump、required commands 和明确 systemd alternatives 有界发现；无 `find /`、`eval` 或 `source .env`。
- [completed] clean source、remote identity/ref、project package identity、media/shared 路径、PM2 cwd 所有权和并发 flock fail closed。
- [completed] backup → `prisma migrate deploy` → atomic current → PM2 online/cwd/release id → exact health release → `pm2 save` 顺序固定。
- [completed] 首次和重复部署、PM2/health 失败、旧 release 恢复、失败 release 清理、外部 PM2 拒绝均由 native-symlink fake-host matrix 实际 PASS。
- [completed] env 示例、ecosystem、CI、deploy 文档与 spec 一致。
- [completed] architecture/typecheck/core/Markdown/next-stage/connections/resources/lint/build 和 diff checks 通过。

## Production boundary

- 未提供 Rocky Linux/SSH 目标、生产 Secret 或授权运行窗口，因此未在真实服务器执行 systemctl、PM2、mysqldump、migration、Nginx reload、域名流量或正式激活。
- 本轮“激活 PASS”是隔离 fake-host 的控制流与回滚证明，不冒充生产上线证据。

## Errors encountered

| Error | Attempt | Resolution |
|---|---:|---|
| Managed PowerShell/helper failed while reading or patching the Chinese workspace | multiple | Used approved reads and full apply-patch-created artifacts or checked exact replacements copied only to validated targets |
| Existing root planning files and another active plan belong to prior/current unrelated work | 1 | Created this isolated plan directory and did not change `.planning/.active_plan` |
| Git Bash was not in the standard C drive path | 1 | Bounded discovery found `D:\Git\bin\bash.exe` |
| Test fixture expanded `name` inside the same `local` declaration under `set -u` | 1 | Split declaration and assignments |
| Windows Git Bash lacked `flock` | 1 | Added fake flock only inside the isolated harness; production still requires real util-linux flock |
| Default Git Bash symlink mode did not expose Unix symlink semantics | 1 | Probed and used `MSYS=winsymlinks:nativestrict`; full matrix then executed |
| MSYS converted Node argv paths but not fake PM2 JSON paths | 3 | Normalized test-only JSON paths with `cygpath -m`; production verifier remained strict |
| Two tool wrappers lost the nested exec session id after a 30-second yield | 2 | Re-ran only after checking no Bash remained, then retained and polled session `96075` to final PASS |

## Follow-up: identity-independent host deployment

- [completed] Phase 5：盘点项目名、服务名、运行用户、端口、二进制与 systemd/PID/lock 的硬编码和信任边界
- [completed] Phase 6：实现 `pwd -P` 与脚本真实目录一致性、动态项目身份和显式用户/端口契约
- [completed] Phase 7：实现命令路径/版本、systemd MainPID/User/SubState、PID/lock/端口的只读验证与宿主状态快照
- [completed] Phase 8：移除自动安装/启动全局服务，补齐应用备份/回滚边界、文档和离线回归矩阵
- [completed] Phase 9：运行完整验证并审计残余硬编码、兼容性和生产边界

### Follow-up acceptance

- 项目更名不要求源码目录、`package.json` name、PM2 app 名或备份前缀包含 `yanwutang`；显式配置优先，安全默认值从当前项目元数据派生。
- 部署必须从脚本所属项目根执行；`pwd -P`、脚本真实目录和可选 `DEPLOY_SOURCE_DIR` 三者不一致即拒绝。
- 运行用户、运行组、监听 host/port、PM2 home、服务 unit/PID/lock/port 均可配置并在切换前验证。
- 命令只通过显式路径或 `command -v` 有界解析，记录路径与版本；版本不满足时保存宿主快照并拒绝，不自动安装或覆盖。
- systemd 仅用于只读确认 LoadState/ActiveState/SubState/MainPID/User；部署脚本不得调用 start/enable/install。
- 应用部署仍执行数据库备份、旧 release 保留和失败回滚；数据库迁移后不自动恢复备份，全局服务升级也不混入应用发布事务。

### Follow-up errors

| Error | Attempt | Resolution |
|---|---:|---|
| `apply_patch` could not read the task plan under the managed Chinese-path ACL | 1 | Created the exact append artifact with `apply_patch`, then copied it only to the validated task-plan target |
| Git Bash emitted a numeric GID while `id -gn` returned failure | 2 | Switched to exit-status-based fallback so a failed group-name lookup is replaced, not concatenated, with `id -g` |
| Windows Node could not directly execute extensionless Git Bash shebang fixtures or implicit `.exe` paths | 1 | Added Windows-only executable-extension resolution and parameterized Bash shebang handling; Linux production execution is unchanged |
| `git apply` repeatedly rejected two documentation/test hunks because their mixed working-tree line endings or untracked context did not match | multiple | Used apply-patch-created exact transforms requiring one match per target and copied only validated outputs |
| The first exact test transform matched both the early SKIP and final PASS text | 1 | Tightened the marker to the complete final PASS line before writing; the failed transform made no target write |
| `npm test:deploy` initially invoked bare `bash`, which cmd.exe could not resolve on this Windows host | 1 | Added a Node launcher that uses explicit BASH_BIN or derives Git Bash from `where git`; the formal npm entry then passed the full matrix |
| Final PowerShell audit used `$f:` inside an interpolated string | 1 | Re-ran with `${f}:`; the failed parser command made no workspace change and the corrected audit passed |

## Follow-up: Rocky Linux CRLF deployment incident

- [completed] Phase 10：复现并审计服务器 `set: pipefail` 失败对应的脚本字节与 Git 行尾属性
- [completed] Phase 11：强制 Shell 脚本使用 LF，增加仓库级字节门禁并补充现场恢复说明
- [completed] Phase 12：运行 Shell 语法、部署矩阵、项目检查和差异审计，给出 `/opt/wzywt` 下一步安全配置
- [completed] Phase 13：核对并修正服务器递归 chmod 后的精确权限恢复说明

### CRLF incident acceptance

- 所有 `scripts/*.sh` 工作树文件都不含 `0x0D`，并由 `.gitattributes` 固定为 `eol=lf`。
- 自动检查在任何 Shell 脚本重新出现 CRLF/CR 时失败，不能只依赖开发机 Bash 是否容忍。
- 现场恢复先备份原脚本，再有界规范化 `scripts/*.sh`，随后运行字节检查和 `bash -n`，迁移与 PM2 切换仍不得提前发生。

### CRLF incident errors

| Error | Attempt | Resolution |
|---|---:|---|
| `session-catchup.py` was invoked through a stale Python 3.13 path | 1 | Located the current `D:\DevTools\Python314\python.exe` and reran the read-only catchup successfully |
| `apply_patch` could not update the three planning files through the managed Chinese-path ACL | 1 | Created exact append artifacts under the approved ASCII root, then validated and appended only to those three files |
| First generated repository integration patch had incorrect hunk line counts and `git apply --check` rejected it as corrupt | 1 | Counted each hunk, generated a corrected v2 patch with `apply_patch`, revalidated it, then applied it cleanly |
| First untracked whitespace audit treated a Git line-ending warning as a whitespace defect | 1 | Made `.gitattributes` itself LF-stable and reran a content-based untracked whitespace audit; all checks passed |
| First one-line permission documentation patch declared seven hunk lines while containing six | 1 | Regenerated a v2 patch with the exact six-line hunk, checked it, and applied it cleanly |
| First Phase 13 record-sync command used an invalid nested PowerShell foreach expression | 1 | Replaced it with a named exact-update function and completed the same bounded writes successfully |


## Follow-up: ordinary-env one-command deployment

- [completed] Phase 14：将用户反馈落实为零配置优先契约，盘点可从 pwd、package、普通 env、Git 和当前用户推导的值
- [completed] Phase 15：实现目录、端口、项目/PM2 身份、用户与 Git ref 的安全自动推导，保留高级覆盖但不要求填写
- [completed] Phase 16：把 `.env.example` 和部署文档恢复为普通应用环境，并补齐一条命令与自动发现回归矩阵
- [completed] Phase 17：运行部署矩阵、架构/类型/业务测试、lint、build 和差异审计

## Follow-up: production dirty-tree diagnostics

- [completed] Phase 18：定位生产 dirty tree 的精确来源，区分 chmod 模式变化、未跟踪归档和内容修改
- [completed] Phase 19：让预检输出可执行的分类诊断和安全恢复命令，但保持禁止自动 stash/reset
- [completed] Phase 20：补部署回归、Shell/项目检查、lint、build 和差异审计

### Dirty-tree acceptance

- dirty 失败必须列出精确路径和状态，而不是只报一句 source tree is dirty。
- 纯 chmod 模式变化、未跟踪发布归档、真实内容修改必须被区分，并给出不会覆盖内容的恢复提示。
- 脚本不得自动 stash、reset、checkout、删除未跟踪文件或弱化 clean-source 门禁。
- `.env`、数据库/Redis/Session Secret 不得进入诊断输出或快照。

### Ordinary-env acceptance

- 新用户只需在项目根执行 `bash scripts/deploy.sh`；脚本自动读取项目 `.env`，不要求理解或填写一整套 `DEPLOY_*`。
- `/opt/wzywt` 自动得到独立运行基目录，普通 `PORT` 驱动 PM2、health 与应用监听；项目名、用户、组、PM2 home 和默认进程名自动推导。
- `DEPLOY_*` 只保留为高级覆盖或歧义消解接口；自动值与真实宿主状态冲突时失败关闭并说明已发现值，不把选择题甩给用户。
- 命令/版本、PM2 所有权、数据库备份、migration、原子切换、health 与回滚边界保持不降低。


### Ordinary-env errors

| Error | Attempt | Resolution |
|---|---:|---|
| A Git-Bash heredoc embedded in the Windows command wrapper was parsed by cmd.exe | 1 | Switched the small module assertion to a PowerShell-safe `node -e` invocation |
| Passing the parser path as argv caused its CLI guard to execute during the import test | 1 | Imported the resolved module URL without occupying `process.argv[1]` |
| Ecosystem zero-config code normalized an explicit MSYS `APP_DIR` into Windows backslashes | 1 | Preserve an explicit already-validated APP_DIR; resolve only the `__dirname` fallback |
| The generated ecosystem test block retained diff-style leading plus signs | 1 | Scanned all line-start plus markers and removed the nine exact accidental prefixes |
| New runtime inspector could not execute an extensionless fake systemctl directly on Windows | 1 | Passed the resolved Git Bash path from the npm launcher and used it only for Windows extensionless fixtures |
| Built-in Node pattern initially allowed 20/22/24 but the validated host runs Node 26 | 1 | Added Node 26 after syntax, tests and the existing production build demonstrated compatibility |
| A multi-line docs/spec transform did not match the file's mixed line endings | 1 | Replaced the seven exact table rows independently and preserved surrounding content |
| First spec update command interpolated `$count:` as an invalid PowerShell variable reference | 1 | Used `${count}:` and completed the already-validated exact replacements |

### Dirty-tree errors

| Error | Attempt | Resolution |
|---|---:|---|
| Multi-word `rg` alternation was split by the cmd wrapper | 1 | Use single-token searches or an audit script instead of repeating the quoted command |
| A semicolon-separated Git inspection was passed as one argument by the cmd wrapper | 1 | Run each read-only Git command as a separate process |
| First exact-transform script parsed embedded Bash quotes as PowerShell syntax | 1 | Generated a derived script with single-quoted PowerShell literals; no workspace file had changed |
| Second transform attempt rejected intentional blank lines in mandatory string arrays | 1 | Added `AllowEmptyString` to both exact-line array parameters and the third transform completed |
| First phase-sync script used `if` where PowerShell required a precomputed expression value | 1 | Moved newline selection to a variable before joining the error rows |
