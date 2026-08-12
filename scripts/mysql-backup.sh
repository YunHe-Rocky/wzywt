#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/opt/Mysql/mysql/bak}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
BINLOG_RETENTION_DAYS="${BINLOG_RETENTION_DAYS:-30}"
LOG_FILE="$BACKUP_DIR/backup.log"

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${MYSQL_HOST:?MYSQL_HOST is required for binlog maintenance}"
: "${MYSQL_USER:?MYSQL_USER is required for binlog maintenance}"
: "${MYSQL_PASSWORD:?MYSQL_PASSWORD is required for binlog maintenance}"

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOG_FILE"; }

mkdir -p "$BACKUP_DIR"
log "start full database backup"
node "$SCRIPT_DIR/db-backup.mjs" "$BACKUP_DIR"

find "$BACKUP_DIR" -type f -name 'yanwutang-*.sql' -mtime "+$RETENTION_DAYS" -delete

log "purge binary logs older than $BINLOG_RETENTION_DAYS days"
MYSQL_PWD="$MYSQL_PASSWORD" mysql \
  --host="$MYSQL_HOST" \
  --user="$MYSQL_USER" \
  --execute="PURGE BINARY LOGS BEFORE DATE_SUB(NOW(), INTERVAL ${BINLOG_RETENTION_DAYS} DAY)"

log "database backup completed"
