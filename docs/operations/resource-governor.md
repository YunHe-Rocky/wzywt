# 资源调度与自动恢复

适用于原生 PM2 和 Docker Compose。调度器控制资源供给、并发、等待和空闲回收；Docker 容器限额是内核边界，PM2 内存阈值是定期检查后的重启保护。资源保护日志不能单独证明整机曾发生 OOM。

## 分层与优先级

纯策略在 `src/core/resource-policy.ts`；主机/cgroup 采样、外部准入、队列和共享租约在 `src/lib`。页面 Resource Scheduler 继续管理页面租约，压力回收只清除无使用者的派生缓存。数据库/Redis 客户端、登录状态、媒体和已保存业务数据不随页面资源回收。

页面缓存每 5 秒扫描。有效租约和正在加载的条目受保护；最后一个租约释放后，空载荷条目可直接清除，已有载荷按空闲 TTL 清理，压力扫描提前清理空闲载荷。首次加载失败、未使用的 deferred 条目也进入清理路径，错误统计按有限的资源定义归档。某个 disposer 抛错会保留其载荷并记录错误，其他条目继续回收。异步 dispose 与新租约申请串行，避免正在释放的载荷被重新交给页面。

| 压力 | 外部速率/并发比例 | 内部详情批次 | 每检查点等待 |
|---|---|---|---|
| normal | 100% | 配置上限，默认 4 | 0 |
| warm | 65% | 至多 2 | 100 ms |
| hot | 25% | 1 | 500 ms |
| critical | 5%，保留最小供给 | 暂停 | 每秒复查 |

内存达到软预算 70%/84%/94%、CPU 时间或事件循环延迟升高时升压；压力降低需持续满足恢复窗口，每窗口只降一级，避免抖动。Web 需求达到基础速率一半时后台让出资源。非危急状态内部任务保留单并发进度。英雄详情、技能检查按动态批次执行；图片按大小上限流式写临时文件并原子替换。心跳和赛事封盘走独立轻量通道，同类轻任务也不会无限叠加。

Web/Cron 在已有 MySQL `kvCache` 交换带 release 和时效的摘要，不新增表。手动作业读取 Web 压力，不覆盖 Cron 摘要。所有重任务竞争同一个带续租的项目级租约，包含原生和 Compose 手工作业；失锁、过期、进程停止会阻止后续任务写入。数据库协调失败/对端摘要失效时降为本地保守供给并记录；需要共享许可的内部任务等待或明确失败，不绕开租约运行。

队列长度、重复触发合并和最长等待均有界。内部任务可以延长时间；超过等待预算会记录失败，数据库中的待处理请求仍可被后续轮次重试。失败不释放仍在执行的作业名额，也不提前认为持久数据已提交。

普通动态请求与实时订阅使用独立令牌桶。普通 API 的基础在途加权名额为 32；`GET/HEAD /api/heroes/watch` 使用独立订阅名额，默认 8，不占普通 API 名额，POST 仍属于普通业务。偏高/高压时订阅上限随压力收缩，危急时为 0，并关闭超额订阅；单条订阅最多 300 秒，浏览器 EventSource 按原机制重连。流式响应在结束、失败或底层取消完成后释放名额，不在仍然取消中的时候提前归还容量。繁忙返回 503、`Retry-After` 和请求 ID。静态文件由 Nginx/Next 静态服务供给，入口连接与带宽上限另行配置。健康探针不受普通供给限制。

自身 RSS 持续危急达到 `RESOURCE_RECYCLE_SECONDS` 后进入单向排空：拒绝新的动态业务与内部任务，关闭可重连订阅，readiness 标记 `runtime=failed`，liveness 保持可探测。普通 API/重任务名额清空后申请 SIGTERM；超过 `RESOURCE_DRAIN_SECONDS` 也会申请 SIGTERM，由 Next/Cron 的优雅停止和监督器的最终超时结束进程。剩余工作仍计为在途，日志记录 `drainTimedOut`，不能据此认为写入完成。SSR 与 Cron 轻量通道由运行时停止流程排空，未作为普通 API 名额计数。计划回收在排空开始后不会因短暂降压撤销；只有宿主压力、而自身 RSS 未危急时不会触发这条进程回收。

