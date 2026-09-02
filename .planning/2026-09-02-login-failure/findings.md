# 注册登录故障发现

## Requirements

- 用户反馈：注册账户后数据库已经有数据，但无法登录。
- 需要实际检查并修复代码，不仅给出推测。

## Research Findings

- 历史代码曾加入 `sessionVersion`、数据库实时权限校验和安全 Cookie；这些是当前登录链路必须重新核对的兼容边界。
- 既有根目录计划属于已完成的历史大任务，本次使用独立 `.planning` 目录，避免覆盖历史记录。
- 当前没有进程监听开发端口 `8001`，因此用户反馈时的运行实例不在当前现场，需先确认启动配置再复现。
- 注册与登录均直接以相同的 `username` 查询，均使用 `bcryptjs` 的同一组 `hashPassword`/`verifyPassword`；代码表面未发现哈希算法不一致。
- 注册和登录都在成功后写入 `userId/username/role/sessionVersion` 并 `session.save()`；登录路由还拒绝临时账户和封禁账户。
- 当前工作区已有未提交的 Session 改动：Cookie 的 `secure` 从固定的 `NODE_ENV === production` 改为可由 `SESSION_COOKIE_SECURE` 覆盖。这一改动与“生产模式通过纯 HTTP/IP 访问时登录 POST 成功，但浏览器随后不回传 Secure Cookie”的症状高度相关；仍需用响应/Cookie 实测确认。
- 当前工作区还包含部署/cron 相关未提交改动，本次不得覆盖；认证修复若与其重叠，应优先验证并补齐现有方向。
- 既有部署任务已经在 `http://192.168.33.133:8001` 用 curl 和 Chrome 复现：页面可达、浏览器保持匿名；根因记录为生产 Secure Cookie 在纯 HTTP 内网地址无法持久化。
- 对应代码、配置校验测试和文档已经存在于当前 dirty worktree，历史计划称全量验证通过，但明确注明尚未把代码与 `SESSION_COOKIE_SECURE=0` 发布到 HTTP 内网服务。
- 当前本地 `.env` 有数据库与 Session Secret，但没有 `SESSION_COOKIE_SECURE`；因此直接以 production + HTTP 启动仍会采用安全默认值 `secure=true`，必须为受信任 HTTP 内网进程显式设 `0` 才能验证修复分支。
- Fresh 回归验证 PASS：连接专项测试、typecheck、架构检查和 Next production build 均成功；build 只有 17 条既有 `<img>` 性能 warning，0 error。
- 使用真实 `sessionOptions + iron-session` 生成 Cookie：production 默认得到 `secure=true`；显式 `SESSION_COOKIE_SECURE=0` 得到 `secure=false`，两者均保持 `httpOnly=true`、`sameSite=lax`。
- 独立 production 服务在 8017 启动，系统 Chrome 完成登录页交互；保证不存在的账号触发只读数据库查询，返回 401 且页面显示“用户名或密码错误”，unexpected console errors=0、page errors=0。
- 未用真实账号做成功登录，也未注册测试账号，因为当前数据库在非 loopback 远端 3306；这是有意的数据安全边界，不应把远端数据库当隔离测试库。
- helper 报告服务已停止，但最终审计发现本轮 `next start -p 8017` 的 PID 11852 仍监听；核对完整命令行后仅终止该精确 PID，复查 8017 已释放。没有创建、修改或删除任何用户记录。
- 最终复查 `192.168.33.133:8001` 时，health/login 均 10 秒超时，随后 TCP 5 秒仍未建立；当前线上服务从本机不可达，无法完成发布后成功登录验收。

## Technical Decisions

| Decision | Rationale |
|---|---|
| 按注册 API -> Prisma 数据 -> 登录 API -> Session/Cookie -> 页面跳转顺序排查 | 能区分“凭据失败”和“已登录但客户端未保留会话” |

## Issues Encountered

| Issue | Resolution |
|---|---|
| 技能与历史记录读取受沙箱 ACL 影响 | 使用只读提升调用；项目写入仍限制在工作区 |
| 8001 当前未监听，无法直接捕获用户原现场响应 | 先确认本地配置的数据库/访问协议类别，再启动隔离端口复现；不猜测或输出 Secret |
| 截图文件已生成，但视觉工具对中文路径和可视化目录均触发相同 ACL helper 错误 | 以 Playwright DOM、响应、截图生成、console/page error 断言作为本轮证据，并明确视觉人工检查未完成 |
| 最终内网服务 HTTP 与 TCP 探测均超时 | 不重启、不部署、不把历史可达状态当成当前线上 PASS；待服务恢复后重新验收 |

## Resources

- `src/lib/session.ts`
- `src/lib/session-config.ts`
- `scripts/test-connections.ts`

## Visual/Browser Findings

- 系统 Chrome production 冒烟 PASS：登录页标题、输入框、按钮、错误提示均可见且可交互；401 后无意外 console/page error。
- 截图生成于 `.cache/test-artifacts/login-production-http.png`；因宿主 ACL helper 错误无法用视觉工具人工打开，未把“截图存在”冒充视觉验收。

