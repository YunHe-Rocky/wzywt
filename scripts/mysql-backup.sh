#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
: "${DEPLOY_PROJECT_NAME:?DEPLOY_PROJECT_NAME is required}"
: "${BACKUP_DIR:?BACKUP_DIR must be the absolute project backup directory}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
BINLOG_RETENTION_DAYS="${BINLOG_RETENTION_DAYS:-30}"
LOG_FILE="$BACKUP_DIR/backup.log"

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${MYSQL_HOST:?MYSQL_HOST is required for binlog maintenance}"
: "${MYSQL_USER:?MYSQL_USER is required for binlog maintenance}"
: "${MYSQL_PASSWORD:?MYSQL_PASSWORD is required for binlog maintenance}"
[[ "$DEPLOY_PROJECT_NAME" =~ ^[A-Za-z0-9._-]+$ ]] || { printf 'invalid DEPLOY_PROJECT_NAME\n' >&2; exit 1; }
[[ "$BACKUP_DIR" == /* && "$BACKUP_DIR" != "/" ]] || { printf 'BACKUP_DIR must be absolute and non-root\n' >&2; exit 1; }
[[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || { printf 'RETENTION_DAYS must be a non-negative integer\n' >&2; exit 1; }
[[ "$BINLOG_RETENTION_DAYS" =~ ^[1-9][0-9]*$ ]] || { printf 'BINLOG_RETENTION_DAYS must be a positive integer\n' >&2; exit 1; }

resolve_command() {
  local label="$1" explicit="$2" resolved=""
  if [[ -n "$explicit" ]]; then
    if [[ "$explicit" == */* ]]; then [[ -x "$explicit" ]] && resolved="$explicit"; else resolved="$(command -v -- "$explicit" 2>/dev/null || true)"; fi
  else
    resolved="$(command -v -- "$label" 2>/dev/null || true)"
  fi
  [[ -n "$resolved" && -x "$resolved" ]] || { printf 'required command not found: %s\n' "$label" >&2; exit 1; }
  printf '%s\n' "$resolved"
}

NODE_BIN="$(resolve_command node "${DEPLOY_NODE_BIN:-}")"
FIND_BIN="$(resolve_command find "${DEPLOY_FIND_BIN:-}")"
MYSQL_BIN="$(resolve_command mysql "${DEPLOY_MYSQL_BIN:-}")"

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOG_FILE"; }

mkdir -p -- "$BACKUP_DIR"
log "start full database backup"
"$NODE_BIN" "$SCRIPT_DIR/db-backup.mjs" "$BACKUP_DIR"

"$FIND_BIN" "$BACKUP_DIR" -maxdepth 1 -type f -name "$DEPLOY_PROJECT_NAME-*.sql" -mtime "+$RETENTION_DAYS" -delete

log "purge binary logs older than $BINLOG_RETENTION_DAYS days"
MYSQL_PWD="$MYSQL_PASSWORD" "$MYSQL_BIN" \
  --host="$MYSQL_HOST" \
  --user="$MYSQL_USER" \
  --execute="PURGE BINARY LOGS BEFORE DATE_SUB(NOW(), INTERVAL ${BINLOG_RETENTION_DAYS} DAY)"

log "database backup completed"