分队计算 Worker 按需创建，默认根据 CPU 选择 1–2 个，队列最多 8，执行与排队共用 8 秒期限。空闲 60 秒或收到压力回收时清除闲置线程，有任务执行或排队时保留。线程 terminate 完成前仍占线程池容量，后续任务按需重建，避免回收与重建短时形成双份线程池。每线程 V8 old-generation 默认上限 64 MiB；线程的 Buffer、原生内存及整个 Web RSS 仍由进程/容器预算约束。

线程终止失败会记录 `worker.terminate_failed`，保留容量名额直到观测到真实 exit，不把终止失败计作成功释放；排队任务仍受原超时约束。

默认拓扑是同一业务数据库的单 Web/单 Cron。外部速率和在途上限按每个 Web 进程计算；多副本必须在网关设总限额并重算每副本预算，不能将每进程限制当成跨副本全局限制。

## 环境配置

使用既有 `.env` / `.env.docker`，不复制数据库或登录密钥到另一套配置。

原生 PM2 从当前 release 的 `.env` 单独解析共享资源白名单并注入两个进程，显式进程环境优先；部署路径白名单不代替资源白名单。修改参数后按原生发布流程更新 PM2 环境并保存进程清单，不能只编辑旧 shell 的变量。

| 配置 | 默认 | 含义 |
|---|---|---|
| `RESOURCE_GOVERNOR_ENABLED` | `1` | `0` 关闭调度，生产保留开启 |
| `RESOURCE_WEB_MEMORY_MB` | `0` | Web 软预算，MiB；0 自动 |
| `RESOURCE_CRON_MEMORY_MB` | `0` | Cron/job 软预算，MiB；0 自动 |
| `RESOURCE_PROJECT_MEMORY_PERCENT` | `25` | 项目总内存预算，整型 20–30；超范围拒绝启动 |
| `RESOURCE_EXTERNAL_RPS` | `30` | 单 Web 基础令牌速率 |
| `RESOURCE_EXTERNAL_BURST` | `30` | 突发令牌数；上传/识别/分队路径加权 |
| `RESOURCE_EXTERNAL_CONCURRENCY` | `32` | 普通 API 在途加权名额，含视频流，不含实时订阅 |
| `RESOURCE_SUBSCRIPTION_CONCURRENCY` | `8` | 实时订阅独立连接上限；危急时关闭 |
| `RESOURCE_SUBSCRIPTION_MAX_SECONDS` | `300` | 单条订阅最长寿命，10–3600 秒 |
| `RESOURCE_INTERNAL_CONCURRENCY` | `4` | 详情批次上限，1–16 |
| `RESOURCE_INTERNAL_QUEUE_LIMIT` | `32` | 待处理任务上限，重复触发合并 |
| `RESOURCE_INTERNAL_MAX_WAIT_SECONDS` | `900` | 排队/单次压力暂停最长等待 |
| `RESOURCE_RECOVERY_SECONDS` | `30` | 降压窗口 |
| `RESOURCE_LOG_SECONDS` | `30` | 摘要日志间隔 |
| `RESOURCE_RECYCLE_SECONDS` | `180` | 自身 RSS 持续危急多久后进入排空；0 关闭兜底 |
| `RESOURCE_DRAIN_SECONDS` | `30` | 等待名额清空的期限，1–300 秒，随后申请优雅退出 |
| `RESOURCE_RECLAIM_SECONDS` | `15` | 压力回收最小周期；升压时可立即触发，重复回收合并 |
| `SPLIT_WORKER_CONCURRENCY` | `0` | 0 按 CPU 自动选择；显式 1–4 个线程 |
| `SPLIT_WORKER_QUEUE_LIMIT` | `8` | 分队等待队列上限，1–32 |
| `SPLIT_WORKER_TIMEOUT_MS` | `8000` | 分队排队与执行总期限，500–30000 ms |
| `SPLIT_WORKER_IDLE_SECONDS` | `60` | 闲置线程寿命，1–3600 秒 |
| `SPLIT_WORKER_HEAP_MB` | `64` | 单线程 old-generation 上限，16–1024 MiB |

预算算法统一在 `src/core/resource-settings.ts`。`RESOURCE_PROJECT_MEMORY_PERCENT` 默认 25，只接受整型 20–30。原生项目预算取宿主总内存乘该百分比与有效 cgroup 限额中的较小值，避免套用项目 cgroup 后再次乘百分比。项目预算的 60%/25% 分别作为 Web/Cron 重启阈值，软预算为对应阈值的 1/1.20；剩余 15% 留给 PM2 和进程开销。显式 MiB 只能进一步降低软预算，不能突破份额。PM2 阈值取整到 MiB，是定期检查后的重启机制；硬上限由下文 systemd cgroup 实施。

