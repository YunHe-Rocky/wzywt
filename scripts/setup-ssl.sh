#!/bin/bash
# SSL 证书配置 — acme.sh 零依赖方案
set -e

DOMAIN="ywt.yunhe.ink"
CERT_DIR="/etc/nginx/ssl"

echo ">>> checking existing SSL..."
if [ -f "${CERT_DIR}/${DOMAIN}.crt" ]; then
  echo "SSL certificate already exists"
  exit 0
fi

echo ">>> installing acme.sh..."
cd /root
if [ ! -d ".acme.sh" ]; then
  curl https://get.acme.sh | sh -s email=admin@ywt.yunhe.ink
fi
source /root/.acme.sh/acme.sh.env 2>/dev/null || . /root/.acme.sh/acme.sh.env

echo ">>> requesting SSL certificate..."
mkdir -p ${CERT_DIR}

# 先用 webroot 方式验证（nginx 已在 80 端口运行）
/root/.acme.sh/acme.sh --issue -d ${DOMAIN} -w /usr/share/nginx/html --debug 2>&1 || {
  echo "webroot mode failed, trying standalone..."
  systemctl stop nginx 2>/dev/null || true
  /root/.acme.sh/acme.sh --issue -d ${DOMAIN} --standalone --debug 2>&1
  systemctl start nginx 2>/dev/null || true
}

echo ">>> installing cert to nginx..."
/root/.acme.sh/acme.sh --install-cert -d ${DOMAIN} \
  --cert-file      ${CERT_DIR}/${DOMAIN}.crt \
  --key-file       ${CERT_DIR}/${DOMAIN}.key \
  --fullchain-file ${CERT_DIR}/fullchain.pem \
  --reloadcmd      "systemctl reload nginx 2>/dev/null || nginx -s reload"

echo ">>> configuring nginx HTTPS..."
cat > /etc/nginx/conf.d/yanwutang.conf << 'NGINX'
server {
    listen 80;
    server_name ywt.yunhe.ink;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ywt.yunhe.ink;

    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/ywt.yunhe.ink.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

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

echo ""
echo "=== SSL setup complete ==="
echo "https://${DOMAIN} is now available"
