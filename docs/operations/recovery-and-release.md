# 发布兼容与恢复手册

本文定义应用 release、数据库 migration、SQL 备份与媒体备份之间的恢复边界。日常操作入口仍是 `docs/operations/deploy.md`；媒体清单和归档格式见 `docs/operations/media-operations.md`。

## 1. 不可混淆的回滚边界

`scripts/deploy.sh` 在激活失败时只回切 `current` 和本项目的 Web/Cron PM2 进程。已经成功执行的 migration 不会自动撤销，也不会自动导入旧 SQL 备份。自动恢复数据库可能覆盖 migration 后产生的新写入，因此必须由维护者在维护窗口内单独决策。

旧 release 必须能读取新 schema。普通发布只接受以下迁移顺序：

1. 扩展：新增可空列、带默认值的列、新表或新索引；旧代码仍可运行。
2. 兼容：新代码同时兼容旧值和新值，必要时双写。
3. 回填：使用可中断、可重入的批次任务完成，记录进度和失败。
4. 收缩：删除列、改名、收紧非空或改变含义属于独立维护窗口，不与普通发布合并。

每个破坏性 migration 的变更说明必须写明：不可逆点、预计锁表时间、停止写入方式、恢复负责人和经过验证的恢复命令。生产始终只运行 `prisma migrate deploy`。

## 2. 发布前与保留策略

部署预检会检查 runtime 所在文件系统可用空间，默认至少保留 2 GiB；可用 `DEPLOY_MIN_FREE_BYTES` 提高门槛，不建议降低。源码目录与 runtime/release 目录保持分离。

至少保留：

- `current` 指向的 release；
- 前一个已经通过健康检查、且可在当前 schema 上运行的 release；
- 最近一次通过校验的 SQL 备份和与其同一时间窗口的媒体归档/清单；
- 最近一次失败 release 的 migration、health 和 PM2 诊断，直到故障复盘完成。

成功发布后自动保留最近 5 个 release；可用 `DEPLOY_RELEASE_RETENTION` 调整为 2–50。`current` 指向的版本和前一回滚版本始终受保护，不识别的目录也不会自动删除；清理失败只记录警告，不回滚已健康的新版本，下次成功发布会重试。激活失败时保留现场，可以临时超过数量上限，直到下次成功发布。SQL 和媒体是业务备份，不随 release 目录清理；不得删除唯一一份已验证备份。

若预检报告 `current symlink target is missing`，说明 `current` 存在但已成为断链，并非正常的首次部署。停止发布，不要直接把它指向“最新目录”。先用错误中打印的完整路径执行 `readlink -- <current路径>`，再从 `pm2 jlist` 核对本项目 Web/Cron 的 `pm_cwd` 与 `APP_RELEASE_ID`。只有当两者一致指向 `releases` 下仍存在、且包含完整构建物的同一 release 时，才原子修复 `current`；若 PM2 指向的目录也不存在，进入维护状态并人工选择经过验证的 release。删除断链只适用于已经确认没有本项目 PM2 进程、确属首次部署的情况。

## 3. 空环境恢复演练

每季度以及破坏性 migration 前，在隔离主机执行一次。目标 MySQL 必须是新建空库，媒体目标必须是新建空目录；禁止把演练命令指向生产库或生产媒体目录。

1. 记录备份完成时间、演练开始时间、release commit、Node/MySQL 大版本和操作者。
2. 校验 SQL 压缩包、媒体归档、媒体 manifest 和 `SHA256SUMS`；任何一项失败立即停止。
3. 把 SQL 恢复到空库，把媒体与头像恢复到空目录。
4. 运行 `npx prisma migrate deploy`，再执行 `node scripts/media-manifest.mjs <输出清单路径>`。
5. 用恢复后的独立 `.env` 启动一套单 Web/单 Cron 实例，验证 health、登录、赛事大厅、比赛档案原图、视频 Range 请求和后台心跳。
6. 抽样核对用户/赛事/比赛/评论行数以及至少一份六图档案和一条视频的 SHA-256。
7. 停止演练实例并保留记录；不要把演练库切为生产。

记录必须包含：恢复点时间、可接受数据丢失窗口（RPO）、从开始到 health/抽样全部通过的耗时（RTO）、每项校验结果、失败原因和改进项。没有实际演练记录时只能声称“备份已生成”，不能声称“可恢复已验证”。

## 4. 激活失败决策

- 旧 release 在新 schema 上健康：维持应用回切，保留新 migration，修复应用后重新发布。
- 旧 release 不兼容但新 release 可修：保持维护状态，发布向前修复；不要直接覆盖数据库。
- 数据已损坏：停止写入，保存故障时间点后的 binlog/媒体，评估增量数据，再由负责人批准定点恢复或数据修复。
- 只有在明确接受恢复点之后的新写入损失、并保存故障现场后，才可导入旧备份。

## 5. 构建物策略

当前发布在目标机执行 `npm ci`、Prisma generate 和 Next.js build，优点是流程直观，代价是 CPU、内存和磁盘峰值较高。若实际发布频率或目标机资源使其成为风险，再引入由 CI 生成并签名的 Linux 构建物；切换前必须验证 Node ABI、Prisma engine、静态资源、worker 产物、lockfile commit 和 SHA-256，不应只复制 `.next` 目录。
