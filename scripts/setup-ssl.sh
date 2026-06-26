#!/bin/bash
# SSL 证书配置 — 为移动端陀螺仪等需要安全上下文的 API 提供 HTTPS
# 仅需执行一次，后续证书自动续期

set -e

DOMAIN="ywt.yunhe.ink"

echo ">>> checking existing SSL..."
if [ -d "/etc/letsencrypt/live/${DOMAIN}" ]; then
  echo "SSL certificate already exists, skipping"
  exit 0
fi

echo ">>> installing certbot..."
if command -v certbot &>/dev/null; then
  echo "certbot already installed"
else
  # Rocky Linux / RHEL 系用 dnf, Ubuntu/Debian 用 apt
  if command -v dnf &>/dev/null; then
    dnf install -y certbot python3-certbot-nginx
  elif command -v yum &>/dev/null; then
    yum install -y certbot python3-certbot-nginx
  elif command -v apt &>/dev/null; then
    apt update && apt install -y certbot python3-certbot-nginx
  else
    # 通用：通过 snap
    snap install --classic certbot
    ln -sf /snap/bin/certbot /usr/bin/certbot
  fi
fi

echo ">>> configuring nginx for domain validation..."
# 确认 nginx 已配置域名 server block
if ! grep -q "${DOMAIN}" /etc/nginx/conf.d/*.conf 2>/dev/null; then
  echo ">>> creating nginx config for ${DOMAIN}..."
  cat > /etc/nginx/conf.d/yanwutang.conf << 'NGINX'
server {
    listen 80;
    server_name ywt.yunhe.ink;
    location / {
        proxy_pass http://127.0.0.1:8081;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX
  nginx -t && systemctl reload nginx
fi

echo ">>> requesting SSL certificate..."
certbot --nginx -d ${DOMAIN} --non-interactive --agree-tos --email admin@${DOMAIN} --redirect

echo ">>> testing auto-renewal..."
certbot renew --dry-run

echo "=== SSL setup complete ==="
echo "https://${DOMAIN} is now available"
