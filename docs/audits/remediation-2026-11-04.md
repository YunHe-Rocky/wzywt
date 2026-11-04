# 2026-11-04 待办复核与第二轮优化

依据《王者演武堂_审查修复与宣传待办_2026-11-04.md》复核当前实现，优先处理账号、权限和文件可靠性。输入文件来自 E 盘，实际修改位于当前工作区 `D:\Worktrees\wzywt`；未覆盖 E 盘文件。

## 基线与交付范围

- 修改前本地 `main`：`65f3ceb26893f59c54aa2930836935d6f6072a0a`。本轮通过 GitHub 连接器核对，远端 `main` 指向相同提交。
- 未连接线上服务核对 release、镜像和 migration，远端分支一致不证明线上版本一致。
- 工作区原有 `src/instrumentation.ts` 改动保留，不归入本轮修复。
- 本地修复交付时尚未提交、上传、触发新 CI 或部署，没有操作生产数据库、迁移、业务存储或持久卷。后续 GitHub 上传与 CI 状态以对应 PR 的提交和检查结果为准。

## 已修改的行为

### 账号限流与密码找回

成功登录只清理当前账号记录；验证找回答案和完成重置只清理对应账号或 token 的记录，均不再清空整个来源 IP 的计数。攻击者不能通过穿插一次自己账号的成功操作，为同一来源对其他账号的尝试重新取得预算。登录先检查来源，再检查账号，已阻断来源不继续消耗其他账号的预算。

窗口和次数保留原值。来源桶累计本窗口内的尝试，包括成功请求。local 且未信任代理时，直连请求仍共用 `direct` 来源，是当前 Next Route 缺少可靠 socket 身份的既有限制；不能通过信任浏览器提供的 IP 头来解决。有区分来源需求时，按既有配置部署受控代理。

新增隔离回归覆盖账号锁定、成功后来源预算不复位、Redis 清理范围，以及实际重置 Route 的错误答案、72 字节密码边界、封禁账号回滚、一次性/过期 token 和会话版本递增。真实 MySQL 并发消费及跨设备登录仍待验收。

### 管理权限和临时玩家

- `leaveTournament` 在删除成员的同一 Serializable 事务内删除其 `co_owner` 记录；房主仍不能普通退出。
- 分队 Worker 完成后，最终提交事务重新读取管理员角色。计算期间已辞任、降权或退出的管理员不能提交结果。
- 新分队快照的 `playerDetails` 和分配说明使用临时玩家填写的名称，缺少名称时显示“临时选手”，避免保存内部账号。历史快照不自动改写。

服务回归通过，真实 MySQL 的退出撤权和分队最终授权用例已加入现有 `test:integration`。其他管理操作的并发授权没有在本轮全部重写或宣告关闭。

### 截图替换的故障补偿

旧逻辑在数据库已提交后，若旧文件删除失败、清理入队也失败，会进入“数据库失败”补偿并误删新截图。现在记录事务提交状态，提交后的旧文件清理故障只记录错误并保留新文件；提交前失败才释放预留、清理新文件。补偿自身失败不覆盖原始数据库错误。

双重清理故障回归通过。此时旧文件可能残留，需要根据日志和数据库引用受控处理，不自动删除未知文件。

### 英雄实时更新

后台跨进程同步使用 `heroId: 0` 通知全量更新，详情页此前仅处理具体英雄 ID。本轮补上全量事件，并稳定 `useHero.refetch`，避免刷新后 SSE 反复重连和快照重放。

实际 Next 页面回归覆盖列表 lease 建立、更新、失败重试、过期恢复，以及详情页在 1280px/390px 下处理全量/单英雄更新、忽略无关英雄、维持同一订阅。API 被拦截，真实 Cron→数据库→跨进程快照仍待验收。

### 原生迁入 Docker 的媒体恢复

