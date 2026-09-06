# 王者演武堂：源码与线上联合评估 / Codex 执行清单

评估日期：2026-09-06。源码基线：`d0d45ddbd44339e2f9a2aca057e245e9d4f3b458`（main）。

## 0. 结论与适用范围

项目已经具备明确产品定位、完整桌面视觉和一定工程防护，适合在修复入口阻断后开展受控的小圈子试用。当前线上版本不宜直接认定为稳定公开版：移动端入口仍重定向到 localhost，最新源码的未登录受保护页面跳转也遗漏了同类修复。下一阶段应集中完成「进入网站 → 登录 → 进房 → 分队 → 记录比赛 → 下次复用」闭环。

这次检查包含：当前 main 源码重点抽样；线上桌面首页、赛事大厅、英雄图鉴、李白详情、装备图鉴、登录页；手机 User-Agent 的无凭据 HTTP GET；健康接口；本地纯逻辑和配置复现；现有 CI 结果。没有提交真实账号密码，没有注册账号、创建赛事、上传截图/视频，也没有修改仓库或生产服务。没有运行生产压测、数据库恢复或真实 OCR。没有 iOS Safari / Android WebView 真机登录结果，不把手机 UA 请求称为真机测试。

证据标签：

- **A：线上实测**，只对记录时刻有效。
- **B：源码确认 / 本地复现**，说明实现或可复现逻辑，不自动等于生产已发生。
- **C：待验证风险 / 产品建议**，必须保留条件，不得写成已发生事故。

优先级：P0 阻断主入口；P1 下一次公开发布前应解决的可靠性/权限/业务问题；P2 后续维护与体验改进。该优先级是项目排期判断，不是 CVSS 评分。

## 1. 版本与现场证据

| 项目 | 本次观察 |
| --- | --- |
| 最新 main | d0d45dd，fix(web): preserve public host in device redirects |
| 最新提交时间 | 2026-09-06 08:47:42 UTC（提交作者时间） |
| 线上 releaseId | 20260906080547-4afbecbe1316-262004 |
| 线上对应源码 | 4afbecbe13160383ed9e8ce705898849590dd041 |
| 两版差异 | 最新提交修改 middleware 设备重定向，并增加 test-device-routing.ts |
| 最新 CI | success，运行编号 34023173674 |
| 实际依赖锁定 | Next.js 15.5.23、React 18.3.1、Prisma 5.22.0、iron-session 8.0.4、ioredis 5.11.1 |
| 源码规模 | src 下 .ts/.tsx/.css 共 285 文件、26,175 行；这是规模描述，不是质量分数 |

2026-09-06 09:13:25–09:13:56 UTC（北京时间 17:13 左右）HTTP 只读快照：

| 请求 | 状态 | 关键结果 |
| --- | --- | --- |
| 桌面 GET / | 200 | 首页可读 |
| 手机 GET / | 307 | Location: https://localhost:8001/m |
| 手机 GET /login | 307 | Location: https://localhost:8001/m/login |
| 未登录桌面 GET /me | 307 | Location: https://localhost:8001/login?redirect=%2Fme |
| GET /api/health | 200 | ok=true；database/mediaStorage/avatarStorage/cron=ok；redis=degraded |

浏览器点击「我的」后，错误目标地址触发浏览器 URL 策略阻止，未访问该 localhost 目标。独立的只读 HTTP 快照与源码已经足以定位问题，不需要绕过浏览器限制。

