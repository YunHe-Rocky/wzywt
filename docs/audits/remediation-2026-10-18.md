# 2026-10-18 审计修复处理记录

本记录对应用户提供的《wzywt 全面问题审计与 Codex 修复任务清单》及追加的 Redis API 需求。
代码修复在 `D:\Worktrees\wzywt`，原 E 盘源目录保留。

## 版本和交付边界

- 聊天原工作目录不存在，因此创建了 D 盘修复副本；没有覆盖 E 盘目录。
- Git 网络克隆未完成，使用 E 盘源码并从 GitHub 固定提交补齐缺失的资源数据 Route。
- 对审计提交 `3835a889b09cc732dea65c15fcfbf8eb04be442d` 的 624 个非 artifacts 文件，
  已逐一比较 Git blob SHA，全部匹配。未复制大型宣传构件。
- 本地基线提交为 `356932e`，只用于审查本次 diff，不冒充上游原始 HEAD。
- 没有推送 GitHub、触发远端 CI、变更分支保护、部署应用或连接生产数据库。

“代码已改”表示实现及相应本地检查已有证据；涉及实际 MySQL、Redis、容器、浏览器、
外部 OCR、OSS 或恢复演练的条目仍需各自运行验收。本记录不把 55 项全部标为关闭。

## Redis 追加需求

统一业务 API 入口先取得 Redis 共享并发租约。普通可缓存 GET 先读 Redis、未命中再读 MySQL；
成功写入及事务 commit 后推进缓存代次，慢旧查询不能填回新代次。
登录先通过 Redis 定位账号，再从 MySQL 实时校验密码、封禁、删除及 sessionVersion。
所有事务内状态检查、授权查询及写请求中的校验都直接读 MySQL。

缓存不保存密码哈希、安全答案、Cookie 或重置凭证。文件流、SSE 和 Range 不转成 JSON 缓存。
健康接口保留独立诊断能力。Compose 的 Redis required 模式失败返回 503，原生开发保留可选回源模式。
完整策略、TTL、失效边界及直连 LAN 限制见 [Redis API 数据路径](../architecture/redis-api-data-path.md)。

## 已完成的本地验证

| 检查 | 结果与证据边界 |
| --- | --- |
| `npm run check` | 通过其所有实际执行的门槛；原生 PM2 完整激活部分由既有测试在 Windows 明确 SKIP，不能算通过 |
| `npm run typecheck` / 架构检查 | 通过；路由直连数据库例外由 29 项减少到 21 项 |
| `npm run lint` | 0 error；仍有既有图片标签告警 |
| `npm run build` | Next 15.5.28 生产构建成功；不需要数据库在线，不等于运行就绪 |
| `npm run test:audit-repairs` | 通过；包含凭据边界/撤销、角色输入、缓存命中与旧填充隔离、头像实际解码及并发 CAS、跨目录锁、截断备份拒绝 |
| `npm run test:compose` | 52 项通过；是管理/存储测试，不是 52 次真实容器部署 |
| `npm run test:match-visibility` | 通过；补充了各战术写入口在事务开始前被提交的受控交错及图层配额用例；数据库替身不替代真实事务并发验收 |
| Python OCR unittest | 36 项通过，使用独立虚拟环境；没有加载真实 OCR 模型 |
| Python→TypeScript OCR 合同 | 单页拒绝和六页人工确认合同通过 |
| 生产依赖审计 | 更新前 4 项：3 high、1 moderate；更新后 0 项 |
| 完整依赖审计 | 更新后仍 11 项：8 high、3 moderate、0 critical；开发工具链风险保留，不降低门禁阈值 |

本地先遇到 Windows 沙箱对 rename、目录链接和回环 socket 的限制。已用独立工作区临时目录和
允许这些操作的测试执行方式复核，不通过修改断言或跳过浏览器/健康门槛绕过。
详细日志保存在该修复副本 `.cache`；交付的审查包另外保留验证日志。

## 按原问题 ID 的处理表

