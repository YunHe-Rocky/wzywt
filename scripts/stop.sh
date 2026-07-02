#!/bin/bash
# 王者演武堂 Linux 停止脚本 — 终止所有相关服务
set -e

PORT=8081
NGINX_DIR="/opt/Nginx/nginx.1.30.2"

echo "[stop] 正在停止 王者演武堂 所有服务..."

# 1. 停止 PM2 应用
pm2 stop yanwutang-web 2>/dev/null && echo "[stop] yanwutang-web 已停止" || echo "[stop] yanwutang-web 未在运行"
pm2 stop yanwutang-cron 2>/dev/null && echo "[stop] yanwutang-cron 已停止" || echo "[stop] yanwutang-cron 未在运行"

# 2. 释放端口
if fuser "$PORT/tcp" 2>/dev/null; then
  fuser -k "$PORT/tcp" 2>/dev/null
  echo "[stop] 端口 $PORT 已释放"
else
  echo "[stop] 端口 $PORT 未被占用"
fi

# 3. Nginx（可选：关闭则取消注释）
# if [ -f "$NGINX_DIR/sbin/nginx" ]; then
#   "$NGINX_DIR/sbin/nginx" -s stop 2>/dev/null && echo "[stop] Nginx 已停止"
# fi

echo "[stop] 所有服务已停止"