来源：[最新提交](https://github.com/YunHe-Rocky/wzywt/commit/d0d45ddbd44339e2f9a2aca057e245e9d4f3b458)、[当前 CI](https://github.com/YunHe-Rocky/wzywt/actions/runs/34023173674)、[线上健康接口](https://ywt.yunhe.ink/api/health)。

## 2. 优点：应保留的基础

1. **产品方向集中。** 首页强调好友内战、按实力分队、照顾分路偏好，比泛化游戏资讯站更有实际使用理由。桌面深蓝、金色、峡谷背景、图标和按钮整体一致，首页主行动清晰。
2. **分层已有约束。** app/web → features → core，并有自动架构检查；core 的分队与游戏计算可单独调用。Web 与 cron 分进程，适合现阶段单机部署。
3. **会话权限不是只看 Cookie 是否存在。** requireAuth 会回查账号、封禁、临时账号、sessionVersion 和当前角色；受保护路由仍应逐个坚持服务端鉴权。只读鉴权不销毁 Cookie，避免旧请求清掉新登录会话；前端登录后再请求 /api/auth/me 确认落地。
4. **赛事并发有认真处理。** 加人使用 Serializable 事务和冲突重试，容量限制为 10；分队提交再次检查玩家集合，避免算完后成员已经改变。
5. **战绩设计有审计意识。** 六类截图、十名玩家、同场一致性、人工确认、正式提交、异议、管理员纠正及版本冲突控制已形成模型。数据库 Restrict 关系有助于保护历史引用。
6. **上传和外部请求有限制。** 视频采用 busboy 流式写入、大小限制、魔数检查、空闲超时、临时文件和原子 rename；官方爬取有 HTTPS 主机白名单并禁止跟随重定向。
7. **发布基础比手工覆盖完善。** 独立 release、发布前数据库备份、migration、current 切换、PM2 状态和版本化 health 校验、失败保留诊断。数据库锁作为 cron 的权威锁，Redis 故障恢复时也保留互斥基础。

以上是抽样实现确认，不等于完成了整个系统安全审计或生产验收。

## 3. 必须执行的修复任务

### R01 / P0 / A+B：统一公网重定向并实际发布

**证据位置：** `src/middleware.ts`：externalRedirectUrl（23 行起）、设备路由（65–73 行）、未登录路由（88–92 行）；`scripts/test-device-routing.ts`；Nginx 模板。

**原因：** 线上仍是 4afbecb。最新 d0d45dd 在设备跳转处改用公网 Host 与协议，但未登录分支仍然 `new URL(loginPath, req.url)`。反向代理场景下 req.url 的 origin 可以是 `https://localhost:8001`。

**本地复现：** 内部请求 URL=`https://localhost:8001`，Host=`ywt.yunhe.ink`，X-Forwarded-Proto=`https`。

| 路径及 UA | 最新源码输出 |
| --- | --- |
| / + iPhone | https://ywt.yunhe.ink/m（已修复） |
| /me + Desktop | https://localhost:8001/login?redirect=%2Fme（遗漏） |
| /m/me + iPhone | https://localhost:8001/m/login?redirect=%2Fm%2Fme（遗漏） |

**实施：** 所有设备与认证重定向使用同一个安全 origin 解析函数；处理内部 URL、公网 Host、端口和协议。只接受受信代理传入的转发头，公网入口覆盖用户可伪造的头；若采用固定 PUBLIC_ORIGIN，部署校验它与站点一致。认证返回路径保留 pathname+search；前端同样用 URL 解析和同源校验处理 redirect，覆盖反斜杠等边界，避免只靠 startsWith。不得以关闭 Secure Cookie 掩盖重定向问题。

**验收：** 在真实 Nginx 前分别检查桌面 /me、/admin 与手机 /、/login、/m/me、带 query 的页面。Location 始终是批准的公网 origin，API/静态资源不被设备重定向。完成真实测试账号登录、刷新保留会话、退出、再次访问受保护页。health.releaseId 必须匹配包含完整修复的提交；不能只验证 localhost 的 health。

### R02 / P1 / B：让回归测试成为 CI 和发布门禁

**证据位置：** `.github/workflows/ci.yml`、`package.json`、`scripts/test-device-routing.ts`、`tests/e2e/login-transition-regression.mjs`。

CI 为绿色，但没有运行新建的设备路由脚本，也没有运行登录 E2E。登录转场 E2E 固定 Windows Chrome 路径，且 mock 了登录接口和 Cookie，不能验证真实反向代理及会话落地。CI 也未执行单独的 test:auth-session 与 test:resources。

**实施：** 把设备重定向、auth-session、resources 纳入稳定检查入口；将真正的反向代理登录集成测试与视觉 mock 测试分开。浏览器路径通过环境/Playwright 管理，移除强制 Windows 绝对路径。增加 Android Chromium 和 WebKit 的自动化用例；发布前另保留真实 iOS Safari / Android 常用浏览器人工验收。

**验收：** 故意把认证分支恢复为内部 req.url 时 CI 必须失败；测试能够检测 Cookie 未保存、旧 sessionVersion、退出后受保护资源继续可读。版本与公网 smoke 测试失败不得标记发布完成。测试使用专用数据，不访问生产账号。

### R03 / P1 / B：补齐资源租约的服务端鉴权和撤销

**证据位置：** `src/app/api/resources/data/route.ts`、`src/app/api/resources/leases/route.ts`、`src/features/resource-scheduler/server/scheduler.ts`、`registry.ts`。

申请租约时会 authenticate，但 GET data、PATCH renew、DELETE release 不校验当前登录身份。scheduler 的 getResource/renewLease/releaseLease 也只收 leaseId。`tournaments.lobby` 是用户作用域资源，却可由持有 leaseId 的请求读取和续期；续期可以使这个独立于会话的访问能力继续存在。UUID 不等于会话权限校验。

**边界：** 这不是「猜到任意用户数据」的线上证明；可利用前提是获得有效租约 ID，例如原会话持有者保存了它。确认的是用户会话撤销、封禁或角色变化没有在后续租约操作中重新检查。客户端监听身份变化和释放租约不是安全边界。

**实施：** 按资源 scope 区分公共和私有；私有资源读取、续期、释放必须 authenticate 并校验 owner/sessionVersion，不能只信请求传来的 userId。退出、改密、封禁后的租约拒绝续期和读取；敏感数据使用 private/no-store。公共租约保留匿名能力并限制并发数/请求率。日志不得记录完整敏感租约参数。

**验收：** 自己的有效租约可用；不同用户、无 Cookie、已撤销版本、封禁用户读取/续租私有资源均被拒绝。没有被授权的公共→私有路径。测试通过路由层执行，不能只测 scheduler 缓存命中。

### R04 / P1 / B：登录、注册及重置确认的反滥用

**证据位置：** `src/app/api/auth/login/route.ts`、`register/route.ts`、`reset-password/route.ts`、`security-question/route.ts`、`src/lib/auth-rate-limit.ts`、Nginx 示例。

密码重置问答阶段有限流，但登录和注册路由未接入对应限流；仓库 Nginx 模板也未见 limit_req。重置确认分支在校验 token 是否存在前先 bcrypt 哈希新密码。公开 security-question GET 区分用户不存在与未设问题，可枚举账号。实际生产入口是否另有 WAF/限流未验证，不应声称生产绝无防护。

**实施：** 登录按账号与可信 IP 分层限流，注册按 IP/风险策略限流，重置完成同样限流；输入设上限，统一常见失败文案。先做廉价 token 格式/存在性检查再做昂贵哈希，最终消费仍必须在事务里原子完成。根据反代拓扑设置可信客户端 IP，不能直接信任外部可伪造的 X-Forwarded-For 首项。为写接口增加统一 Origin/Fetch Metadata 或 CSRF 校验策略，避免把 SameSite 当作唯一保障。

**验收：** 在隔离测试环境验证 429/Retry-After、并发限流、伪造转发头无效和恢复窗口；无效 token 不大量触发哈希；不得通过在线爆破测试证明问题。

### R05 / P1 / B：把分队计算移出 Web 主线程

**证据位置：** `src/core/team-balancing/search.ts`、`metrics.ts`、`src/app/api/tournaments/[id]/split/route.ts`、`ecosystem.config.js`。

分队在 Route 内同步调用 splitTeams。角色分配最坏有 10!/(2!^5)=113,400 种，每种再检查 16 个红蓝排列，共 1,814,400 个候选。偏好均相同或全缺失时，当前叶节点偏好淘汰不能有效减少候选。

本地 Node.js 24.19.0 单次测量（评估环境，非生产容量数据）：

| 场景 | 用时 |
| --- | --- |
| 十人都未填分路偏好/战力 | 1,929 ms |
| 十人相同分路优先级 | 2,429 ms |
| 轮转分路优先级 | 22 ms |

**实施：** 采用有界 worker_threads 池或独立任务进程；同赛事 single-flight/幂等，设队列上限和时间预算。算法可用前缀偏好上界剪枝、缓存组合、减少候选对象分配，但保持现有业务排序语义。不要只给 Route 加 async，CPU 仍会阻塞。

**验收：** 上述三类场景结果与基准一致、输入不变、输出确定；计算期间 /api/auth/me 和 /api/health 不随计算暂停。生产相近规格测 p95、event-loop delay、队列等待与 CPU；目标值须基于实机基线制定，报告数字不能直接当云服务器承诺。

**产品规则提醒：** 当前按第一偏好人数、第二偏好人数等做字典序最大化，然后才比战力差，不是可互相折中的加权公平度。向用户解释这个优先级；使用历史对局胜差验证权重，未知战力用中位数回填需标记低置信度。

### R06 / P1 / B：完成 OCR 超时与降级闭环

**证据位置：** `src/features/shared/client/api.ts`（默认 30 秒）、`src/features/matches/client/api.ts`、`src/features/matches/server/recognition-provider.ts`（90 秒）、`recognition.ts`、`records.ts`、`.env.example`。

startRecognition 使用 jsonRequest 的 30 秒默认预算，而服务端同步等待最长 90 秒。上游在 30–90 秒成功时，用户可能已看到失败，服务端却继续写识别结果。环境模板把 OCR 标为可选，但正式 submit 要求至少一个 COMPLETED 识别记录和一致性通过；未配置 OCR 时没有人工提交兜底路径。线上 OCR 是否已配置未验证。

**实施：** 推荐 POST 返回 202+jobId，后台识别，客户端读状态；同一比赛/截图版本幂等，结果绑定输入快照，进程重启后可恢复或明确失败。短期修复可为 OCR 显式设合理客户端预算并在超时后查询状态，但要同时审查代理超时。若保持 OCR 可选，提供有审计的人工确认模式；若作为必需组件，启动/界面必须明确不可用，不能让用户填完整条流程后才失败。

**验收：** 使用假 OCR 服务模拟 5/35/95 秒、断网、错误 JSON、重复点击、页面刷新和旧截图结果晚到；每次操作最终状态可解释，无重复应用和假失败。无 OCR 配置的部署也有清晰功能边界。

### R07 / P1 / A+B：修复装备数据的字段语义和零值同步

**证据位置：** `src/features/equipment/server/sync.ts`（98–151 行）、`list.ts`、`src/app/equipment/page.tsx`、`[id]/page.tsx`。

线上列表显示铁剑 165、末世 1260、无尽战刃 1224。官方 item.json 本次返回：

| 装备 | 上游 price | 上游 total_price | 线上显示 |
| --- | --- | --- | --- |
| 铁剑 | 165 | 275 | 165 |
| 末世 | 1260 | 2100 | 1260 |
| 无尽战刃 | 1224 | 2060 | 1224 |

代码只将 item.price 持久化/展示，而 total_price 仅用于等级判定。当前界面没有告诉用户是哪种价格。购买总价应使用 total_price 并显式标注；若同时保留出售价格，分别定义字段，不能把两个口径混为一谈。不要把这些抓取值等同于所有游戏模式的实时价格。

同步另有确定性缺陷：`if (stats.atk) updateData.atk = stats.atk` 等真值判断会跳过 0。某次更新移除属性时数据库旧值留存，extraJson 列表和标量详情可能不一致。正则对空格、移动速度写法等也脆弱，数据校验与缺失语义需要明确。

**实施：** 新增明确的 buyPrice/sellPrice 或定义原 price 为总价并迁移；字段和 DTO 一次性切换。区分「可信零值」「字段缺失」「解析失败」，合法零值覆盖旧值，解析失败拒绝覆盖整批关键数据。以规范化全量对象计算 hash，记录 source/schemaVersion/fetchedAt，建立采样差异告警。

**验收：** 固定上游 fixture 验证上述价格、非零→零、空格/换行/小数、下架装备、异常空列表；列表/详情/计算使用同一个规范 DTO。查询结果必须可追溯到上游快照。

来源：[王者荣耀官方装备数据](https://pvp.qq.com/web201605/js/item.json)。

### R08 / P1 / A+C：处理 Redis 降级，并区分存活与可用

**证据位置：** `src/app/api/health/route.ts`、`src/lib/redis.ts`、`scripts/deploy.sh`、`verify-deploy-state.mjs`。

线上明确返回 redis=degraded。按源码，REDIS_URL 配置后探测失败且 REDIS_REQUIRED!=1 才产生此状态；这是可选依赖失败时的设计，不能把 HTTP 200 直接叫错误，也不能据此判断密码一定写错。网络、服务状态、密码/ACL、连接超时都需服务器侧日志确认。

**实施：** 运维核对同用户、同运行时的 Redis 连接，避免输出密码。若产品确实依赖其性能/功能，恢复后再设置必需；若不使用，则明确不配置。设置独立告警关注 checks.redis、cron 和磁盘，区分 liveness/readiness/功能就绪。发布 smoke 使用公网域名，而非仅内部 /api/health。

**验收：** 正常状态符合部署声明；人为隔离环境 Redis 故障后请求的退化延迟、恢复行为、cron 互斥和告警符合预期；不可出现长期 degraded 无人知道。报告不建议为了返回绿色而直接隐藏失败。

### R09 / P2 / B：对齐会话期限和账号恢复策略

`src/lib/session.ts` 设置 Cookie maxAge=90 天，但未设置 iron-session ttl；锁定的 8.0.4 默认 seal ttl 是 14 天，不能把注释中的「三个月」当成有效登录保证。明确绝对/滑动期限、重新认证规则，并统一 Cookie 与 seal TTL。安全问题不适合成为长期唯一恢复方式；先降低账号枚举和限流风险，再按产品规模考虑恢复码或已验证渠道。

验收：测试到期前后、续期、改密撤销、旧标签页晚到响应，不依赖等待真实 14 天；使用可控时钟或较短测试配置。

### R10 / P2 / B：协调历史档案与删除语义

`deleteUser.ts` 会删除所拥有赛事并删除用户，但 InternalMatch、MatchPlayer 等关系使用 onDelete: Restrict。有关联档案的账号/赛事删除可能被外键拒绝，部分 Route 未把该情况转成明确业务响应。这是应保护历史引用与旧删除流程之间的冲突，不是已经证明数据被级联删除。

明确账号停用/匿名化、赛事归档、房主转移与彻底删除的条件；保留审计关系，不通过改 Cascade 快速消除外键错误。返回可理解的 409 等业务错误，整个操作原子性保持。测试无历史、有草稿、有正式比赛、有视频动态的账号/赛事生命周期。

### R11 / P2 / B+C：给缓存、上传和磁盘设明确边界

资源调度器采用进程内 Map；EVICTED 只清 value，不删除用户条目元数据。长期访问用户增长可能让 entry 元数据持续积累；不能根据此项声称当前发生内存泄漏事故。增加最大条目数、LRU/过期删除、租约配额。当前 PM2 配置是单 Web 进程，不能直接改为多实例后期待租约自动共享；扩容前处理共享存储或去状态化，并验证 SSE/缓存一致性。

视频单文件上限 500 MiB，已有流式传输避免整段载入，但未见完整用户/全站容量配额与磁盘水位控制。增加配额、空余空间保留、清理账本和中断恢复；核对 Nginx request buffering 与临时目录容量，按媒体预算决定是否外置对象存储。不要把流式上传等同于没有磁盘耗尽风险。

部署的数据库备份不自动包含截图、头像和视频；建立数据库+媒体一致备份、异机保留、定期恢复演练。代码回滚也不等于数据库自动回滚，schema 变更采用 expand/contract，旧版必须兼容新 schema。实际磁盘大小、异机备份与恢复结果本次未读取。

### R12 / P2 / A+B：修复体验断点，收敛维护成本

- 登录页把站内 username 标为「召唤师名称」，与独立 gameNickname 概念冲突；明确「站内账号」，提示不要填游戏昵称。
- 装备首页承诺「看合成」，卡片实现为没有详情动作的 div；虽然存在详情路由，普通列表没有连接入口，syncItems 也未见合成 components 填充。连接真实可用的详情/合成流程，或者先收敛文案。
- 首页公告直接展示 src/web、features、core 等开发内容，并出现字面 `\n`；改为用户可理解的改进，技术日志单独维护。自动资讯中出现其他游戏的交叉推广内容，按来源栏目/主题过滤。
- 开场动画有跳过、reduced-motion、焦点隔离和超时兜底，保留这些。缩短用户要立即进房时的额外等待；不要为每个新标签页重复增加仪式感。
- 英雄图鉴检索和详情本次正常，132 是展示条目数（可能含命格/形态），不要自动解释成游戏基础英雄总量。为图鉴标注数据时间和版本，避免用户把旧属性当当前实战事实。
- 对手机按 360/390/430 CSS px、软键盘、横竖屏、顶部/底部安全区做真实回归；本次没有真机布局证据，不得发布「手机视觉完全通过」结论。
- globals.css 2,176 行，连同三个 arena 样式文件集中在根 layout；TournamentDetail.tsx 978 行，多处 any 与双份 DTO 字段。按页面/业务拆分组件和样式，逐步移除覆盖式 CSS 和 any；无需因此重写成微服务。
- AGENTS 文案仍写 Next.js 14，锁文件为 15.5.23，package version 为 0.1.0，线上公告为 3.0.0。区分产品版本与 release commit 并同步文档。
- 当前 sitemap 只有五个静态入口；英雄详情是客户端取数，根 metadata 通用。若希望搜索流量，再为公开详情加服务端内容、独立 title/description/canonical；不需要为登录私有数据做 SEO。

## 4. 产品与架构建议

### 产品主线

优先打造好友群体的内战组织与复盘工具。最有价值的差异来自分路偏好、透明的分队理由、临时玩家加入、赛后记录和再次开局。英雄/装备图鉴可以辅助等人和查资料，不宜消耗全部精力做一个数据口径不明的百科。

建议下一阶段只跟踪四个业务指标：登录成功率、成功进房率、满员到完成分队的时间、比赛档案提交完成率。分队口碑再看用户是否接受分配、赛后双方差距与下一次是否使用。无行为数据时，不给留存率/市场规模/并发容量的数值结论。

### 技术取舍

保留 Next.js 模块化单体、MySQL 事实数据、可选 Redis、独立 cron。当前不需要 Kubernetes 或大量微服务。先把 CPU 分队与长 OCR 任务移出 HTTP 请求主链，并统一 API 鉴权、数据校验、错误映射、日志和请求关联 ID。接入指标后再决定数据库索引优化、CDN 或扩容。

### 视觉评价

桌面视觉已经具备正式产品的统一感；暗色金色与主题匹配，首页行动层级合理。信息可读性比动效数量重要：装备长描述字号较小，空白与大筛选面板占屏明显，可增加紧凑列表；表单应明确账号概念。没有测色工具和完整可访问性审计，不宣称达到 WCAG 等级。

## 5. 验证记录与限制

| 项目 | 结果与边界 |
| --- | --- |
| main CI 34023173674 | GitHub 显示 success；不等于每个 E2E 已执行 |
| Device routing 原有测试 | 本地通过；额外的认证路由场景复现遗漏 |
| Architecture check | 本地通过 |
| Typecheck | 本地通过 |
| Core tests | 本地通过；为 Prisma 构造提供虚拟 DATABASE_URL，未连接真实数据库 |
| Resource scheduler tests | 本地通过；额外演示 get/renew 不要求调用方身份 |
| Auth session contract | 本地通过；属于源码契约断言，不能替代真实 Cookie 测试 |
| Lint | 0 errors / 18 warnings，主要是原生 img 提示 |
| npm audit --omit=dev | 当时返回 0 个已报告漏洞；不涵盖业务逻辑安全，也非未来保证 |
| 本地性能 | splitTeams 三种场景单次计时；无生产 QPS/p95 结论 |
| 本地完整生产构建 / 数据库集成 | 未重新执行；参考该 SHA 的成功 CI，不能写成本地已通过 |
| 真机登录 / 上传 / OCR / 战术协作 | 未执行真实端到端，需要测试账号及隔离环境 |

开始运行 tsx CLI 时评估环境不允许它创建 IPC socket，随后使用 `node --import tsx` 执行同一脚本。Prisma 独立 generate 调用的网络步骤未取得完整成功记录，不计为本地通过项；类型检查及实际已运行脚本的结果按各自输出记录。

## 6. 执行顺序与完成定义

1. **热修复批次：R01 + R02 的入口门禁。** 修全公网 origin、部署匹配 releaseId、桌面/手机认证入口回归，再验证 Redis 状态。
2. **安全与可靠性批次：R03、R04、R05。** 私有租约回归、反滥用、CPU 隔离；随后 R06 异步识别闭环。
3. **业务可信度批次：R07、R09、R10。** 价格/零值、会话 TTL、历史删除/归档。
4. **运维与体验批次：R08、R11、R12。** 功能就绪监测、容量/备份、移动端和文案/结构收敛。

每个 PR 只解决一个可审核问题，写清失败场景、用户影响、代码变动、验收证据和剩余限制。先读仓库 AGENTS 与权威架构文档；不修改既有 migration、不提交凭据，不将本报告推测项当作产品授权。涉及 schema/数据生命周期的变更先提供迁移与恢复方案。最终验收必须使用公网部署链路，不能仅凭单测通过或 health=200 完成结项。

## 7. 源码索引（固定评估版本）

- [Middleware](https://github.com/YunHe-Rocky/wzywt/blob/d0d45ddbd44339e2f9a2aca057e245e9d4f3b458/src/middleware.ts)
- [Auth login](https://github.com/YunHe-Rocky/wzywt/blob/d0d45ddbd44339e2f9a2aca057e245e9d4f3b458/src/app/api/auth/login/route.ts)
- [Session](https://github.com/YunHe-Rocky/wzywt/blob/d0d45ddbd44339e2f9a2aca057e245e9d4f3b458/src/lib/session.ts)
- [Resource data API](https://github.com/YunHe-Rocky/wzywt/blob/d0d45ddbd44339e2f9a2aca057e245e9d4f3b458/src/app/api/resources/data/route.ts)
- [Resource scheduler](https://github.com/YunHe-Rocky/wzywt/blob/d0d45ddbd44339e2f9a2aca057e245e9d4f3b458/src/features/resource-scheduler/server/scheduler.ts)
- [Team search](https://github.com/YunHe-Rocky/wzywt/blob/d0d45ddbd44339e2f9a2aca057e245e9d4f3b458/src/core/team-balancing/search.ts)
- [OCR provider](https://github.com/YunHe-Rocky/wzywt/blob/d0d45ddbd44339e2f9a2aca057e245e9d4f3b458/src/features/matches/server/recognition-provider.ts)
- [Match records](https://github.com/YunHe-Rocky/wzywt/blob/d0d45ddbd44339e2f9a2aca057e245e9d4f3b458/src/features/matches/server/records.ts)
- [Equipment sync](https://github.com/YunHe-Rocky/wzywt/blob/d0d45ddbd44339e2f9a2aca057e245e9d4f3b458/src/features/equipment/server/sync.ts)
- [Prisma schema](https://github.com/YunHe-Rocky/wzywt/blob/d0d45ddbd44339e2f9a2aca057e245e9d4f3b458/prisma/schema.prisma)
- [Deploy](https://github.com/YunHe-Rocky/wzywt/blob/d0d45ddbd44339e2f9a2aca057e245e9d4f3b458/scripts/deploy.sh)
- [CI workflow](https://github.com/YunHe-Rocky/wzywt/blob/d0d45ddbd44339e2f9a2aca057e245e9d4f3b458/.github/workflows/ci.yml)
