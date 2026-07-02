#!/bin/bash
# MySQL 备份脚本 — 全量 + binlog 日志轮转
# 用法: bash scripts/mysql-backup.sh
# cron: 0 3 * * * bash /opt/yanwutang/scripts/mysql-backup.sh

set -e

MYSQL_USER="root"
MYSQL_PASS="你的MySQL密码"
MYSQL_HOST="127.0.0.1"
DB_NAME="yanwutang"
BACKUP_DIR="/opt/Mysql/mysql/bak"
BINLOG_DIR="/opt/Mysql/mysql/log"
RETENTION_DAYS=7   # 全量备份保留天数
BINLOG_RETENTION=30 # binlog 保留天数

TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
BACKUP_FILE="$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.sql.gz"
LOG_FILE="$BACKUP_DIR/backup.log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"; }

mkdir -p "$BACKUP_DIR"

# ============================================================
# 1. 全量备份
# ============================================================
log "开始全量备份: $DB_NAME"
mysqldump -u"$MYSQL_USER" -p"$MYSQL_PASS" -h"$MYSQL_HOST" \
  --single-transaction --routines --triggers --events \
  --flush-logs --master-data=2 \
  "$DB_NAME" | gzip > "$BACKUP_FILE"

log "全量备份完成: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

# ============================================================
# 2. 清理过期全量备份
# ============================================================
DELETED=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +$RETENTION_DAYS -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
  log "清理 $DELETED 个过期全量备份 (>${RETENTION_DAYS}天)"
fi

# ============================================================
# 3. Binlog 清理（只保留最近 N 天）
# ============================================================
log "清理 $BINLOG_RETENTION 天前的 binlog..."
mysql -u"$MYSQL_USER" -p"$MYSQL_PASS" -h"$MYSQL_HOST" -e "
  PURGE BINARY LOGS BEFORE DATE_SUB(NOW(), INTERVAL $BINLOG_RETENTION DAY);
" 2>/dev/null

log "备份任务完成"