在 8 GiB 原生主机上，默认项目预算为 2048 MiB；Web 软预算 1024 MiB、PM2 重启约 1229 MiB，Cron 软预算约 427 MiB、重启 512 MiB。已安装的 systemd 主服务开始在 20% 宿主内存处施加压力，在 25%（2048 MiB）处触发硬限额；父级 cgroup 更紧时以更紧限额为准。原生独立运行的 MySQL/Redis/OCR、构建、命令行同步均不在 PM2 主服务 cgroup 内，不得把此结果解释成全栈已硬封顶。

Docker 入口固定 `APP_RUNTIME=docker`，默认软预算为所在独立容器 cgroup 有效限额的 85%，显式 MiB 同样只能降低此值。各容器硬限额总和及工具峰值还必须通过项目百分比预算检查。应用无需手工配置 `APP_RUNTIME`。

采样支持 cgroup v1/v2 及父级限制，已确认可回收的 inactive file cache 不计为不可释放工作集；宿主 MemAvailable 同时参与压力判断。必须为 MySQL/Redis/OCR、操作系统、构建与备份留空间。清除引用、等待任务结束和线程退出会使对象可回收，但不能保证 RSS 立即下降；日志中的内存差值是观测值，不能直接当作本轮释放的物理字节数。

## Docker

从 [Docker 部署入口](docker.md) 执行 `init/check/build/up/update`；已有原生数据通过同一入口的 `export-native/import-native` 迁入，操作顺序见部署手册。容器限额及 MySQL/Redis 启动参数统一由 `scripts/compose-runtime.mjs` 生成，应用配置复用 `docker/runtime-env.mjs`，调度默认值仍由 `src/core/resource-settings.ts` 读取；`compose.yaml` 不重复维护这些参数。

`RESOURCE_*` 与 `SPLIT_WORKER_*` 从项目根目录 `.env` 继承，容器需要不同值时才在 `.env.docker` 或 `--env-file` 指定的覆盖文件设置；各服务硬限额和宿主预留仍在 Docker 覆盖文件维护。优先级为显式进程环境 > Docker 覆盖 > 根目录 `.env` > 程序默认，省略为继承，显式空值清除继承后使用该调度项的默认值。没有 `.env` 时直接使用程序默认，`--env-file` 不改变基底位置。旧覆盖文件中已有的调度值继续优先，不会被自动清除。

Web 默认 512 MiB、Cron 256 MiB、MySQL 512 MiB、Redis 192 MiB、可选 OCR 2 GiB；一次性 migration 256 MiB、storage-init 128 MiB、MySQL 客户端 128 MiB，也有 CPU/PID 限额。媒体核验和原生导入工具复用 Cron 容器的限额，媒体/英雄备份工具复用 Web 限额。各容器 `memswap_limit` 等于 `mem_limit`，避免额外交换空间扩大内存边界。Redis 数据上限 64 MiB，并预留 AOF/fork 与进程开销；MySQL 默认 buffer pool 128 MiB、最多 30 个连接。全部是可调默认值，不是实测峰值；低于实际运行需求可能触发受限服务 OOM，不能为强行启动把总预算调到 30% 以上。

`check/build/up/update/import-native/sync-heroes` 会读取 Docker daemon 的 MemTotal，先计算所选常驻服务、最大一次性任务和 `COMPOSE_EXTERNAL_MEMORY_MB`（默认 0）的项目总额，必须不超过 `RESOURCE_PROJECT_MEMORY_PERCENT`（默认 25%）。一次性任务包含 Web 备份、Cron 媒体核验/导入/同步、migration、MySQL 客户端和 storage-init，按依次执行工具的最大值预留。再加 `COMPOSE_MEMORY_RESERVE_MB`（默认 1024）的操作系统/构建容量余量核对 daemon 总容量。超配或限额缺失时在构建和停写前失败，不把显式旧配置当成突破百分比的例外。

未选择的外部 MySQL/OCR 不启动、不管理；若与 Docker 在同一宿主，须把其占用填写在外部预留中。预留是容量核对，不是内核预占；其他项目容器和构建峰值仍须纳入现场容量评估。默认无 OCR 的项目预算为 **1984 MiB**（含 Web 工具 512 MiB），加系统余量后的总规划为 **3008 MiB**，可通过 8 GiB/25% 检查。含容器 OCR 的项目预算为 **4032 MiB**、总规划 **5056 MiB**，8 GiB 主机无法满足 25% 项目上限，16 GiB 可通过。Docker Desktop 以 daemon/VM 容量为检查基准，不能冒充物理宿主测量。

