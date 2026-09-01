#!/bin/bash
# 内存清理脚本 — 仅在内存不足时安全清理，不影响业务
set -Eeuo pipefail

: "${DEPLOY_PROJECT_NAME:?DEPLOY_PROJECT_NAME is required}"
[[ "$DEPLOY_PROJECT_NAME" =~ ^[A-Za-z0-9._-]+$ ]] || { printf 'invalid DEPLOY_PROJECT_NAME\n' >&2; exit 1; }
PM2_WEB_NAME="${DEPLOY_PM2_WEB_NAME:-$DEPLOY_PROJECT_NAME-web}"
[[ "$PM2_WEB_NAME" =~ ^[A-Za-z0-9._-]+$ ]] || { printf 'invalid DEPLOY_PM2_WEB_NAME\n' >&2; exit 1; }
PM2_BIN="${DEPLOY_PM2_BIN:-}"
if [[ -n "$PM2_BIN" && "$PM2_BIN" != */* ]]; then
  PM2_BIN="$(command -v -- "$PM2_BIN" 2>/dev/null || true)"
elif [[ -z "$PM2_BIN" ]]; then
  PM2_BIN="$(command -v pm2 2>/dev/null || true)"
fi
[[ -n "$PM2_BIN" && -x "$PM2_BIN" ]] || { printf 'PM2 command not found\n' >&2; exit 1; }
if [[ -n "${DEPLOY_RUN_USER:-}" && "$(id -un)" != "$DEPLOY_RUN_USER" ]]; then
  printf 'memory cleanup must run as %s\n' "$DEPLOY_RUN_USER" >&2
  exit 1
fi
THRESHOLD_MB="${MEMORY_CLEANUP_THRESHOLD_MB:-200}"
INTERVAL_SEC="${MEMORY_CLEANUP_INTERVAL_SECONDS:-300}"
[[ "$THRESHOLD_MB" =~ ^[1-9][0-9]*$ && "$INTERVAL_SEC" =~ ^[1-9][0-9]*$ ]] || { printf 'invalid memory cleanup threshold/interval\n' >&2; exit 1; }
STAMP_FILE="/tmp/${DEPLOY_PROJECT_NAME}-memclean-stamp"

# 最小间隔检查
if [ -f "$STAMP_FILE" ]; then
  last=$(cat "$STAMP_FILE")
  now=$(date +%s)
  [[ "$last" =~ ^[0-9]+$ ]] || { printf 'invalid cleanup stamp\n' >&2; exit 1; }
  if [ $((now - last)) -lt $INTERVAL_SEC ]; then
    exit 0
  fi
fi

# 获取可用内存 (MB)
available=$(free -m | awk '/^Mem:/{print $7}')
if [ -z "$available" ]; then
  # fallback: MemAvailable 列可能在旧系统上不存在
  available=$(free -m | awk '/^-\/\+/{print $4}')
fi
[[ "$available" =~ ^[0-9]+$ ]] || { printf 'could not determine available memory\n' >&2; exit 1; }

if [ "$available" -gt "$THRESHOLD_MB" ]; then
  exit 0  # 内存充足，无需清理
fi

echo "[$(date '+%F %T')] 可用内存 ${available}MB < ${THRESHOLD_MB}MB，重载 web 进程..."

# 仅回收应用自身的 V8 内存；应用不得修改 Linux page cache。
"$PM2_BIN" reload "$PM2_WEB_NAME" --update-env

# 记录时间戳
date +%s > "$STAMP_FILE"

after=$(free -m | awk '/^Mem:/{print $7}')
echo "[$(date '+%F %T')] 清理完成，可用内存: ${after}MB"
