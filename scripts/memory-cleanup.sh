#!/bin/bash
# Compatibility for existing crontabs: record host pressure. The adaptive
# governor and liveness watchdog own reclamation/recovery; never guess which
# process to reload from a single low-MemAvailable snapshot.
set -Eeuo pipefail

: "${DEPLOY_PROJECT_NAME:?DEPLOY_PROJECT_NAME is required}"
[[ "$DEPLOY_PROJECT_NAME" =~ ^[A-Za-z0-9._-]+$ ]] || { printf 'invalid DEPLOY_PROJECT_NAME\n' >&2; exit 1; }
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

printf '{"timestamp":"%s","event":"host.memory_pressure","level":"warn","project":"%s","availableMiB":%s,"thresholdMiB":%s,"action":"observe-adaptive-governor"}\n' \
  "$(date -u '+%FT%TZ')" "$DEPLOY_PROJECT_NAME" "$available" "$THRESHOLD_MB" >&2

# 记录时间戳
date +%s > "$STAMP_FILE"

