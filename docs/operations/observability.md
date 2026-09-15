# 健康检查与告警

## 探针语义

- `GET /api/health?mode=live` 是 liveness，只证明当前 Web 进程能响应。它不访问数据库、Redis 或文件系统，不能作为流量切换依据。
- `GET /api/health` 是 readiness。数据库、生产媒体目录、头像目录、当前 release 的 Cron 心跳，以及声明为 required 的 Redis 均必须通过；独立探针并行执行，单项预算 1.8 秒，部署 curl 总预算为 4 秒。
- 未配置 Redis 且 `REDIS_REQUIRED=1` 时 readiness 返回 503；可选 Redis 故障标记为 degraded，不阻断流量。
- 公共响应只返回 release 和各依赖状态。需要容量/队列指标时配置高熵 `HEALTH_DETAILS_TOKEN`，内部监控请求携带 `X-Health-Details-Token`；不要把该 token 放进 URL、浏览器代码或公开日志。

## 最低告警集合

| 信号 | 触发建议 | 必须附带的信息 |
|---|---|---|
| readiness | 连续 3 次 503 或 2 分钟失败 | release、失败依赖、首末时间 |
| HTTP 5xx | 5 分钟窗口超过 2% 且至少 20 个请求 | requestId、用例、错误码、release |
| Cron 心跳 | 超过 `CRON_HEARTBEAT_MAX_AGE_MS` 或 release 不匹配 | Web/Cron release、最后心跳时间 |
| 媒体磁盘 | 可用空间低于 `MEDIA_MIN_FREE_BYTES` | 可用/门槛字节、挂载点 |
| SQL/媒体备份 | 任一计划任务非零退出、校验和失败或超过约定完成时间 | 备份集 ID、开始/结束、失败阶段 |
| OCR 队列 | 队列持续增长、最老任务超过业务 SLA、连续三次失败 | 数量、最老任务年龄、errorCode |

告警通知渠道和收件人属于部署环境配置，不写死在仓库。仅有 health 颜色变化而没有时间、release 和失败依赖，不足以定位故障。

## 后台任务失锁

`runExclusiveTask` 使用数据库租约作为权威锁。续租失败、token 被替换或本地租约时间到期时会中止任务信号；共享 Prisma 单例在所有写操作前检查当前任务 fence，因此旧 worker 即使尚未从外部 I/O 返回，也不能在租约过期后继续写库。下一任 worker 会恢复仍处于 RUNNING 的可恢复任务。

## 进程内存

生产 Cron 由 PM2 直接以 Node 加载 `scripts/cron.ts`，通过 `--import tsx` 在同一进程内支持 TypeScript 和路径别名。不要把 PM2 入口改回 `tsx` CLI：它会额外创建业务子进程，使 PM2 默认显示和检查启动器的 RSS，遗漏实际 Cron 内存。

`max_memory_restart` 是定期检查后触发的重启阈值，不是操作系统硬内存上限，也不代表整棵子进程树的总量。Web 的 500M 和 Cron 的 300M 阈值分别作用于其托管进程；独立 OCR、MySQL、Redis 和构建进程需要各自观察。

排查时使用实际部署用户和 `PM2_HOME` 查看 `pm2 ls`，并对照 `ps -eo user,pid,ppid,rss,comm --sort=-rss`。`free` 的 `available` 反映当前可用内存；空闲时的快照和没有匹配项的 OOM 日志，均不能排除此前的短时峰值。

`npm run test:deploy` 包含 Cron 入口回归：以隔离业务 worker 运行真实入口，验证业务 PID 与托管 PID 一致，并验证 SIGINT/SIGTERM 处理会等待 worker 退出。

## 无人访问时持续抓取

Cron 每 3 分钟进行一次变化检查；英雄技能每轮轮换抽查至多 8 个。监控与同步复用配置的 HTML/JSON 合并目录、详情抓取和技能解析；每轮目录仅抓取一次，供英雄、皮肤和技能检查共用。技能只与已保存的 `skillsJson` 比较，不与包含皮肤图片地址的 `dataHash` 混比。皮肤名称复用同步的清洗规则；只检查当前可同步目录中的英雄，保留 HTML 独有英雄的覆盖，不因数据库历史记录而反复触发同步。频率、每日同步和互斥锁保持不变。

监控要求目录的 HTML 和 JSON 来源均可用；某个来源失败或返回空内容时跳过变化判定，避免把兜底元数据当成真实更新。原有全量同步的来源兜底策略不变。

`npm run test:crawler` 隔离数据库和外部网络，覆盖同步后连续检查不重爬、真实技能/皮肤变化同步后恢复稳定、页面格式与配置地址兼容，以及抓取/解析失败不被当成变化。此回归不测量生产 RSS：发布后仍需结合 Cron 实际业务 PID 的内存走势与同步日志，确认重复全量抓取已停止，并继续判断是否存在独立的内存增长原因。
