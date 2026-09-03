# 点击“我的”后退出排查计划

## Goal

复现并修复“用户已能成功登录，但点击功能栏‘我的’后被直接退出”的完整链路，确保真实失效 Session 只拒绝访问，普通资料加载或旧标签页响应不会误清新登录态。

## Constraints

- 遵守 `app / web -> features -> core` 与 `features -> lib` 架构边界。
- 不读取、记录或修改真实用户密码、Session Secret、Token 或生产连接信息。
- 保留无关进程和用户改动；测试只使用隔离账号、自动清理或无副作用路径。

## Phases

### Phase 1: 复现与链路定位
- [x] 盘点“我的”入口、页面请求、鉴权 API 与退出调用
- [x] 区分 Cookie 丢失、Session 校验失败和前端误退出
- **Status:** complete

### Phase 2: 最小修复与回归覆盖
- [x] 在正确架构层修复初始假登录问题
- [x] 为触发条件增加回归测试
- **Status:** complete

### Phase 3: 本地全链验证
- [x] 运行专项测试、typecheck、架构检查和 build
- [x] 完成登录后点击“我的”的本地 production 浏览器验证
- **Status:** complete

### Phase 4: 192.168.1.72 现场复现
- [x] 用系统 Chrome 记录页面、Cookie、认证 API、跳转和浏览器错误
- [x] 确认线上仍为旧 release，但新用户的 HTTP Cookie 实际可用
- **Status:** complete

### Phase 5: 现场根因修复
- [x] 捕获桌面端和移动端进入个人空间后的认证/profile 请求与最终状态
- [x] 通过旧 Cookie + 新 Session 的受控实验确认删除 Cookie 竞态，并实施最小修复
- **Status:** complete

### Phase 6: 重新验证与交付
- [x] 运行代码门禁、Lint、生产构建和本地 production Chrome 回归
- [x] 明确本地已修复范围、线上未部署状态和剩余风险
- **Status:** complete

## Errors Encountered

| Error | Attempt | Resolution |
|---|---:|---|
| 沙箱对中文工作区的 PowerShell 只读启动报 `apply deny-read ACLs` | 1 | 对必要只读检查使用受审提升；项目改动仍限制在仓库内 |
| `apply_patch` 无法读取中文路径下的既有目标文件 | 1 | 创建完整候选文件，校验目标在仓库内及关键调用计数后只覆盖精确文件 |
| 多份手工统一补丁 hunk 计数错误 | 4 | 每次校验均在应用前停止；重新核对实际行数后生成有效补丁 |
| Python Playwright 未安装 | 1 | 不安装额外依赖，使用项目现有 Node Playwright 正式回归 |
| data URL runner 无法解析 `playwright` | 1 | 改用物理修正版脚本，不重复 data URL 路径 |
| 首个真实注册脚本按旧假设等待 `/login` 超时，未执行注销 | 1 | 确认新用户实际进入 `/me`；后续脚本把清理放入 `finally`，遗留一条随机 `codex_` 测试账号待有合法管理通道后删除 |
| 读取 `.env` 解析数据库目标被安全策略拒绝 | 1 | 不绕过 Secret 边界，不使用数据库直接清理 |
| `with_server.py` 在 Windows 上遗留 Next 子进程 | 3 | 核对 PID/父进程/命令后只停止本轮进程，并复查 8001 |

## Completion Note

代码、回归约束和本地验证均已完成；生产站点仍运行基于 `99de8ee` 的旧 release，必须通过服务器上的 `scripts/deploy.sh` 流程发布后，用户浏览器才能获得本次修复。
