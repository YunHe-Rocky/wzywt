# 媒体容量、备份与恢复

比赛截图、战报视频和头像不在 Git release 内。数据库备份只包含记录和校验和，不包含媒体文件；完整恢复必须同时具备同一恢复点附近的 SQL 备份、媒体归档、头像归档和媒体清单。

## 容量门槛

上传在写盘前创建数据库预留，成功时与业务记录在同一事务结算，失败或超时后释放。默认门槛：

- 单用户已存储媒体：2 GiB
- 单用户 UTC 自然日上传：512 MiB
- 全站已存储媒体：50 GiB
- 文件系统最低保留空间：2 GiB
- 视频单文件：默认 512 MiB、最长 300 秒；截图单文件：12 MiB
- 截图最长边：8192 像素；总像素：4000 万

只有容量规划确认需要变化时才设置 MEDIA_USER_STORED_QUOTA_BYTES、MEDIA_USER_DAILY_QUOTA_BYTES、MEDIA_GLOBAL_STORED_QUOTA_BYTES 或 MEDIA_MIN_FREE_BYTES。值为十进制字节数。并发请求会共同计入 RESERVED 预留，不能各自通过检查后超卖。

/api/health 会报告媒体可用字节数，并在低于保留线时失败。cron 每五分钟清理过期预留及其已写入但未提交的孤儿文件。新视频上传会先检查容器时长，再完成解码与兼容处理；无法直接读取时长的录屏 WebM 由解码结果确定时长。转换后的帧和音频包对齐容差为 100 毫秒，原片已知时长仍严格执行配置上限。处理成功仍需在目标手机浏览器抽样验证播放与拖动。

## 视频上传配置

项目支持直接访问 Next.js 的 8001 端口，不要求使用 Nginx。以下应用配置适用于直连和代理部署；本节末尾的 Nginx 配置仅在请求确实经过 Nginx 时适用。

在部署所使用的 `.env` 中设置，修改后重启 Web 进程：

```dotenv
COMBAT_VIDEO_MAX_DURATION_SECONDS=300
COMBAT_VIDEO_MAX_SIZE_MB=512
COMBAT_VIDEO_UPLOAD_TIMEOUT_SECONDS=900
```

大小按 MiB（1024 × 1024 字节）计算。时长和大小独立限制：五分钟的高码率视频如果超过 512 MiB，仍需压缩。浏览器从 `/api/combat-posts/policy` 获取实际配置，上传前检查大小和时长；后端独立检查容器时长，不信任浏览器。缺失有效时长信息的文件需重新导出为 MP4/WebM。旧视频不因新上传时长限制而被删除或禁播。

上传采用流式保存，提供进度与取消；客户端和服务端总超时默认均为 15 分钟，服务端另保留 30 秒无数据空闲超时。配额预留有效期覆盖配置的上传总超时及一分钟验证余量，修改总超时不会让预留提前失效。单用户每日媒体配额默认仍是 512 MiB（包含截图），因此已有当天上传记录时，可能先达到每日配额。按真实运营需求单独调整 `MEDIA_USER_DAILY_QUOTA_BYTES`。

`/api/combat-posts` 精确排除在 Middleware matcher 外，让大视频直接到达流式解析器。Next.js 当前版本默认对中间件请求体克隆设置 10 MiB 上限，超过会截断，导致后端报 multipart 格式错误。不要靠扩大中间件内存缓冲解决；POST Route 的 `requireAuth` 和 GET 用例的身份检查仍独立执行，其他动态子路由仍经过 Middleware。

Nginx 的 `client_max_body_size` 必须覆盖文件上限和 multipart 开销。两份参考配置均为 `516m`，已有线上 Nginx 不会自动读取应用 `.env`，需单独核对当前站点配置。`proxy_read_timeout` 必须覆盖完整上传及验证时间：流式上传期间应用尚未返回响应，旧值 `300s` 会使慢速上传提前收到 504；完整示例改为 `960s`（15 分钟上传加 1 分钟余量）。如调整上传总超时，也须同步代理超时。应用文件大小上限最高 2047 MiB，以适配现有数据库字段。

遇到五分钟内视频失败时，先区分浏览器提示和 HTTP 状态：413 通常需要核对站点代理大小限制；504 核对代理响应超时；应用提示每日配额、文件大小或时长时则按该项实际配置排查。仅更新应用 release 不会更新现有 Nginx；使用备份后的站点配置，通过 `nginx -t` 后再重载。