远端 CI `39887391795` 的容器日志显示 `restore-media` 在解包 `media.tar.gz` 时失败。当前恢复命令同时使用 `--keep-old-files` 和 `--no-overwrite-dir`，本机 GNU tar 1.35 已直接复现参数互斥，tar 在读取归档前退出。

恢复命令保留 `--keep-old-files`、`--no-same-owner`、`--no-same-permissions`，移除互斥项。仍从已打开的只读描述符读取私有归档，以应用身份解包；失败保留 pending 标记和目标存储。错误信息增加有界且清除控制字符的 tar 诊断。

新增真实 GNU tar 三归档回归，检查文件内容、pending 标记不变与拒绝重复恢复。Linux CI 执行真实解包；Windows 默认 BSD tar 明确跳过该项。本机显式选择 GNU tar 后，gzip 子进程被系统策略阻止，因此没有本机完整 GNU gzip/Docker/MySQL 恢复通过证据。已有 96 项 Compose/迁移合同测试通过，不等于真实容器恢复。

### 视频失败诊断与 CI

上述 CI 的 Node 24/26 × proxy/local 均在完整手机视频回归失败。已读 Node 26/proxy 日志的 WebKit 未处理错误来自 `inspectCombatVideoSource`；原逻辑为两字节 Range GET 后取消响应体。没有据此把“access control checks”直接认定为生产 CORS 漏洞。

本轮改为 `HEAD` 诊断，执行相同的登录、可见性和文件大小校验，但不打开媒体流；普通 GET/Range 播放不变。诊断断网、超时和取消时保留原播放提示。实际 Next 手机页面的 HEAD 404、重试和断网用例在 Edge 通过。完整转码、解码、拖动与 WebKit 回归仍须重跑，目前为候选修复。

新故障回归接入 `test:audit-repairs`；英雄和视频诊断浏览器回归接入 CI 已有的本地 HTTP 服务。没有删除断言、关闭检查或添加 `continue-on-error`。

### 依赖补丁

