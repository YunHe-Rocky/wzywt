# Docker Compose 实施交付记录

复制本模板作为每次部署的交付记录。不要记录 `.env.docker` 的密码、Token 或 Secret 原文。

## 基本信息

- 实施日期：
- 实施人员：
- 主机名 / 环境：
- 源码版本或提交号：
- `APP_RELEASE_ID`：
- `PUBLIC_ORIGIN`：
- 部署场景：本机 / 局域网 / 公网域名
- 是否启用 OCR：是 / 否

## 软件版本

- Node.js：
- Docker Server：
- Docker Compose：
- rclone（如适用）：
- MySQL 模式（container / external）、版本/客户端镜像：
- OCR 模式（off / container / external）、外部接入检查结果（不记令牌）：
- Redis 镜像：

## 存储

- `STORAGE_MODE`：
- `OSS_MOUNT_PATH`（如适用）：
- `OSS_DATA_PATH`（如适用）：
- `COMPOSE_BACKUP_DIR`：
- `findmnt` 文件系统类型：
- rclone VFS 缓存目录和容量：
- OSS 版本控制 / 保留策略：

## 执行结果

- [ ] `node scripts/compose.mjs check` 通过
- [ ] `node scripts/compose.mjs up/update` 通过
- [ ] 容器 MySQL healthy，或外部 MySQL 容器网络查询通过
- [ ] Redis healthy
- [ ] Web healthy，releaseId 正确
- [ ] Cron healthy，产生当前 release 新心跳
- [ ] OCR healthy（启用时）
- [ ] 电脑入口、登录、刷新和退出通过
- [ ] 手机入口、登录、刷新和退出通过
- [ ] 测试媒体上传和再次读取通过
- [ ] 英雄同步后 Web 无重启读取通过

## 备份与恢复证据

- 备份目录：
- `manifest.json` 的 `complete`：
- `database.sql` 大小：
- `media.tar.gz` 大小：
- `hero-assets.tar.gz` 大小：
- OSS 远端对象核验方式和结果：
- 最近隔离恢复演练日期：
- 恢复点 / RPO：
- 恢复耗时 / RTO：

## 网络与安全

- 宿主发布地址和端口：
- 防火墙 / 安全组变更：
- 反向代理与 TLS（公网时）：
- `.env.docker` 私密副本保管位置（只写保管系统名称，不写内容）：

## 未完成项和风险

- 未执行的现场验证：
- 已知限制：
- 后续负责人和期限：
