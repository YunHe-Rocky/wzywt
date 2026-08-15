# WZYWT V2.2 动态资源调度实施计划

## Goal

按 `docs/王者演武堂_V2.2_动态资源调度架构升级_Codex开发任务书.md` 渐进式实现页面感知资源调度、共享加载、Lease 生命周期、独立同步与监控，并完成可重复验证。

## Constraints

- 保持 `app/web -> features -> core/lib` 依赖方向，不在 Route/UI 中引入数据库或复杂业务逻辑。
- 公共资源与用户资源隔离；MySQL/Redis/持久化数据不随页面 Lease 释放。
- 后台同步独立于页面生命周期；生产部署和真实外部同步不在无授权环境中执行。
- 保留用户新增任务书及全部无关工作；不做一次性大规模重构。

## Phases

- [completed] Phase 1：盘点首页、赛事、英雄、装备、Cron、缓存与 SSE 现状，确定最小接入面
- [completed] Phase 2：实现 Resource 模型、SingleFlight、Lease、Page Scheduler、Data Scheduler 和状态机
- [completed] Phase 3：首页与赛事页面接入资源清单、Lease acquire/renew/release
- [completed] Phase 4：英雄/装备同步独立化与 stale-while-revalidate 数据版本策略
- [completed] Phase 5：实现资源监控 API/UI，补齐权限与用户数据隔离
- [completed] Phase 6：新增并运行单元、并发、生命周期、架构、类型、连接、lint 与 build 验证
- [completed] Phase 7：审计验收标准、文档与 residual risk，保持 worktree 可交付

## Acceptance Criteria

- 首页冷启动成功，后续调用复用 HOT 数据。
- 并发用户对同一公共资源只触发一次 loader。
- 90 秒 Lease 可续租、主动释放、异常过期；无 Lease 时实时资源进入 IDLE 并自动 EVICT。
- SSE/轮询/临时计算可释放；MySQL、Redis、后台同步和业务数据不被页面生命周期关闭。
- 英雄与装备同步分别由后台调度运行，页面只读版本并可触发后台刷新请求。
- 用户作用域资源不能被其他用户复用；公共资源可跨用户复用。
- 管理员可观察 COLD/WARMING/HOT/IDLE/EVICTED、Lease 数、加载/复用/释放指标。

## Errors Encountered

| Error | Attempt | Resolution |
|---|---:|---|
| 初次 PowerShell 文件枚举过滤正则多出转义括号并产生重复错误 | 1 | 改用 `git ls-files`/定向目录枚举，停止使用该正则 |
| sandbox 用户执行 Git 遇到 dubious ownership | 1 | 对只读 Git 命令使用单次 `-c safe.directory=...`，不修改全局配置 |
| `apply_patch` 无法为计划文件自动创建父目录 | 1 | 经用户授权创建唯一明确的 V2.2 计划目录，文件继续使用 patch 写入 |
| 公共赛事服务初稿复用了含 `admins` 的大厅查询，安全审查拒绝潜在字段扩张 | 1 | 公共资源改用独立最小字段 `select`，用户作用域查询保持隔离 |
| `test:resources` 被宿主 Node 26 `uv_os_get_passwd ENOMEM` 阻断 | 1 | 使用仓库忽略目录中的既有验证策略 userinfo preload，仅作用于本地测试进程 |
| SingleFlight 测试只等待一个 microtask，断言早于 `acquirePage` 的异步 sweep 完成 | 1 | 有界等待 Loader 启动后再断言，不改变生产调度逻辑 |
| `webapp-testing` 的 `with_server.py` 在 Windows 上两种 server 命令均无输出 exit 1 | 2 | 改用可追踪 PTY 启动 production server，验收后 Ctrl+C 精确清理 |
| 项目 Playwright 未安装 bundled Chromium | 1 | 使用本机已安装 Chrome channel，不下载新依赖 |
| 浏览器发现公开英雄页因 SSE GET 新增 admin 校验持续 401 | 1 | 恢复 GET 公共英雄更新语义；POST 手动检查和 `/api/admin/resources` 继续要求管理员 |
| 浏览器最初点击了 Dock 中 aria-hidden 子链接且被动画层拦截 | 3 | 按真实交互先展开“图鉴”菜单，再点击可见英雄/装备 Link；Lease release 验收 PASS |
