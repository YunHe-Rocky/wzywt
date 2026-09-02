# 注册登录故障进度

## Session: 2026-09-02

### Phase 1: 现场与代码盘点
- **Status:** complete
- Actions taken:
  - 读取 `planning-with-files` 与 `webapp-testing` 完整技能说明。
  - 恢复项目既有计划与认证安全改造历史。
  - 建立独立排查计划，准备检查现场、源码和失败响应。
  - 检查 Git 与端口现场：8001 未监听；识别出 Session Cookie 安全策略的现有未提交改动。
  - 对照注册、登录、`/api/auth/me`、bcrypt 与 `sessionVersion` 逻辑，确认注册/登录哈希函数一致，当前首要假设是 Cookie 传输策略而非密码哈希不兼容。
  - 读取上一部署任务的现场证据，确认纯 HTTP 内网生产实例已复现 Secure Cookie 丢失，并且对应代码修复尚未发布。
  - 检查环境变量名存在性：本地 `.env` 尚无 `SESSION_COOKIE_SECURE`，没有读取或输出任何 Secret 值。
  - 确认远端数据库边界，未创建测试用户；验证现有 Cookie 修复、真实 iron-session 输出和独立 production 登录错误链路。
  - 运行连接专项、typecheck、架构检查及 production build，全部通过。
  - production Chrome 冒烟通过；最终审计发现 helper 遗留的 PID 11852，核对为本轮 `next start -p 8017` 后精确终止，8017 已释放。
  - 截图已生成但视觉工具受 ACL 阻断；DOM/响应/浏览器错误断言完成。
  - 最终线上 HTTP/TCP 探测超时，记录为发布后验收阻塞项。
  - 未读取、记录或请求用户真实密码。
- Files created/modified:
  - `.planning/2026-09-02-login-failure/task_plan.md`
  - `.planning/2026-09-02-login-failure/findings.md`
  - `.planning/2026-09-02-login-failure/progress.md`

### Phase 2: 最小修复与回归覆盖
- **Status:** complete
- Actions taken:
  - 确认 `resolveSessionCookieSecure()` 保持 production secure-by-default，只允许显式 `0` 用于受信任 HTTP 内网。
  - 实际生成 Cookie 验证 `session.ts` 已正确接入配置函数。

### Phase 3: 验证与交付
- **Status:** complete
- Actions taken:
  - 完成本地代码、production build、Cookie 与浏览器验证。
  - 保留线上发布和真实账号成功登录为明确未执行项：当前内网服务从本机不可达，且未获真实凭据/发布目标授权。
  - 保留忽略目录中的测试截图与脚本作为本轮证据；没有业务进程或数据库清理项。

## Test Results

| Test | Input | Expected | Actual | Status |
|---|---|---|---|---|
| Connection regression | `npm.cmd run test:connections` | PASS | PASS | PASS |
| TypeScript | `npm.cmd run typecheck` | PASS | exit 0 | PASS |
| Architecture | `npm.cmd run check:architecture` | PASS | PASS | PASS |
| Production build | `npm.cmd run build` | PASS | exit 0, 17 existing warnings | PASS |
| Cookie default | production, override unset | Secure + HttpOnly + Lax | matched | PASS |
| Cookie HTTP override | production, override 0 | non-Secure + HttpOnly + Lax | matched | PASS |
| Production Chrome | 8017, nonexistent account | 401 visible, no unexpected browser errors | matched | PASS |

## Error Log

| Timestamp | Error | Attempt | Resolution |
|---|---|---:|---|
| 2026-09-02 | 沙箱启动 PowerShell 时 `apply deny-read ACLs` | 1 | 使用受审只读提升调用继续恢复上下文 |
| 2026-09-02 | 开发端口 8001 无监听进程 | 1 | 转为配置分类与隔离启动复现，不触碰未知进程 |
| 2026-09-02 | Playwright 1.61 缺少 bundled Chromium executable | 1 | 使用已安装的系统 Chrome；8017 临时服务已由 helper 停止 |
| 2026-09-02 | `apply_patch` 更新测试脚本时遇到中文路径 ACL 错误 | 1 | 使用 ASCII 临时区的限定统一补丁 |
| 2026-09-02 | 组合补丁计数/上下文未匹配 | 2 | 只应用已校验脚本 hunk，再按精确行号生成补丁 |
| 2026-09-02 | 预期登录 401 被 Chrome 记为资源 console error | 1 | 过滤该预期网络错误，其他浏览器错误仍为硬失败 |
| 2026-09-02 | 截图视觉工具对中文路径与可视化目录均报 ACL helper 错误 | 2 | 保留截图，使用 DOM/响应/console/page error 自动断言并明确人工视觉未完成 |
| 2026-09-02 | 线上 health/login 10 秒超时 | 1 | 改用 5 秒 TCP 连接检查区分 HTTP 与网络层 |
| 2026-09-02 | 线上 8001 TCP 连接未建立 | 2 | 停止重试，不重启或猜测线上状态；等待服务恢复后验收 |
| 2026-09-02 | `with_server.py` 最终一次运行遗留 8017 Node 子进程 | 1 | 核对 PID 11852 完整命令行为本轮 `next start -p 8017`，仅终止该 PID 并确认端口释放 |

## 5-Question Reboot Check

| Question | Answer |
|---|---|
| Where am I? | Phase 3：本地验证完成，线上验收待服务恢复 |
| Where am I going? | 发布当前修复并用真实账号验收成功登录 |
| What's the goal? | 修复注册成功后无法登录 |
| What have I learned? | 根因是 production Secure Cookie 与纯 HTTP 内网不兼容；显式 0 修复已通过本地验证 |
| What have I done? | 完成代码、Cookie、build 与 production Chrome 验证，且未修改远端数据 |

