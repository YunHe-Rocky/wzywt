# 王者演武堂 — Rocky Linux 部署文档

## 一、服务器基础

```bash
sudo dnf update -y
sudo dnf install -y git curl wget vim tar gzip openssl unzip
sudo timedatectl set-timezone Asia/Shanghai
sudo mkdir -p /opt/yanwutang
sudo chown $USER:$USER /opt/yanwutang
```

## 二、安装 Node.js 20 + tsx + PM2

```bash
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs
sudo npm i -g tsx pm2
pm2 startup systemd  # 按提示执行输出的 sudo 命令
```

## 三、MySQL 8

```bash
sudo dnf install -y mysql-server
sudo systemctl start mysqld && sudo systemctl enable mysqld
sudo mysql_secure_installation

mysql -u root -p << SQL
CREATE DATABASE yanwutang CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'yanwutang'@'localhost' IDENTIFIED BY '你的密码';
GRANT ALL PRIVILEGES ON yanwutang.* TO 'yanwutang'@'localhost';
FLUSH PRIVILEGES;
SQL
```

## 四、部署项目

```bash
cd /opt
git clone git@github.com:szk5142-beep/yanwutang.git
cd yanwutang
npm install

# 配置 .env
openssl rand -base64 32  # 生成 SESSION_SECRET
cat > .env << 'ENVEOF'
DATABASE_URL="mysql://yanwutang:你的密码@localhost:3306/yanwutang"
SESSION_SECRET="上面生成的密钥"
ENVEOF

# 初始化 + 构建 + 启动
npx prisma db push
npx prisma generate
npm run build
pm2 start ecosystem.config.js
pm2 save
```

## 五、Nginx 反向代理

```bash
sudo dnf install -y nginx
sudo cp /opt/yanwutang/docs/yanwutang.conf /etc/nginx/conf.d/yanwutang.conf
sudo vim /etc/nginx/conf.d/yanwutang.conf  # 改 server_name
sudo nginx -t && sudo systemctl start nginx && sudo systemctl enable nginx
sudo firewall-cmd --add-service=http --permanent && sudo firewall-cmd --reload
```

## 六、SSL（可选）

```bash
sudo dnf install -y certbot python3-certbot-nginx
sudo certbot --nginx -d ywt.yunhe.ink
```

## 七、部署更新

```bash
cd /opt/yanwutang
bash scripts/deploy.sh
```

脚本自动执行：停旧服务 → git pull → npm install → prisma generate + db push → 公告迁移 → 清缓存 → build → pm2 重启。

## 八、PM2 进程

| 进程 | 说明 |
|------|------|
| yanwutang-web | Next.js（端口 8081） |
| yanwutang-cron | 定时任务（3分钟监控 + 每天同步） |

```bash
pm2 status          # 查看状态
pm2 logs            # 查看日志
pm2 restart all     # 重启全部
```

## 九、数据库备份

```bash
sudo tee /opt/backup-db.sh << 'SCRIPT'
#!/bin/bash
mkdir -p /opt/backups/db
mysqldump -u yanwutang -p密码 yanwutang | gzip > "/opt/backups/db/yanwutang_$(date +%Y%m%d_%H%M).sql.gz"
find /opt/backups/db -mtime +7 -delete
SCRIPT
sudo chmod +x /opt/backup-db.sh
(crontab -l 2>/dev/null; echo "0 3 * * * /opt/backup-db.sh") | crontab -
```

## 十、常见问题

### build 报 Permission denied
```bash
rm -rf node_modules && npm install && npm run build
```

### 端口被占用
```bash
fuser -k 8081/tcp
```

### 数据库连接失败
```bash
sudo systemctl status mysqld
cat /opt/yanwutang/.env | grep DATABASE_URL
```
