# 王者演武堂 — Rocky Linux 部署文档

生产运行目录为 `/opt/yanwutang/current`，源码仓库、共享配置和历史 release 分离。Web 进程监听 `127.0.0.1:8081`，由 Nginx 对外提供 HTTPS。

## 一、服务器基础

```bash
sudo dnf update -y
sudo dnf install -y git curl tar gzip openssl mysql-server
sudo timedatectl set-timezone Asia/Shanghai
sudo systemctl enable --now mysqld
```

安装 Node.js 20 与 PM2：

```bash
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs
sudo npm install -g pm2
pm2 startup systemd
```

执行 `pm2 startup` 输出的命令，使进程能够在系统重启后恢复。

## 二、数据库

数据库只监听本机或受信任内网地址，不向公网开放 3306。账号密码由运维人员生成并保存到共享 `.env`，禁止写入仓库或 shell 历史。

```sql
CREATE DATABASE yanwutang CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'yanwutang'@'localhost' IDENTIFIED BY '<STRONG_DB_PASSWORD>';
GRANT ALL PRIVILEGES ON yanwutang.* TO 'yanwutang'@'localhost';
FLUSH PRIVILEGES;
```

## 三、首次部署

```bash
sudo mkdir -p /opt/yanwutang
sudo chown "$USER:$USER" /opt/yanwutang
git clone https://github.com/YunHe-Rocky/wzywt.git /opt/yanwutang/source
mkdir -p /opt/yanwutang/shared/mysql-bak /opt/yanwutang/releases
```

创建 `/opt/yanwutang/shared/.env`：

```dotenv
DATABASE_URL="mysql://yanwutang:<URL_ENCODED_DB_PASSWORD>@localhost:3306/yanwutang"
SESSION_SECRET="<AT_LEAST_32_RANDOM_CHARACTERS>"
REDIS_URL="redis://127.0.0.1:6379"
```

可用 `openssl rand -base64 48` 生成 `SESSION_SECRET`。`.env` 权限应限制为运行用户可读：

```bash
chmod 600 /opt/yanwutang/shared/.env
cd /opt/yanwutang/source
bash scripts/deploy.sh
```

对于历史上通过 `prisma db push` 创建且没有 migration 记录的数据库，只能在核对备份和 schema 后执行一次：

```bash
ALLOW_MIGRATION_BASELINE=1 bash scripts/deploy.sh
```

新数据库和完成 baseline 后的发布禁止设置该变量。生产 schema 只允许 `prisma migrate deploy`，禁止 `prisma db push`。

## 四、后续发布

```bash
cd /opt/yanwutang/source
git status --short
bash scripts/deploy.sh
```

脚本执行顺序：

1. 拒绝 dirty source tree，拉取 `origin/main`。
2. 从 `origin/main` 创建不可变 release，执行 `npm ci`、Prisma 校验和 production build。
3. 先生成数据库备份，再执行 `prisma migrate deploy`。
4. 原子切换 `/opt/yanwutang/current`，使用 PM2 reload。
5. 请求 `http://127.0.0.1:8081/api/health`；失败时自动回滚到上一 release。

Hero Sync 与代码发布解耦，由 Cron 或管理员手动触发。

## 五、Nginx 与防火墙

将站点配置放到 `/opt/Nginx/nginx.1.30.2/conf.d/sites/`，反向代理到 `http://127.0.0.1:8081`。修改后执行：

```bash
sudo /opt/Nginx/nginx.1.30.2/sbin/nginx -t
sudo /opt/Nginx/nginx.1.30.2/sbin/nginx -s reload
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

不要为公网添加 MySQL 3306 端口规则。

## 六、备份与恢复检查

发布脚本会在 migration 前调用 `scripts/db-backup.mjs`，备份保存在 `/opt/yanwutang/shared/mysql-bak`。手工备份使用同一入口：

```bash
cd /opt/yanwutang/current
node scripts/db-backup.mjs /opt/yanwutang/shared/mysql-bak
```

数据库凭据从 `DATABASE_URL` 解析并通过临时 defaults file 传递，不应出现在命令行参数中。必须定期在隔离数据库验证备份可恢复。

## 七、运行检查

```bash
pm2 status
pm2 logs yanwutang-web --lines 100
pm2 logs yanwutang-cron --lines 100
curl --fail http://127.0.0.1:8081/api/health
readlink -f /opt/yanwutang/current
```

健康接口通过只证明进程、数据库和基础依赖可用；发布后仍需验证登录、赛事创建/加入/分队及管理员操作。
