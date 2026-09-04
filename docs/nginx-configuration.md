# Nginx 与 SSL/TLS 配置讲解

本文与 [`.env.example`](../.env.example) 和 [`nginx.conf.example`](nginx.conf.example) 配套。目标是让 `.env` 保存全部部署意图，但由运维人员审核后执行宿主级操作；`deploy.sh` 不会擅自覆盖全局 Nginx、申请证书或修改防火墙。

## 1. 先确定使用方式

### 方式 A：这台服务器的 Nginx 只服务本项目

可以把 `docs/nginx.conf.example` 作为完整 `/etc/nginx/nginx.conf` 的参考，但仍必须先备份原文件、替换全部示例值并执行 `nginx -t`。发行版自带配置可能还有模块、日志轮转或目录约定，不应机械覆盖。

### 方式 B：Nginx 已服务其他网站（更常见）

禁止替换 `/etc/nginx/nginx.conf`。只进行以下合并：

1. 将范文中的 `map $http_upgrade ...` 放到现有 `http {}` 内；如果已有同名 map 就复用。
2. 将两个 `server {}` 保存到 `.env` 的 `NGINX_SITE_CONFIG`。
3. 保留现有站点和现有 `include` 规则。
4. 用 `NGINX_BIN -t` 检查整个 Nginx 配置树，而不是只检查新文件。

Rocky Linux RPM 常见站点路径是 `/etc/nginx/conf.d/*.conf`；自编译 Nginx 可能完全不同。以 `nginx -V` 和现有 `nginx.conf` 的 `include` 为准。

## 2. `.env` 与 Nginx 的逐项对应

| `.env` 变量 | Nginx 中的位置 | 范例 | 如何确认 |
|---|---|---|---|
| `PUBLIC_HOST` | 两个 `server_name`、证书目录、外部验证 | `game.example.com` | DNS A/AAAA 记录和实际域名 |
| `PUBLIC_PORT` | HTTPS `listen` | `443` | `ss -lntp` 与防火墙策略 |
| `DEPLOY_WEB_HOST` | 每个 `proxy_pass` host | `127.0.0.1` | 必须与 PM2/Next 监听一致 |
| `DEPLOY_WEB_PORT` | 每个 `proxy_pass` port | `8001` | 必须与 `.env` 的 `PORT` 一致 |
| `NGINX_BIN` | 检查和 reload 前的命令 | `/usr/sbin/nginx` | `command -v nginx` |
| `NGINX_SERVICE` | systemd unit | `nginx` | `systemctl status nginx` |
| `NGINX_SITE_CONFIG` | 项目站点文件 | `/etc/nginx/conf.d/wangzhe-yanwutang.conf` | 查看主配置的 `include` |
| `NGINX_CLIENT_MAX_BODY_SIZE` | `client_max_body_size` | `260m` | 应覆盖项目允许的最大视频/图片请求 |
| `TLS_CERT_FILE` | `ssl_certificate` | `fullchain.pem` | 文件存在且含完整证书链 |
| `TLS_KEY_FILE` | `ssl_certificate_key` | `privkey.pem` | 文件存在、权限最小、与证书匹配 |
| `TLS_TRUSTED_CERT_FILE` | 可选 `ssl_trusted_certificate` | 留空 | 仅 CA/OCSP 方案明确要求时配置 |
| `TLS_CERTBOT_WEBROOT` | ACME challenge 的 `root` | `/var/www/certbot` | Certbot 与 Nginx 必须使用同一路径 |
| `PUBLIC_HEALTH_URL` | 发布后的外部检查 | `https://game.example.com/api/health` | 必须经过公网 DNS、TLS 和 Nginx |

Nginx 不会自动读取 `.env`。这些变量是生成和复核配置时的权威输入，必须由人逐项替换，或以后实现一个只生成临时文件、不 reload 的安全渲染工具。

## 3. 签发证书

### 已有证书或人工 CA

