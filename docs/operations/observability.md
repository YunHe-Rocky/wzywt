# 健康检查与告警

## 探针语义

- `GET /api/health?mode=live` 是 liveness，只证明当前 Web 进程能响应。它不访问数据库、Redis 或文件系统，不能作为流量切换依据。
- `GET /api/health` 是 readiness。数据库、生产媒体目录、头像目录、当前 release 的 Cron 心跳，以及声明为 required 的 Redis 均必须通过；独立探针并行执行，单项预算 1.8 秒，部署 curl 总预算为 4 秒。
- 未配置 Redis 且 `REDIS_REQUIRED=1` 时 readiness 返回 503；可选 Redis 故障标记为 degraded，不阻断流量。
- 高压排空期间 readiness 的 `runtime` 为 failed；liveness 保持可探测，监督器等待进程主动退出或真正存活失败，不把依赖故障单独当作重启理由。
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

`max_memory_restart` 是定期检查后的兜底重启阈值，不是操作系统硬内存上限。PM2 与调度器共用预算算法：原生 Web/Cron 软预算为有效容量的 35%/20%，受 cgroup 限制时比例相同，PM2 重启阈值为软预算的 120%（最多有效容量）。显式 MiB 使用 `RESOURCE_WEB_MEMORY_MB` / `RESOURCE_CRON_MEMORY_MB`，最多有效容量的 85%。Docker 入口使用独立容器限额的 85% 作为默认软预算。MySQL、Redis、OCR 和构建需要另外规划容量。

自适应供给、任务日志、存活失败恢复和压力验收见 [资源调度与恢复运行手册](resource-governor.md)。日志使用 JSON 行，包含 UTC 时间、事件、级别、role、PID、bootId、release、requestId/taskId、阶段和耗时；错误保留脱敏消息和栈，资源摘要每 30 秒记录一次。既有服务输出补充相同身份字段。请求体、Cookie、认证头和完整连接串不作为日志字段。

读故障时间线时，联合检查 `process.started/stopping/exited`、`task.queued/started/phase/paused/resumed/completed/failed`、`resource.pressure_changed/sample` 和 supervisor/watchdog 的退出码、信号及恢复动作。SIGKILL/OOM/断电无法保证子进程写出最后一行，仍需关联父进程和宿主事件。原生日志按 10 MiB、3 份历史保留（copytruncate 有很小的并发日志窗口）；Docker 沿用 json-file 的 10 MiB、3 份限制，systemd 日志由 journald 保留策略管理。

`resource.sweep_completed` 记录过期租约、载荷回收、空条目清理和剩余数量；`resource.reclaim_completed` 记录回收器、结果、耗时和前后内存，`resource.reclaim_failed` 记录失败。查看 `worker.idle_reclaimed` 确认空闲分队线程退出，查看 `request.subscription_retired` 确认订阅因压力、寿命或排空结束。前后 RSS/heap 差值是观测值，不能当作本次回收释放的精确字节数。

持续自身高压的时间线应为 `process.drain_started` → 拒绝新业务、关闭订阅、readiness 失败 → `process.recycle_requested` → 运行时停止与监督器恢复。`drainTimedOut=true` 表示仍有在途工作，需核对事务和媒体提交结果，不得把退出记录当作任务完成记录。普通 API 与实时订阅分别计数，订阅占满不能让普通 API 全部 503。

排查时使用实际部署用户和 `PM2_HOME` 查看 `pm2 ls`，并对照 `ps -eo user,pid,ppid,rss,comm --sort=-rss`。`free` 的 `available` 反映当前可用内存；空闲时的快照和没有匹配项的 OOM 日志，均不能排除此前的短时峰值。

`npm run test:deploy` 包含 Cron 入口回归：以隔离业务 worker 运行真实入口，验证业务 PID 与托管 PID 一致，并验证 SIGINT/SIGTERM 处理会等待 worker 退出。

## 无人访问时持续抓取

Cron 每 3 分钟进行一次变化检查；英雄技能每轮轮换抽查至多 8 个。监控与同步复用配置的 HTML/JSON 合并目录、详情抓取和技能解析；每轮目录仅抓取一次，供英雄、皮肤和技能检查共用。技能只与已保存的 `skillsJson` 比较，不与包含皮肤图片地址的 `dataHash` 混比。皮肤名称复用同步的清洗规则；只检查当前可同步目录中的英雄，保留 HTML 独有英雄的覆盖，不因数据库历史记录而反复触发同步。频率、每日同步和互斥锁保持不变。

监控要求目录的 HTML 和 JSON 来源均可用；某个来源失败或返回空内容时跳过变化判定，避免把兜底元数据当成真实更新。原有全量同步的来源兜底策略不变。

`npm run test:crawler` 隔离数据库和外部网络，覆盖同步后连续检查不重爬、真实技能/皮肤变化同步后恢复稳定、页面格式与配置地址兼容，以及抓取/解析失败不被当成变化。此回归不测量生产 RSS：发布后仍需结合 Cron 实际业务 PID 的内存走势与同步日志，确认重复全量抓取已停止，并继续判断是否存在独立的内存增长原因。
