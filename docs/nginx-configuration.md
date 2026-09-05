# Nginx 与 SSL/TLS 配置指南

Nginx 与证书是一次性或低频宿主配置，不属于每次应用发布。`scripts/deploy.sh` 不会覆盖全局 Nginx、申请证书、修改防火墙或 reload 其他站点；日常发布请看 [部署指南](deploy.md)。

本页不要求把 Nginx/TLS 参数写进应用 `.env`。直接以已经核实的域名、路径和现有 Nginx include 规则修改站点配置，避免维护一套应用根本不会读取的重复变量。

## 1. 选择配置方式

### Nginx 只服务本项目

可以参考 [`nginx.conf.example`](nginx.conf.example)，但仍要先备份实际配置、替换全部示例值并执行 `nginx -t`。发行版或自编译安装可能有自己的模块、日志和 include 约定，不能机械覆盖。

### Nginx 已服务其他网站（更常见）

不要替换主 `nginx.conf`。只做三件事：

1. 已有 `map $http_upgrade ...` 就复用；没有时放进现有 `http {}`。
2. 把本项目的两个 `server {}` 放到现有 `include` 会加载的独立站点文件。
3. 对整个配置树执行实际 Nginx 二进制的 `-t`，成功后才 reload。

Rocky Linux RPM 常见站点目录是 `/etc/nginx/conf.d/*.conf`；自编译 Nginx 可能不同。以 `nginx -V` 和当前主配置中的 `include` 为准。

## 2. 只需要确认这些事实

| 事实 | 放到哪里 | 如何确认 |
|---|---|---|
| 公网域名 | `server_name`、证书签发、外部验证 URL | DNS A/AAAA 与真实域名 |
| 内部 upstream | `proxy_pass http://127.0.0.1:8001` | `deploy.sh` 默认和内部 health |
| 站点文件路径 | 当前 Nginx 的 include 目录 | 查看实际 `nginx.conf` |
| 上传上限 | `client_max_body_size` | 覆盖项目允许的最大图片/视频请求 |
| 证书链 | `ssl_certificate` | 文件存在、有效期正确、包含完整链 |
| 私钥 | `ssl_certificate_key` | 权限最小且与证书匹配 |
| ACME webroot | 80 端口 challenge location 与 Certbot `-w` | 两处必须是同一路径 |

应用默认只监听 `127.0.0.1:8001`。除非架构明确需要跨主机访问，不要改成 `0.0.0.0`。

## 3. 签发或安装证书

### 已有证书

1. 把完整证书链与私钥放到宿主受保护目录，不要放进源码或 release。
2. 私钥只授予 Nginx 所需的最小权限。
3. 验证证书和 RSA 私钥匹配；两条 SHA-256 应相同：

```bash
openssl x509 -noout -modulus -in /path/to/fullchain.pem | openssl sha256
openssl rsa  -noout -modulus -in /path/to/privkey.pem   | openssl sha256
```

ECDSA 私钥应使用证书提供方对应的验证方式，不能套用 `openssl rsa`。

### Certbot webroot

1. 创建一个固定的 ACME webroot。
2. 先安装仅提供 `/.well-known/acme-challenge/` 的 HTTP 站点。
3. 从外部确认 challenge 文件可访问。
4. 使用真实域名、通知邮箱和同一个 webroot 签发：

```bash
sudo install -d -m 0755 /var/www/certbot
sudo certbot certonly --webroot \
  -w /var/www/certbot \
  -d game.example.com \
  -m admin@example.com \
  --agree-tos --no-eff-email
```

证书存在后再启用 HTTPS server 和 HTTP 301 跳转。不要让 Nginx 配置提前引用不存在的证书文件。

## 4. 安装配置的安全顺序

1. `readlink -f` 确认正在编辑的主配置、include 目录和站点文件。
2. 把现有站点文件备份到 root-only 目录并保留时间戳。
3. 从 [`nginx.conf.example`](nginx.conf.example) 或 [`nginx-site.conf.template`](nginx-site.conf.template) 复制所需片段到临时文件。
4. 替换全部 `example.com`、证书路径、webroot 和占位符。
5. 安装站点文件，执行实际 Nginx 二进制的 `-t`。
6. 只有检查成功后才 reload；不要 stop 全局 Nginx。
7. reload 后检查 80/443 listener、内部 health、公网 health 和错误日志。
8. 任一步失败就恢复站点备份，再次 `nginx -t` 后 reload。

## 5. 验证

```bash
# 应用内部链路
curl --fail http://127.0.0.1:8001/api/health

# HTTP 跳转
curl -I http://game.example.com/

# 公网 DNS + TLS + Nginx + upstream
curl --fail --proto '=https' --tlsv1.2 https://game.example.com/api/health

# 证书和 SNI
openssl x509 -in /path/to/fullchain.pem -noout -subject -issuer -dates
openssl s_client -connect game.example.com:443 \
  -servername game.example.com -verify_return_error </dev/null

systemctl status nginx --no-pager
ss -lntp | grep -E ':(80|443|8001)[[:space:]]'
```

内部 health 通过不等于公网完成。还要验证登录、Secure Cookie、赛事流程、上传、OCR、视频 Range、评论/点赞和管理员操作。

## 6. 续期与回滚

Certbot 至少执行一次：

```bash
certbot renew --dry-run
systemctl list-timers --all | grep -i certbot
```

续期 hook 必须先 `nginx -t`，成功后才 reload。非 Certbot 证书需要独立到期告警。

Nginx/证书不属于应用 release 的自动回滚。每次修改前单独备份站点文件，并记录证书序列号、到期时间、`nginx -t` 和 reload 结果。
