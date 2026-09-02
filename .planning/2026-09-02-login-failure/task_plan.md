# 注册成功但无法登录排查计划

## Goal

复现并修复“账户注册后数据库已有记录，但正确凭据无法登录”的完整认证链路，并用自动化回归与本地端到端登录证据确认结果。

## Constraints

- 保留工作区现有用户改动，不覆盖无关文件。
- 遵守 `app / web -> features -> core` 与 `features -> lib` 的架构边界。
- 不输出、提交或记录真实密码、Session Secret、数据库连接串或用户隐私数据。
- 不连接或修改未确认的生产数据库；所有数据变更型复现只使用任务自建测试账号或现有本地测试设施。

## Phases

### Phase 1: 现场与代码盘点
- [x] 检查 Git 状态、运行中服务和当前认证入口
- [x] 对照注册写入、登录查询、密码哈希及 Session 创建
- [x] 记录可复现的失败响应和根因假设
- **Status:** complete

### Phase 2: 最小修复与回归覆盖
- [x] 确认现有最小修复位于 Session 配置边界且保持生产安全默认值
- [x] 验证纯配置回归与实际 iron-session Cookie 接线
- **Status:** complete

### Phase 3: 验证与交付
- [x] 运行认证专项测试、typecheck、架构检查及 production build
- [x] 用独立 production 服务验证 HTTP Cookie 接线和登录页/API 错误链路
- [x] 确认未创建账号、未修改远端数据且任务自建服务已停止
- **Status:** complete

## Key Questions

1. 注册与登录是否对账号标识、密码格式、大小写或空白做了不一致的规范化？
2. 数据库中的新用户是否缺少登录路径新增后要求的字段或状态？
3. 登录失败发生在凭据校验、用户状态校验、Session 保存还是浏览器 Cookie 阶段？

## Decisions Made

| Decision | Rationale |
|---|---|
| 先复现并记录 API 响应，再修改代码 | 避免用猜测替代真实故障证据 |
| 测试数据只使用任务自建账号 | 保护用户现有账户和数据 |

## Errors Encountered

| Error | Attempt | Resolution |
|---|---:|---|
| Windows 管理沙箱无法为中文工作区启动只读 PowerShell，报 `apply deny-read ACLs` | 1 | 改用受审的只读提升执行读取技能和既有计划，未修改项目 |
| 组合读取已有计划输出被截断 | 1 | 已取得与认证相关的现状；后续按需分文件、分段读取，避免再次组合大量输出 |
| Playwright 自带 Chromium 未安装，production 浏览器测试在启动浏览器前失败 | 1 | 改用主机已有的系统 Chrome，不下载新浏览器；with_server 已正常停止 8017 服务 |
| `apply_patch` 无法再次读取中文工作区中的新测试脚本 | 1 | 在纯 ASCII 临时区生成限定目标的统一补丁，经 `git apply --check` 后应用 |
| 首个组合补丁 hunk 计数错误，修正后计划文件上下文仍不匹配 | 2 | 仅应用已校验的测试脚本 hunk，再按精确行号重新生成计划记录补丁 |
| 系统 Chrome 把故意触发的登录 401 记录为资源加载 console error | 1 | 仅过滤该条预期 401，其他 console/page error 仍须为零 |
| `with_server.py` 最终一次运行遗留 8017 Node 子进程 | 1 | 核对 PID 11852 命令行为本轮 `next start -p 8017`，仅终止该 PID 并确认端口释放 |