当 `TLS_CERT_MODE=existing` 或 `manual`：

1. 将证书链放到 `TLS_CERT_FILE`。
2. 将对应私钥放到 `TLS_KEY_FILE`。
3. 私钥不得提交 Git，不得放进源码/release 目录。
4. 验证证书与私钥匹配（两条输出的 SHA-256 必须相同）：

```bash
openssl x509 -noout -modulus -in /path/to/fullchain.pem | openssl sha256
openssl rsa  -noout -modulus -in /path/to/privkey.pem   | openssl sha256
```

如果使用 ECDSA 私钥，上述 `openssl rsa` 不适用，应由证书提供方给出对应验证命令。

### Certbot webroot

当 `TLS_CERT_MODE=certbot`：

1. 创建 `.env` 中的 webroot：`install -d -m 0755 /var/www/certbot`。
2. 先安装仅监听 80、提供 `/.well-known/acme-challenge/` 的临时站点。
3. 从外部确认 challenge 文件能通过 HTTP 访问。
4. 按 `.env` 实际路径、域名和邮箱执行：

```bash
/usr/bin/certbot certonly --webroot \
  -w /var/www/certbot \
  -d game.example.com \
  -m admin@game.example.com \
  --agree-tos --no-eff-email
```

5. 证书生成后再启用 HTTPS server 和 HTTP 301 跳转。

不要在签发证书前启用引用不存在证书文件的 HTTPS 配置，否则 `nginx -t` 会失败。

## 4. 安装配置的安全事务

以下步骤是操作顺序，不是可直接无脑粘贴的脚本。所有路径必须先与 `.env` 对照：

1. `readlink -f` 确认源文件和目标文件。
2. 将现有配置备份到 root-only 目录，并保留时间戳。
3. 把编辑完成的配置先写入临时文件。
4. 检查临时文件不存在 `CHANGE_ME`、`example.com` 或未替换占位符。
5. 安装到 `NGINX_SITE_CONFIG`。
6. 执行 `NGINX_BIN -t`。
7. 只有检查成功后才执行 `systemctl reload NGINX_SERVICE`。
8. reload 后检查 unit、80/443 listener、内部 health、公网 health 和日志。
9. 任一步失败就恢复备份，再次 `nginx -t` 后 reload；不要直接 stop 全局 Nginx。

## 5. 发布后验证

```bash
# 内部应用，不经过 Nginx/TLS
curl --fail http://127.0.0.1:8001/api/health

# HTTP 必须跳转到 HTTPS
curl -I http://game.example.com/

# 公网完整链路
curl --fail --proto '=https' --tlsv1.2 \
  https://game.example.com/api/health

# 证书主题、签发者和有效期
openssl x509 -in /etc/letsencrypt/live/game.example.com/fullchain.pem \
  -noout -subject -issuer -dates

# 带 SNI 的握手与证书链
openssl s_client -connect game.example.com:443 \
  -servername game.example.com -verify_return_error </dev/null

systemctl status nginx --no-pager
ss -lntp | grep -E ':(80|443|8001)[[:space:]]'
```

内部 `/api/health` 成功只证明 Next.js/依赖链；公网 URL 成功才覆盖 DNS、443、证书、Nginx 和 upstream。仍需继续验证登录、Secure Cookie、赛事流程、上传、OCR、视频 Range、评论/点赞和管理员操作。

## 6. 续期与回滚

Certbot 模式至少执行一次：

```bash
certbot renew --dry-run
systemctl list-timers --all | grep -i certbot
```

续期 hook 应执行 `nginx -t`，成功后才 reload。非 Certbot 模式必须在监控系统中设置证书到期告警。

Nginx/证书是宿主级事务，不属于应用 release 的原子回滚。应用回滚不会自动回滚证书或站点配置，因此每次修改前必须单独备份并记录：原文件、目标文件、证书序列号、到期时间、`nginx -t` 结果和 reload 时间。