`import-native` 与 `up/update` 共用 MySQL/Redis 实际内存、内存加交换空间、CPU/PID 限额检查。导入仍保留数据容器的 `--no-recreate`；旧容器限额缺失或超过配置时，在导入标记和首次数据库写入前阻止继续，按部署手册完成资源维护后再执行。

更新继续保留数据服务的 `--no-recreate`。启动 Web/Cron 前会核对现有 MySQL/Redis 的真实限额，旧无限额容器会阻止部署进入停写阶段；按 [Docker 资源维护步骤](docker.md#已有容器的资源限额维护) 更新其实际限额后再发布。只编辑环境文件不代表已有容器已经采用新限制。

入口监督实际子进程并转发信号。启动宽限 120 秒，之后每 15 秒检查存活，连续三次失败发 SIGTERM；Web 最多等 40 秒、Cron 最多等 300 秒，再强制终止，入口以 75 退出交给 `restart: unless-stopped`。Cron 存活检查本地 `/tmp/wzywt-cron-heartbeat` 的 PID、release、本次启动时间；readiness 仍检查数据库及共享心跳。仅有 Docker unhealthy 状态不会主动触发这套恢复，实际由入口监督器执行。

```bash
node scripts/compose.mjs check
node scripts/compose.mjs up
node scripts/compose.mjs status
node scripts/compose.mjs logs
```

MySQL/Redis 暂时故障会改变 readiness，不会单独触发存活重启；保留原备份、迁移和 OSS 挂载验收边界。

## 原生 PM2

先按 [原生部署](deploy.md) 发布并确认两个进程同 release、readiness 通过。使用既有 `DEPLOY_PM2_HOME`；现场若使用 `/opt/project/.pm2`，在原 `.env` 明确保留该路径。

在源码根目录生成计划，核对运行用户、专用 PM2 home、工具路径、current 和应用名：

```bash
node scripts/runtime-service.mjs --plan
```

计划写到 `.cache/runtime-service`，不含数据库密码或 Session Secret。保存文件须只有本项目两个进程，且 cwd 指向当前 release；拒绝接管其他项目。以 root 部署终端在相同源码目录执行安装，并保留原 `DEPLOY_RUN_USER` 与工具链配置：

若部署使用自定义环境文件，计划和安装均加上 `--env-file /实际路径/应用.env`，与 `deploy.sh --env-file` 使用同一文件。

```bash
node scripts/runtime-service.mjs --install
```

安装再次检查进程所有权，要求保存的 PM2 列表只有本项目 Web/Cron；在线列表须是同一对进程，或上次安装失败后留下的空列表。空列表重试会保留已有 dump，不执行 `pm2 save`。包含其他进程、仅有一项进程或两项未正常运行时均拒绝接管。

安装先运行 `systemd-analyze verify` 检查计划中的全部三份文件，通过后才替换系统 unit、保存在线状态和停止 PM2。没有解析器或校验失败都会在停写前终止。`--plan` 只生成文件，不能单独证明系统可以加载服务。`WorkingDirectory` 与 `PIDFile` 使用单值绝对路径，不加 shell 引号；`Exec*` 命令参数和 `Environment` 继续按各自规则引用。Linux CI 的 `npm run test:systemd` 用真实解析器检查生成文件并复现旧的引号错误，无需启动任何服务。

它写入带管理标记的 systemd 主服务、watchdog service/timer，拒绝覆盖无管理标记的同名服务。配置在 runtime 的 `shared/runtime-service.json`，只包含路径、名称和恢复设置。主服务固定 PM2_HOME、Node PATH、PIDFile 和用户，并设置 `MemoryHigh=<项目百分比的80%>`、`MemoryMax=<项目百分比>%`、`MemorySwapMax=0`。

`--install` 会保存状态、停止旧的受管服务及本项目专用 PM2 daemon，再通过 systemd 的 `pm2 resurrect` 恢复，存在短暂停写/重启窗口。该步骤确保此前从终端启动的 daemon 也真正进入受限 cgroup；仅写入 unit 后联系旧 daemon 无法实施硬上限。先完成正常发布、数据库/媒体备份及健康验证，在维护窗口安装。watchdog 每 30 秒检查存活。Node/PM2 路径或项目百分比变化后重新生成计划并安装。

如果 systemd 在停 PM2 后启动失败，安装会先停止部分启动的服务，再从已核对归属的 dump 恢复 Web/Cron，并检查进程名、目录及 online 状态；不会重新保存空列表，也不会重复启动已恢复的进程。恢复成功仍以失败退出，并明确提示合计硬限制尚未确认生效，需检查 `/api/health` 后修复重试。无法确认恢复时保留日志和 dump，按错误中的 `PM2_HOME` 执行 `pm2 resurrect`；恢复前不要运行 `pm2 save`。对于旧版安装已经停掉 PM2 的情况，更新源码后可直接重新执行 `--install`，新脚本支持读取原有 dump 完成空列表重试。

安装后执行 `systemctl show <服务名>.service -p MemoryCurrent -p MemoryHigh -p MemoryMax -p EffectiveMemoryMax -p MemorySwapMax -p ControlGroup`，确认 8 GiB 主机默认 `MemoryMax=2147483648`，并检查 Web/Cron 的 `/proc/<pid>/cgroup` 都属于该服务。原有 PM2 单独重载只更新软预算/重启阈值；未安装此 unit 时不保证硬封顶。MemoryHigh 是压力节流机制，MemoryMax 才是最后的内核限制，触及上限可能触发组内 OOM；健康/恢复机制仍须验收。

watchdog 连续三次失败后尝试恢复，间隔至少 120 秒，每 10 分钟最多三次尝试，先保存重试预算再调用 PM2；只操作 cwd 匹配的指定进程。`stopped` 是有意维护状态，不自动拉起。原生专用 home 内日志按 10 MiB、3 份历史保留，copytruncate 存在很小的并发日志窗口；服务自身日志按 journald 策略保留。

watchdog 通过 `current/scripts/runtime-watchdog.mjs` 启动，入口比较使用双方的真实文件路径。旧版只比较模块 URL 与命令行路径，Node 解析 `current` 符号链接后会跳过整个巡检却返回成功。因此 timer 显示 active 或 service 显示成功，不能单独证明轮转已执行；还应检查 `<runtime>/shared/runtime-watchdog-state.json` 的修改时间持续更新，以及超限日志是否轮转。真实 Node 回归覆盖直接路径、`current` 链接和 `--preserve-symlinks-main`，并确认普通模块导入不会执行巡检。

将脚本打印的实际服务名填入下面命令：

```bash
systemctl status <服务名>.service <服务名>-watchdog.timer
journalctl -u <服务名>.service -u <服务名>-watchdog.service --since today
```

日常使用原有 `bash scripts/stop.sh` 停止本项目；需要禁用整套恢复时停止并禁用主服务和 watchdog timer。专用 PM2 home 不再加入其他项目。

旧 crontab 中的 `scripts/memory-cleanup.sh` 现在只记录整机低可用内存，不再凭空闲快照重载 Web；任务回收和恢复由上述机制协调执行。

## 只读内存趋势

先看 `free -m` 的 `available`，不要只看 `free` 或把全部 `buff/cache` 当作程序占用。例如 total=7680、used=1976、buff/cache=5843、available=5704 MiB，表示当时约 25.7% 已用、仍有约 5.6 GiB 可用；单次快照不能排除长期增长。Linux 会按需求回收可回收缓存，定时 `drop_caches` 会增加重新读取的 I/O/CPU 开销，不作为日常释放方案。字段含义见 [free 手册](https://man7.org/linux/man-pages/man1/free.1.html)，缓存行为见 [Linux 内核说明](https://docs.kernel.org/admin-guide/sysctl/vm.html#drop-caches)。

在源码目录读取本项目现有 PM2 日志，不需要安装依赖或调用 PM2：

```bash
node scripts/memory-report.mjs --pm2-home /root/.pm2 --minutes 120
```

`--pm2-home` 必须显式指定绝对路径，应替换为实际部署使用的 PM2 home；它不会探测或启动 daemon。默认读取 `wangzhe-yanwutang-web` / `wangzhe-yanwutang-cron`，自定义进程名可加 `--web-name` / `--cron-name`。`--minutes` 为 1–10080 分钟，默认 120。脚本只读日志和 Linux `/proc/meminfo`，不读取 `.env`、不重启、不删文件。

报告按角色、PID 和 bootId 分组，显示 RSS、JS 堆、原生/外部内存的首末、最低与最高值，以及最近三次任务完成样本；不同重启不会串成一条增长曲线。另列出采样时 activeJobs/queuedJobs/activeRequests 均为零的空闲基线，这只表示受管任务和请求空闲，不能保证所有原生后台活动已停止。任务完成瞬间的值不能直接当作空闲回落值，应在重复执行同类任务后比较同一进程的空闲基线。

每个角色只读 out/error 当前日志及 `.1`–`.3` 三代，每文件最多 2 MiB，总读取量最多 32 MiB；保留最新 6000 个有效样本，最多显示最近 20 次进程生命周期。截尾、文件变动、缺失和样本不足都会提示，因此窗口不保证完整。没有有效样本不等于没有内存占用；需核对进程名、日志权限、时间窗口及资源采样是否开启。输出只含验证过的身份、时间和数值，不回显原始日志、任务参数或连接串。

该趋势只覆盖 Web/Cron，宿主快照包含整机；PM2 daemon、MySQL、Redis、OCR 应分别测量，不能相加 RSS 后当作精确整机用量。进程列表中未观察到 OCR，也不能仅凭“同机部署”就认定模型正占用大量内存。RSS 上涨但 heapUsed 稳定时还需区分外部内存、分配器保留和碎片；报告不会自动将增长判成泄漏。验证入口为 `npm run test:memory-report`。

## 日志与验收

PM2 与 Docker 均在实际业务 PID 中预加载 `scripts/runtime-preload.mjs`，先记录 `process.boot`、Node 版本和内存，再进入 Next/tsx；业务导入失败也会留下脱敏 fatal 事件与退出码。预加载器不另建业务子进程，PM2 仍检查真实 Cron 的内存。

JSON 日志字段包括 UTC 时间、级别、role、PID、bootId、release、requestId/taskId、阶段、队列等待和执行耗时。既有服务输出补充相同身份信息，错误保留脱敏消息和栈；请求体、Cookie、认证头、完整连接串不写为日志字段。

回收观测使用 `resource.sweep_completed`（过期租约、载荷回收、空条目移除、dispose 失败、剩余条目）、`resource.reclaim_completed`（回收器名称、结果、耗时、前后 heap/external/RSS 和差值）、`worker.idle_reclaimed`。回收器重复执行合并，某个回收器抛错后其他回收器仍会执行。订阅记录 `request.subscription_retired` 的 pressure/max-age/recycling/shutdown 原因；进程记录 `process.drain_started` 和 `process.recycle_requested`。

1. 用 `process.started/stopping/exited` 和 supervisor 的退出码/信号定位进程变化。
2. 按 taskId 跟踪 queued、started、phase、paused、resumed、completed、failed；关联资源压力变化和定期样本。
3. 模拟流量与资源压力，确认动态批次下降、后台排队、无租约缓存回收、API 有限供给，心跳/封盘持续执行；降压后逐级恢复。订阅占满时普通 API 仍能服务；危急时订阅关闭，底层取消结束后容量归零。
4. 观察至少两轮每日同步及完整图片同步，记录任务完成、峰值、任务后基线，不只记录空闲快照。
5. 在维护窗口分别验证进程退出、无响应和计划服务器重启恢复；核对同 release 的 readiness、电脑/手机入口、登录及持久数据。
6. 保留父进程、上次样本及宿主 OOM/重启事件。SIGKILL、断电和 OOM 不能保证应用来得及写最后一行。
7. 模拟不同用户首次加载失败及未加载 deferred 资源，释放租约后确认空条目不累积；首次分队后等待空闲期限确认线程退出，再次分队能重建。
8. 模拟自身 RSS 持续危急，确认拒绝新业务、readiness 失败、liveness 可探测、订阅退场，名额清空或排空超时后仅申请一次 SIGTERM；核对剩余写入的实际结果。

本地回归入口为 `npm run test:governor`、`npm run test:resources`、`npm run test:split-worker`、`npm run test:compose` 和构建后的 `npm run test:governor:http`。它们覆盖已发现的失败空条目、订阅挤占、取消未完成、排空超时、原生 cgroup 预算差异、线程释放重建和容器预算缺口。

本地策略、模拟 cgroup、流式取消和恢复预算测试只证明相应代码路径。真实 Linux systemd、Docker 镜像、硬限额/OOM、真实数据库协调及生产重启恢复必须在目标环境验收。
