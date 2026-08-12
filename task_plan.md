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

## Errors Encountered

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
