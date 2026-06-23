# 王者演武堂 — 部署文档

> Rocky Linux · MySQL 8 · Nginx · Node.js 20 · PM2

## 环境

```bash
# Node.js 20
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs git

# PM2
sudo npm i -g pm2

# Nginx (通常已安装)
sudo dnf install -y nginx
```

## 部署

```bash
cd /opt
git clone <repo-url> yanwutang
cd yanwutang
npm install
cp .env.example .env
vim .env  # 填 DATABASE_URL 和 SESSION_SECRET
npx prisma db push
npm run build
```

`.env`:
```env
DATABASE_URL="mysql://user:pass@localhost:3306/yanwutang"
SESSION_SECRET="$(openssl rand -base64 32)"
```

## 启动

```bash
# Web 服务 (端口 8081)
pm2 start node_modules/.bin/next --name yanwutang -- start -p 8081

# 定时任务 (英雄同步 + 截止检查)
pm2 start scripts/cron.ts --name yanwutang-cron --interpreter tsx

pm2 save
pm2 startup
```

## Nginx 反代

```bash
sudo cp docs/yanwutang.conf /etc/nginx/conf.d/
sudo vim /etc/nginx/conf.d/yanwutang.conf  # 改 server_name
sudo nginx -t && sudo systemctl reload nginx
```

配置已包含 SSE 长连接支持 (`proxy_buffering off` + 86400s 超时)。

## SSL

```bash
sudo dnf install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 防火墙

```bash
sudo firewall-cmd --add-service=http --add-service=https --permanent
sudo firewall-cmd --reload
```

## 更新

```bash
cd /opt/yanwutang
git pull && npm install && npm run build
pm2 restart all
```

## 服务清单

| 服务 | 端口 | 守护 |
|------|:----:|------|
| Nginx | 80/443 | systemd |
| Next.js | 8081 | PM2 |
| Cron | - | PM2 |
| MySQL | 3306 | systemd |
