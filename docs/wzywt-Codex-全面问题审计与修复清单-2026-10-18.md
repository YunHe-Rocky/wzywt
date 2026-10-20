# wzywt 全面问题审计与 Codex 修复任务清单

> 归档说明：本文保留 2026-10-18 固定基线的审计事实。后续源码修复和验收状态见 [审计处理记录](audits/remediation-2026-10-18.md)；本次版本归并另见正式版本登记，不将原始 55 项清单当作当前全部未修复或全部已关闭的结论。

> 当前交付是审计文档：没有修改 GitHub 仓库、提交代码、触发 CI、部署服务或变更数据库。本文中的修复与验收步骤供后续获得修复任务的 Codex 执行，不表示这些修复已经完成。

| 项目 | 值 |
| --- | --- |
| 仓库 | [YunHe-Rocky/wzywt](https://github.com/YunHe-Rocky/wzywt) |
| 项目 | 王者演武堂，王者荣耀 5v5 内战分队与赛后档案/交流 |
| 审计日期 | 2026-10-18，Asia/Shanghai |
| 固定基线 | [3835a889b09cc732dea65c15fcfbf8eb04be442d](https://github.com/YunHe-Rocky/wzywt/commit/3835a889b09cc732dea65c15fcfbf8eb04be442d) |
| 最新提交时间 | 2026-10-17 19:43:47，Asia/Shanghai |
| 本轮重新读取 | main 分支、近期 Actions runs、关键 Job 日志、分支保护及 rulesets |
| 仓库证据来源 | 已连接 GitHub 插件；文件统一固定到上述 SHA，避免 main 漂移改变引用含义 |
| 源码覆盖 | 读取/检索 220 个文本文件；包括全部 70 个 API Route、32 个 Prisma model、9 个 migration |
| 问题清单 | 55 个编号条目；其中包含已确认缺陷、条件风险、工程改进和验收缺口，不等于 55 个已利用安全漏洞 |
| 最新 CI | [39029809865：failure](https://github.com/YunHe-Rocky/wzywt/actions/runs/39029809865) |
| 生产依赖审计证据 | [2026-10-12 的失败作业](https://github.com/YunHe-Rocky/wzywt/actions/runs/38240158264/job/114780481565)，当前相关锁定版本仍在；没有冒充 10-18 新扫描 |
| 本次未执行 | npm 安装/构建/项目测试、容器运行、在线接口复现、数据库迁移、OSS 上传、真实设备/生产验收 |

本文把上一轮发现重新核对，并补充认证、业务输入、并发、媒体生命周期、PM2 发布及 CI 覆盖问题。历史部署笔记仅用于确定检查方向；结论以当前 GitHub 文件、配置和日志为依据。静态审阅无法证明“所有潜在问题已经穷尽”，也无法取代运行验证；已检查范围和剩余验证工作在文末列出。

## 给后续 Codex 的执行约定

1. 先读当前 checkout 的 AGENTS.md、README 和 docs/operations/docker.md，确认工作目录、分支、当前 HEAD、未提交改动。不要按历史 E: / D: 路径猜仓库位置。
2. 对比当前 HEAD 与本报告 SHA。如果代码已变化，逐条重读相关文件，先把已修复、已失效或条件变化的条目标出；不要照抄本报告行号改错位置。
3. 每个条目保持独立 ID；复现/补证据在前，修复在后。并发问题使用可控制的交错时序；不要仅靠多跑几次“未出现”就关闭。
4. 依据当次用户任务执行代码修复；仓库设置、部署、生产迁移、删除数据和历史重写按该任务明确范围处理。本报告本身不扩大当前“仅分析”的范围。
5. 改 API 时保留认证、权限、输入限制与错误语义；数据库变更只新增 migration，不删除/改写既有 migration，不对生产使用 db push。
6. 保留电脑、手机、本地 HTTP、局域网与公网 HTTPS 场景；不能为了公网部署修复破坏明确支持的 LAN 使用。
7. 分开处理 Compose 与原生 PM2；不假定两条路线具有相同的备份、停写和恢复保证。保持 mysql external、ocr off/container/external 与 rclone 的既有边界。
8. 失败时先保留脱敏证据和现场状态。禁止用删测试、continue-on-error、停用 WebKit、放宽鉴权、关闭 readiness、清卷或自动导入旧 SQL 来制造“成功”。
9. 做到相关测试和明确受影响的回归通过即可进入评审；不要反复跑无关检查拖延。涉及容器、数据库、远端存储的条目，静态/单测成功不等于环境验收通过。
10. 每项最终回报：实际原因、修改范围、测试及运行证据、未验证边界、是否需要数据迁移/操作步骤。需要产品选择的事项先明确最小契约，不能擅自改变用户权限和历史数据保留策略。

### 状态与优先级

- **已确认缺陷**：代码路径/配置矛盾已经核实；是否线上发生另行说明。
- **条件风险**：只有在特定部署、并发、输入、数据量或攻击前提下发生；必须保留该前提。
- **待验证/验收缺口**：缺少证明，不能把未知写成失败，也不能写成成功。
- **P0**：需立即处置的已证实严重事故。本轮证据不足以认定 P0。
- **P1**：当前交付阻断、账户恢复/认证问题，或相关发布条件下的数据安全门槛。
- **P2**：近期修复的业务一致性、可靠性、配置及覆盖问题；对应模式上线前可提升。
- **P3**：维护性、体积、许可/发布材料治理。先完成 P1/P2，再按使用场景推进。

索引里的优先级只是起点。以每项正文中的触发条件为准；例如 PM2 不兼容迁移、外部服务或多副本未被采用时，不应假定所有风险都在当前环境发生。

## 架构事实与审计边界

本项目是 Next.js 全栈应用按业务模块分层，辅以独立 Cron 和 Python OCR 服务。不是前后端两个独立产品，也没有证据表明采用了微服务平台或官方游戏账号认证。

| 层/组件 | 当前实现与数据职责 |
| --- | --- |
| Web | Next.js 15.5.25、React 18.3.1、TypeScript 5.9.3、Tailwind 3.4.19；桌面与 /m 共享业务 |
| API/领域 | app/web → features → core；features → lib；算法纯逻辑，API 调用业务服务，仍有 29 个旧路由数据库访问例外 |
| 数据库 | Prisma 5.22.0 + MySQL；用户、房间、比赛、OCR 任务、媒体预留、审计/状态等持久数据 |
| Redis | 缓存/协调；OCR 队列和任务状态并非全部仅存 Redis |
| 分队 | 确定性志愿优先搜索、Worker Threads、有界队列与超时；强度是估计值，不是校准胜率模型 |
| 媒体 | 本地文件接口，或以 rclone 挂载承载业务媒体；Compose 管理的 MySQL/Redis 活动数据使用本地 Docker 卷，external MySQL 保留既有存储 |
| OCR | FastAPI + RapidOCR/ONNX；六类截图结构化识别，必须人工复核；固定版式/像素边界 |
| Cron | 数据同步、新闻、OCR 任务、清理、心跳/监控；已有任务锁、停止写入及优雅排空机制 |
| 部署 | 管理入口 node scripts/compose.mjs；另保留原生 PM2 scripts/deploy.sh 路线 |

版本来自基线 [package-lock.json](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/package-lock.json)；结构见 [AGENTS.md](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/AGENTS.md)、[Prisma schema](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/prisma/schema.prisma)、[运行架构](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/docs/architecture/runtime-architecture.md)。

需要保留的产品边界：一个房间最多一份 InternalMatch；十人分队；已有截图版本/一致性与人工确认；赛前队内战术和赛后只读复盘。不能把未实现的多局赛制、全自动裁判、无限并发或多副本高可用写成现有功能。

## 建议执行顺序与关联关系

| 批次 | 条目 | 交付目的 |
| --- | --- | --- |
| 1. 失败证据与当前 CI | CI-05 → CI-01/CI-02，DEP-01 | 保存可诊断证据，恢复真实浏览器与空卷启动验证；先查根因，不调低门槛 |
| 2. 账户与关键一致性 | SEC-01～05、SEC-08/11，BUS-05 | 统一凭证契约、撤销旧恢复凭证，保护状态转换和已提交媒体 |
| 3. 验证与发布门禁 | CI-03/04/06，DEPEND-01/02，GOV-01 | 运行遗漏测试，修依赖，建立不能绕过失败的发布标准 |
| 4. 业务/媒体/配置 | 其余 SEC、BUS；DEP-05/06/08/10；WEB-01、PERF-01、DOC-01/02 | 修真实输入、并发、配额、代理和前端问题 |
| 5. 运维与模式验收 | DEP-02/03/04/09/12/13，CI-07/08 | 按实际采用的 PM2/外部服务/OSS 路线证明可升级、可备份、可恢复 |
| 6. 扩容与长期治理 | DEP-07/11，GOV-02，SUPPLY-01，QUAL-01～03 | 明确单实例边界，建立构件追溯、依赖来源和可维护架构 |

关联不代表重复计数同一个 bug：CI-02 是真实失败现象，DEP-01 是独立静态缺陷；GOV-02 是发布记录契约，DEP-11 是管理脚本里的身份绑定；CI-07/08 是自动验证覆盖，DEP-12/13 是运行验收边界。处理时可在同一 PR 合并相关修改，但每条的验收结论应分别记录。



## 当前 CI 事实快照

当前提交对应 [CI run 39029809865](https://github.com/YunHe-Rocky/wzywt/actions/runs/39029809865)：

| Job | 结果 | 准确边界 |
| --- | --- | --- |
| [validate (24)](https://github.com/YunHe-Rocky/wzywt/actions/runs/39029809865/job/117387834367) | 失败 | 安装、迁移、静态检查、配置/部署/算法/集成测试、构建、赛事边界浏览器测试、战报管理浏览器测试通过；HTTPS 代理回归第三个 WebKit profile 未处理页面错误断言失败；后续 Local HTTP 步骤跳过 |
| [validate (26)](https://github.com/YunHe-Rocky/wzywt/actions/runs/39029809865/job/117387834456) | 失败 | 同一阶段失败；Chromium 桌面与 Android profiles 通过；WebKit 错误包含 leases、users/me/roles、users/me/heroes |
| [containers](https://github.com/YunHe-Rocky/wzywt/actions/runs/39029809865/job/117387834458) | 失败 | 12 个 Compose 配置模型通过；镜像构建和 9 个 migration 应用成功；Cron healthy，Web 等待 180 秒未 healthy；后续共享图片可见性步骤跳过 |
| [database-compatibility (8.4)](https://github.com/YunHe-Rocky/wzywt/actions/runs/39029809865/job/117387834463) | 通过 | 空测试库 migration + integration；不代表已有生产库升级、恢复或生产负载已通过 |
| [database-compatibility (8.0)](https://github.com/YunHe-Rocky/wzywt/actions/runs/39029809865/job/117387834465) | 通过 | 同上 |

前一轮“Compose 2.x 不输出 create_host_path=false”的兼容问题已经由当前提交修复：当前 12 模型步骤通过，不能继续把旧错误写成当前启动失败原因。当前仍有浏览器和容器两条独立失败链。

## 全部条目索引

| 编号 | 优先级起点 | 问题/风险/待验证事项 |
| --- | --- | --- |
| [CI-01](#ci-01) | P1 | HTTPS WebKit 回归真实失败，根因尚未闭合 |
| [CI-02](#ci-02) | P1 | 容器首次启动就绪失败，当前镜像未达到部署验收 |
| [CI-03](#ci-03) | P1 | CI 与 npm run check 清单漂移，七组既有门槛没有接入工作流 |
| [CI-04](#ci-04) | P2 | HTTPS 与 HTTP 回归串行依赖，前一失败遮蔽后续验收 |
| [CI-05](#ci-05) | P1 | 失败诊断不足，现有工作流没有保存可回溯的浏览器与健康检查证据 |
| [CI-06](#ci-06) | P1 | Python OCR 服务核心测试和跨语言合同没有进入 CI |
| [CI-07](#ci-07) | P2 | 12 个 Compose 模型不是 12 种可用部署，外部服务/OSS/OCR 运行证据仍缺 |
| [CI-08](#ci-08) | P2 | MySQL 兼容矩阵只证明新库迁移与现有集成用例，未证明版本升级及恢复 |
| [DEPEND-01](#depend-01) | P1 | 已有依赖审计失败尚未在锁文件中消除，必须复扫再定当前影响 |
| [DEPEND-02](#depend-02) | P1 | 依赖审计只每周/手动执行，且范围未覆盖实际镜像所有安装内容 |
| [GOV-01](#gov-01) | P1 | 当前 main 没有可见的必需 CI 分支门禁 |
| [GOV-02](#gov-02) | P2 | 版本登记、当前主线与可交付构件身份尚未形成完整可验证发布记录 |
| [SUPPLY-01](#supply-01) | P2 | 构建输入部分可变，跨时间重建不完全可复现 |
| [SEC-01](#sec-01) | P1 | 修改密码绕过统一的 72 字节上限，设置成功后正常登录被拒绝 |
| [SEC-02](#sec-02) | P1 | 修改安全问题的输入校验弱于注册和重置，能保存无法正常用于找回的答案 |
| [SEC-03](#sec-03) | P1 | 改密码或改安全问题只撤销 Session，没有撤销已经签发的密码重置凭证 |
| [SEC-04](#sec-04) | P2 | 修改恢复凭据无需再次验证已有秘密，已登录的安全答案验证入口没有独立尝试次数限制 |
| [SEC-05](#sec-05) | P1 | 生产 HTTPS 配置允许显式关闭 Cookie Secure |
| [SEC-06](#sec-06) | P2 | 真实 IP 信任模型与直连 LAN 部署模式不一致 |
| [SEC-07](#sec-07) | P2 | 公开安全问题查询可枚举账户且缺少专门限流 |
| [SEC-08](#sec-08) | P2 | 战术板锁定检查与写入分离，可能在比赛正式提交后继续修改 |
| [SEC-09](#sec-09) | P2 | 异议每小时 5 条限制是 count 后 create，存在并发穿透窗口 |
| [SEC-10](#sec-10) | P2 | 媒体“每日上传配额”统计现存对象，截图替换会丢失历史上传量 |
| [SEC-11](#sec-11) | P2 | 过期媒体预留清理与业务消费之间缺少所有权移交，可能删除已经提交的文件 |
| [SEC-12](#sec-12) | P2 | 头像独立写入路径缺少像素验证、并发更新协议和失败清理可观察性 |
| [SEC-13](#sec-13) | P2 | Web 与 OCR 的图片像素上限不一致 |
| [SEC-14](#sec-14) | P2 | OCR 能力和成功率仍依赖固定画面，health 的 fullMatchReady 不能替代实图验收 |
| [SEC-15](#sec-15) | P2 | 战术图层/标记缺少数量上限，读取时一次加载全部 |
| [DEP-01](#dep-01) | P1 | 全新存储卷没有初始化 avatars 子目录，Web readiness 会拒绝就绪 |
| [DEP-02](#dep-02) | P1 | 原生 PM2 的迁移兼容和必要停写只由文档约束，脚本不强制核验 |
| [DEP-03](#dep-03) | P1 | 原生 PM2 自动发布备份仅覆盖 SQL，没有匹配的媒体/头像备份 |
| [DEP-04](#dep-04) | P1 | PM2 在迁移后激活失败会自动回到旧程序，未验证旧程序是否兼容新 schema |
| [DEP-05](#dep-05) | P2 | Compose 环境白名单未透传媒体配额与剩余空间设置 |
| [DEP-06](#dep-06) | P2 | 两个 Nginx 模板的上传限制不一致，小模板会拒绝应用允许的视频 |
| [DEP-07](#dep-07) | P2 | 页面资源租约和缓存仅存在单个 Web 进程内，多副本不具有透明兼容性 |
| [DEP-08](#dep-08) | P2 | PM2 watchdog 固定探测 127.0.0.1，与自定义监听地址配置不一致 |
| [DEP-09](#dep-09) | P2 | 外部 MySQL 的 TLS/证书验证配置缺少标准 Compose 透传通道 |
| [DEP-10](#dep-10) | P2 | Compose 操作锁以源码目录为范围，不能阻止两个 checkout 同时操作同一项目 |
| [DEP-11](#dep-11) | P2 | 发布身份依赖手动改 APP_RELEASE_ID，备份 manifest 没有精确源码/镜像身份 |
| [DEP-12](#dep-12) | P2 | 外部 OCR 预检证明健康协议，不证明 Bearer 鉴权和六图推理链可用 |
| [DEP-13](#dep-13) | P2 | 备份完成标记不是校验/远端上传/灾难恢复通过，需补充可执行闭环 |
| [BUS-01](#bus-01) | P2 | 分路偏好只检查数组长度，非法分路、重复志愿和越界段位可以进入数据库 |
| [BUS-02](#bus-02) | P2 | 每路最多三个英雄的限制采用先计数后插入，可被并发突破 |
| [BUS-03](#bus-03) | P2 | 个人英雄战力直接信任客户端 heroId/heroName，与英雄库可以不一致 |
| [BUS-04](#bus-04) | P2 | 后台分页与部分删除 ID 使用宽松 parseInt，坏参数可能变成 500 或错误对象 ID |
| [BUS-05](#bus-05) | P1 | 退出房间及容量纠正未完整保护状态转换，可能与分队提交交错 |
| [BUS-06](#bus-06) | P2 | 已有比赛档案的房间仍走物理删除，外键阻止后缺少明确业务响应 |
| [BUS-07](#bus-07) | P2 | 选人写接口未校验目标归属、分队一致性及装备主数据 |
| [PERF-01](#perf-01) | P2 | 公告接口没有分页，full=true 会返回全部已发布正文 |
| [WEB-01](#web-01) | P2 | 比赛档案轮询允许请求重叠，旧响应可能覆盖新状态 |
| [QUAL-01](#qual-01) | P3 | 架构检查仍保留 29 个路由直连数据库例外，核心界面文件过大 |
| [QUAL-02](#qual-02) | P3 | Git 跟踪宣传素材和大型可执行依赖，增加获取与审查成本 |
| [QUAL-03](#qual-03) | P3 | 缺少项目级许可证，公开仓库与可再分发授权不能混为一谈 |
| [DOC-01](#doc-01) | P2 | README 仍将仓库 OCR 描述为不能替代六图服务的单图预览 |
| [DOC-02](#doc-02) | P2 | 媒体备份示例头像目录与原生部署默认及约束不一致 |

## CI、依赖、供应链与发布门禁

<a id="ci-01"></a>

### CI-01｜HTTPS WebKit 回归真实失败，根因尚未闭合

- 状态：**确认失败；根因待验证**。优先级：**P1**。
- 证据：[测试第 86 行捕获 pageerror](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/tests/e2e/ci-auth-resource-regression.mjs#L86)、[第 176 行要求未处理错误为空](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/tests/e2e/ci-auth-resource-regression.mjs#L176)、上表两个 validate Job。
- 观察：Node 24 报 “/localhost:8443/api/resources/leases due to access control checks.”；Node 26 另有 roles、heroes。两个 Chromium profiles 已完成登录、刷新、租约恢复、退出、重新登录、sessionVersion 撤销和丢 Cookie 用例。
- 影响：当前 WebKit/Safari 路径存在浏览器可见的未处理请求异常，阻断主线 CI；不能宣称三端全部通过。
- 不能据此下结论：仅凭 WebKit 的错误短语，不能确定是生产 CORS 漏洞、服务端权限绕过、Cookie 未保存或 iPhone 完全不能登录。需要具体请求时序、重定向、网络失败原因和页面生命周期证据。
- 修复步骤：先记录 requestfailed、response 状态与重定向链、Origin/Referer、浏览器 pageerror 堆栈、路由切换和 AbortController 时序；检查租约/用户数据请求在退出、刷新、卸载后的取消与异常处理；确认反向代理及 PUBLIC_ORIGIN 一致；对已复现的原因修复，保留安全边界断言。
- 验收：在隔离 CI 测试库中分别运行 E2E_PROJECTS=webkit-iphone npm run test:e2e:proxy 与完整 npm run test:e2e:proxy；Node 24/26 都通过；再运行 Local HTTP；保留至少一次完整 trace 和三个 profile 的结果。不得删除 pageerror 断言、禁用 WebKit、忽略整类 access-control 错误或仅延长等待时间来宣称修复。

<a id="ci-02"></a>

### CI-02｜容器首次启动就绪失败，当前镜像未达到部署验收

- 状态：**确认失败；完整根因待验证**。优先级：**P1**。
- 证据：[容器工作流启动步骤](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/.github/workflows/ci.yml#L104)、[containers Job](https://github.com/YunHe-Rocky/wzywt/actions/runs/39029809865/job/117387834458)；日志原文 “application not healthy after 3m0s”。
- 已知行为：Web/Cron 在迁移开始后的失败路径被停止，数据库/Redis 保留；日志给出备份目录及“先核对 migration 状态再恢复”的提示。这是保护行为，不应移除。
- 高可信代码候选：runtime-env 指定 AVATAR_DIR=/app/data/media/avatars，而 storage-init 只创建 media 根及英雄目录；健康检查要求头像目录存在。见 [runtime-env 第 6 行](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/docker/runtime-env.mjs#L6)、[init-storage 第 7 行](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/docker/init-storage.mjs#L7)、[health 第 103 行](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/app/api/health/route.ts#L103)。独立的初始化缺陷见 DEP-01；本条记录当前 CI 失败现象。
- 边界：现有 CI 日志没有保留 Web /api/health 的逐项结果，不能声称此候选是该次失败唯一根因。
- 修复步骤：先补保密的就绪诊断；在一次性 CI Docker 环境复现空卷首启，按检查项定位 database/media/avatars/cron/redis/releaseId；修复实际原因，保留迁移后 fail-closed 与持久卷。
- 验收：空卷首启、原卷再次启动、更新三种情景均成功；Web 和 Cron healthy；desktop/mobile smoke 与共享图片动态可见性步骤实际执行并通过；migration 保持只执行未应用项；失败演练保留数据与备份。禁止在目标生产环境通过清卷“修好”失败。

<a id="ci-03"></a>

### CI-03｜CI 与 npm run check 清单漂移，七组既有门槛没有接入工作流

- 状态：**确认**。优先级：**P1**（鉴权、写栅栏、草稿等关键回归）。
- 证据：[package.json 的 check 定义](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/package.json#L59) 与 [ci.yml 手工清单](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/.github/workflows/ci.yml#L51)；核对了 test:entry 和 test:deploy 的下级调用，未发现它们间接调用下列脚本。
- 漏项：test:release、test:governor、test:task-fence、test:api-use-cases、test:match-draft、test:match-visibility、test:mobile-routes。
- 触发/影响：开发者新增或维护这些测试后，PR 的 CI 仍可能通过而缺少资源回收、停止写入、用例权限、草稿冲突、比赛可见性、移动页面对等与版本登记校验。
- 修复：建立一份权威测试集合供 CI 与本地 check 共用；区分必须数据库/服务的步骤和纯测试，避免盲目重复运行所有命令。现有 npm run check 本身不含 lint/build/integration，不要直接用它替换整个 validate Job。
- 验收：CI 日志显示七组测试实际运行；故意使其中任意一组的真实断言失败时，应阻断对应 Job；本地 check 与 CI 清单的覆盖差异有自动核验或明确记录。

<a id="ci-04"></a>

### CI-04｜HTTPS 与 HTTP 回归串行依赖，前一失败遮蔽后续验收

- 状态：**确认**。优先级：**P2**。
- 证据：[ci.yml 第 89–92 行](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/.github/workflows/ci.yml#L89)；两个 validate Job 的 Local HTTP 步骤均为 skipped。
- 进一步遮蔽：[代理运行器第 132–137 行](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/tests/e2e/run-proxy-regression.mjs#L132)顺序执行认证、登录过渡、房间资料、归档、战术图层、更新记录；第一个脚本失败后，同一运行器后续用例也未执行。
- 影响：一次失败无法判断 HTTPS/HTTP 哪些路径健康，移动/房间功能的未执行容易被误写为通过。
- 修复：按 deployment mode/浏览器/功能合理拆 Job 或测试套件，各自保证清理和数据库隔离；保留最终聚合失败状态，不能简单 continue-on-error。可优先把 local 与 proxy 独立，避免因同端口并发产生新冲突。
- 验收：有意让 HTTPS 用例失败时，独立 Local HTTP 用例仍实际执行；所有失败都被聚合门禁阻断；报告明确 pass/fail/skipped。

<a id="ci-05"></a>

### CI-05｜失败诊断不足，现有工作流没有保存可回溯的浏览器与健康检查证据

- 状态：**确认**。优先级：**P1**（直接影响当前失败定位）。
- 证据：[proxy runner 第 82 行关闭 Nginx access log](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/tests/e2e/run-proxy-regression.mjs#L82)、[第 138–162 行仅打印日志尾部后删除临时目录](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/tests/e2e/run-proxy-regression.mjs#L138)；[CI 容器诊断仅 status 与 docker logs](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/.github/workflows/ci.yml#L118)；[healthcheck 第 23 行吞掉异常](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/docker/healthcheck.mjs#L23)。
- 影响：测试结束后临时日志和浏览器证据消失；容器健康检查 stdout 本身又为空，仅增加 docker inspect 仍可能无法判断哪个 check 失败。
- 修复：失败时导出脱敏 Playwright trace、screenshot、console/pageerror/requestfailed 事件、代理 access/error 与 Next 日志；保存容器 State.Health、退出状态、已脱敏逐项 readiness 与 releaseId；在应用保护性停止之前捕获诊断，工作流退出前上传 artifact。不得上传 .env、Cookie、Authorization、真实 Session Secret、完整连接串或未脱敏 docker inspect Config.Env。
- 验收：人为制造一个头像目录缺失和一个浏览器网络失败，下载 CI artifacts 后无需重跑即可看到具体失败检查项/请求时序；成功运行与失败运行均不泄密；原故障仍使 Job 非零退出。

<a id="ci-06"></a>

### CI-06｜Python OCR 服务核心测试和跨语言合同没有进入 CI

- 状态：**确认覆盖缺口**。优先级：**P1**（启用 OCR 时）。
- 证据：工作流没有 setup-python、Python 服务单测或 OCR 真实样本调用；已有 [test_ocr.py 第 53 行及 132 行](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/services/ocr/test_ocr.py#L53)、[test_samples.py](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/services/ocr/test_samples.py#L1)、[test_daemon.py](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/services/ocr/test_daemon.py#L1)、[test-ocr-contract.mjs](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/scripts/test-ocr-contract.mjs#L1)、[test-ocr-samples.py](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/scripts/test-ocr-samples.py#L1)。
- 避免误报：test:deploy 已运行 OCR 配置测试及 test-ocr-python.sh；后者明确使用模拟解释器，不安装 Python/模型。不能写“仓库没有 OCR 测试”或“CI 完全不检查 OCR”。
- 风险：FastAPI multipart、Token 鉴权、像素/批量限制、解析器、人工确认标志、字段零值、Python→TypeScript 数据合同变更不受主线实际执行门禁保护。
- 修复：加入独立轻量 Python HTTP/parser/daemon 单测 Job；安装明确的测试依赖（TestClient 还需要 httpx，daemon 测试所需依赖应查明锁定）；执行已有跨语言合同；真实模型六图样本放定时/发布前或相关路径变更 Job，保留识别证据。
- 验收：python -m unittest discover -s services/ocr -p 'test_*.py' 通过；OCR_TEST_PYTHON 指向同一测试解释器后运行 node --import tsx scripts/test-ocr-contract.mjs 通过；至少一个模型 Job 实际运行 scripts/test-ocr-samples.py，记录六页 10 人和独立转录统计的比较结果。纯 parser fixture 通过不能冒充模型准确率或现场所有截图验收。

<a id="ci-07"></a>

### CI-07｜12 个 Compose 模型不是 12 种可用部署，外部服务/OSS/OCR 运行证据仍缺

- 状态：**确认验收缺口；真实环境结果待验证**。优先级：**P2**；上线使用对应模式前升为 **P1**。
- 证据：[test-compose-model.mjs 第 12 行明确无 daemon/不启动容器](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/scripts/test-compose-model.mjs#L12)、[第 29 行开始 2×3×2 模型组合](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/scripts/test-compose-model.mjs#L29)、[ci.yml 容器 Job 只初始化默认配置并 up](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/.github/workflows/ci.yml#L104)。
- 缺少的实际验证：external MySQL 的网络/权限/备份；external OCR 的 Token 与真实识别；OCR 容器构建、模型、容量；rclone/FUSE 的实际 uid 读写、断挂拒写、远端落盘与恢复。
- 修复：新增受控服务集成矩阵或可复跑部署验收脚本；无需每个 PR 跑昂贵真实 OSS，但发布前/变更对应功能时需要有结果、环境和证据。把 config 模型测试、容器 smoke、外部连接、真实远端文件校验分开标记。
- 验收：外部模式只连接不管理现有服务；只读/错误凭据清楚失败；OCR 全流程产生待人工确认结果；rclone 断挂不回落本地；远端列表/内容校验和备份恢复成功，不能只依据本地 tar/manifest 完成标志。

<a id="ci-08"></a>

### CI-08｜MySQL 兼容矩阵只证明新库迁移与现有集成用例，未证明版本升级及恢复

- 状态：**确认覆盖边界；潜在风险**。优先级：**P2**。
- 证据：[database-compatibility 新建服务与空库](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/.github/workflows/ci.yml#L138)、[仅 migrate deploy + integration](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/.github/workflows/ci.yml#L163)。
- 触发/影响：旧版本真实数据含重复值、较大表、字符集差异、历史迁移状态时，新 migration/约束/索引可能失败或阻塞；通过空库矩阵不能得出生产升级安全或备份可恢复。
- 修复：构造上一发布版本 schema 的脱敏代表性 fixture，再升级到候选提交；演练数据库与媒体的一致备份、恢复到隔离实例以及失败状态保留。禁止改写已应用 migration。
- 验收：MySQL 8.0/8.4 分别验证旧版本→候选版本、备份→全新实例恢复；核对记录数、关键外键、权限、上传媒体引用；报告迁移耗时/锁定与 RPO/RTO 实测，不虚构“零丢失”。

<a id="depend-01"></a>

### DEPEND-01｜已有依赖审计失败尚未在锁文件中消除，必须复扫再定当前影响

- 状态：**确认历史审计失败且受影响锁定版本仍在；当前公告/可达性待验证**。优先级：**P1**。
- 证据：[2026-10-12 production audit run](https://github.com/YunHe-Rocky/wzywt/actions/runs/38240158264/job/114780481565)失败；日志生产筛选为 5 vulnerabilities（1 moderate、4 high）。其中涉及 Next、sharp、source-map-js、undici 及 cheerio 的依赖传播；计数不是五个独立可远程利用入口。
- 当前锁文件：[next 15.5.25 第 5662 行](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/package-lock.json#L5662)、[sharp 0.35.4 第 6869 行](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/package-lock.json#L6869)、[source-map-js 1.2.1 第 7031 行](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/package-lock.json#L7031)、[undici 7.29.0 第 7659 行](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/package-lock.json#L7659)。package.json overrides 固定 sharp/undici，升级时必须一起检查。
- 当前 2026-10-17 npm ci 日志仍显示 19 vulnerabilities（4 moderate、13 high、2 critical），这是含开发依赖的安装总数，不能写成“生产系统存在 2 个可利用严重漏洞”。此次未运行 10-18 新审计。
- 历史报告给出的方向：Next 自托管 SSG/ISR 缓存污染；sharp 的 librsvg 依赖；source-map-js 事件循环 DoS；undici 的若干 DoS/TLS/cache 情景。是否暴露于应用实际路由和调用链，需要逐项确认。
- 修复：先在隔离 checkout 上生成 npm audit --omit=dev --json 和完整 npm audit --json，保存时间、锁文件 SHA、公告 ID、直接/传递依赖和可达路径；依据当前官方公告选择兼容修复版本，更新 overrides 与锁文件；不要直接 npm audit fix --force。重新验证 Next 构建、图片路径、爬虫/OCR HTTP、浏览器认证、两版 Node 和容器。
- 验收：生产高危/严重报告清零，或每个暂缓项有明确适用条件、补偿控制、负责人和到期日；不得仅将阈值改 critical/忽略失败；新审计报告与实际最终镜像的依赖清单对应。

<a id="depend-02"></a>

### DEPEND-02｜依赖审计只每周/手动执行，且范围未覆盖实际镜像所有安装内容

- 状态：**确认**。优先级：**P1**。
- 证据：[dependency-audit.yml 仅 schedule/workflow_dispatch](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/.github/workflows/dependency-audit.yml#L3)、[audit:prod 仅 omit=dev](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/package.json#L58)、[Dockerfile 第 13 行安装 dev，第 29 行整个 node_modules 进入 runtime](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/Dockerfile#L13)。
- 避免误报：保留 tsx/Prisma 是 Cron 与迁移的现有运行要求，不能简单 npm prune --omit=dev 破坏服务；“安装在镜像里”也不等于一定有网络可利用路径。
- 影响：PR 新增的高危依赖可在下次周审计前进入 main；生产筛选遗漏镜像中携带的开发工具；Python/OS 包没有此 npm 审计覆盖。
- 修复：依赖相关 PR 与发布候选运行生产审计并纳入必需状态；每周扫未变动依赖新公告；对最终 Web/Cron/迁移/OCR 镜像分别生成 SBOM/镜像扫描；合理拆分实际运行依赖与测试构建工具，或保留统一镜像但按完整内容审查。
- 验收：引入已知高危依赖的测试 PR 会被门禁阻断；报告区分生产 JS、镜像内工具、Python、OS；精简镜像后 Cron 与迁移仍通过实机容器验收。

<a id="gov-01"></a>

### GOV-01｜当前 main 没有可见的必需 CI 分支门禁

- 状态：**确认 GitHub API 当前可见配置**。优先级：**P1**。
- 证据：2026-10-18 读取 [branches/main](https://api.github.com/repos/YunHe-Rocky/wzywt/branches/main) 返回 protected=false、protection.enabled=false、required_status_checks.enforcement_level=off、contexts/checks=[]；[rulesets](https://api.github.com/repos/YunHe-Rocky/wzywt/rulesets) 返回 []。
- 影响：代码检查即便失败，现有仓库可见规则也没有要求合并前必须成功；当前 main 的实际失败证明“最新代码”等同“已验收”是不成立的。不能由此推断有人绕过流程或生产已经发布失败版本。
- 修复：在修复现有红灯后设置受保护主分支/规则集，要求 review 与关键 CI/生产依赖审计成功；配置谁可 bypass 及紧急流程；部署工具选择已验收 SHA，而不是无条件追随任意 main。仓库设置变更属于后续另行授权的操作，此审计不修改。
- 验收：受控测试 PR 只要 validate、containers、database-compatibility 或生产审计任一失败即不能合并；规则 API/UI 可核实；管理员紧急 bypass 有记录。

<a id="gov-02"></a>

### GOV-02｜版本登记、当前主线与可交付构件身份尚未形成完整可验证发布记录

- 状态：**确认现状；流程风险**。优先级：**P2**。
- 证据：[releases.json](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/docs/releases/releases.json#L5)已建立 v1.0.0（2026-09-07）登记，sourceRange 截止 2db40d8...；当前主线为 10-17 新提交；[GitHub Releases API](https://api.github.com/repos/YunHe-Rocky/wzywt/releases)返回 []。标签列表接口在此次插件中不支持，未确认 v1.0.0 Git tag 是否存在，不能断言缺 tag。
- 影响：若运维只按 package version=1.0.0 或 main 描述安装，可能无法准确关联源码、镜像、migration、CI run 和回退兼容范围。
- 避免误报：主线开发提交不要求每次 bump version；没有 GitHub Release 不等于没有版本制度。APP_RELEASE_ID 与候选 SHA 的现有健康核对机制应保留。
- 修复：发布时输出版本/源码 SHA/不可变镜像 digest/锁文件摘要/CI run/迁移集合/部署参数模板/备份恢复说明/已知限制；版本登记同步实际发布范围，发布前执行已有 test:release。
- 验收：从正在运行的 releaseId 能唯一追溯到源码与构件；相同发布标识不重复指向不同内容；回退前明确数据库兼容性；发布记录不能把失败 CI 写成已通过。

<a id="supply-01"></a>

### SUPPLY-01｜构建输入部分可变，跨时间重建不完全可复现

- 状态：**确认配置；潜在供应链/可复现性风险**。优先级：**P2/P3**。
- 证据：[Node 基础镜像 node:24-bookworm-slim](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/Dockerfile#L2)、[Python 基础镜像与 pip 安装](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/services/ocr/Dockerfile#L2)、[Compose MySQL/Redis 标签](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/compose.yaml#L42)、[Actions 使用 @v4 标签](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/.github/workflows/ci.yml#L42)。
- 影响：npm lock 已锁 JS 包，但基础镜像、apt 元数据/包、Python 传递依赖和第三方 Action 内容可以在相同源码 SHA 下变化；不能把“有 package-lock”写成完整可复现供应链，也不能把可变标签直接等同已被入侵。
- 修复：正式发布固定镜像 digest 和 Actions commit SHA，保留可审查更新策略；Python 为目标平台产出传递依赖/哈希锁及模型来源/摘要；输出 SBOM、基础镜像与构建输入清单。apt 等输入的严格锁定按发布要求分级，避免僵化到不接收安全更新。
- 验收：发布 manifest 能列出全部镜像 digest、Action SHA、Python 锁/模型摘要；干净环境可重建功能等价构件并解释差异；依赖更新走完整安全与兼容验证。

## 认证、授权、媒体与 OCR

<a id="sec-01"></a>

### SEC-01｜修改密码绕过统一的 72 字节上限，设置成功后正常登录被拒绝

- **状态 / 优先级：已确认的输入契约缺陷，P1。**
- **证据：** [change-password/route.ts L43-L55](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/app/api/auth/change-password/route.ts#L43)只检查 `newPassword.length < 11`，随后直接哈希；[login/route.ts L21](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/app/api/auth/login/route.ts#L21)调用 `passwordValidationError(password, 1)`；[auth/model.ts L12-L15](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/features/auth/model.ts#L12)拒绝 UTF-8 超过 72 字节；[auth.ts L28-L29](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/lib/auth.ts#L28)没有额外验证。
- **触发 / 影响：** 已登录用户提供正确安全答案，通过接口设置例如 25 个常见汉字组成的密码（75 UTF-8 字节，且字符数大于 11）。修改入口会接受该密码，但下次使用原样密码登录会被明确拒绝；也存在 bcrypt 长输入截断与用户预期不一致的问题。不是已经观察到的线上锁号事件。
- **修复：** 改密、注册、重置全部调用同一密码校验函数；验证成功后才执行哈希和数据库写入。对可能已经存在的超长密码问题，提供正常重置路径，不能擅自修改用户密码。
- **验收：** 对 ASCII 72/73 字节、中文跨 72 字节、11 字符边界分别做接口测试；不合法请求必须 400 且密码、sessionVersion 均不变；合法新密码可重新登录、旧密码失效。

<a id="sec-02"></a>

### SEC-02｜修改安全问题的输入校验弱于注册和重置，能保存无法正常用于找回的答案

- **状态 / 优先级：已确认，P1（账户恢复可用性）。**
- **证据：** [security-question/route.ts L54-L76](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/app/api/auth/security-question/route.ts#L54)检查原始字符串是否非空，随后只对答案 `trim()` 再哈希，自定义问题只有最小长度；[auth/model.ts L18-L21](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/features/auth/model.ts#L18)在重置路径拒绝空白及超过 72 字节的答案；[register.ts L34-L44](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/features/auth/server/register.ts#L34)已经实行答案上限及自定义问题 2–255 字符规则。
- **触发 / 影响：** 安全答案为纯空格会通过前置非空检查并保存空字符串的哈希，但找回入口无法提交有效答案；超过 72 字节答案也与找回入口不兼容；超长自定义问题可能落到数据库列长度错误，成为 500，而不是可理解的 400。
- **修复：** 提取并复用完整安全问题解析器，先 trim 再判空，统一 UTF-8 长度、问题长度和预设题规则；不把数据库错误当输入校验。
- **验收：** 空白、73 字节答案、256 字符自定义问题均返回 400 且旧问题/答案不变；正常修改后能通过真正的找回流程。

<a id="sec-03"></a>

### SEC-03｜改密码或改安全问题只撤销 Session，没有撤销已经签发的密码重置凭证

- **状态 / 优先级：已确认的撤销缺口，P1；滥用前提是对方已持有尚未过期的重置凭证。**
- **证据：** [auth-rate-limit.ts L122-L132](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/lib/auth-rate-limit.ts#L122)签发 10 分钟有效的数据库 token；[change-password/route.ts L55-L65](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/app/api/auth/change-password/route.ts#L55)及 [security-question/route.ts L72-L84](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/app/api/auth/security-question/route.ts#L72)仅更新账户和 sessionVersion；[reset-password/route.ts L95-L105](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/app/api/auth/reset-password/route.ts#L95)消费 token 时只检查存在、有效期及用户状态，不与签发时的凭证版本绑定。
- **触发 / 影响：** 先签发 token A，随后账户持有人改密码或改安全答案，A 在有效期内仍能再次重置密码。用户以为完成安全恢复，旧恢复凭证仍有效。
- **修复：** 在同一事务内更新账户凭证、提升凭证版本、撤销该用户所有未消费 token；或 token 保存签发时凭证版本并在消费时原子校验。正常重复签发也要保持明确的单一有效 token 语义。
- **验收：** “签发 A → 改密码 → 使用 A”、“签发 A → 改答案 → 使用 A”均失败且不改变新密码；两个并发 token 消费最多成功一次；新增操作不得破坏现有一次性 token 事务。

<a id="sec-04"></a>

### SEC-04｜修改恢复凭据无需再次验证已有秘密，已登录的安全答案验证入口没有独立尝试次数限制

- **状态 / 优先级：已确认控制缺口，P2；并非未登录任意接管。**
- **证据：** [security-question/route.ts L43-L76](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/app/api/auth/security-question/route.ts#L43)只要求现有登录态即可覆盖恢复答案；[change-password/route.ts L22-L40](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/app/api/auth/change-password/route.ts#L22)含 `verifyOnly` 答案验证但不调用认证尝试限流；[auth/me/route.ts L74-L90](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/app/api/auth/me/route.ts#L74)注销账户前的答案验证也是如此。全局 `withRequestCapacity` 保护并发资源，并不等同按账户统计失败尝试。
- **触发 / 影响：** 拿到解锁设备或有效会话的人可以先替换恢复答案，再改密或注销账户；或者通过已登录的 verifyOnly 接口持续猜答案，绕开匿名找回入口已有的 5 次/窗口限制。该问题需要有效会话这一前提。
- **修复：** 对改安全问题、改密、注销账户统一敏感操作策略：验证当前密码/最近一次重新认证，服务端绑定动作与账户、短时有效；答案验证入口统一账户及可信 IP 限流。不能把前端两步弹窗视作服务端授权凭证。
- **验收：** 仅有 Cookie、没有正确当前凭据不能替换恢复信息；连续错误触发 429；验证结果不能跨账户、跨动作重用；合法操作仍按现有 sessionVersion 机制撤销其他设备会话。

<a id="sec-05"></a>

### SEC-05｜生产 HTTPS 配置允许显式关闭 Cookie Secure

- **状态 / 优先级：已确认的危险配置组合，P1；默认配置并非关闭 Secure。**
- **证据：** [session-config.ts L10-L18](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/lib/session-config.ts#L10)在生产路径接受 `SESSION_COOKIE_SECURE=0`；[public-origin.ts L67-L82](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/lib/public-origin.ts#L67)仅对 local 模式强制覆盖值与协议一致。
- **触发 / 影响：** `DEPLOY_ENVIRONMENT=production`、HTTPS `PUBLIC_ORIGIN` 与 `SESSION_COOKIE_SECURE=0` 共存，浏览器收到不带 Secure 的会话 Cookie。实际是否会经 HTTP 发送还取决于 HTTP 入口/HSTS/浏览器状态，不能声称当前站点已泄漏。
- **修复 / 验收：** 生产模式强制 Secure，错误组合启动前失败；local HTTP/LAN 的既有合法使用保持可配置。测试生产 HTTPS + 0 拒绝、生产 HTTPS 默认/1 成功、local HTTP 自动非 Secure、local HTTPS Secure。

<a id="sec-06"></a>

### SEC-06｜真实 IP 信任模型与直连 LAN 部署模式不一致

- **状态 / 优先级：已确认的条件性风险，P2；生产只经正确 Nginx 转发时不构成同样风险。**
- **证据：** [auth-rate-limit.ts L21-L31](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/lib/auth-rate-limit.ts#L21)无条件读取 `X-Real-IP`，注释假定应用只绑定 loopback 并由唯一 Nginx 覆盖此头；同文件 L76-L90 用该值统计登录、注册 IP 限额。仓库部署方案同时支持直接访问 `0.0.0.0:8001` 的 LAN 模式。
- **触发 / 影响：** 直连请求没有该头时不同用户合并为 `unknown`、共享限额；能直接到应用端口的客户端又可自行提供合法格式的 `X-Real-IP`，规避 IP 维度的限制。用户名维度的登录/重置限额仍存在，不能写成“完全没有限流”。
- **修复：** 明确可信代理拓扑，只从受信代理接收覆盖后的 IP；直连模式使用可靠连接来源，或者也通过一个受控入口。Next Request 本身无法可靠识别 socket 地址时，不应假装任意转发头可信。
- **验收：** 直连伪造头不改变来源身份；通过可信代理能区分两台 LAN 客户端；无头请求不会让所有正常用户共用一个可轻易耗尽的桶。

<a id="sec-07"></a>

### SEC-07｜公开安全问题查询可枚举账户且缺少专门限流

- **状态 / 优先级：已确认，P2。**
- **证据：** [security-question/route.ts L21-L40](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/app/api/auth/security-question/route.ts#L21)未登录查询按“不存在 404 / 未设置 400 / 返回问题 200”区分，未调用认证限流。
- **触发 / 影响：** 批量查询用户名可识别存在账户及其恢复问题，辅助定向猜测。注册“用户名已被占用”也具有部分枚举能力，因此应制定一致策略，而不是声称修一个 GET 就完全消除枚举。这里只返回问题，不返回答案或哈希。
- **修复 / 验收：** 统一恢复流程对外错误、添加来源与目标限流、限制用户名长度和日志内容；若保留公开问题展示，明确其隐私取舍并减少信息差。测不存在、禁用、删除、未设置和正常账户的响应差异及 429。

<a id="sec-08"></a>

### SEC-08｜战术板锁定检查与写入分离，可能在比赛正式提交后继续修改

- **状态 / 优先级：源码确认缺少原子状态条件；并发结果待隔离环境复现，P2。**
- **证据：** [tactics/service.ts L39-L62](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/features/tactics/server/service.ts#L39)读取比赛状态并判断 canDraw；L149-L168 修改/删除图层，L183-L215 保存/删除路线，L225-L262 创建/修改/删除标记的实际写条件仅约束对象、所有者和对象版本，没有比赛未提交条件，也未与状态检查放入共同的串行事务。与此相对，创建/初始化图层在 L107-L116、L138-L146 已在 Serializable 事务内重新检查状态。
- **触发 / 影响：** 请求 A 检查未提交后暂停；请求 B 正式提交比赛；A 随后执行写入，可能改变按产品承诺已只读的复盘战术。对象 revision 并不能解决比赛状态变化的问题。
- **修复：** 将读权限、比赛状态检查和所有相关写入纳入能与正式提交串行化的事务/锁协议；或使用数据库级状态条件及必要的父记录锁，不能仅在写前再增加一次非原子查询。
- **验收：** 使用可控并发屏障覆盖“先验证 → 另一事务提交 → 再写入”，所有路线/标记/图层修改与删除必须失败或在比赛提交前完成；提交成功后数据不能再变化；保留各用户只能编辑自己的轨迹这一现有边界。

<a id="sec-09"></a>

### SEC-09｜异议每小时 5 条限制是 count 后 create，存在并发穿透窗口

- **状态 / 优先级：源码确认非原子；实际并发待复现，P2。**
- **证据：** [records.ts L280-L290](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/features/matches/server/records.ts#L280)独立统计、检查，再独立插入。相比之下，评论的同类限制已经在 [combat-posts/service.ts L194-L206](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/features/combat-posts/server/service.ts#L194)中使用 Serializable 事务。
- **触发 / 影响：** 有效比赛访问者在当前 4 条时同时提交多个请求，多个请求可同时看到 4 后插入，制造额外审核负担。全局并发限制可能缩小窗口，但不保证每账户精确限额。
- **修复 / 验收：** 使用事务化计数或独立原子限流桶，并处理序列化冲突。对 20 个同账户并发异议请求，成功数量不得超过剩余额度，其他请求返回可识别的 429/冲突。

<a id="sec-10"></a>

### SEC-10｜媒体“每日上传配额”统计现存对象，截图替换会丢失历史上传量

- **状态 / 优先级：已确认实现与“每日上传量”语义不一致，P2；若产品只想限制当日仍占用的空间，应更名而不是声称限制上传总量。**
- **证据：** [quota.ts L92-L100](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/features/media/server/quota.ts#L92)从当前截图/未删除视频的 createdAt 与 size 累加日配额；[draft.ts L292-L315](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/features/matches/server/draft.ts#L292)替换同类截图用 upsert 更新原行，保留旧 createdAt、覆盖 size；[quota.ts L159-L161](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/features/media/server/quota.ts#L159)完成后删除预留记录，不保留用量账本。
- **触发 / 影响：** 不断替换同一截图只留下当前版本大小；替换前一天创建的截图，完成后当天用量甚至不会计入该行。可持续消耗上传带宽、OSS 写入与文件处理，而 512 MiB 日上限无法累计反映。总存储预留机制仍有效，不能称全部媒体配额失效。
- **修复：** 明确定义“存量”和“每日上传流量”两个指标；后者用事务化每日计数/不可变上传账本，替换/删除不倒减已使用流量，失败是否计费另外明确。
- **验收：** 同类型连续替换、跨午夜替换旧截图、不同上传人替换、删除视频后再上传、失败重试均符合明确策略；时区取 UTC 还是业务时区写入文档。

<a id="sec-11"></a>

### SEC-11｜过期媒体预留清理与业务消费之间缺少所有权移交，可能删除已经提交的文件

- **状态 / 优先级：源码确认竞态条件；未运行复现，P2。该窗口依赖预留临近/超过 TTL、请求停顿或故障恢复。**
- **证据：** [quota.ts L174-L185](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/features/media/server/quota.ts#L174)先读取过期预留列表，然后不重新声明清理所有权就先删除文件、再删除数据库预留；[quota.ts L152-L162](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/features/media/server/quota.ts#L152)业务消费 deleteMany 没有有效期条件。
- **触发 / 影响：** 清理进程选中某条过期预留后停顿，业务事务仍可删除该预留并提交引用该文件的截图/动态；清理继续使用旧快照删除文件，留下成功业务记录与缺失文件。不能把“使用 Serializable”作为此跨数据库/文件系统问题的完整保证。
- **修复：** 通过 CAS 将过期 RESERVED 改为独占 CLEANING 状态，只有获权者才删文件；业务消费必须要求 RESERVED 且未过期，清理失败可重试。业务与清理不能同时获得该文件所有权。清理前引用检查可做附加防护，但单独先查引用仍有竞态。
- **验收：** 给查询和文件删除之间加入可控屏障，覆盖清理/消费两种先后顺序、进程中断和重启；已提交对象的文件始终存在，超时无主对象最终删除，失权消费者返回明确冲突。

<a id="sec-12"></a>

### SEC-12｜头像独立写入路径缺少像素验证、并发更新协议和失败清理可观察性

- **状态 / 优先级：已确认防护差异，P2；并发残留/坏链接结果待复现，不能宣称已存在任意文件执行。**
- **证据：** [avatar.ts L8-L33](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/features/profile/server/avatar.ts#L8)仅识别签名；[avatar/route.ts L28-L62](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/app/api/me/avatar/route.ts#L28)将表单值直接断言 File、使用 `userId_Date.now()` 命名、读取旧头像后写文件和覆盖数据库、忽略旧文件删除错误。未使用其他媒体的预留/清理队列。
- **触发 / 影响：** string 类型 avatar 可触发运行时错误；仅有魔数的损坏文件及很高像素低体积图片可以通过该入口；并发请求可能读取同一旧头像并各自提交新文件，落败者文件成为无引用残留。同毫秒文件名碰撞还需要定时测试确认其具体结果。2 MiB 字节限制、MIME 匹配与 basename 清理边界是存在的。
- **修复：** `instanceof File`；共享受限图像解析/像素检查；随机唯一键、临时文件原子发布、数据库头像 CAS；失败/替换清理进入可重试队列。头像是否纳入全局空间/频率限制明确决策。
- **验收：** 错误字段类型、损坏图片、高像素图片返回 4xx；同账户并发多次修改最终恰好一个有效头像，其他文件最终清理；故障注入覆盖写文件后 DB 失败、替换清理失败、同毫秒时间戳。

<a id="sec-13"></a>

### SEC-13｜Web 与 OCR 的图片像素上限不一致

- **状态 / 优先级：已确认跨服务契约缺陷，P2。**
- **证据：** [media-validation.ts L4-L7、L103-L108](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/lib/media-validation.ts#L4)允许截图至 4000 万像素、单边 8192；[services/ocr/app.py L20-L23、L49-L50](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/services/ocr/app.py#L20)拒绝超过 1200 万像素。
- **触发 / 影响：** 例如 6000×2800、文件小于 12 MiB 的有效图片可先成功上传，调用本仓库 OCR 时再失败。用户重复重试不能解决契约不一致。
- **修复 / 验收：** 上传前按当前 OCR 能力检查并给可理解提示；或明确在受限资源内缩放并保留原始证据/坐标映射。用刚低于/等于/刚高于 1200 万及 4000 万像素样本测试实际上传→排队→OCR→确认链路，不能只测文件字节数。

<a id="sec-14"></a>

### SEC-14｜OCR 能力和成功率仍依赖固定画面，health 的 fullMatchReady 不能替代实图验收

- **状态 / 优先级：已确认适配范围，P2 验证事项；不是“完全没实现六图 OCR”。**
- **证据：** [parser.py L13-L31、L60-L72、L88-L100](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/services/ocr/parser.py#L60)使用固定相对列、行及表头区域，宽高比 2.0–2.35、置信度 0.90；[app.py L152-L154](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/services/ocr/app.py#L152)声明 fullMatchReady/requiresConfirmation。该健康返回表示协议功能，不证明某台手机/新游戏 UI 的识别正确率。
- **风险 / 影响：** 游戏版本、手机比例、UI 缩放、局部裁剪、昵称重叠和低清截图会改变结果。误识别需要依赖现有一致性检查与人工确认阻止进入正式档案。
- **修复 / 验收：** 建立经授权且去标识的真实六图样本库，按设备、分辨率、游戏版本统计字段准确率、未知率、整场拒绝率与延迟；错误必须保持 unknown/失败，不能补猜。保留固定版式适配边界和人工确认。Python 测试与 CI 覆盖缺口见 CI-06。

<a id="sec-15"></a>

### SEC-15｜战术图层/标记缺少数量上限，读取时一次加载全部

- **状态 / 优先级：已确认持久化数量无显式上限，P2 容量风险；实际阈值需压测。**
- **证据：** [tactics/service.ts L68-L77](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/features/tactics/server/service.ts#L68)全量加载 layers/routes/markers；L125-L146 创建图层只计算 sortOrder、没有数量配额；L225-L232 创建标记没有按用户/图层/比赛限量。单条文本和路线点数已有边界。
- **触发 / 影响：** 有权限的参赛者持续创建大量图层/标记，累计数据库数据与前端渲染成本。全局请求容量限制控制并发，不能限制长期累计对象数。
- **修复 / 验收：** 明确每比赛/图层/用户上限和去重/归档策略，原子校验配额；读取按合理范围/分页或按层加载。压测上限附近的响应大小、查询和浏览器绘制，超额返回 4xx 且普通协作不受影响。

## 部署、数据、存储与运行

<a id="dep-01"></a>

### DEP-01｜全新存储卷没有初始化 avatars 子目录，Web readiness 会拒绝就绪

- **状态**：已确认静态实现缺陷；未在本次启动真实容器复现。
- **优先级**：P1。
- **代码证据**：[docker/runtime-env.mjs:3-7](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/docker/runtime-env.mjs#L3)；[docker/init-storage.mjs:7-18](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/docker/init-storage.mjs#L7)；[Dockerfile:39-40](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/Dockerfile#L39)；[scripts/compose-storage.mjs:110-117](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/scripts/compose-storage.mjs#L110)；[src/features/profile/server/avatar-storage.ts:13-23](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/features/profile/server/avatar-storage.ts#L13)；[src/app/api/health/route.ts:102-104](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/app/api/health/route.ts#L102)；[src/app/api/health/route.ts:127-141](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/app/api/health/route.ts#L127)。
- **原因/链路**：Docker 将 AVATAR_DIR 固定为 /app/data/media/avatars；storage-init、镜像构建与 rclone prepare 只创建 media 根目录及英雄目录。readiness 对 avatars 执行 stat/access，目录不存在即 failed。ensureAvatarDirectory 会创建它，但启动链未调用；该函数由头像业务使用。
- **触发与影响**：首次部署空命名卷或全新 OSS 目录时，即使 MySQL/Redis/Cron 正常，Web 仍可能持续 503，Compose --wait 失败。现有卷已包含 avatars 时不触发；原生 deploy.sh:634 明确创建 avatars，不能把它也判成同一缺陷。当前 CI Web unhealthy 与此一致，但其日志没有保存分项健康响应，所以不能把此项直接宣布为 CI 唯一根因。
- **修复方向**：让存储初始化统一覆盖实际应用所需目录，包括 avatars；保留普通卷 uid/gid 1000 权限及 rclone 不执行 chown/chmod 的边界。不要用删除 avatar 健康检查来绕过。
- **验收标准**：空命名卷与空 rclone 业务目录分别启动，确认 avatars 已存在、真实应用 UID 可读写/rename，/api/health 的 avatarStorage=ok；只读/权限错误仍阻断。使用新的隔离项目和新卷，不删除现场卷。

<a id="dep-02"></a>

### DEP-02｜原生 PM2 的迁移兼容和必要停写只由文档约束，脚本不强制核验

- **状态**：已确认执行顺序与前置条件门禁缺口；影响依赖实际 migration 与运行负载。
- **优先级**：P1（含不兼容 DDL 的发布）。
- **代码证据**：[scripts/deploy.sh:675-699](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/scripts/deploy.sh#L675)；[scripts/deploy.sh:883-891](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/scripts/deploy.sh#L883)；[scripts/compose.mjs:261-302](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/scripts/compose.mjs#L261)。
- **原因/链路**：PM2 路线 build 后直接 db-backup、prisma migrate deploy，直到后面的 atomic_switch/reload 才切进程；不存在 Compose 路线的 stop writers 阶段。仓库已在 [docs/operations/recovery-and-release.md:9-16](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/docs/operations/recovery-and-release.md#L9) 明确规定普通发布仅接受 expand/contract，破坏性变更必须单独维护窗口，说明停写方式、负责人和恢复命令。因此问题是脚本未核验这项安全前置条件，不能写成所有 PM2 迁移都错误或都必须停写。
- **触发与影响**：需要锁表、重建约束、删除/改名字段的 migration 与旧代码并发，可能使旧请求失败或写入不符合新模型。迁移失败时旧服务也可能继续访问部分变化的 schema。本次最新两个提交未改 schema，并不证明所有未来 migration 安全。
- **修复方向**：明确选择“停写发布”或经过验证的 expand/contract 在线迁移。停写方案需要排空 Web 请求和 Cron、记录原运行状态、禁止 watchdog 把有意停机重启；迁移开始后失败应保持写入关闭，保留诊断。
- **验收标准**：以隔离库测试持续业务写入和耗时 Cron；迁移前确认写入停止，迁移失败后旧写入不自动恢复；若采用在线模式，必须有旧/新两版客户端并发兼容测试。

<a id="dep-03"></a>

### DEP-03｜原生 PM2 自动发布备份仅覆盖 SQL，没有匹配的媒体/头像备份

- **状态**：已确认自动备份覆盖范围；不代表现场没有额外备份。
- **优先级**：P1（灾备完整性）/P2（日常改进）。
- **代码证据**：[scripts/deploy.sh:678-679](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/scripts/deploy.sh#L678)；[scripts/db-backup.mjs:43-65](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/scripts/db-backup.mjs#L43)；[scripts/deploy.sh:351-357](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/scripts/deploy.sh#L351)；[scripts/compose.mjs:284-296](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/scripts/compose.mjs#L284)。
- **原因/链路**：deploy.sh 只调用 db-backup.mjs；该脚本只有 mysqldump。持久化 shared/media、avatars 不在这份自动发布备份中。Compose 则同时生成 SQL、media.tar.gz 与 hero-assets.tar.gz。另有 [docs/operations/media-operations.md:38-57](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/docs/operations/media-operations.md#L38) 和 media-backup.sh，支持独立媒体/头像归档、manifest、SHA256SUMS；缺口是 PM2 发布未绑定或校验同一恢复点的媒体备份，不能宣称仓库没有媒体备份能力。
- **触发与影响**：只依靠 PM2 发布生成的 SQL 回到旧时点，可能恢复出引用已删除、被替换或尚未备份媒体的记录；服务器/磁盘丢失后不能仅凭 SQL 恢复图片和视频。shared 持久化防止发布覆盖，不等于历史备份。
- **修复方向**：为原生部署增加与 SQL 同一停写窗口的媒体、头像、爬虫资源备份及 manifest；或明确定义并校验外部快照/版本化备份契约。保留 env/凭据在独立私密位置。
- **验收标准**：在独立实例恢复一个带头像、比赛截图、视频、英雄资源的备份集，核对引用、文件哈希及 Range 播放；记录备份集时间、源码版本、schema 和 RPO/RTO。

<a id="dep-04"></a>

### DEP-04｜PM2 在迁移后激活失败会自动回到旧程序，未验证旧程序是否兼容新 schema

- **状态**：已确认恢复路径；条件风险。
- **优先级**：P1（不向后兼容 migration）。
- **代码证据**：[scripts/deploy.sh:681-699](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/scripts/deploy.sh#L681)；[scripts/deploy.sh:813-828](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/scripts/deploy.sh#L813)；[scripts/deploy.sh:885-891](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/scripts/deploy.sh#L885)；[docs/operations/recovery-and-release.md:7-16](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/docs/operations/recovery-and-release.md#L7)；[docs/operations/recovery-and-release.md:49-52](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/docs/operations/recovery-and-release.md#L49)。
- **原因/链路**：migration 成功后，PM2、health、公开入口或 pm2 save 失败都会调用 rollback_release；它原子切换旧 release 并 reload，再用通用健康检查判断成功，没有 schema 兼容标记/业务探针门禁。文档已规定旧 release 必须兼容新 schema，并写明不兼容时保持维护状态；在这项前提成立时应用自动回切是合理设计。此项仅指出自动执行层没有证明该前提，不能说任何应用回切都会破坏数据库。
- **触发与影响**：SELECT 1 与 Cron 心跳正常并不能证明旧业务查询兼容新 schema；因此“旧程序恢复 healthy”不能等价于业务恢复。脚本正确地不自动导入旧 SQL，但程序回退本身也需要兼容判定。
- **修复方向**：将“迁移前失败可恢复旧进程”和“迁移已开始需判断兼容”拆成明确状态；通过 migration compatibility manifest 或 expand/contract 契约允许已证明兼容的回切，否则保持停写、提示向前修复/人工恢复。
- **验收标准**：用删除旧代码必需字段的测试 migration 注入激活失败，验证不会把旧程序自动当成功恢复；兼容新增字段迁移应可受控回切，并执行实际业务读写探针。

<a id="dep-05"></a>

### DEP-05｜Compose 环境白名单未透传媒体配额与剩余空间设置

- **状态**：已确认配置契约缺陷。
- **优先级**：P2。
- **代码证据**：[src/features/media/server/quota.ts:12-25](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/features/media/server/quota.ts#L12)；[docker/runtime-env.mjs:14-24](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/docker/runtime-env.mjs#L14)；[scripts/compose-runtime.mjs:12-26](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/scripts/compose-runtime.mjs#L12)。
- **原因/链路**：业务读取 MEDIA_USER_STORED_QUOTA_BYTES、MEDIA_USER_DAILY_QUOTA_BYTES、MEDIA_GLOBAL_STORED_QUOTA_BYTES、MEDIA_MIN_FREE_BYTES；Compose 仅解析 applicationEnvironmentKeys，四个变量均不在其中。即使写入 .env.docker 或父进程环境，标准管理入口也不会把它们传给 Web/Cron。
- **触发与影响**：实施人员以为调整了配额或磁盘最低余量，容器仍用 2 GiB/512 MiB/50 GiB/2 GiB 默认值；可能过早拒绝上传，或未按更严格现场容量限制阻断。
- **修复方向**：建立业务配置清单并统一透传、校验、文档；为非敏感有效配置提供可检查摘要。检查 MATCH_OCR_QUEUE_LIMIT 等其他业务变量是否也落入同类遗漏，避免只修四个已发现键。
- **验收标准**：对每个变量设非默认值，生成实际 Compose model 并检查 Web/Cron env，再跑行为测试验证配额和低空间阈值；非法值不能悄悄回落而让实施人员误以为生效。

<a id="dep-06"></a>

### DEP-06｜两个 Nginx 模板的上传限制不一致，小模板会拒绝应用允许的视频

- **状态**：已确认模板契约不一致；实际影响取决于采用哪个模板。
- **优先级**：P2。
- **代码证据**：[docs/operations/nginx-site.conf.template:12-30](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/docs/operations/nginx-site.conf.template#L12)；[docs/operations/nginx.conf.example:41-43](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/docs/operations/nginx.conf.example#L41)；[src/features/combat-posts/video-policy.ts:11-14](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/features/combat-posts/video-policy.ts#L11)；[src/features/combat-posts/server/upload.ts:57-66](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/features/combat-posts/server/upload.ts#L57)。
- **原因/链路**：应用默认允许 512 MiB 视频，可配置更大；nginx-site.conf.template 为 260m，nginx.conf.example 为 516m。小模板会先于应用返回 413。
- **触发与影响**：例如合法 300 MiB、时长合规且配额充足的视频，经该模板失败；绕过代理直连时却成功，造成前后端排错混乱。不是所有 Nginx 配置都坏，完整示例已为默认值留余量。
- **修复方向**：把代理最大请求体与应用上传策略建立单一契约，包含 multipart 余量；清理过时模板并明确自定义上限的同步规则，避免无限放大请求限制。
- **验收标准**：两份受支持配置通过 nginx -t；经代理验证合法大于 260 MiB 的视频、恰好上限附近视频和超过配置的请求；后者仍被清晰拒绝。

<a id="dep-07"></a>

### DEP-07｜页面资源租约和缓存仅存在单个 Web 进程内，多副本不具有透明兼容性

- **状态**：已确认架构边界；只有扩多进程/多实例时成为故障。
- **优先级**：P2（计划扩容前）。
- **代码证据**：[src/features/resource-scheduler/server/scheduler.ts:69-86](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/features/resource-scheduler/server/scheduler.ts#L69)；[src/features/resource-scheduler/server/scheduler.ts:157-176](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/features/resource-scheduler/server/scheduler.ts#L157)；[src/features/resource-scheduler/server/registry.ts:118-126](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/features/resource-scheduler/server/registry.ts#L118)；[src/features/resource-scheduler/client/usePageResources.ts:40-64](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/features/resource-scheduler/client/usePageResources.ts#L40)。
- **原因/链路**：租约及缓存由 Map 保存在 globalThis 单进程单例。A 实例发出的租约到 B 实例查不到，返回 LEASE_NOT_FOUND；客户端会重新申请，但负载均衡持续跨实例时可反复失效。
- **触发与影响**：直接开启 PM2 cluster、多 Web 容器或滚动替换会出现续租/资源读失败与重复加载。当前 Compose 单 Web 和 PM2 单实例配置不构成此故障，不能要求为了小规模站点立即上分布式架构。
- **修复方向**：先在部署文档明确单实例限制；要扩容时选择受支持的粘性路由与进程重启恢复策略，或共享租约存储/无状态安全令牌，并处理缓存失效和身份隔离。
- **验收标准**：两 Web 实例轮询访问：申请、读取、续租、释放、登出以及一实例重启均需稳定；验证不同用户不能共享私有数据。

<a id="dep-08"></a>

### DEP-08｜PM2 watchdog 固定探测 127.0.0.1，与自定义监听地址配置不一致

- **状态**：已确认条件触发的配置缺陷。
- **优先级**：P2。
- **代码证据**：[ecosystem.config.js:38-39](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/ecosystem.config.js#L38)；[ecosystem.config.js:57-64](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/ecosystem.config.js#L57)；[scripts/runtime-service.mjs:43-47](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/scripts/runtime-service.mjs#L43)；[scripts/runtime-liveness.mjs:12-21](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/scripts/runtime-liveness.mjs#L12)；[scripts/runtime-watchdog.mjs:10-13](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/scripts/runtime-watchdog.mjs#L10)；[scripts/runtime-watchdog.mjs:39-51](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/scripts/runtime-watchdog.mjs#L39)。
- **原因/链路**：PM2 接受 DEPLOY_WEB_HOST/HOST，例如专用局域网 IP 或 ::1；runtime-service 只保存 port，probeLiveness 始终 fetch http://127.0.0.1:port。
- **触发与影响**：当进程只监听专用 IP/IPv6 loopback，真实服务可用但 watchdog 认为不活跃，达到阈值后重启。已有三次/十分钟预算限制风暴，仍会造成不必要中断。默认 127.0.0.1 与 Docker 0.0.0.0 不触发。
- **修复方向**：由共享运行配置导出规范化内部健康检查地址，正确处理 IPv4、IPv6 与通配监听；限制其为本机可验证目标，避免任意外部 URL。
- **验收标准**：默认 loopback、0.0.0.0、专用本机 IP、::1 分别启动探针测试；活跃进程不重启，真卡死仍能按预算恢复。

<a id="dep-09"></a>

### DEP-09｜外部 MySQL 的 TLS/证书验证配置缺少标准 Compose 透传通道

- **状态**：待验证/能力缺口；未抓包，不能断言现场连接一定明文。
- **优先级**：P2（跨主机、云数据库或强制 TLS 场景）。
- **代码证据**：[docker/runtime-env.mjs:14-16](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/docker/runtime-env.mjs#L14)；[docker/runtime-env.mjs:28-43](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/docker/runtime-env.mjs#L28)；[scripts/compose-runtime.mjs:27-32](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/scripts/compose-runtime.mjs#L27)；[scripts/compose.mjs:254-256](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/scripts/compose.mjs#L254)；[docs/operations/docker.md:166-180](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/docs/operations/docker.md#L166)。
- **原因/链路**：标准 Compose 路线从 MYSQL_HOST/PORT/USER/PASSWORD/DATABASE 构造固定连接 URL，仅附连接池/超时参数；没有 CA、客户端证书或验证模式的配置与挂载；DATABASE_URL 也不在 app 白名单。mysql-client 预检与导出只带连接基础参数。
- **触发与影响**：复用强制 TLS/自签 CA/客户端证书的外部数据库时可能连不上，或应用、迁移、备份使用不同 TLS 行为。现有私有 Docker 网络与同机数据库不能直接套用跨公网风险结论。
- **修复方向**：先实测 Prisma 与 mysql-client 的实际协商结果；按真实需求增加统一 TLS 配置、证书只读挂载、应用/迁移/备份一致性及服务端身份验证。禁止为了通连而默认关闭验证。
- **验收标准**：使用要求 TLS 的隔离 MySQL，查询会话加密信息并验证证书身份；错误 CA/主机名必须失败，Web、Cron、migration 与 mysqldump 均按同一策略工作。

<a id="dep-10"></a>

### DEP-10｜Compose 操作锁以源码目录为范围，不能阻止两个 checkout 同时操作同一项目

- **状态**：已确认锁范围；条件风险。
- **优先级**：P2（多目录发布/多实施人员场景）。
- **代码证据**：[compose.yaml:3-4](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/compose.yaml#L3)；[scripts/compose.mjs:144-149](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/scripts/compose.mjs#L144)；[scripts/compose.mjs:204-214](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/scripts/compose.mjs#L204)；[scripts/compose.mjs:261-319](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/scripts/compose.mjs#L261)。
- **原因/链路**：默认 Compose 项目名固定 wzywt，但操作锁在各自 root/.cache/compose-deploy.lock。两个不同目录采用同一 COMPOSE_PROJECT_NAME/同一 Docker daemon 时持有不同锁，却管理相同容器和卷。
- **触发与影响**：并行 update/backup/down 可能交错停写、构建、备份、migration 与恢复动作；各自 finally 只能保证各目录锁，不保证项目级互斥。标准单目录单操作不会触发。
- **修复方向**：定义同一 Docker endpoint + Compose project 的稳定互斥身份，锁记录 PID、起始时间和操作；或强制项目固定状态目录并在其他 checkout 明确拒绝操作。不得把自动删除他人锁当解决方案。
- **验收标准**：从两个临时源码目录对同一隔离 Compose project 同时发起操作，第二个必须在任何停写/迁移前被拒绝；不同 project 应能并行。

<a id="dep-11"></a>

### DEP-11｜发布身份依赖手动改 APP_RELEASE_ID，备份 manifest 没有精确源码/镜像身份

- **状态**：已确认可追溯性边界；文档有要求，程序未强制。
- **优先级**：P2。
- **代码证据**：[.env.docker.example:6-6](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/.env.docker.example#L6)；[docker/runtime-env.mjs:10-12](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/docker/runtime-env.mjs#L10)；[compose.yaml:13-18](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/compose.yaml#L13)；[scripts/compose.mjs:290-305](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/scripts/compose.mjs#L290)；[docs/operations/docker.md:240-255](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/docs/operations/docker.md#L240)；[docs/operations/docker.md:446-447](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/docs/operations/docker.md#L446)。
- **原因/链路**：默认 APP_RELEASE_ID=local；文档要求每次更新修改，但脚本不检查复用。健康验收只比较该字符串；manifest 记录 project/时间/文件名，不记录 Git SHA、镜像 digest、migration 清单与文件哈希。
- **触发与影响**：漏改 ID 时，新旧发布可拥有相同健康身份与镜像 tag，事故后难以证明哪份源码/镜像匹配哪个备份；外部入口误指旧环境时也可能同 ID 通过。不能说文档完全没有发布版本约定。
- **修复方向**：为受控发布自动生成并记录唯一 build/release ID，保存源码 SHA（ZIP 可用可信清单）、实际镜像 ID/digest、schema/migrations 与备份文件摘要；检查生产模式拒绝 local 或复用身份。
- **验收标准**：连续两次不同源码发布产生不同可追溯身份；回切能定位原镜像；恢复工具拒绝未确认 schema 匹配的备份/源码组合。

<a id="dep-12"></a>

### DEP-12｜外部 OCR 预检证明健康协议，不证明 Bearer 鉴权和六图推理链可用

- **状态**：现场验收待验证；已有明确说明，不应当作健康探针实现错误。
- **优先级**：P2（启用外部 OCR 的上线验收）。
- **代码证据**：[docker/probe-ocr.mjs:4-25](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/docker/probe-ocr.mjs#L4)；[services/ocr/app.py:150-160](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/services/ocr/app.py#L150)；[docs/operations/docker.md:178-180](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/docs/operations/docker.md#L178)。
- **原因/链路**：probeOcr 请求 /health，检查 status/service/fullMatchReady；虽然携带 Authorization，但随仓库 OCR 的 /health 不校验 token，/recognize 才比对 Bearer。因此错误 token 也可能通过健康探针。
- **触发与影响**：部署可通过网络预检，实际识别时 401；模型加载、六张图片解析、运行耗时/资源等也不由 health 响应证明。代码日志和文档已明确要求识别/鉴权验收，不应宣称它虚报认证成功。
- **修复方向**：把真实六图及正确/错误 token 用例放进独立验收流程；如需自动发布阻断，可提供显式 opt-in 的轻量鉴权/推理探针，避免每次 health 都耗费完整 OCR。
- **验收标准**：正确 token 六图有结构化结果，错误/缺失 token 必须 401，任务状态、重试和超时正确；记录 CPU/RSS、耗时与实际页面截图对照，不用 health 截图代替。

<a id="dep-13"></a>

### DEP-13｜备份完成标记不是校验/远端上传/灾难恢复通过，需补充可执行闭环

- **状态**：已确认验证边界；远端上传与恢复能力本次未验证。
- **优先级**：P2。
- **代码证据**：[scripts/compose.mjs:275-299](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/scripts/compose.mjs#L275)；[docs/operations/docker.md:383-407](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/docs/operations/docker.md#L383)；[docs/operations/docker.md:555-570](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/docs/operations/docker.md#L555)。
- **原因/链路**：脚本依据子命令成功及文件非零生成 complete:true，同时明确 remoteUploadVerified:false；没有在此处解包校验、SQL 试导入或远端对象回读。每次生成独立备份目录；本地保留和容量管理需要现场策略。文档已要求 rclone 远端核验、隔离恢复、OSS 生命周期及独立备份边界。
- **触发与影响**：备份可正常生成但未被证明可恢复；如果现场忽略容量/保留策略，持续全量备份可能耗尽备份盘或 rclone 缓存。不得把“尚无核验”表述为“上传失败/备份损坏”，也不得声称仓库没有恢复指南。
- **修复方向**：复用现有 media-manifest.mjs、media-backup.sh 及 recovery-and-release.md 的恢复步骤，为 Compose 三件套增加可重复运行的只读验证与隔离恢复入口，保存文件哈希、归档内容检查、SQL 导入/业务抽样及远端核验结果；提供显式保留策略与容量告警，清理必须保护最近可恢复集合。
- **验收标准**：生成→哈希/归档检查→远端核验（适用时）→独立项目/新卷恢复→登录/截图/视频/业务抽样，记录证据与 RPO/RTO；故意截断备份后校验必须失败，不得仅凭历史 complete:true 进入恢复，也不得生成 restoreVerified:true 或等价通过结论。

## 业务一致性、前端、性能与维护性

<a id="bus-01"></a>

### BUS-01｜分路偏好只检查数组长度，非法分路、重复志愿和越界段位可以进入数据库

- 优先级：**P2**
- 证据状态：已确认：输入契约缺口
- 证据：[src/app/api/users/me/roles/route.ts:35](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/app/api/users/me/roles/route.ts#L35)；[src/features/profile/model.ts:51](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/features/profile/model.ts#L51)；[prisma/schema.prisma:147](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/prisma/schema.prisma#L147)

**问题与触发条件：** PUT /api/users/me/roles 仅要求 preferences 是长度为 5 的数组，随后直接读取元素字段。normalizeRolePreferenceSettings 只做非负整数归一化和巅峰分数规则，没有验证五个 role_type 恰好覆盖合法分路、preference_rank 是 1–5 的排列、段位/分值上限。数据库唯一键只有 userId+roleType。五个长度合法但不存在的分路字符串会成为新记录；重复分路重复 upsert 不等于保存五路；null 元素会在访问属性时抛异常。该结论来自实现路径，尚未向在线仓库服务发送请求。

**影响及边界：** 自己的分路资料可被污染，分队输入的完整性、公平性与页面显示失去约束；非法对象可能产生 500。不能将自报战力天然不可信误称为已接入官方数据认证。

**建议修复：** 在 feature 层建立运行时 schema，严格验证对象/字段类型、五路集合唯一且完整、志愿排列、业务允许的段位及整数范围；不通过时在写入前返回稳定的 400。正常化与验证分开。旧库若已有异常值，先输出诊断清单，再制定迁移/修复方案，禁止直接丢弃用户记录。

**验收要求：** 以 null、重复分路、未知分路、重复志愿、0/6志愿、极大整数分别请求，断言 400 且数据库无变更；合法五路保存后恰好五行、各字段符合契约。验证默认新用户与低段位的合法兼容行为。

<a id="bus-02"></a>

### BUS-02｜每路最多三个英雄的限制采用先计数后插入，可被并发突破

- 优先级：**P2**
- 证据状态：已确认：存在竞态窗口；并发结果待集成复现
- 证据：[src/app/api/users/me/heroes/route.ts:54](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/app/api/users/me/heroes/route.ts#L54)；[prisma/schema.prisma:172](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/prisma/schema.prisma#L172)

**问题与触发条件：** count>=3 与 create 是两个独立数据库操作。同一用户同一路已有两条时，两个不同 heroId 的请求可以同时读到 count=2 并各自插入，唯一键不会阻止不同英雄的第四条。全局请求容量限制并不串行化同一用户写入。

**影响及边界：** 接口声明的最多三个英雄失效，页面及算法所依据的数据集可能不一致。当前算法有自己的取值/截断规则，不能直接推导它会无限计算或崩溃。

**建议修复：** 把校验和写入放到能保护 userId+roleType 容量不变量的事务/锁机制中，处理序列化冲突与重试；重复提交同一英雄返回可理解的冲突或幂等结果。

**验收要求：** MySQL 8.0/8.4 均在已有两条数据时并发提交至少两个不同英雄；成功条数最多一条，最终数量<=3，失败返回明确业务码，无无界重试。

<a id="bus-03"></a>

### BUS-03｜个人英雄战力直接信任客户端 heroId/heroName，与英雄库可以不一致

- 优先级：**P2**
- 证据状态：已确认：主数据校验缺口
- 证据：[src/app/api/users/me/heroes/route.ts:33](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/app/api/users/me/heroes/route.ts#L33)；[src/app/api/users/me/heroes/route.ts:64](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/app/api/users/me/heroes/route.ts#L64)；[prisma/schema.prisma:162](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/prisma/schema.prisma#L162)

**问题与触发条件：** 接口验证 heroId 为正整数、heroName 非空后直接创建，没有从 Hero 表核实存在性或取得权威名称；HeroPower 只有 User 关系，没有 Hero 外键。字符串长度也未按 VarChar(64) 检查；超数据库整数范围、超长名称、唯一键冲突缺少本路由的业务错误映射。

**影响及边界：** 不存在的英雄 ID、错误名称可保存；其他无效输入可能进入 Prisma 错误路径。此项是资料一致性与错误处理问题，不是 SQL 注入证据。

**建议修复：** 从 Hero 主数据读取名称；明确已下架英雄是否允许保留历史快照。入参检查数据库整数范围及名称策略；将重复英雄和不存在英雄映射为 409/400。若引入外键，先清点历史异常并新增 migration。

**验收要求：** 不存在 ID、ID/名称不匹配、超长名称、重复提交、最大整数边界均有确定结果；合法录入的名称与主数据一致，已有历史记录的兼容行为有测试。

<a id="bus-04"></a>

### BUS-04｜后台分页与部分删除 ID 使用宽松 parseInt，坏参数可能变成 500 或错误对象 ID

- 优先级：**P2**
- 证据状态：已确认：参数边界不一致
- 证据：[src/app/api/admin/users/route.ts:15](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/app/api/admin/users/route.ts#L15)；[src/app/api/admin/tournaments/route.ts:14](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/app/api/admin/tournaments/route.ts#L14)；[src/app/api/users/me/heroes/route.ts:81](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/app/api/users/me/heroes/route.ts#L81)；[src/lib/request-validation.ts:18](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/lib/request-validation.ts#L18)

**问题与触发条件：** 分页没有验证正整数、上界及安全整数，直接计算 skip；英雄删除也将 id 用 parseInt 转换，1abc 会被当成 1。项目已有严格 parseRouteId，但这里没有复用。后台分页须先通过管理员认证，因此不能写成匿名可调用的攻击面。

**影响及边界：** 无效 page 可引发查询异常/大 offset 成本；非标准 ID 被部分接受，接口行为难预测。删除仍按当前 userId 查找，未发现由此跨用户删除。

**建议修复：** 统一严格 ID/分页解析，约定 page>=1、合理最大页/游标及 search 长度；非法参数返回 400，资源不存在返回 404；不要把所有数据库错误统一吞成成功。

**验收要求：** 覆盖 page=abc/0/-1/超大值、id=1abc/空/小数/溢出；断言状态码和无副作用；保留正常第一页、末页和空结果行为。

<a id="bus-05"></a>

### BUS-05｜退出房间及容量纠正未完整保护状态转换，可能与分队提交交错

- 优先级：**P1**
- 证据状态：已确认：状态检查与写入分离；需并发复现
- 证据：[src/app/api/tournaments/[id]/leave/route.ts:20](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/app/api/tournaments/%5Bid%5D/leave/route.ts#L20)；[src/app/api/tournaments/[id]/leave/route.ts:35](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/app/api/tournaments/%5Bid%5D/leave/route.ts#L35)；[src/features/tournaments/server/capacity.ts:198](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/features/tournaments/server/capacity.ts#L198)；[src/features/tournaments/server/split.ts:38](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/features/tournaments/server/split.ts#L38)

**问题与触发条件：** leave 在事务之外检查 recruiting/locked、deadline 和房主身份，事务里直接删除成员。若检查后、删除前分队已提交，仍可删除该成员。reconcileTournamentCapacity 先读状态/人数，后续 update 仅按 id，没有把原状态和 splitResult 纳入条件；调用方若不提供足够的并发保护，也存在旧状态覆盖新状态的窗口。split 自身已使用 Serializable、成员集合校验和 CAS，不能因此认定反向操作也安全。

**影响及边界：** 已完成分队的十人快照与当前报名名单可能分离，后续 createMatchDraft 的十人/成员一致性检查会拒绝创建。容量纠正的具体覆盖结果取决于并发时序和事务隔离，应测试而非宣布已在生产发生。

**建议修复：** 把退出许可、房主校验、成员变更和状态转换纳入同一受保护的事务；所有招募状态转换使用带旧状态/splitResult 条件的 CAS 或统一锁。统一处理重试/409；完成分队后是否允许特殊成员变更必须另有明确流程。

**验收要求：** 用可控制的并发屏障暂停 leave 于校验之后，让 split 先提交，再恢复 leave；应只有一个允许结果，完成房间仍保留其十人成员。对 reconcile 与 split 的交错也断言 completed 不会被旧的 recruiting/locked 覆盖。

<a id="bus-06"></a>

### BUS-06｜已有比赛档案的房间仍走物理删除，外键阻止后缺少明确业务响应

- 优先级：**P2**
- 证据状态：已确认：数据库保护与 API 行为未对齐
- 证据：[src/app/api/tournaments/[id]/route.ts:116](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/app/api/tournaments/%5Bid%5D/route.ts#L116)；[prisma/schema.prisma:359](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/prisma/schema.prisma#L359)；[src/features/tournaments/server/lifecycle.ts:35](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/features/tournaments/server/lifecycle.ts#L35)

**问题与触发条件：** DELETE /api/tournaments/:id 完成权限检查后直接 tournament.delete。InternalMatch 对 Tournament 使用 onDelete: Restrict；已有比赛档案时数据库会拒绝删除，但该路由没有事先归档/冲突判断，也没有将外键错误转换为用户可理解的结果。生命周期清理模块已经明确保留有历史的房间，直接删除路由没有共享这个规则。

**影响及边界：** 管理员/房主在已有档案房间执行删除可能得到 500。历史数据受外键保护，本项不能描述为已确认历史数据被级联删除。

**建议修复：** 与现有历史保留规则统一：有档案返回明确冲突并提供归档路径，无历史才删除；保留 Restrict，不用级联删除来消除报错。处理不存在及重试的幂等语义。

**验收要求：** 分别删除无历史房间、有 DRAFT 档案、有 SUBMITTED 档案和已不存在房间；验证业务码、页面提示、成员关系清理和档案保留。

<a id="bus-07"></a>

### BUS-07｜选人写接口未校验目标归属、分队一致性及装备主数据

- 优先级：**P2**
- 证据状态：已确认缺少关联校验；产品允许范围待确认
- 证据：[src/app/api/tournaments/[id]/picks/route.ts:68](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/app/api/tournaments/%5Bid%5D/picks/route.ts#L68)；[src/app/api/tournaments/[id]/picks/route.ts:54](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/app/api/tournaments/%5Bid%5D/picks/route.ts#L54)；[src/app/api/tournaments/[id]/picks/route.ts:86](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/app/api/tournaments/%5Bid%5D/picks/route.ts#L86)；[prisma/schema.prisma:325](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/prisma/schema.prisma#L325)

**问题与触发条件：** 接口会验证操作者为房间管理员或正式参赛者，且 heroId 存在，这是已有保护。之后管理员可传任意正整数 targetUserId，未核实目标是本房成员；team/roleType 只校验枚举，不比对分队结果；equipIds 只检查正整数，不核装备是否存在、数量及组合策略。TournamentPick 没有对 userId 的 User 关系。

**影响及边界：** 可以形成房间外目标或无效装备的选人记录，展示/建档所依据的选人资料可能失真。未发现因此读取其他房间资料。允许临时战术模拟还是只能按已定阵容编辑属于产品契约，不能替用户直接取消一种玩法。

**建议修复：** 先写清选人状态机和目标集合；最少校验目标属于本房、数据有效。若允许模拟阵容，把模拟记录与正式选人分开；统一创建和更新约束。

**验收要求：** 房间管理员指定外部/不存在用户、普通成员修改他人、错误队伍、无效/超量装备、已提交比赛修改等逐项测试，预期由批准的契约决定；保留合法管理员代填和临时玩家流程。

<a id="perf-01"></a>

### PERF-01｜公告接口没有分页，full=true 会返回全部已发布正文

- 优先级：**P2**
- 证据状态：已确认无界查询；容量影响待压测
- 证据：[src/features/announcements/server/service.ts:28](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/features/announcements/server/service.ts#L28)；[src/features/announcements/server/service.ts:22](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/features/announcements/server/service.ts#L22)；[src/app/api/announcements/route.ts:12](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/app/api/announcements/route.ts#L12)

**问题与触发条件：** 公开公告列表和后台列表的 findMany 没有 take/cursor。公开 full=true 还把所有正文一起返回。withRequestCapacity 能限制并发请求数，不能限制单次结果集字节数。

**影响及边界：** 公告数据累积时，数据库查询、JSON 序列化、响应传输和前端解析开销增长；目前没有测得具体瓶颈或拒绝服务结果。

**建议修复：** 引入稳定分页、最大页长和列表摘要，正文按 slug/id 单独读取；保持现有客户端兼容或同步迁移。根据访问量决定缓存和索引，不无依据加 Redis。

**验收要求：** 种入足够多的长正文公告，验证列表最多返回约定条数，翻页无重复/遗漏，正文访问权限和排序一致；记录响应体大小、查询耗时和高分位延迟。

<a id="web-01"></a>

### WEB-01｜比赛档案轮询允许请求重叠，旧响应可能覆盖新状态

- 优先级：**P2**
- 证据状态：已确认缺少响应时序保护；用户影响待浏览器复现
- 证据：[src/web/MatchWorkspace.tsx:174](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/web/MatchWorkspace.tsx#L174)；[src/web/MatchWorkspace.tsx:179](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/web/MatchWorkspace.tsx#L179)；[src/web/MatchWorkspace.tsx:235](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/web/MatchWorkspace.tsx#L235)

**问题与触发条件：** 识别运行期间每 2 秒调用 load，load 没有单飞标记、请求序号或旧请求取消；返回后直接 setDetail 并更新草稿版本。正常草稿保护已存在，不能说轮询必然清掉输入；但当慢旧请求晚于新请求/提交后的刷新返回时，仍可能把已更新界面回退到旧版本，或触发错误的草稿版本处理。

**影响及边界：** 慢网、弱网或接口延迟下出现状态闪回、重复请求、错误草稿恢复/清空提示的风险。服务端提交权限和版本约束独立存在，客户端回退不代表能绕过服务端锁定。

**建议修复：** 轮询改为一次请求结束后调度下一次，或维护 request generation 丢弃过期响应；切换比赛/卸载/提交后取消旧请求；按 record/evidence revision 拒绝版本回退，保留现有草稿保护。

**验收要求：** 浏览器拦截两次 GET，先发旧请求后发新请求，让新响应先返回；页面版本不得回退，用户输入保留；切换比赛/注销后旧请求不得污染新页面；后台页面可降低轮询频率。

<a id="qual-01"></a>

### QUAL-01｜架构检查仍保留 29 个路由直连数据库例外，核心界面文件过大

- 优先级：**P3**
- 证据状态：已确认：维护性债务
- 证据：[scripts/architecture-route-db-baseline.json:2](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/scripts/architecture-route-db-baseline.json#L2)；[src/web/components/tournament/TournamentDetail.tsx:1](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/web/components/tournament/TournamentDetail.tsx#L1)；[src/web/MatchWorkspace.tsx:1](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/web/MatchWorkspace.tsx#L1)

**问题与触发条件：** 架构检查有 29 项既有 Route/数据库访问例外；TournamentDetail 约 1031 行、MatchWorkspace 约 554 行。例外是有意记录的遗留边界，不等于检查器失效；文件行数本身也不是功能缺陷。上面的输入校验和事务问题说明分散用例逻辑会增加一致维护成本。

**影响及边界：** 相同认证、状态检查、错误映射在不同入口容易漂移；大组件将加载、草稿、上传、轮询、提交混在一起，回归范围扩大。

**建议修复：** 随实际缺陷修复抽取 feature 用例/共享运行时校验，逐项减少 baseline；组件按业务职责拆分。不要为清零数字一次性大重写，也不要删架构检查或扩大白名单掩盖问题。

**验收要求：** 既有架构检查通过、baseline数量不增加；受影响的 API/浏览器契约通过；功能和权限等价，减少重复代码有明确 diff 依据。

<a id="qual-02"></a>

### QUAL-02｜Git 跟踪宣传素材和大型可执行依赖，增加获取与审查成本

- 优先级：**P3**
- 证据状态：已确认：仓库体积与来源治理
- 证据：[大型 FFmpeg 二进制](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/artifacts/promotional-video/.deps/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe)；[.dockerignore:33](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/.dockerignore#L33)

**问题与触发条件：** 当前 Git tree 中 ffmpeg-win-x86_64-v7.1.exe 为 87,638,016 bytes（约83.58MiB），另有约11.33MiB视频与11.21MiB音频。GitHub仓库元信息 size=501896 KB，不能当成准确 checkout 体积。artifacts 已被 .dockerignore 排除，因此不能据此声称这些文件进入 Docker 镜像。

**影响及边界：** clone/CI源码拉取及历史体积成本、二进制来源与版本核查成本增加。未扫描该二进制，不宣称含恶意内容。

**建议修复：** 后续素材放制品存储/Release或合适的大文件管理；开发工具从可校验来源安装并记录许可证/校验和。清理 Git 历史会改提交ID，必须另行得到明确授权；本报告不要求直接重写历史。

**验收要求：** 对比干净 clone 下载量、CI checkout耗时；确认生产构建不依赖移出的素材；保留使用方下载路径与可验证来源。

<a id="qual-03"></a>

### QUAL-03｜缺少项目级许可证，公开仓库与可再分发授权不能混为一谈

- 优先级：**P3**
- 证据状态：已确认：项目级声明缺口；使用条件需维护者决定
- 证据：[固定提交目录](https://github.com/YunHe-Rocky/wzywt/tree/3835a889b09cc732dea65c15fcfbf8eb04be442d)

**问题与触发条件：** 递归 tree 未发现根目录项目 LICENSE；发现的是宣传工具依赖自己的 LICENSE，不能自动覆盖应用源码、游戏素材和宣传音频。README/API/public 可读不等于所有内容有统一的再分发许可。

**影响及边界：** 对外二次开发、交付和复用时无法从仓库确定完整授权边界。这里不做权利归属或侵权结论。

**建议修复：** 由维护者确认自身源码希望采用的许可及第三方素材来源，补项目声明和第三方清单；无法确认授权的素材标为待确认，不替维护者擅自选择许可证。

**验收要求：** 项目声明与依赖/素材清单可追溯，发行制品包含必要说明；涉及第三方授权的结论由实际凭证支持。

## 文档和实施配置

<a id="doc-01"></a>

### DOC-01｜README 仍将仓库 OCR 描述为不能替代六图服务的单图预览

- 优先级：**P2**
- 证据状态：已确认文档与实现漂移。
- 证据：[README.md:94](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/README.md#L94)；[services/ocr/app.py:150](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/services/ocr/app.py#L150)；[services/ocr/parser.py:13](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/services/ocr/parser.py#L13)。

**问题与影响：** README 写明仓库自建 RapidOCR 是单图预览、尚不能代替正式六图服务；当前 app.py 已声明 fullMatchReady=true，并支持多页类型与结构化处理。实施人员会对是否可以选择 OCR_MODE=container 得到相互矛盾的指引。服务名仍含 preview，不应单凭名称推断无六图实现。

**建议修复：** 按当前实际协议更新能力说明，同时明确六页要求、固定版式、人工确认、支持范围与未验证设备；不能把文档改为“任意截图准确识别”。同步 README、OCR 手册、部署手册和实际响应合同。

**验收要求：** 文档示例可走通正确/错误 Token、六图输入和人工确认全流程；CI 合同测试防止页面类型与 fullMatchReady 声明再次漂移。与 SEC-14、CI-06 联动。

<a id="doc-02"></a>

### DOC-02｜媒体备份示例头像目录与原生部署默认及约束不一致

- 优先级：**P2**
- 证据状态：已确认示例容易误配；不等于现场已经漏备份。
- 证据：[media-operations.md:40](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/docs/operations/media-operations.md#L40)；[scripts/deploy.sh:351](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/scripts/deploy.sh#L351)。

**问题与影响：** 文档示例 MEDIA_STORAGE_DIR=/opt/apps/wzywt-runtime/shared/media、AVATAR_DIR=/opt/apps/wzywt-runtime/shared/avatars；部署默认却是 MEDIA_STORAGE_DIR/avatars，且 deploy.sh 要求 AVATAR_DIR 位于 MEDIA_STORAGE_DIR 内。照抄示例可能备份错误目录或与发布校验冲突。文档已有“先确认实际目录”的提醒，应保留并改进。

**建议修复：** 示例从同一已解析配置获取目录，不再各处手抄；输出不包含密钥的路径摘要。备份必须检查当前数据库头像引用与文件存在性，错误目录不得被当作空库成功。

**验收要求：** 新建原生默认部署及允许的自定义子目录两种情景，按文档生成含真实头像的备份并恢复核对；错误目录清晰失败。与 DEP-03 的完整备份集修复联动。

## 已核实的保护与误报排除

以下是修复时必须保留的行为；没有必要为制造新架构而拆掉它们。

### 认证与业务

1. [auth.ts L36-L64](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/lib/auth.ts#L36)每次认证读取数据库角色、封禁、临时用户、删除状态和 sessionVersion；不能声称只相信 Cookie 中的 admin。
2. [reset-password/route.ts L74-L105](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/app/api/auth/reset-password/route.ts#L74)现有 token 具备固定格式、哈希存储、有效期、原子消费；SEC-03 是后续凭证更改时的撤销缺口，不是 token 明文数据库存储或无限有效。
3. [draft.ts L273-L333](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/features/matches/server/draft.ts#L273)截图替换有 evidenceRevision CAS、状态限定、旧识别任务 SUPERSEDED、同场一致性重置及事务；已确认/正式提交后不能正常再替换。
4. [records.ts L196-L242](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/features/matches/server/records.ts#L196)正式提交校验六图、完成识别、同场一致性、十人确认和击杀总和，串行事务内限定 CONFIRMED→SUBMITTED；管理员修正在同文件 L331-L410 有比赛 recordRevision 与单条版本 CAS 及审计。
5. [matches/visibility.ts L8-L11](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/features/matches/visibility.ts#L8)比赛档案按管理员/己方正式参赛者与状态限制；[draft.ts L347-L358](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/features/matches/server/draft.ts#L347)原始截图 GET 要求全站 admin，不能把知道 matchId 当作公开截图访问。
6. [combat-posts/service.ts L227-L269](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/features/combat-posts/server/service.ts#L227)视频流检查已登录及隐藏/删除状态，管理操作验证 admin；仅存在 Range 支持不能推出任意文件读取。
7. [recognition-provider.ts L19-L76、L101-L106](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/features/matches/server/recognition-provider.ts#L19)限制响应为 5 MiB、90 秒超时、拒绝重定向；Python 侧有 token、实际字节计数和图像限制，不能声称 OCR 裸奔或无限请求体。
8. [request-validation.ts L35-L79](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/lib/request-validation.ts#L35)按实际流字节限额，并非只信 Content-Length。JSON 默认上限 256 KiB。
9. 本次检查没有得到可以直接断言的通用 SQL 注入、原始 Markdown HTML XSS、任意 URL 爬虫 SSRF 或任意路径上传证据。若继续做专项测试，必须另列为待验证；不能从“有用户输入/有 fetch/有文件写入”直接推导成立。

### 部署与运行

1. Compose 已实现构建先于停写；停止 Web/Cron 后备份 SQL、媒体和英雄文件；备份失败且尚未迁移时，以 no-recreate/no-build/pull-never 恢复原来在运行的 writer。migration 开始后的失败保持停写，保留备份路径。不能写成“完全无发布保护”。
2. `down` 不删除卷，未知参数被拒绝；MySQL/Redis 日常更新使用 no-recreate，资源限额不匹配会在停写前拒绝继续。不能提出直接删除卷、重装数据库作为 CI Web unhealthy 的修复。
3. Compose 管理的 MySQL 与 Redis 活动数据位于本地 Docker 卷；external MySQL 保留其既有存储。rclone 只承载业务文件和导出备份，不承载活动数据库。宿主与容器均检查 fuse.rclone，检查路径逃逸，初始化执行 uid/gid 1000 的写/rename/读测试。远端持久性仍需要单独证明。
4. Compose 只向宿主发布 Web；数据库、Redis 与容器 OCR 没有公开宿主端口。默认本地/LAN 部署允许 HTTP 有明确产品需求，不能“一律改成必须公网域名 HTTPS”。
5. 运行系统已有内存/CPU/PID 限额、资源治理、请求与订阅分别限额、Worker/缓存回收、Cron 优雅排空、日志轮转、liveness 与 readiness 分离。它们不能证明峰值并发、OOM 免疫或多副本正确性，但也不能误写成完全没有资源治理。
6. 原生 PM2 创建 avatars；DEP-01 特指容器初始化。原生 PM2 会保存发布诊断、原子切换 release、验证进程归属与 release health；DEP-02/03/04 是迁移/恢复契约差异。
7. 外部 MySQL 预检在容器网络执行，并要求应用非 root 专用账户；备份权限不足会阻断迁移。此处不认定已发生凭据泄漏或云数据库 TLS 攻击。
8. 默认 Node/MySQL/Redis 镜像使用可变版本 tag，不是同 SHA 完全可复现构建的充分证据；若需要供应链审计，可增加 release digest/SBOM/扫描记录。未查看现场镜像扫描结果，不能虚构某镜像存在特定 CVE。
9. 恢复、OSS、外部 OCR、服务器重启和容量峰值属于现场验收。既有文档已经要求记录这些边界；本审计建议把它们变为可重复执行的证据，不宣布它们当前失败。

### CI 与审计证据

1. 当前 create_host_path=false 解析兼容问题已修，12 模型通过。
2. 不是“CI 一片失败”：两种 MySQL 集成通过，validate 的 lint/typecheck/build 和多数测试通过。
3. 不是“没有自动化测试/没有 OCR 测试/没有发布制度”：三者均有，问题是覆盖、执行、门禁和证据边界。
4. CI 固定的 ci-password、ci-only-session-secret 是回环临时测试库/会话 fixture，不是已发现泄露的生产凭据。
5. 失败后停止 Web/Cron、保留数据库/Redis/备份是安全保护，不应通过移除它来掩盖健康检查失败。
6. npm 总漏洞数不能直接当作生产可利用漏洞数；历史公告需要当前复扫和调用链确认。
7. 当前没有取得生产部署、外部 OCR/OSS 或已有业务数据恢复结果，不能推断它们一定成功或一定失败。

## 尚不足以定性为缺陷的候选与专项验证

以下项目没有计入 55 个编号条目。需要先取得环境/产品条件与复现证据，再转成缺陷；不能直接套用安全漏洞结论。

- 敏感写操作的 Origin/CSRF 防护：统一 JSON reader 未要求 application/json，已检查的 middleware/request wrapper 没有显式 Origin 校验。现有 `SameSite=Lax` 对跨站请求提供保护，**不能直接认定任意外站可 CSRF**；需结合是否有不可信同站子域/同主机其他端口、浏览器和反向代理策略做隔离环境验证，再决定是否上升为漏洞。建议统一验证写操作来源并保留合法 CLI/API 调用策略。
- 发布动态关联比赛：`createCombatPost` 只检查 matchId 存在且 SUBMITTED，没有检查发布者是否可查看该场档案；目前动态接口返回关联 ID，不直接返回私有战绩。需明确是否允许“非参赛者引用他人比赛”，再决定是否增加 match viewer/participant 校验，不能现在直接写成私有战绩泄漏。
- 真实截图/视频隐私：确认仓库含测试图和服务保留原始媒体不等于确认发生个人信息泄漏。下一步应人工查看素材授权、昵称/游戏 ID/聊天文字/图片元数据以及删除、备份保留策略；未查看图像前不得声称存在凭证或个人信息泄露。

### 其他运行与客户端验证方向

| 方向 | 当前已知边界 | 下一步验证与合格结果 |
| --- | --- | --- |
| 容量/性能 | 有资源限额和治理，没有取得目标服务器实测吞吐/峰值数据 | 目标 Linux 上混合登录、列表、上传、视频 Range、SSE、分队、OCR、Cron 负载；记录 p95/p99、错误率、CPU/RSS、事件循环、MySQL连接及磁盘/缓存余量。容量上限由实测给出 |
| 机器内存 | 默认 Compose 预检预算无 OCR 5120 MiB、含 OCR 7168 MiB；4 GiB 是需调配额且验峰值的文档方案 | 核对 Docker daemon 可用内存、其他容器、同机外部服务与构建峰值；不能将改小预留当容量优化，不能承诺默认配置适配 2 GiB |
| Redis/数据库失效 | 有必需依赖健康检查、超时/任务协调；未做本次故障注入 | 验证断连、重连、Redis noeviction满额、MySQL慢查询/死锁/连接池耗尽，写入应给明确失败且不重复提交；不要把Redis缓存失效等同业务数据丢失 |
| Cron/OCR恢复 | 有任务 claim、heartbeat、重试与旧结果隔离 | 杀死工作进程、超时、重复启动、时钟偏差、release切换后确认任务只产生允许的一次结果，旧任务不能覆盖新证据 |
| 视频兼容 | MP4/WebM 容器时长检查及原生 Range 播放；没有 FFmpeg/HLS 转码 | 桌面 Chrome、Android、iOS/Safari按实际编码/音轨/旋转/fast-start测试首播和拖动；容器可读不等于所有编码都可播放。无法播放时提供明确支持范围/转码建议 |
| 隐私与保留 | 账户删除有匿名化并保留历史引用，头像和截图/备份另有文件生命周期 | 用测试账户核对注销后昵称/头像链接、历史截图、OCR原文和备份是否符合明确保留策略；验证孤儿文件最终清理，不擅自删除需保留的审计历史 |
| 跨站请求 | SameSite=Lax 已存在，未证实可利用 CSRF | 在隔离浏览器验证不同源/同站子域/不同端口的 Cookie、Origin、内容类型和敏感写操作；确认需要的 CLI/API调用策略，再决定防护实现 |
| UI/可访问性 | 已有 aria、键盘与坐标编辑等支持；未做本次全页面视觉和辅助技术测试 | 检验360px窄屏、横屏、缩放、长文本、键盘焦点/弹窗、屏幕阅读器、断网/重试；不能从单截图或个别aria标签得出全面通过 |
| 监控与告警 | 已有结构化日志、监控循环、health和watchdog；未取得现场通知链证据 | 验证磁盘低水位、持续5xx、任务积压、备份失败、服务重启预算用尽能被实际值班人发现；不将本地日志存在当作告警已送达 |
| 外部素材与爬虫 | 已有限定 HTTPS 域名、超时和响应体上限 | 验证上游结构变化/限流/无效数据不清空有效旧数据，来源和更新时间可追溯；素材使用权限由实际依据确认 |

容量来源：[docker.md:26](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/docs/operations/docker.md#L26)。视频边界：[media-operations.md:18](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/docs/operations/media-operations.md#L18)、[同文件:36](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/docs/operations/media-operations.md#L36)。历史匿名化：[deleteUser.ts](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/src/features/users/server/deleteUser.ts)。

## 后续修复的验证矩阵与命令入口

下面是验收方案，**本次没有执行这些项目测试或部署命令**。先在隔离 checkout、独立数据库/Redis、一次性 Compose project 中配置测试环境。生产凭据、Cookie、Token 不得写入报告或 CI artifacts。需要数据服务的命令不能误连现有生产实例。

Compose 隔离必须显式落实：先确认 Docker context/daemon；使用专用测试环境文件，并在任何 check/up/update/backup 前填写唯一的 COMPOSE_PROJECT_NAME、未占用的宿主 PORT、仅测试用途的数据库/Redis、独立备份目录及 OSS 前缀（如使用）。init 只生成配置，生成后必须核对这些值；默认项目名 wzywt 不能直接拿来做与现有环境并行的实验。换一个源码目录不会自动隔离容器、卷或外部服务。

| 层级 | 命令/动作入口 | 能证明什么 | 仍不能证明什么 |
| --- | --- | --- | --- |
| 安装/生成 | npm ci；npx prisma generate | 基线依赖安装、客户端生成 | 项目构建/启动/兼容性 |
| 静态与既有测试集合 | npm run check | shell EOL、版本、架构、文档、类型和脚本中列出的测试 | 该命令不含所有lint/build/integration/E2E |
| 构建 | npm run lint；npm run build | lint和生产构建 | 容器健康/浏览器路径/已有库升级 |
| 数据库 | npx prisma migrate deploy；npm run test:integration | 指定隔离库迁移与已有集成测试 | 生产数据规模迁移、灾备恢复 |
| 当前漏跑关键项 | 分别执行 npm run test:release；npm run test:governor；npm run test:task-fence；npm run test:api-use-cases；npm run test:match-draft；npm run test:match-visibility；npm run test:mobile-routes | 这些已存在脚本的实际结果 | 新发现缺陷必须另加有效行为回归，旧脚本通过并不自动证明修复 |
| 浏览器 | npm run test:e2e:proxy；npm run test:e2e:local | 配置好的HTTPS代理/Local HTTP全流程 | 真机浏览器、实际公网/LAN |
| 容器模型 | npm run test:compose；npm run test:compose:model | 管理配置和12种合并模型 | 不等于12种真实部署运行成功 |
| 容器运行 | 按上述隔离条件执行 node scripts/compose.mjs init → check → up → status；然后 update/backup，并单独执行共享媒体写入及桌面/手机读取 smoke | 空卷首启、现卷升级、readiness；单独smoke可验证指定共享媒体路径 | OSS远端持久性/生产数据恢复 |
| OCR | Python单测、跨语言合同、真实模型六图样本 | 分别证明HTTP/parser、字段合同、指定样本推理 | 任意设备/游戏版本准确率 |
| 灾备 | 独立实例恢复SQL+媒体+头像/英雄资源，验证哈希和业务 | 被演练备份集合的可恢复性、实测RPO/RTO | 未演练的备份集合或未来数据规模 |
| 依赖 | npm audit --omit=dev --json；npm audit --json；最终镜像扫描 | 该时点依赖/镜像命中公告 | 每项均能从真实网络入口利用 |

上述 npm 脚本以固定提交 [package.json](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/package.json) 为准。源码更新后重新核对。npm run check 会跑一组不同类别的脚本，应阅读其前置条件；不要对生产库直接执行集成 seed。只在明确的隔离测试环境运行 migration 与故障注入。

浏览器代理与部署脚本按 CI 的 Linux 环境准备，需已构建应用、Nginx/OpenSSL、Playwright Chromium/WebKit 与系统依赖。浏览器运行器还检查数据库必须为回环地址、库名以 _ci 或 _test 结尾，要求 E2E_ALLOW_TEST_DATABASE=1 以及专用测试 SESSION_SECRET。集成测试环境按 CI 设置 ALLOW_INTEGRATION_TEST_DATABASE=1；这些开关只能在确认测试库后设置，不能用来绕过生产保护。具体前置条件见 [代理运行器](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/tests/e2e/run-proxy-regression.mjs#L14) 与 [CI 环境](https://github.com/YunHe-Rocky/wzywt/blob/3835a889b09cc732dea65c15fcfbf8eb04be442d/.github/workflows/ci.yml#L32)。

### 按问题设计新增回归，不写只复述实现的测试

- 认证：注册/改密/重置共享边界；72字节；安全问题空白/长度；重置token撤销；重新认证与失败尝试限制；同一用户多会话失效。
- 权限：匿名、普通用户、房间外用户、正式成员、游客、房主/协管、超管、封禁、删除、sessionVersion失效逐角色测实际HTTP结果。
- 状态机：recruiting/locked/completed/finished，DRAFT/CONFIRMED/SUBMITTED，OCR QUEUED/RUNNING/终态；主要写操作覆盖“校验后状态改变”的受控并发。
- 媒体：失败/取消/超时、配额边界、同图替换与跨日、同用户并发、清理与消费竞态、文件写成功DB失败、文件删除失败后恢复。
- 部署：真正空卷；变量非默认值；正确/错误 uid、只读挂载、rclone断挂；两个checkout操作同一项目；自定义监听地址；迁移失败和激活失败分别验证。
- 前端：慢响应倒序、页面切换、退出后旧请求、浏览器storage异常、草稿版本冲突；保留用户输入，拒绝旧版本覆盖。

### 推荐的关闭标准

一个条目关闭前应能填写：

```text
问题 ID：
复核的 HEAD：
结论：已复现 / 静态确认 / 不适用 / 已被其他提交修复 / 仍待验证
根因与触发条件：
修改文件与提交：
回归测试：命令、环境、结果、证据位置
运行验收：是否真实执行；未执行的原因与剩余要求
数据/发布影响：是否新增 migration、需要维护窗口或恢复演练
已知限制：
关闭依据：
```

不得用“单测绿了”关闭真实容器、浏览器、外部服务或恢复验收条目。不适用的条件风险可以记录并延期，例如明确保持单实例时暂缓 DEP-07；需要上线对应模式前重新开启验收。

## 可直接交给 Codex 的任务说明

以下内容可随本文件一起交给负责仓库修复的 Codex；是否执行修复以用户当次请求为准。

```text
请读取本审计文档与仓库当前 AGENTS.md。先比较当前 HEAD 和审计基线
3835a889b09cc732dea65c15fcfbf8eb04be442d，逐条复核，不把报告中的候选根因当成已经运行证实的事实。

按“建议执行顺序”处理。先补可诊断证据并修当前 CI 两条失败链，再处理账户凭证、状态并发、媒体清理和遗漏门禁。
在现有架构内做针对性修复，保留桌面/手机、本地HTTP/LAN/生产HTTPS、Compose/PM2与外部服务的既有契约。
不得删测试、忽略WebKit、跳过权限/健康检查、删除数据卷或自动恢复生产旧SQL来换取绿灯。

每次修改后运行与影响相匹配的测试；真实环境验收与静态检查分别记录。
有产品选择或环境前提的条目先明确契约，未复现的风险先验证，不凭空重构。
最终按问题ID交付处理表、修改依据、测试/运行证据、未关闭条目及原因。
```



## 附录：本次读取与检索的固定提交文件

共 220 个文本文件，包含全部 70 个 API Route、Prisma schema 与 9 个 migration、两份工作流及核心业务/运行文件。此列表表示读取和检索范围，不代表每个文件的每条执行路径都经过测试。图片/视频/二进制只核查 tree 元数据，未做解码、隐私内容审查或二进制安全扫描。

<details>
<summary>展开文件清单</summary>

```text
.dockerignore
.env.docker.example
.github/workflows/ci.yml
.github/workflows/dependency-audit.yml
AGENTS.md
Dockerfile
README.md
compose.yaml
docker/entrypoint.mjs
docker/healthcheck.mjs
docker/init-storage.mjs
docker/probe-ocr.mjs
docker/runtime-env.mjs
docs/architecture/code-architecture.md
docs/architecture/database.md
docs/architecture/runtime-architecture.md
docs/operations/dependencies.md
docs/operations/deploy-advanced.md
docs/operations/docker.md
docs/operations/media-operations.md
docs/operations/nginx-site.conf.template
docs/operations/nginx.conf.example
docs/operations/recovery-and-release.md
docs/releases/releases.json
ecosystem.config.js
next.config.js
package-lock.json
package.json
prisma/migrations/20260623103519_init/migration.sql
prisma/migrations/20260623104500_add_constraints/migration.sql
prisma/migrations/20260725090000_add_player_identity_and_hero_secondary_lanes/migration.sql
prisma/migrations/20260725140000_mark_temporary_users/migration.sql
prisma/migrations/20260725150000_reconcile_legacy_schema/migration.sql
prisma/migrations/20260812090000_harden_auth_sessions/migration.sql
prisma/migrations/20260812100000_add_tournament_indexes/migration.sql
prisma/migrations/20260812140000_add_match_posts_and_tactics/migration.sql
prisma/migrations/20260905090000_review_state_and_account_lifecycle/migration.sql
prisma/schema.prisma
scripts/architecture-route-db-baseline.json
scripts/check-architecture.ts
scripts/compose-capacity.mjs
scripts/compose-runtime.mjs
scripts/compose-services.mjs
scripts/compose-storage.mjs
scripts/compose.mjs
scripts/db-backup.mjs
scripts/deploy.sh
scripts/run-deploy-tests.mjs
scripts/runtime-command.mjs
scripts/runtime-liveness.mjs
scripts/runtime-preload.mjs
scripts/runtime-service.mjs
scripts/runtime-watchdog.mjs
scripts/test-compose-model.mjs
scripts/test-deploy.sh
scripts/test-ocr-contract.mjs
scripts/test-ocr-deploy.mjs
scripts/test-ocr-python.sh
scripts/test-ocr-samples.py
scripts/test-release-registry.mjs
services/ocr/Dockerfile
services/ocr/app.py
services/ocr/parser.py
services/ocr/requirements-http.txt
services/ocr/test_daemon.py
services/ocr/test_ocr.py
services/ocr/test_samples.py
src/app/admin/layout.tsx
src/app/api/admin/announcements/route.ts
src/app/api/admin/combat-posts/route.ts
src/app/api/admin/matches/[matchId]/corrections/route.ts
src/app/api/admin/resources/route.ts
src/app/api/admin/settings/route.ts
src/app/api/admin/stats/route.ts
src/app/api/admin/sync-status/route.ts
src/app/api/admin/tournaments/route.ts
src/app/api/admin/users/[id]/route.ts
src/app/api/admin/users/route.ts
src/app/api/announcements/[id]/route.ts
src/app/api/announcements/route.ts
src/app/api/auth/change-password/route.ts
src/app/api/auth/login/route.ts
src/app/api/auth/logout/route.ts
src/app/api/auth/me/route.ts
src/app/api/auth/register/route.ts
src/app/api/auth/reset-password/route.ts
src/app/api/auth/security-question/route.ts
src/app/api/avatars/[filename]/route.ts
src/app/api/changelog/route.ts
src/app/api/combat-posts/[postId]/comments/[commentId]/route.ts
src/app/api/combat-posts/[postId]/comments/route.ts
src/app/api/combat-posts/[postId]/like/route.ts
src/app/api/combat-posts/[postId]/route.ts
src/app/api/combat-posts/[postId]/video/route.ts
src/app/api/combat-posts/policy/route.ts
src/app/api/combat-posts/route.ts
src/app/api/equipment/[id]/route.ts
src/app/api/equipment/route.ts
src/app/api/health/route.ts
src/app/api/heroes/[id]/route.ts
src/app/api/heroes/assets/[...segments]/route.ts
src/app/api/heroes/route.ts
src/app/api/heroes/watch/route.ts
src/app/api/me/avatar/route.ts
src/app/api/me/profile/route.ts
src/app/api/official-news/route.ts
src/app/api/resources/data/route.ts
src/app/api/resources/leases/route.ts
src/app/api/tournaments/[id]/admin/resign/route.ts
src/app/api/tournaments/[id]/admin/route.ts
src/app/api/tournaments/[id]/extend/route.ts
src/app/api/tournaments/[id]/join/route.ts
src/app/api/tournaments/[id]/kick/route.ts
src/app/api/tournaments/[id]/leave/route.ts
src/app/api/tournaments/[id]/matches/[matchId]/confirmation/route.ts
src/app/api/tournaments/[id]/matches/[matchId]/disputes/route.ts
src/app/api/tournaments/[id]/matches/[matchId]/recognitions/route.ts
src/app/api/tournaments/[id]/matches/[matchId]/route.ts
src/app/api/tournaments/[id]/matches/[matchId]/screenshots/[type]/route.ts
src/app/api/tournaments/[id]/matches/[matchId]/submit/route.ts
src/app/api/tournaments/[id]/matches/[matchId]/tactics/[side]/layers/[layerId]/markers/route.ts
src/app/api/tournaments/[id]/matches/[matchId]/tactics/[side]/layers/[layerId]/route.ts
src/app/api/tournaments/[id]/matches/[matchId]/tactics/[side]/layers/[layerId]/route/route.ts
src/app/api/tournaments/[id]/matches/[matchId]/tactics/[side]/markers/[markerId]/route.ts
src/app/api/tournaments/[id]/matches/[matchId]/tactics/[side]/route.ts
src/app/api/tournaments/[id]/matches/[matchId]/tactics/[side]/routes/[routeId]/route.ts
src/app/api/tournaments/[id]/matches/route.ts
src/app/api/tournaments/[id]/picks/route.ts
src/app/api/tournaments/[id]/route.ts
src/app/api/tournaments/[id]/split/route.ts
src/app/api/tournaments/[id]/temp-application/[appId]/route.ts
src/app/api/tournaments/[id]/temp-application/route.ts
src/app/api/tournaments/[id]/temp-player/route.ts
src/app/api/tournaments/join-by-code/route.ts
src/app/api/tournaments/public/route.ts
src/app/api/tournaments/route.ts
src/app/api/users/me/heroes/route.ts
src/app/api/users/me/roles/route.ts
src/app/debug/layout.tsx
src/app/m/admin/layout.tsx
src/app/m/tournaments/[id]/page.tsx
src/core/game/constants.ts
src/core/game/power.ts
src/core/resource-settings.ts
src/core/team-balancing/metrics.ts
src/core/team-balancing/search.ts
src/features/admin/server/overview.ts
src/features/announcements/server/service.ts
src/features/auth/model.ts
src/features/auth/server/register.ts
src/features/combat-posts/model.ts
src/features/combat-posts/server/service.ts
src/features/combat-posts/server/upload.ts
src/features/combat-posts/server/video-policy.ts
src/features/combat-posts/video-policy.ts
src/features/cron/task-lock.ts
src/features/cron/worker.ts
src/features/equipment/server/sync.ts
src/features/heroes/server/assets.ts
src/features/heroes/server/events.ts
src/features/heroes/server/sync.ts
src/features/matches/model.ts
src/features/matches/server/access.ts
src/features/matches/server/draft.ts
src/features/matches/server/recognition-provider.ts
src/features/matches/server/recognition.ts
src/features/matches/server/records.ts
src/features/matches/visibility.ts
src/features/media/server/quota.ts
src/features/media/server/storage-cleanup.ts
src/features/monitor/cycle.ts
src/features/official-news/server/service.ts
src/features/profile/model.ts
src/features/profile/server/avatar-storage.ts
src/features/profile/server/avatar.ts
src/features/resource-scheduler/client/usePageResources.ts
src/features/resource-scheduler/server/http.ts
src/features/resource-scheduler/server/registry.ts
src/features/resource-scheduler/server/scheduler.ts
src/features/shared/client/api.ts
src/features/tactics/model.ts
src/features/tactics/server/service.ts
src/features/tournaments/model.ts
src/features/tournaments/server/capacity.ts
src/features/tournaments/server/lifecycle.ts
src/features/tournaments/server/list.ts
src/features/tournaments/server/management.ts
src/features/tournaments/server/picks.ts
src/features/tournaments/server/split-use-case.ts
src/features/tournaments/server/split.ts
src/features/tournaments/server/team-balancing-pool.ts
src/features/users/server/deleteUser.ts
src/instrumentation.ts
src/lib/anti-bot.ts
src/lib/api-errors.ts
src/lib/auth-rate-limit.ts
src/lib/auth.ts
src/lib/db.ts
src/lib/media-validation.ts
src/lib/permissions.ts
src/lib/public-origin.ts
src/lib/redis.ts
src/lib/request-capacity.ts
src/lib/request-validation.ts
src/lib/resource-governor.ts
src/lib/runtime-logging.mjs
src/lib/session-config.ts
src/lib/session.ts
src/lib/storage/index.ts
src/lib/storage/local.ts
src/lib/task-write-fence.ts
src/middleware.ts
src/web/MatchWorkspace.tsx
src/web/TacticBoard.tsx
src/web/components/admin/AdminDashboard.tsx
src/web/components/content/MarkdownContent.tsx
src/web/components/tournament/TournamentDetail.tsx
tests/e2e/browser-profiles.mjs
tests/e2e/ci-auth-resource-regression.mjs
tests/e2e/run-proxy-regression.mjs
```

</details>