经用户授权、禁用安装脚本后更新 `undici` 7.29.1→7.30.1，以及现有依赖范围内的 `browserslist` 4.28.4→4.29.5 和必要子依赖。undici 修复版本由[官方公告](https://github.com/nodejs/undici/security/advisories/GHSA-xjj6-f33q-929c)核对。

最终在线审计：生产依赖 **0 项**；完整依赖 **0 critical、0 high、19 moderate**。剩余问题主要位于 ESLint/minimatch 依赖链和 PostCSS selector parser。未跨主版本改造 ESLint，原有 high 门禁阈值保留。不能由 npm 审计推断镜像 OS、Python、Node 内置依赖或业务无风险。

## 本地验证

Node 26.10.0。Windows 应用控制策略阻止 `esbuild.exe` 和 sharp 原生模块；未修改系统策略或重命名二进制。离线 TS 用例通过工作区 `.cache/register-typescript.mjs` 使用 TypeScript 编译器执行，保留原用例和断言，逐项记录结果；这不等于标准 `npm run check` 已通过。

| 检查 | 结果及边界 |
| --- | --- |
| 类型、架构 | 通过；架构脚本使用替代 TS 执行器 |
| lint | 0 error、18 条既有图片告警 |
| 新故障回归 | 通过；实际服务/Route + 替身数据库、存储、Redis |
| core、API 用例、连接、视频上传、任务栅栏、草稿、设备/手机路由等 | 原 check 对应集合通过，使用隔离测试连接和替代 TS 执行器 |
| 历史主题核心 | 45 项通过 |
| 爬虫合同 | 17 项通过，网络/数据库隔离 |
| 资源治理与 Worker 生命周期 | 31 项通过 |
| Compose/原生迁移/备份合同 | 最终 97 项：96 通过、1 项 GNU tar 平台跳过；真实 GNU gzip 解包另受系统策略限制 |
| 英雄 UI | 列表及 1280px/390px 详情通过；API 拦截 |
| 档案 UI | 1280/390/320px × 普通成员/房间管理/站点管理共 9 组通过；含拒绝后不重复加载 |
| 视频诊断 UI | 手机真实 Next 页面 HEAD 404/重试/断网通过；API 和视频为 fixture |
| 生产/完整 npm 审计 | 0 / 19 moderate，无 high/critical；原 `npm audit --audit-level=high` 门禁退出 0 |
| 完整生产构建 | 未通过；编译后收集 `/api/me/avatar` 时系统策略阻止 sharp |
| 原 audit-repairs、match-visibility、deploy 集合 | 未完整通过；前两项受 sharp 限制，Cron 子进程用例受 esbuild 限制；新故障回归单独通过 |
| 真实 MySQL/Redis/Docker、完整恢复 | 本机未执行，不连接生产代替 |

本地证据在 `.cache/`：`review-verification/results.json`、`review-check-summary.log`、`review-lint-final.log`、`review-build.log`、`review-compose.log`、`review-governor.log`、`review-hero-browser.log`、`review-archive-browser.log`、`review-video-probe.log`、`review-native-gnu-tar.log`、`review-*-audit-final.json`。这些没有作为远端制品上传。

## 原待办逐项回填

| 原待办 | 本轮状态与未关闭边界 |
| --- | --- |
| 账号限流 | 来源预算重置已修复；真实服务和 LAN 多用户预算待验收 |
| 密码找回 | 回归已有凭据协议并修正来源预算；真实找回→重置→旧会话失效→新密码登录待验收 |
| 共同管理员退出 | 同事务撤权及分队最终授权已改；真实并发和其他管理入口仍待验证 |
| 档案卡死 | 9 组 UI 通过，未复现原现场卡死；仍需失败账号/比赛/响应/OCR 队列证据 |
| 截图替换丢文件 | 双重清理故障已修复并回归；真实断连和并发待验收 |
| Docker 媒体恢复 | GNU tar 参数根因已复现并改；Linux 真实导入仍待通过 |
| 真实备份恢复 | 未执行；须隔离空库/独立存储恢复，核对记录、哈希、权限、播放/拖动及 RPO/RTO |
| CI/依赖 | 高危清除，媒体/视频有针对性修改；新提交的 CI 和 WebKit 仍待运行 |
| 英雄更新 | 详情全量刷新和稳定订阅已改；真实后台同步链待验收 |
| 图鉴分类 | 现有英雄/装备入口、分路和命格筛选已复核；缺少错分样本，未无证据重分类 |
| 临时玩家内部 ID | 新快照显示已改；历史快照不自动改写 |
| 告警送达 | 只有探针和手册不算送达；待配置真实渠道/收件人并验证失败、恢复和确认时间 |
| 移动完整流程 | 局部 UI 通过；真实 Android/vivo、WebKit 和数据库全流程待验收 |
| 宣传视频 | 未修改成片；听验、字幕同步、商用配音授权独立保留 |

远端基线 [CI 39887391795](https://github.com/YunHe-Rocky/wzywt/actions/runs/39887391795) 和[依赖审计 41436599435](https://github.com/YunHe-Rocky/wzywt/actions/runs/41436599435) 仍是旧提交的失败记录，本轮未触发重跑。

## 后续顺序

1. 在允许当前构建依赖运行的 Node 24/26 环境执行 `npm ci`、`npm run check`、lint、build，保留失败日志。
2. 独立 `_ci`/`_test` MySQL 执行 `test:integration`、`test:integration:audit`；专用 Redis 验证限流。不能用生产库替代。
3. Linux 执行新增 GNU tar 回归及 `scripts/test-native-migration-docker.mjs`，保存报告、文件哈希和 pending/completed 证据。失败保持停写，不清卷、清标记或自动导回 SQL。
4. 完整手机视频回归特别核对 WebKit，真实恢复和外部告警送达各留独立验收记录。
5. 发布前核对实际服务身份、release、migration 和备份，从[Docker 操作入口](../operations/docker.md)开始；原生 PM2 使用既有独立流程。