新视频必须在发布前完成解码与兼容处理：接受 MP4、MOV、WebM，统一生成 H.264 Main / AAC、8-bit yuv420p、最高 720p（保留竖屏方向）、30 fps 的 MP4；元数据移到文件开头以便边下载边播放。视频码率上限 1.5 Mbps、音频 96 kbps。无法解码、处理超时或处理后超限时拒绝发布，并清理中间文件。处理由现有资源调度串行协调，编码使用一个线程；处理后文件可能大于低码率原件，此时必须在原预留上重新核对配额，不能绕过配额或重复计算预留。没有 HLS 自适应码率或多清晰度切换。

Docker 运行镜像已安装 FFmpeg。原生开发与 PM2 需要自行安装含 `libx264` 和 `aac` 编码器的 FFmpeg；可执行文件不在 PATH 时，在应用 `.env` 设置 `FFMPEG_BIN=/实际路径/ffmpeg`。发布前执行 `npm run check:video-runtime` 验证。上传配置接口和发布接口也会检查组件，缺失时明确返回 503，阻止用户上传后才得知无法处理；不会降级为直接发布未验证原片。

上传进度达到 100% 后显示“正在处理兼容播放版本”，完成前不要重复发布。浏览器可先读本地时长，但无法读取本机编码时仍可交给服务器处理；服务端独立检查最终时长，不允许通过修改浏览器结果绕过限制。处理单次最多三分钟，整个上传仍受配置的请求时限与预留有效期约束。临时目录需为原片和输出保留空间。

播放器使用浏览器原生 Range 播放，视频响应发送 `X-Accel-Buffering: no`。手机端首次进入显示“点击播放视频”，点击时直接发起有声播放；仅预读视频信息、等待用户点击时不显示持续缓冲。播放请求连续等待 20 秒后提供重试和单独播放入口，重复缓冲事件不会重置期限或隐藏错误，并区分登录失效、文件丢失、服务繁忙与解码失败；首次播放与重试都在用户点击时直接调用播放，避免丢失手机浏览器的用户操作授权。浏览器拒绝播放且没有触发媒体错误事件时，也会显示可重试的提示。旧视频保持原文件，不会因部署更新自动转码；旧片需重新发布兼容版本，或另行备份后安排受控处理。

验证命令为 `npm run test:combat-video`（解析与边界）、`npm run test:e2e:combat-streaming`（Next 入口的大请求完整性）和 `npm run test:e2e:video-compatibility`（真实特殊编码、MOV、WebM 转换与 Chromium/WebKit 播放、拖动、重试、错误恢复）。第三项需要 FFmpeg 和 Playwright 浏览器；模拟环境不能代替 vivo 浏览器或 iOS 真机验收。上线后必须用实际手机重新上传并播放验证。

## 建立媒体备份集

MEDIA_BACKUP_DIR 应是受权限保护的异地挂载目录或会被独立同步到异地的目录，不能放在 release 目录。先使用部署预检打印的 runtime 路径确认三个目录，再执行：

```bash
export DEPLOY_PROJECT_NAME=wangzhe-yanwutang
export MEDIA_STORAGE_DIR=/opt/apps/wzywt-runtime/shared/media
export AVATAR_DIR=/opt/apps/wzywt-runtime/shared/media/avatars
export MEDIA_BACKUP_DIR=/mnt/offsite/wzywt/media
bash scripts/media-backup.sh
```

脚本先读取数据库记录并逐个验证现有文件大小和 SHA-256；缺失或不一致时拒绝生成“成功”备份。成功产物包括：

- *-media.tar.gz
- *-avatars.tar.gz
- *-media-manifest.json
- *-media-SHA256SUMS.txt

媒体备份不替代 scripts/db-backup.mjs 或 scripts/mysql-backup.sh。调度时应把 SQL 与媒体备份的时间戳、数据库 binlog 位置、保留期限和异地同步结果写入运维记录。备份目录权限建议 0700，清单和归档不得包含 .env。

## 空目录恢复演练

1. 新建隔离 MySQL 和两个空目录，不覆盖生产目录。
2. 校验 SQL、两个归档和清单文件的 SHA256SUMS。
3. 导入 SQL，分别把媒体和头像归档解压到空目录。
4. 让 DATABASE_URL、MEDIA_STORAGE_DIR、AVATAR_DIR 指向隔离环境。
5. 运行 node scripts/media-manifest.mjs /tmp/restored-media-manifest.json；只有 complete=true 且 problems 为空才算文件层恢复通过。
6. 启动隔离应用，抽样访问历史截图、视频 Range 请求和头像，再核对数据库记录的 SHA-256。
7. 记录实际 RPO、RTO、对象总数、总字节、缺失/不一致数和演练日期。

故障时不要自动把旧 SQL 导回正在写入的生产库。应用回滚只切换 release；数据库兼容边界与人工恢复决策见部署指南。

