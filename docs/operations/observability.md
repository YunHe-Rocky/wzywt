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
