# 王者演武堂：全面代码评测与 Codex 整改任务书

评测日期：2026-09-05  
仓库：https://github.com/YunHe-Rocky/wzywt  
固定提交：6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d  
配套文件：wzywt-user-review.pdf。PDF 面向用户与项目负责人；本文面向实施开发者。

## 1. 执行结论

这个项目已经形成“朋友局组织、分队、比赛档案、内容分享、战术复盘”的业务骨架。确定性分队、数据库并发保护、会话版本校验和独立 release 发布值得保留。

当前最重要的矛盾是：功能和基础设施扩展很快，但跨模块的权限、状态、资源预算和历史数据规则没有全部闭合。下一轮工作应优先修复这些边界，再扩展功能。保留 Next.js 模块化单体；无需为当前问题引入微服务、Kubernetes 或重写技术栈。

建议定位为“适合继续打磨的内战组织与复盘产品”。在扩大公开使用前，应先完成 R01-R08 的相关核心修复，并处理 R09-R12 的运行与验证门槛。此结论是工程评估，不是生产环境验收证明。

## 2. 范围、证据与限制

### 2.1 本次实际完成

- 使用 GitHub 连接读取主分支、固定提交源码、目录和该提交的 Actions 状态。
- 检查认证、资源调度、赛事容量、分队、截图、OCR、战绩确认/纠错、视频、数据库、发布与 CI 的关键调用链；对前端和样式做代码抽查。
- 使用原始业务代码进行四类隔离验证。只在评测临时目录运行，没有修改或发布项目。
- 核对依赖锁文件：Next.js 15.5.23、React 18.3.1、Prisma Client 5.22.0、node-cron 4.5.0、TypeScript 5.9.3。这是固定提交的锁定版本，不是对“最新版本”的断言。
- 该提交 [GitHub CI 运行记录](https://github.com/YunHe-Rocky/wzywt/actions/runs/33956507110) 为 completed / success。

### 2.2 没有完成的验证

- 未启动完整网站，未做真实浏览器视觉验收或真实手机性能测试。
- 未连接生产 MySQL、Redis、PM2、Nginx，未验证服务器现行配置。
- 未在本地重跑全部依赖安装、构建、迁移和 CI。
- 未调用真实 OCR 服务，没有可用于计算识别准确率的标注数据集。
- 未做全历史 Secret 扫描、依赖漏洞数据库审计或网络渗透测试。

“已确认”指源码或隔离验证能确认该行为；“条件风险”指触发依赖部署或并发环境；“规划建议”不代表现有代码一定出错。不要将源码发现写成已经发生的线上事故。

### 2.3 隔离验证记录

| 项目 | 方法 | 结果 | 结论边界 |
| --- | --- | --- | --- |
| 匿名资源访问 | 原始 middleware，替换 NextResponse 返回对象 | 首页放行；无 Cookie 的 leases / data 请求均为 401 | 证明中间件分支；不是整站浏览器测试 |
| OCR 迟到结果 | 原始 recognition 服务及 normalizer；模拟 DB、存储、OCR；等待期间把比赛置为 SUBMITTED | 返回后状态被写成 WAITING_CONFIRMATION；更新条件只有 id | 证明服务缺少最终状态守卫；不是实际数据库并发集成测试 |
| 调度元数据回收 | 原始 ResourceScheduler；模拟时钟；100 个用户创建、释放租约并 sweep | 活跃租约为 0，100 个 EVICTED 条目仍存在 | 数据 payload 已清空；不能夸大成完整数据永久驻留 |
| 分队最差输入 | 原始 splitTeams；10 人无偏好、无已知战力；Node v24.19.0 | 两次 1494 ms、1532 ms | 当前容器局部 CPU 耗时，不是生产 P95 或真实服务器性能 |

## 3. 已有能力与值得保留的设计

| 维度 | 判断 | 依据及保留建议 |
| --- | --- | --- |
| 业务范围 | 已超过简单报名工具 | 房间、临时玩家、分路、英雄战力、比赛档案、动态、战术板已有对应模块 |
| 分层 | 方向清晰，执行不完全 | app/web → features → core；features → lib；继续保留纯算法层 |
| 认证 | 有实质防护 | bcrypt、加密会话、实时查询角色和封禁状态、sessionVersion；旧请求不再销毁新 Cookie |
| 报名并发 | 实现较扎实 | Serializable 事务、容量检查、唯一约束、有限重试；已有并发集成用例 |
| 战绩可信度 | 有人工确认与追溯意识 | 六类截图、字段来源、冲突提示、十人确认、总击杀校验、管理员操作记录 |
| 文件处理 | 已考虑流式与补偿 | 视频使用 busboy 和流式保存；有大小约束、内容头检查和文件删除补偿队列 |
| 运行维护 | 发布流程较完整 | 独立 release、先构建、备份后迁移、切换 current、校验 releaseId、保留失败诊断 |
| 测试 | 基础良好，覆盖入口不统一 | CI 含类型、lint、构建、算法、数据库集成和部署测试，但漏掉部分现有脚本 |

主要依据：[src/lib/auth.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/lib/auth.ts)；[src/features/tournaments/server/capacity.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/features/tournaments/server/capacity.ts)；[src/features/matches/server/records.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/features/matches/server/records.ts)；[src/features/combat-posts/server/upload.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/features/combat-posts/server/upload.ts)；[scripts/deploy.sh](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/scripts/deploy.sh)。

## 4. 优先级与实施顺序

- P1：扩大公开使用前或下一发布周期优先处理；包括权限、核心数据一致性及明显运行风险。
- P2：核心修复后安排；包括容量、恢复、维护和用户体验完整性。
- P3：随业务成熟推进，避免提前增加复杂度。
- 本文没有将未经验证的潜在问题升级为“已确认 P0 严重漏洞”。

| ID | 优先级 | 主题 | 证据类型 |
| --- | --- | --- | --- |
| R01 | P1 | 匿名页面与资源 API 权限矛盾 | 源码 + 隔离验证 |
| R02 | P1 | 私有租约读取、续期和释放缺少身份绑定 | 源码 |
| R03 | P1 | OCR 迟到结果覆盖新状态 | 源码 + 隔离验证 |
| R04 | P1 | 截图上传与正式提交存在状态竞争 | 源码、条件并发风险 |
| R05 | P1 | 登录/注册和重置完成阶段缺少完整限流 | 源码 |
| R06 | P1 | IP 限流信任转发头首项 | 源码、部署条件风险 |
| R07 | P1 | 管理员纠错破坏汇总或英雄一致性 | 源码 |
| R08 | P1 | 注销流程与历史记录 Restrict 约束冲突 | 源码 |
| R09 | P1 | 同步分队占用 Web 事件循环 | 源码 + 本地耗时 |
| R10 | P1/P2 | OCR 并发、内存与进程重启恢复 | 结构风险，容量需实测 |
| R11 | P2 | 媒体缺少总配额与完整恢复策略 | 已读上传/备份路径 |
| R12 | P1 | CI 未覆盖已有关键测试入口 | 工作流与脚本对照 |
| R13 | P2 | 租约状态只在进程内且回收不完整 | 源码 + 隔离验证 |
| R14 | P2 | 应用回滚与数据库回滚边界 | 部署源码 |
| R15 | P2 | 列表分页、查询投影与索引 | 源码、规模风险 |
| R16 | P2 | 路由职责、校验和错误契约不统一 | 源码 |
| R17 | P2 | 健康检查预算与任务失锁处理 | 源码、故障条件风险 |
| R18 | P2/P3 | 赛事、多局与公平策略的产品定义 | 当前模型事实 + 产品建议 |
| R19 | P2 | 前端恢复体验、可访问性和移动适配 | 代码抽查，需视觉验收 |
| R20 | P2/P3 | 依赖、文档、许可证和发布物治理 | 仓库内容 |

## 5. 逐项问题与验收标准

### R01：匿名页面无法正常取得公共资源

证据：[src/middleware.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/middleware.ts)；[src/app/api/resources/leases/route.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/app/api/resources/leases/route.ts)；[src/features/resource-scheduler/server/registry.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/features/resource-scheduler/server/registry.ts)；[src/app/page.tsx](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/app/page.tsx)；[src/features/heroes/client/useHeroes.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/features/heroes/client/useHeroes.ts)。

middleware 允许首页、英雄等页面，但 PUBLIC_API 没有 /api/resources。无会话 Cookie 的请求在到达 leases 路由前已返回 401。registry 将 home、heroes、equipment 定义为公开页面，却没有机会按此规则处理匿名请求。首页未接收 usePageResources 的 error，可能将失败表现为内容空缺或新闻加载未完成。

实施：
1. 建立统一的“页面资源访问策略”。资源接口允许进入路由，再按公共/私有资源进行真实权限判断。
2. 与 R02 一起完成，禁止仅扩大中间件白名单却忽略私有资源鉴权。
3. 首页和英雄页面区分空数据、加载中、失败三种状态，提供重试。

验收：无 Cookie、有效会话、伪造 Cookie、过期会话分别访问首页/英雄/装备；匿名公共数据成功，匿名私有数据 401；失败不得呈现为“本来没有内容”。

### R02：租约 ID 被当作访问私有资源的唯一凭证

证据：[src/app/api/resources/data/route.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/app/api/resources/data/route.ts)；[src/app/api/resources/leases/route.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/app/api/resources/leases/route.ts)；[src/features/resource-scheduler/server/scheduler.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/features/resource-scheduler/server/scheduler.ts)。

创建租约时会 authenticate，但 data GET、PATCH 续租、DELETE 释放没有重新鉴权或比对所有者。scheduler 的 getResource / renewLease / releaseLease 只收 leaseId；中间件仅检查 Cookie 是否存在。租约 ID 使用 randomUUID，不能据此声称可猜出任意用户数据；实际风险是已知私有租约可在会话撤销或账号切换后继续被使用、续期。

实施：
1. 为私有租约操作传入经 requireAuth 得到的 actor，校验 userId；需要即时撤销时关联 sessionVersion 或撤销租约。
2. 公共租约保持匿名可读，但设置创建和续期预算，避免无限租约。
3. getResource、renewLease、releaseLease 在服务层统一执行校验，防止未来绕过路由调用。
4. 客户端登出、身份变化时清理私有租约与页面缓存。

验收：A 的租约不能由 B 读取、续期、释放；封禁/改密撤销后不可继续读取私有数据；伪造 Cookie 无效；匿名公共资源仍可用。

### R03：OCR 返回时无条件覆盖比赛新状态

证据：[src/features/matches/server/recognition.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/features/matches/server/recognition.ts)，startMatchRecognition。

开始时仅检查非 SUBMITTED，随后最多等待 90 秒 HTTP OCR。完成事务以 id 更新比赛为 WAITING_CONFIRMATION，并按 matchId 标记所有当前截图为完成，没有对启动时的截图版本和比赛版本进行比较。重复 OCR、识别中换图、识别中提交都可能产生过时写入。隔离测试已重放 SUBMITTED 被迟到结果改回 WAITING_CONFIRMATION。

实施：
1. 新增明确的 screenshotRevision、matchVersion、activeRecognitionId，或达到同等效果的版本与任务关联。
2. 每个任务固定截图 ID、内容哈希和 revision；OCR 输出仅能对应其输入版本。
3. 完成时用条件更新检查版本、活动任务和允许的状态；未命中则标记 STALE/SUPERSEDED，不覆盖比赛。
4. 同一输入版本的重复启动应幂等或返回明确冲突。
5. 正式提交后原始证据锁定；识别过程不在长事务中等待外部请求。

验收：任务 A 延迟、任务 B 先结束、期间换图、期间确认/提交四类用例均不得被旧结果覆盖；正式比赛状态不能倒退。

### R04：上传截图的状态守卫位于事务之外

证据：[src/features/matches/server/draft.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/features/matches/server/draft.ts)，uploadMatchScreenshot；[src/app/api/tournaments/[id]/matches/[matchId]/screenshots/[type]/route.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/app/api/tournaments/[id]/matches/[matchId]/screenshots/[type]/route.ts)。

读取 currentMatch.status 后需要校验文件、保存文件、查询旧截图，再进入事务。事务内没有再次确认比赛仍可修改；最终直接改为 UPLOADED 或 DRAFT。若期间已正式提交，仍可能替换证据并倒退状态。原图 previous 也在事务外读取；同类型并发上传可能留下未被补偿清理的中间文件。

实施：
1. 与 R03 共用比赛版本守卫，事务中再次核对状态和 revision。
2. 在同一受保护写入中取得被替换对象，避免并发覆盖时遗漏回收。
3. DB 失败或条件冲突时删除刚存储对象或可靠入队。
4. 在读取整个 multipart 之前进行真实身份和比赛权限检查；目前权限检查发生在服务调用内、表单解析之后。

验收：上传和提交并发时只允许一条合法路径；拒绝修改已提交档案；并发替换后 DB 指向文件存在，旧文件可被最终清理；未授权请求不能先消耗完整截图解析资源。

### R05：认证防刷没有覆盖完整流程

证据：[src/app/api/auth/login/route.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/app/api/auth/login/route.ts)；[src/app/api/auth/register/route.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/app/api/auth/register/route.ts)；[src/app/api/auth/reset-password/route.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/app/api/auth/reset-password/route.ts)；[src/lib/auth-rate-limit.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/lib/auth-rate-limit.ts)。

登录和注册没有调用现有限流；注册还会做密码与答案两次 bcrypt。重置第一阶段有账号/IP 限制，但携带 resetToken 的完成阶段直接进入 completePasswordReset，并在查询 Token 有效性之前计算新密码哈希。

实施：
1. 登录实施账户和可信 IP 的组合预算；注册实施可信 IP、全局及必要的邀请/验证码策略。
2. 重置完成阶段独立限流，并先做廉价格式与令牌存在/过期检查；最终消费仍须在事务内原子执行，不能牺牲一次性语义。
3. 统一用户名、问题、答案和密码长度边界；密码边界按哈希库的字节行为设计，不静默截断。
4. 注册捕获并发用户名 P2002，返回 409；校验不能只依靠先查再写。
5. 错误消息避免不必要的账户状态泄露，日志不记录密码、答案或 Token。

验收：超过预算返回 429 和 Retry-After；不存在账户与正常账户的外部错误契约一致；两个并发同名注册只有一个成功、另一个为业务冲突；无效 Token 不能无限触发高成本哈希。

### R06：可信代理边界与 IP 限流规则不匹配

证据：[src/lib/auth-rate-limit.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/lib/auth-rate-limit.ts)，getRequestIp / normalizeIp；[docs/nginx-site.conf.template](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/docs/nginx-site.conf.template)；[docs/nginx.conf.example](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/docs/nginx.conf.example)。

应用取 X-Forwarded-For 第一项，Nginx 示例使用 $proxy_add_x_forwarded_for。该变量保留原请求头并附加 remote_addr；如果边缘代理接受客户端提供的头，首项可控。这会削弱 IP 维度的限流，不代表现有账号维度限制完全失效。依据：[Nginx 官方代理模块文档](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#variables)。

实施：
- 单一可信 Nginx 直面公网：由边缘覆盖传给应用的客户端地址头，应用端口限制只接受该代理。
- CDN/多代理：先明确定义可信代理来源，再从可信边界解析真实 IP；不能照搬单跳配置。
- IP 归一化兼容 IPv4/IPv6；源地址缺失时使用保守预算。

验收：向边缘发送不同伪造转发头，限流仍归属于同一真实来源；直接访问应用不能绕过边缘信任链。

### R07：管理员纠错后汇总数据可能自相矛盾

证据：[src/features/matches/server/records.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/features/matches/server/records.ts)，submitMatch / correctMatchRecord；[src/features/matches/server/draft.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/features/matches/server/draft.ts)，getMatchDetail。

正式提交会校验玩家 kills 之和与队伍总击杀相等。correctMatchRecord 允许修改 kills，但没有同步更新或重新校验 redTotalKills / blueTotalKills。允许修改 heroName，却可能保留 heroId，而展示优先 player.hero?.name，导致修改不生效或语义冲突。

实施：
1. 定义“可独立编辑字段”和“必须联动编辑字段”，把聚合约束放入领域服务。
2. 修改 kills 时重算相关队伍总击杀，或要求整组纠错并校验；具体产品规则需保持一致。
3. 英雄纠错同时处理 heroId / heroName / 关联展示；保留原始快照与纠错记录。
4. 保留现有乐观版本检查及审计，增加整场比赛修订号。

验收：纠错后所有展示和统计使用相同版本；审计包含旧值、新值、原因与操作者；并发纠错不丢更新；英雄名称不会“保存成功但仍显示旧值”。

### R08：账号注销与历史档案外键策略冲突

证据：[src/features/users/server/deleteUser.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/features/users/server/deleteUser.ts)；[prisma/schema.prisma](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/prisma/schema.prisma)；[src/app/api/auth/me/route.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/app/api/auth/me/route.ts)。

注销会删除用户拥有的赛事并最终删除 User；InternalMatch 对 Tournament、创建者等使用 Restrict，MatchPlayer 对成员也使用 Restrict。有比赛档案或参与记录的账号删除会受到外键限制；当前注销入口没有将这类情况转成明确产品行为。事务回滚能保护数据，但不能让注销流程完成。

实施：
1. 优先采用账号停用/匿名化与历史竞技档案保留分离；先定义展示昵称、审计人和媒体内容如何处理。
2. 仅对无历史引用的临时数据执行硬删除。
3. 房主退出时明确归档或转交，不让历史赛事跟随账号直接消失。
4. 对不可删除情况返回稳定错误码和用户说明；不要把 Restrict 改 Cascade 作为快捷修复。

验收：未参赛账号、参与过比赛账号、创建过档案房主、管理员四类场景可预期；其他九名玩家的档案不受破坏；失败不会留下部分删除。

### R09：分队同步计算阻塞 Web 事件循环

证据：[src/core/team-balancing/search.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/core/team-balancing/search.ts)；[src/app/api/tournaments/[id]/split/route.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/app/api/tournaments/[id]/split/route.ts)。

路由直接调用同步 splitTeams。搜索枚举 10!/(2!^5)=113,400 个分路分配；偏好相同的最差情况还枚举每个分配的 16 种去镜像队伍方向，共 1,814,400 个候选。当前实现为候选构造数组和签名，最差输入本地两次耗时约 1.5 秒。Node 官方说明同步长任务会占用事件循环：[事件循环性能指南](https://nodejs.org/learn/asynchronous-work/dont-block-the-event-loop)。

实施：
1. 先把算法放到有界 Worker 线程池，或已有后台任务架构；限制排队长度和同一房间重复请求。
2. 输入包括成员、偏好、战力及算法版本；可按输入哈希复用结果。
3. 优化候选分配与比较，增加可证明正确的剪枝；保持确定性、镜像消除和不修改输入。
4. 不要用 Promise 包一层冒充异步计算，不要为每个请求无限创建 Worker。

验收：最差输入和多个房间并发分队时，独立轻量接口仍能在约定延迟内响应；与原算法回归样本结果一致；线程池队列满时有明确退避。具体生产阈值以实际机器基线确定。

### R10：OCR 缺少有界作业与进程中断恢复

证据：[src/features/matches/server/recognition.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/features/matches/server/recognition.ts)；[src/features/matches/server/recognition-provider.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/features/matches/server/recognition-provider.ts)；[src/lib/media-validation.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/lib/media-validation.ts)；[ecosystem.config.js](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/ecosystem.config.js)。

单图最大 12 MiB，六图原始数据理论上限 72 MiB；识别服务把各图放入 Buffer，provider 又调用 Uint8Array.from 和 Blob。存在额外分配，但没有实测峰值，不能写成固定 N 倍内存。Web 的 PM2 重启阈值配置为 500M，而该流程未见全局 OCR 并发预算。进程被终止时 catch 不会执行，RUNNING 任务需要外部恢复逻辑。

实施：
1. 使用已有 DB/后台进程实现可持久化作业，先从并发 1-2 的保守配置起步，再实测调整。
2. API 返回任务 ID；支持状态轮询或 SSE，定义超时、取消、失败重试与幂等。
3. 定期回收超时 RUNNING，记录重试次数和最后心跳。
4. 记录任务输入版本，与 R03 统一；原图证据和用于 OCR 的压缩副本分开。
5. 建立脱敏标注集，统计各字段准确率、缺失率、人工修改率、耗时和失败原因。

验收：Web/worker 重启后任务能恢复或明确失败；并发和排队均有上限；真实六图测试输出内存峰值；低置信度只提示用户确认，不自动变成正式战绩。

### R11：单文件限制不等于媒体容量治理

证据：[src/features/combat-posts/server/upload.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/features/combat-posts/server/upload.ts)；[src/features/combat-posts/server/service.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/features/combat-posts/server/service.ts)；[src/lib/storage/local.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/lib/storage/local.ts)；[scripts/db-backup.mjs](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/scripts/db-backup.mjs)。

视频流式上传与单文件 256 MiB 上限是优点，但已读创建路径没有用户累计配额、每日配额和全局剩余空间预算。数据库备份脚本导出 SQL，不包含视频、截图或头像。不能因 release 目录持久化就声称有完整备份。

实施：
1. 用户/日/全站配额和预留空间；上传前预留、成功结算、失败释放，并考虑并发。
2. 增加像素/尺寸限制和实际解码验证；视频头部签名不能代替可播放性、时长与编码检查。
3. 媒体记录与备份清单关联；异地备份 SQL、媒体与恢复所需配置，敏感配置单独保护。
4. 监控磁盘剩余量、inode、临时文件、孤儿文件、补偿队列失败。
5. 保持当前存储接口，达到容量或带宽瓶颈时再替换对象存储。

验收：超配额/低空间明确拒绝；并发上传不能超卖配额；恢复到空目录后，抽样历史截图/视频可访问且校验和一致。

### R12：CI 成功不等于所有已有测试都被执行

证据：[.github/workflows/ci.yml](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/.github/workflows/ci.yml)；[package.json](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/package.json)；[scripts/test-auth-session-contract.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/scripts/test-auth-session-contract.ts)；[scripts/test-resource-scheduler.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/scripts/test-resource-scheduler.ts)。

CI 直接逐条运行脚本，未运行 test:auth-session、test:resources 或任何浏览器 E2E；package.json 的 check 中却包含前两项。已有 test:integration 确实覆盖部分容量/分队并发，不能说项目“没有集成测试”。

实施：
1. 统一验证入口或显式维护 CI 与 check 的契约，避免两份清单漂移。
2. 将现有会话和资源测试接入 CI。
3. 以真实路由和浏览器补匿名首页、登录后导航、退出重登、租约失效恢复。
4. 在真实 MySQL 测试库补 R03/R04/R07/R08 的并发与外键场景。
5. 目标生产 Node、MySQL 大版本应有对应兼容验证；当前 CI 是 Node 20 / MySQL 8.4，不能假设等同用户实际服务器。
6. 测试夹具只能使用独立测试数据库，启动前检查非生产条件。

验收：CI 日志能看到新增测试；核心缺陷先以回归测试失败，再因修复通过；不允许删除断言、跳过门槛或 continue-on-error。

### R13：资源调度的进程边界和回收边界不完整

证据：[src/features/resource-scheduler/server/scheduler.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/features/resource-scheduler/server/scheduler.ts)；[src/features/resource-scheduler/server/registry.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/features/resource-scheduler/server/registry.ts)；[src/features/resource-scheduler/client/usePageResources.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/features/resource-scheduler/client/usePageResources.ts)。

调度器为 globalThis 下的进程内 Map。发布/重启后租约消失；多 Web 实例之间不共享。客户端续租失败只提示刷新，没有自动重新获取。sweep 清除 payload 但不删除 EVICTED 元数据条目，100 用户隔离验证保留了 100 条元数据。

实施：
1. 当前保持单 Web 实例时，明确此约束；遇到 410 自动重新获取租约和数据，保留用户未提交编辑。
2. 为元数据与租约数设置上限，删除已回收且无引用的条目；历史指标聚合存储。
3. 在页面隐藏时减少续租/轮询，恢复可见时重新取得租约。
4. 只有确定需要多实例时，再共享租约存储或重新设计为无服务器租约的标准缓存读取；不要直接把 PM2 instances 改 max。

验收：进程重启后页面自动恢复；长期不同用户访问不会让元数据无限增长；租约不能在新账号下继续使用旧私有数据。

### R14：发布回滚不自动恢复数据库兼容性

证据：[scripts/deploy.sh](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/scripts/deploy.sh)；[scripts/db-backup.mjs](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/scripts/db-backup.mjs)；[scripts/mysql-backup.sh](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/scripts/mysql-backup.sh)。

脚本先构建、备份、迁移，再切换应用。失败时回切 current 和 PM2，但未自动撤销数据库迁移；这是应明确的边界。旧应用需要兼容已迁移 schema。不能以“有备份”代替“可无损回退”，也不应故障时自动导入旧备份覆盖新写入。

实施：
1. 采用先扩展、兼容读写、回填、后收缩的迁移策略。
2. 给破坏性迁移安排维护窗口与人工恢复决策点。
3. 建立独立恢复演练，记录 RPO/RTO、备份校验和及媒体清单。
4. 维护 release 与备份保留策略：保留 current、前一可恢复版本和必要失败诊断；不要自动清理仍被引用的版本。
5. 启用部署前磁盘空间预检；运行目录与构建产物分离。
6. 评估生成可部署构建物后下发，减少每次在小服务器 npm ci/build；结合实际发布频率决定。

验收：新版本失败后旧版本能在新 schema 上服务；恢复演练能在空库/空目录重建业务；清理策略不会删当前版本和唯一有效备份。

### R15：数据量增长后列表与限流查询需要优化

证据：[src/features/combat-posts/server/service.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/features/combat-posts/server/service.ts)；[src/features/tournaments/server/list.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/features/tournaments/server/list.ts)；[prisma/schema.prisma](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/prisma/schema.prisma)。

getCombatPost 一次读取全部 active 评论；赛事大厅查回全部相关赛事并 include 广泛字段，可能携带较大的 splitResult；评论/异议的每用户小时计数与现有索引不完全匹配。动态列表已有 take 12，不能笼统说全部没有分页。

实施：
1. 评论使用游标分页，以 createdAt + id 稳定排序；房间列表分页并只 select 列表所需列。
2. 根据真实 SQL 与 EXPLAIN 评估 authorId/createdAt、createdById/createdAt 等索引，避免无证据堆索引。
3. 给 schema 中的 status 字符串建立统一类型与状态迁移函数，减少 completed/finished 等概念混用。
4. COUNT 后 CREATE 的限流存在并发窗口，按风险采用原子预算机制。

验收：在声明的数据规模下测量响应体大小和查询耗时；翻页不重复漏项；索引调整有执行计划依据。

### R16：架构检查尚未覆盖“路由只做适配”

证据：[scripts/check-architecture.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/scripts/check-architecture.ts)；[src/app/api/auth/register/route.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/app/api/auth/register/route.ts)；[src/app/api/tournaments/[id]/split/route.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/app/api/tournaments/[id]/split/route.ts)；[src/lib/api-errors.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/lib/api-errors.ts)。

分层检查主要限制 core、features、web 的依赖方向，没有约束 app 内业务体积。注册与分队路由仍承担较多用例编排。多处手写 isRecord、parseText、parseInteger，错误处理方式不一致；apiErrorResponse 对未知异常仅记录 error.name，定位信息较少。

实施：
1. 把认证、分队等业务用例移至 features/server，路由负责参数、身份入口与 HTTP 映射。
2. 统一输入 schema、字段长度、错误码及响应结构；可沿用现有校验工具，不强制新增框架。
3. 架构检查用 AST 或可靠依赖分析增强：捕捉别名、相对路径、side-effect import 和客户端引用 server 模块。
4. 服务端结构化日志包含 requestId、用例、耗时、错误码及经过脱敏的堆栈；用户响应不泄漏内部错误。

验收：新增路由遵循统一模板；关键服务可在不构造 NextRequest 的情况下测试；同类错误返回一致契约；能从 requestId 追到失败原因。

### R17：健康检查与后台任务故障语义需要补全

证据：[src/app/api/health/route.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/app/api/health/route.ts)；[src/features/cron/task-lock.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/features/cron/task-lock.ts)；[scripts/deploy.sh](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/scripts/deploy.sh)。

健康检查顺序等待多个探测，各自有超时，而部署 health 默认 curl 总超时为 3 秒，存在总预算不匹配。REDIS_REQUIRED=1 且 REDIS_URL 空时，当前 health 仍走 skipped。task-lock 数据库租约丢失后记录日志并停止续期，但没有中止 operation，也没有写入端的 fencing 守卫；网络长故障等条件下可能出现旧任务继续执行。

实施：
1. 定义 liveness 与 readiness；独立探测可并行并设置统一总预算，部署等待参数与之匹配。
2. required 依赖缺配置应在配置阶段失败，不能视作跳过。
3. 公共健康响应只返回必要信息，详细诊断面向管理员或内部监控。
4. 后台任务失锁后阻止继续写入：传播取消信号并在批次写入前验证所有权，或使用递增 fencing token。
5. 为备份失败、持续 5xx、cron 心跳、磁盘低空间建立明确告警。

验收：每个依赖慢响应与失效都有可预期状态；required Redis 缺配置失败；两个 worker 在租约失效演练中不会同时产生有效写入。

### R18：把“房间、单场比赛、系列赛”及公平目标写清

证据：[prisma/schema.prisma](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/prisma/schema.prisma)，InternalMatch.tournamentId 为 unique；[src/core/team-balancing/metrics.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/core/team-balancing/metrics.ts)，compareCandidate。

当前每个 tournament 最多一个比赛档案，这是明确约束，是否改变取决于产品定位。分队算法先按第一志愿人数等字典序比较，再比总战力与分路差；因此“多满足一个第一志愿”可能胜过战力更接近的方案，这是产品策略，不是数学错误。

建议：
- 若一间房连续打多局，应拆清房间与局次，设计每局人员/英雄快照；用新 migration 调整唯一约束，禁止直接删除约束上线。
- 若确实一房一局，界面、帮助和命名明确说明。
- 分队结果显示志愿满足人数、双方估计强度、最悬殊分路、未知数据比例和算法版本。
- 先保留默认策略，再依据实际用户反馈考虑“偏好优先/均衡优先”，避免大量无法解释的权重。
- 用历史对局评估，不能把当前手工公式当作经过校准的真实胜率。
- 保留临时玩家低门槛，并清楚显示其估计实力的不确定性。

验收：用户能回答“为什么我被分到这个位置”；相同输入可复现；历史重算不会覆盖当时记录；多局需求有明确结论。

### R19：前端优先修复操作恢复和信息可理解性

证据：[src/web/components/tournament/TournamentDetail.tsx](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/web/components/tournament/TournamentDetail.tsx)；[src/web/MatchWorkspace.tsx](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/web/MatchWorkspace.tsx)；[src/app/globals.css](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/app/globals.css)；[src/middleware.ts](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/src/middleware.ts)。

TournamentDetail 约 979 行，globals.css 约 2311 行；复杂状态集中会提高修改成本。已有 reduced-motion 和移动端效果降级，不能指责完全未考虑可访问性。middleware 对移动 UA 自动加 /m，新增页面若没有对应别名可能出现导航缺口，需要路由一致性检查。

实施：
1. 将比赛工作台表现为“建档、上传、识别、确认、提交”，只突出当前下一步。
2. 六图展示各自状态、失败重试、低置信字段和必须人工处理的原因。
3. 网络断开、租约失效、页面刷新应保护未提交编辑；草稿按账号和比赛隔离，并有过期策略。
4. 按业务子模块拆 TournamentDetail 与样式，不按任意行数拆文件。
5. 验证键盘、焦点回收、对话框、屏幕阅读标签、触摸目标和颜色对比；美观评价留给真实截图/手机验收。
6. 检查全部 /m 别名和链接策略，评估长期统一响应式路由的迁移成本。

验收：手机完成核心流程无横向溢出；键盘可完成表单；失网重试不重复提交；账号切换不出现旧草稿；减少动态效果设置有效。

### R20：文档、依赖和发布治理

证据：[package-lock.json](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/package-lock.json)；[package.json](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/package.json)；[README.md](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/README.md)；[docs/code-architecture.md](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/docs/code-architecture.md)；[.github/workflows/ci.yml](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/.github/workflows/ci.yml)。

锁文件应是部署依据；仓库[AGENTS.md](https://github.com/YunHe-Rocky/wzywt/blob/6fe3f81ee4a4c30087ce31a699b7ecc11b87f05d/AGENTS.md) 仍有 Next.js 14 的描述，与锁定 15.5.23 不一致。README 明确尚未声明开源许可证，不能把“公开 GitHub 仓库”直接称为允许自由复用的开源项目。本文没有扫描漏洞数据库，禁止据版本号擅自生成 CVE 结论。

实施：
- 统一运行时版本、数据库兼容矩阵、环境变量来源和迁移指南。
- 记录 overrides 的原因、移除条件和验证用例；定期进行依赖审计与最小升级。
- 保留 lockfile，避免部署漂移。
- 将任务草稿、回归截图与长期权威文档分开；是否清理 Git 历史须单独评估，不能直接重写远端历史。
- 若希望外部贡献，补许可证决策、贡献指南、安全问题反馈方式；游戏素材与第三方来源另行核实使用条件。这里是发布治理建议，不构成法律结论。

验收：新维护者按一份权威指南可启动、测试、部署、定位日志和恢复；文档版本与实际依赖一致。

## 6. 推荐的目标架构

维持模块化单体，保留现有技术栈。按以下职责划分：

| 模块 | 负责 | 不应负责 |
| --- | --- | --- |
| 页面与组件 | 用户流程、输入反馈、恢复体验 | 数据库写入、最终权限判断 |
| API 适配层 | 解析请求、身份入口、错误到 HTTP 映射 | 大段业务计算与跨实体一致性 |
| 业务服务 | 权限规则、状态迁移、事务、幂等与审计 | 直接操作 DOM 或 UI 状态 |
| 纯算法 | 分队、字段归一化、确定性计算 | 数据库、网络、会话 |
| 后台 worker | 有界 OCR、同步、补偿与恢复 | 无上限任务并行 |
| 基础设施 | DB、缓存、存储、日志、发布 | 决定产品领域规则 |

资源调度先收紧当前实现的访问和恢复边界。分队使用受限计算资源；OCR 使用可恢复作业。MySQL 仍作为持久化事实来源，Redis 是按明确规则使用的缓存/辅助设施。

## 7. 分阶段执行任务单

### 阶段 A：关闭核心缺陷

顺序：R01+R02 → R03+R04 → R05+R06 → R07+R08；同时完成 R12 中的回归入口。

交付：
- 公共/私有资源访问矩阵及真实路由回归。
- 比赛状态、截图版本、活动识别任务设计和 migration。
- 认证限流与可信代理说明。
- 纠错与注销的数据规则。
- 每组变化独立、可审查的小 PR；不在同一 PR 顺便重做 UI 或技术栈。

完成定义：前述核心验收用例通过，历史数据不被破坏，现有 CI 门槛保持通过。

### 阶段 B：稳定运行与可恢复

范围：R09、R10、R11、R13、R14、R17。

交付：
- 分队计算隔离、OCR 作业与并发预算。
- 资源租约自动恢复、媒体配额和磁盘监控。
- 备份与恢复操作手册及一次恢复演练记录。
- 一份目标机器基线：普通请求延迟、分队耗时、OCR 峰值内存、上传吞吐、数据库慢查询。

完成定义：超时、重启、依赖失效、磁盘不足均有明确状态，且用户数据与后台任务可恢复。

### 阶段 C：体验、规模与产品扩展

范围：R15、R16、R18、R19、R20。

交付：
- 评论/大厅分页与查询优化。
- 路由薄化、统一校验、结构化日志。
- 六图工作流、分队解释与移动端验收。
- 明确一房一局还是一房多局；再决定系列赛、长期统计等功能。

完成定义：真实用户能顺畅完成核心流程，新增功能有明确价值与可衡量指标。

## 8. 必须保留的工程约束

1. 先读取仓库当前 AGENTS.md；执行时核对 HEAD，本文定位基于上述固定提交。
2. 不修改既有 migration；新增 schema 变更使用新 migration。
3. 生产仅使用 prisma migrate deploy，不使用 db push。
4. 不自动 stash/reset/清理生产目录，不在报告实施中直接操作线上数据库。
5. 不降低测试、类型、lint 或架构门槛掩盖失败。
6. 不将数据库 Restrict 改 Cascade 作为注销修复捷径。
7. 不把原始截图、账号私密信息、连接凭据写入日志或测试夹具。
8. 保留版本感知 health、发布备份、失败诊断和人工可审查的恢复路径。
9. 用真实行为测试验证权限与并发；静态“函数名存在”只能作为补充。
10. 部署、破坏性迁移、账号数据清理等执行动作仍遵循会话中明确授权范围。

## 9. 建议保留的验收命令

按照当前 package.json，基础门槛包括：

- npm run check:architecture
- npm run typecheck
- npm run test:core
- npm run test:auth-session
- npm run test:resources
- npm run test:markdown
- npm run test:next-stage
- npm run test:connections
- npm run test:integration
- npm run test:deploy
- npm run lint
- npm run build

按变更范围新增业务回归，并把关键浏览器测试接入 CI。不要把这些命令的列出当作本次全部执行过的证明。

## 10. 面向项目负责人的决策摘要

继续投入这个项目是合理的。最值得发展的差异化能力是：可解释的朋友局分队、带原始证据和人工确认的战绩档案、围绕同一场比赛的复盘。

近期投入优先级应是“访问正确、状态正确、数据可恢复、操作顺畅”。不要把功能数量、代码行数或一次 CI 成功当作成熟度的全部依据。完成核心修复并取得真实使用数据后，再判断是否扩展多局赛事、更多社交功能和多实例部署。

