#!/bin/bash
# 内存清理脚本 — 仅在内存不足时安全清理，不影响业务
set -e

THRESHOLD_MB=200
INTERVAL_SEC=300  # 两次清理最小间隔 5 分钟
STAMP_FILE="/tmp/yanwutang-memclean-stamp"

# 最小间隔检查
if [ -f "$STAMP_FILE" ]; then
  last=$(cat "$STAMP_FILE")
  now=$(date +%s)
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

if [ "$available" -gt "$THRESHOLD_MB" ]; then
  exit 0  # 内存充足，无需清理
fi

echo "[$(date '+%F %T')] 可用内存 ${available}MB < ${THRESHOLD_MB}MB，执行安全清理..."

# 1. 清理系统页缓存 (安全操作，不影响进程内存)
sync
echo 1 > /proc/sys/vm/drop_caches 2>/dev/null || true

# 2. PM2 优雅重载 web 进程（释放 V8 碎片内存）
pm2 reload yanwutang-web 2>/dev/null || true

# 记录时间戳
date +%s > "$STAMP_FILE"

after=$(free -m | awk '/^Mem:/{print $7}')
echo "[$(date '+%F %T')] 清理完成，可用内存: ${after}MB"
