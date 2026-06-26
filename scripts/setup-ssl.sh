#!/bin/bash
# SSL 证书配置 — 自动检测 nginx 路径
set -e

DOMAIN="ywt.yunhe.ink"

echo ">>> checking existing SSL..."
CERT_DIR="/etc/nginx/ssl"
if [ -f "${CERT_DIR}/fullchain.pem" ]; then
  echo "SSL certificate already exists"
  exit 0
fi

# 自动检测 nginx 路径
NGINX_BIN=$(which nginx 2>/dev/null || echo "/opt/Nginx/sbin/nginx")
NGINX_DIR=$(dirname $(dirname $($NGINX_BIN -V 2>&1 | grep -oP 'conf-path=\K[^ ]+' | head -1) 2>/dev/null) 2>/dev/null)
[ -z "$NGINX_DIR" ] && NGINX_DIR="/opt/Nginx/nginx.1.30.2"
CONF_DIR="${NGINX_DIR}/conf.d"
# 如果 conf.d 下有 sites 子目录，用 sites
[ -d "${CONF_DIR}/sites" ] && SITE_DIR="${CONF_DIR}/sites" || SITE_DIR="${CONF_DIR}"

echo ">>> nginx: bin=$NGINX_BIN dir=$NGINX_DIR site=$SITE_DIR"

echo ">>> installing acme.sh..."
cd /root
if [ ! -d ".acme.sh" ]; then
  curl https://get.acme.sh | sh -s email=admin@${DOMAIN}
fi
source /root/.acme.sh/acme.sh.env 2>/dev/null || . /root/.acme.sh/acme.sh.env

echo ">>> requesting SSL certificate..."
mkdir -p ${CERT_DIR}

# 用 standalone 模式（先停 nginx，拿完证书再起）
$NGINX_BIN -s stop 2>/dev/null || true
sleep 2

/root/.acme.sh/acme.sh --issue -d ${DOMAIN} --standalone --debug 2>&1

# 起 nginx
$NGINX_BIN 2>/dev/null || systemctl start nginx 2>/dev/null || true
sleep 2

echo ">>> installing cert to ${CERT_DIR}..."
/root/.acme.sh/acme.sh --install-cert -d ${DOMAIN} \
  --cert-file      ${CERT_DIR}/fullchain.pem \
  --key-file       ${CERT_DIR}/${DOMAIN}.key \
  --fullchain-file ${CERT_DIR}/fullchain.pem \
  --reloadcmd      "$NGINX_BIN -s reload"

echo ">>> writing nginx config to ${SITE_DIR}/yanwutang.conf..."
cat > ${SITE_DIR}/yanwutang.conf << NGINX
server {
    listen 80;
    server_name ${DOMAIN};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${DOMAIN};

    ssl_certificate ${CERT_DIR}/fullchain.pem;
    ssl_certificate_key ${CERT_DIR}/${DOMAIN}.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        proxy_pass http://127.0.0.1:8081;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX

$NGINX_BIN -t && $NGINX_BIN -s reload

echo ""
echo "=== SSL setup complete ==="
echo "https://${DOMAIN} is now available"