| ID | 实际处理 | 仍需的关闭证据/边界 |
| --- | --- | --- |
| CI-01 | 补充 requestfailed/response/pageerror/导航事件、截图与脱敏 trace；代理 Host 与外部入口保持一致 | WebKit 原始失败尚未实际复现/关闭；Node 24/26 的 HTTPS、HTTP 全流程仍须真实运行 |
| CI-02 | 修复空卷 avatars 初始化，健康检查输出无凭据的逐项状态，迁移后失败仍停写 | 空卷首启、旧卷启动、更新、共享媒体和桌面/手机真实容器验收未执行 |
| CI-03 | CI 与本地直接共用 `npm run check`，补运行遗漏集合；先生成 Worker 再跑回收测试 | 新工作流尚未在 GitHub 执行 |
| CI-04 | Node × proxy/local 独立矩阵；代理运行器汇总各功能失败，后续套件仍执行 | 需要远端故意失败演练验证聚合结果 |
| CI-05 | 增加浏览器诊断、trace 脱敏器、容器 State/Health artifact、保护性停止前的健康采集 | 需下载一次真实失败 artifact 复核；trace 不含 DOM/源码、凭据头或请求正文 |
| CI-06 | 增加独立 Python HTTP/parser/daemon 和跨语言合同 CI；本地 36 项及合同通过 | 真实模型样本 Job、目标设备六图准确率尚未完成 |
| CI-07 | 保留服务/存储模型；增加可执行真实 Redis/MySQL 合同入口与备份校验入口 | external MySQL/OCR、rclone 断挂、远端回读等运行矩阵仍待环境验收 |
| CI-08 | MySQL 8.0/8.4 矩阵接入新英雄配额、上传账本及受控清理竞态回归 | 旧发布 schema fixture 升级、隔离 SQL+媒体恢复及实测 RPO/RTO 仍未完成 |
| DEPEND-01 | 更新 Next、sharp、undici、source-map-js、shell-quote、brace-expansion、js-yaml；生产审计归零 | 完整依赖仍 11 项；不声称开发工具链/镜像 OS/Python 无漏洞 |
| DEPEND-02 | 依赖审计接入 PR/push；Prisma/tsx 作为显式生产工具，运行镜像只复制生产依赖阶段 | 最终镜像 SBOM/OS/Python 扫描及 Cron/迁移容器验收仍待执行；完整 high 门禁仍会阻断现有开发工具风险 |
| GOV-01 | 未修改 GitHub 仓库设置 | 分支保护/必需状态需项目维护者在 CI 红灯修复后配置；代码修改请求不替代仓库管理授权 |
| GOV-02 | 自动 release ID、源码/锁文件摘要、镜像身份和备份哈希进入发布链 | 正式版本登记、不可变 digest、CI run 及恢复兼容证明仍须发布流程补齐 |
| SUPPLY-01 | 已核对并固定 checkout/setup-node/setup-python/upload-artifact 的 commit SHA | 基础镜像 digest、Python 平台/哈希锁和模型来源摘要仍未完成 |
| SEC-01 | 改密复用统一 UTF-8 72 字节密码校验；非法请求不写密码或版本 | 本地服务回归通过；真实 HTTP 改密后登录仍需集成环境 |
| SEC-02 | 注册与改恢复信息共用安全问题解析器，trim、72 字节答案、2–255 字问题统一 | 本地边界及服务回归通过；实际找回全流程待 HTTP 验收 |
| SEC-03 | 更新凭据、递增版本与删除所有重置 token 同事务；签发时复核验证时版本 | 本地撤销回归通过；真实 MySQL 的交错签发/消费仍待执行 |
| SEC-04 | 修改恢复信息必须验证当前密码；改密/注销重复验证当前答案，敏感操作按动作/账号及来源限流 | 重新认证操作保留服务端验证；跨设备真实会话测试待验收 |
| SEC-05 | 两处配置解析均拒绝生产 HTTPS 显式关闭 Secure，保留 local HTTP/HTTPS | 本地配置回归通过 |
| SEC-06 | local 默认忽略客户端 X-Real-IP，新增显式 TRUST_PROXY 通道 | Next Route 缺 socket 身份，直连仍共用来源桶；需受控网关才可区分 LAN 客户端，未全面关闭 |
| SEC-07 | 公开问题查询有目标/来源限流，不可用账户统一响应 | 有效账号仍返回问题，产品保留公开恢复展示；不声称彻底消除枚举 |
| SEC-08 | 所有图层/路线/标记写入在 Serializable 事务中重读比赛状态；保留对象 revision/所有者约束 | 本地受控交错通过；MySQL 锁顺序及提交并发须实测 |
| SEC-09 | 异议计数与创建进入同一 Serializable 事务并有界重试 | 同用户 20 并发请求的真实数据库验收尚未执行 |
| SEC-10 | 新增不可变上传流量账本，替换/删除不退还日用量；按 UTC 日累计 | 新 migration 必须部署；已覆盖的旧记录回填，旧覆盖/删除流量无法还原；实际回归已接 CI 未在本机执行 |
| SEC-11 | RESERVED→CLEANING CAS、消费验证有效期、清理读取获权后的文件键、失败可重试 | 新增真实数据库的受控删除屏障用例；本机无数据库，待 CI 执行 |
| SEC-12 | File 类型、sharp 受限完整解码、UUID+临时发布、头像 CAS、失败清理队列；读取及备份兼容旧/新文件名 | 本地坏文件/高像素/双请求 CAS 通过；清理队列故障恢复及频率/全局配额策略仍待环境验收 |
| SEC-13 | Web 截图上限与随仓库 OCR 统一为 1200 万像素 | 图片解析本地检查通过；真实六图上传→识别→确认待验收 |
| SEC-14 | 保留固定版式、unknown 和人工确认边界；合同已有测试与 CI | 未获得新的授权设备样本，不能声称真实模型/任意设备准确率通过 |
| SEC-15 | 创建图层限 20/阵营，标记限 100/玩家/图层，均在事务内检查 | 不删除既有超额数据；旧库对象盘点、读取体积及浏览器绘制压测仍待执行 |
| DEP-01 | volume/rclone 初始化及镜像目录覆盖 avatars，继续以应用 UID 验证 I/O | 52 项管理/存储测试通过；实际空卷及 rclone UID 验收待执行 |
| DEP-02 | 原生 PM2 默认构建后停 Web/Cron，再备份和迁移；迁移开始后失败保持停写 | Linux 持续写入与耗时 Cron 排空仍待验证 |
| DEP-03 | 原生发布增加同一停写窗口的 SQL、媒体、头像、英雄资源、引用 manifest 与哈希 | 真实数据库/媒体恢复、Range 抽查及 RPO/RTO 仍待演练 |
| DEP-04 | 仅新旧 migration 文件集合一致时允许自动应用回切；集合变化时激活失败保持停写 | 破坏性 migration + 激活失败、兼容回切的 Linux 演练未执行 |
| DEP-05 | Compose 透传四个媒体配额、OCR 队列及代理设置；非法配置明确失败 | 模型/配置测试通过；实际非默认阈值行为待服务环境 |
| DEP-06 | 两份 Nginx 默认上传上限统一到 516m，覆盖默认 512 MiB 视频及余量 | 未在本机执行 nginx -t 和大文件代理上传 |
| DEP-07 | 文档明确单 Web 实例限制，新 Redis 缓存不等于分布式租约 | 未擅自开启 cluster；双实例透明运行仍不支持 |
| DEP-08 | 共享本机探针 URL，传递 HOST；支持通配、专用 IPv4、IPv6 | 本地 URL/进程治理回归通过，目标机器监听/重启实测待验收 |
| DEP-09 | 未凭空引入未经验证的 MySQL TLS/证书映射 | 统一 Prisma/mysql-client TLS、CA 只读挂载、错误 CA/主机名拒绝仍待隔离 TLS 数据库验证与实现 |
| DEP-10 | 锁身份改为 Docker daemon ID + project，保存 owner.json，不自动删除他人锁 | 本地跨目录互斥行为通过；同 daemon 的真实双 checkout 操作待验收 |
| DEP-11 | 自动唯一 release ID 同时进入实际 Compose 镜像标签、应用健康与备份记录 | 已有管理测试通过；实际运行身份→镜像→源码追溯待容器验收 |
| DEP-12 | 保留 health 只是协议/连通性证明的边界 | 外部 OCR 正确/错误/缺失 token、六图推理与页面核对仍未执行 |
| DEP-13 | 新增只读备份 SHA-256/tar 验证入口，截断失败；远端/恢复标志继续 false | SQL 试导入、OSS 对象回读、保留策略及独立完整恢复仍待环境验收 |
| BUS-01 | feature 层严格验证五路集合、志愿排列、整数/段位/分数边界 | 本地输入回归通过；旧库异常只盘点不擅自删除 |
| BUS-02 | 每路 3 英雄的校验/创建同事务，有界序列化重试 | 新增真实 MySQL 并发用例并接矩阵；本机未执行 |
| BUS-03 | 英雄名称以 Hero 主数据为准，严格 ID，重复返回冲突 | 新增真实数据库名称/配额用例；未增加历史 HeroPower 外键或删除旧记录 |
| BUS-04 | 后台分页及英雄删除复用严格整数 ID，限制页数/搜索长度 | 类型/既有校验回归通过；后台真实 HTTP 用例待验收 |
| BUS-05 | 退出许可、房主、成员删除和容量纠正在同事务；容量更新加入旧状态+空 split CAS | 真正 split/leave 的数据库屏障交错仍待集成验收 |
| BUS-06 | 有比赛档案的房间明确 409，不绕开 Restrict；数据库并发外键冲突也映射 409 | 实际 DRAFT/SUBMITTED 删除与页面提示待验收；没有擅自实现删除历史 |
| BUS-07 | 目标必须本房正式成员、非管理员不得修改他人、装备存在且最多 6 件；正式队伍/分路与分队快照一致，已提交只读 | 分队前仍可本房选人；临时玩家保留管理员代填；实际 API 多角色用例待验收 |
| PERF-01 | 公告最大页长 100、默认 50，稳定排序；后台翻页，首页仅 10 条，详情路径保留 | 无需一次返回所有正文；大规模数据翻页/性能及 UI 验收待执行 |
| WEB-01 | 档案 load 使用 generation+AbortController；卸载取消，轮询完成后再调度，隐藏页暂停 | 本地构建/类型检查通过；倒序响应、切换账号/比赛的浏览器拦截回归待执行 |
| QUAL-01 | 随缺陷修复下沉登录、凭据、头像、资料、退出及选人用例，baseline 29→21 | 架构检查通过；大组件整体拆分未做无关重写 |
| QUAL-02 | 修复副本不复制大型宣传 artifacts；未改 Git 历史 | 上游制品迁移、可验证下载来源及实际 clone 体积优化尚未完成 |
| QUAL-03 | 保留未选定项目许可证的现状 | 许可证及第三方素材授权必须由权利维护者决定，没有代选许可证 |
| DOC-01 | README 改为随仓库六图辅助 OCR + 固定版式/人工复核边界 | 文档链接与合同通过；不替代真实模型/设备验收 |
| DOC-02 | 备份示例头像路径修正为 media/avatars；manifest 复用实际头像目录并兼容 UUID | 真实原生默认/自定义子目录的备份恢复仍待验收 |

