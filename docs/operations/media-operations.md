# 媒体容量、备份与恢复

比赛截图、战报视频和头像不在 Git release 内。数据库备份只包含记录和校验和，不包含媒体文件；完整恢复必须同时具备同一恢复点附近的 SQL 备份、媒体归档、头像归档和媒体清单。

## 容量门槛

上传在写盘前创建数据库预留，成功时与业务记录在同一事务结算，失败或超时后释放。默认门槛：

- 单用户已存储媒体：2 GiB
- 单用户 UTC 自然日上传：512 MiB
- 全站已存储媒体：50 GiB
- 文件系统最低保留空间：2 GiB
- 视频单文件：256 MiB；截图单文件：12 MiB
- 截图最长边：8192 像素；总像素：4000 万

只有容量规划确认需要变化时才设置 MEDIA_USER_STORED_QUOTA_BYTES、MEDIA_USER_DAILY_QUOTA_BYTES、MEDIA_GLOBAL_STORED_QUOTA_BYTES 或 MEDIA_MIN_FREE_BYTES。值为十进制字节数。并发请求会共同计入 RESERVED 预留，不能各自通过检查后超卖。

/api/health 会报告媒体可用字节数，并在低于保留线时失败。cron 每五分钟清理过期预留及其已写入但未提交的孤儿文件。容器头和图片尺寸检查只能阻挡明显伪造或异常输入；视频是否可播放、时长和编码兼容性仍应在目标服务器用 ffprobe/播放抽样验证。

## 建立媒体备份集

MEDIA_BACKUP_DIR 应是受权限保护的异地挂载目录或会被独立同步到异地的目录，不能放在 release 目录。先使用部署预检打印的 runtime 路径确认三个目录，再执行：

```bash
export DEPLOY_PROJECT_NAME=wangzhe-yanwutang
export MEDIA_STORAGE_DIR=/opt/apps/wzywt-runtime/shared/media
export AVATAR_DIR=/opt/apps/wzywt-runtime/shared/avatars
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