## 迁移和操作影响

1. 新增 `20261018090000_media_upload_usage` migration，创建不可变上传流量表并回填当前可见截图/视频。
   生产只能按既有流程使用 `prisma migrate deploy`，不得改写旧 migration 或 db push。
2. 每日上传量按 UTC 日计算，成功消费才记账；替换或删除不返还当日流量，失败上传不计成功流量。
   活跃预留仍占用额度，跨午夜尚未完成的预留保守计入，避免跨日绕过。
3. 修改安全问题的请求新增必填 `currentPassword`；仅 Cookie 或仅新答案不再允许修改。
4. 原生 PM2 更新现在有明确停写窗口。备份前失败只恢复先前运行的进程；迁移开始后保留诊断、
   不自动导入旧 SQL，migration 集合变化时也不自动恢复旧程序写入。
5. Compose 自动生成 release ID；使用 [部署手册](../operations/docker.md) 的唯一入口。
   Redis、数据库、外部服务、OSS 和恢复能力分别验收；当前修复候选还不能宣布上线合格。

## 后续可直接执行的环境检查

- Node 24/26 × proxy/local 的 Chromium/Android/WebKit 完整矩阵。
- MySQL 8.0/8.4 migrate + `test:integration` + `test:integration:audit`。
- 专用本机 Redis DB 15：`ALLOW_REDIS_INTEGRATION_TEST=1` 后运行 `test:redis:audit`。
- 全新独立 Compose project 首启、旧卷更新、媒体共享、migration/activation 故障保留。
- 原生 Linux PM2 停写、完整备份、migration 失败及禁止不兼容回切的真实演练。
- external MySQL TLS、外部 OCR 鉴权/六图、rclone 断挂/远端哈希回读、隔离恢复及 RPO/RTO。
- Tailwind/ESLint 开发工具链风险、镜像 SBOM/OS/Python 扫描、正式构件与分支门禁登记。

这些检查必须使用独立测试库、端口、项目名、卷和备份目录；不得将测试配置指向生产实例。
