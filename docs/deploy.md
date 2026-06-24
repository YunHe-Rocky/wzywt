# 王者演武堂 — Rocky Linux 部署文档

> 从零开始，完整部署到 Rocky Linux 9

## 一、服务器基础配置

```bash
# 更新系统
sudo dnf update -y

# 安装基础工具
sudo dnf install -y git curl wget vim tar gzip openssl unzip

# 设置时区
sudo timedatectl set-timezone Asia/Shanghai

# 创建项目目录
sudo mkdir -p /opt/yanwutang
sudo chown $USER:$USER /opt/yanwutang
```

## 二、安装 Node.js 20

```bash
# 添加 NodeSource 仓库
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -

# 安装
sudo dnf install -y nodejs

# 验证
node -v    # v20.x.x
npm -v     # 10.x.x

# 安装 tsx（TypeScript 执行器）
sudo npm i -g tsx
```

## 三、安装 MySQL 8

```bash
# 安装
sudo dnf install -y mysql-server

# 启动并设置开机自启
sudo systemctl start mysqld
sudo systemctl enable mysqld

# 安全初始化
sudo mysql_secure_installation
# 按提示: 设置 root 密码 → 全部 Y

# 创建数据库和用户
mysql -u root -p << SQL
CREATE DATABASE yanwutang CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'yanwutang'@'localhost' IDENTIFIED BY '你的数据库密码';
GRANT ALL PRIVILEGES ON yanwutang.* TO 'yanwutang'@'localhost';
FLUSH PRIVILEGES;
SQL
```

## 四、安装 PM2

```bash
sudo npm i -g pm2

# 开机自启
pm2 startup systemd
# 按提示执行输出的 sudo 命令
```

## 五、部署项目

### 方式一：Git 克隆（推荐）

```bash
cd /opt

# 克隆项目
git clone <你的仓库地址> yanwutang
cd /opt/yanwutang

# 安装依赖
npm install
```

### 方式二：ZIP 上传（Windows → Linux）

**重要：** Windows 压缩的文件传到 Linux 后，`node_modules/.bin/` 下的可执行文件权限会丢失，导致 `npm run build` 报 `Permission denied`。

```bash
# 上传 zip 到服务器
scp 王者演武堂.zip root@你的服务器IP:/opt/

# 解压
cd /opt
unzip 王者演武堂.zip -d yanwutang
cd /opt/yanwutang

# ⚠️ 关键步骤：删除 node_modules 重新安装
# Windows 打包的 node_modules 在 Linux 上权限不对，必须重装
rm -rf node_modules
npm install
```

### 配置环境变量

```bash
# 生成 session 密钥
openssl rand -base64 32

cat > .env << 'ENVEOF'
DATABASE_URL="mysql://yanwutang:你的数据库密码@localhost:3306/yanwutang"
SESSION_SECRET="上面生成的密钥填这里"

# QQ邮箱 SMTP（用于注册验证码和找回密码）
# 登录QQ邮箱 → 设置 → 账户 → 开启SMTP服务 → 获取授权码
EMAIL_HOST=smtp.qq.com
EMAIL_PORT=465
EMAIL_USER=你的QQ号@qq.com
EMAIL_PASS=QQ邮箱SMTP授权码
ENVEOF

# 初始化数据库表结构
npx prisma db push

# 生产构建
npm run build
```

## 六、PM2 启动

```bash
# 启动 Web 服务（端口 8081）
pm2 start node_modules/next/dist/bin/next --name yanwutang -- start -p 8081

# 启动定时任务
pm2 start scripts/cron.ts --name yanwutang-cron --interpreter tsx

# 查看状态
pm2 status

# 查看日志
pm2 logs yanwutang

# 保存进程列表（重启后自动恢复）
pm2 save
```

## 七、Nginx 反向代理

```bash
# 安装 Nginx
sudo dnf install -y nginx

# 复制配置文件
sudo cp /opt/yanwutang/docs/yanwutang.conf /etc/nginx/conf.d/yanwutang.conf

# 编辑域名
sudo vim /etc/nginx/conf.d/yanwutang.conf
# 把 server_name 改成你的域名

# 测试配置
sudo nginx -t

# 启动
sudo systemctl start nginx
sudo systemctl enable nginx
```

## 八、防火墙

```bash
sudo firewall-cmd --add-service=http --permanent
sudo firewall-cmd --add-service=https --permanent
sudo firewall-cmd --reload
```

## 九、SSL 证书 (Let's Encrypt)

```bash
# 安装 certbot
sudo dnf install -y epel-release
sudo dnf install -y certbot python3-certbot-nginx

# 申请证书（替换为你的域名）
sudo certbot --nginx -d your-subdomain.example.com

# 证书自动续期（certbot 安装后自带 systemd timer）
sudo systemctl status certbot-renew.timer
```

## 十、数据库备份

```bash
# 备份脚本
sudo tee /opt/backup-db.sh << 'SCRIPT'
#!/bin/bash
BACKUP_DIR="/opt/backups/db"
mkdir -p "$BACKUP_DIR"
mysqldump -u yanwutang -p你的数据库密码 yanwutang | gzip > "$BACKUP_DIR/yanwutang_$(date +%Y%m%d_%H%M).sql.gz"
find "$BACKUP_DIR" -mtime +7 -delete
echo "Backup done: $(date)"
SCRIPT

sudo chmod +x /opt/backup-db.sh

# 每天凌晨 3 点执行
(crontab -l 2>/dev/null; echo "0 3 * * * /opt/backup-db.sh >> /var/log/db-backup.log 2>&1") | crontab -
```

## 十一、更新部署

```bash
cd /opt/yanwutang
git pull
npm install          # 依赖可能有更新
npx prisma db push   # 数据库迁移
npm run build
pm2 restart all
```

## 十二、常见问题

### `npm run build` 报 Permission denied

```
sh: line 1: /opt/yanwutang/node_modules/.bin/next: Permission denied
```

**原因：** 项目是从 Windows 打包的 zip 上传的，`node_modules/.bin/` 下的文件没有执行权限。

**解决：**
```bash
rm -rf node_modules
npm install
npm run build
```

### 数据库连接失败

```bash
# 检查 MySQL 是否运行
sudo systemctl status mysqld

# 检查 .env 中 DATABASE_URL 是否正确
cat /opt/yanwutang/.env | grep DATABASE_URL

# 测试连接
mysql -u yanwutang -p -e "SELECT 1"
```

### 端口被占用

```bash
# 查看端口占用
sudo ss -tlnp | grep 8081

# 杀掉占用进程
sudo kill -9 <PID>
```

### 邮箱验证码发不出去

```bash
# 检查 SMTP 配置
cat /opt/yanwutang/.env | grep EMAIL

# 确认QQ邮箱已开启SMTP服务且授权码正确
# 确认防火墙未拦截465端口
```

## 十三、常用运维命令

```bash
# 服务状态
pm2 status
sudo systemctl status nginx mysqld

# 查看日志
pm2 logs yanwutang          # Web 日志
pm2 logs yanwutang-cron     # 定时任务日志
sudo tail -f /var/log/nginx/yanwutang-error.log  # Nginx 错误日志

# 重启服务
pm2 restart yanwutang       # 重启 Web
pm2 restart all             # 重启所有
sudo systemctl restart nginx

# 手动同步英雄数据
cd /opt/yanwutang && npm run sync-heroes

# 查看数据库
mysql -u yanwutang -p yanwutang
```

## 部署完毕检查清单

| 检查项 | 命令 |
|--------|------|
| Node 版本 | `node -v` → v20.x |
| MySQL 运行 | `sudo systemctl status mysqld` → active |
| 数据库存在 | `mysql -u yanwutang -p -e "USE yanwutang; SHOW TABLES;"` |
| Web 运行 | `curl http://localhost:8081/login` → 200 |
| PM2 进程 | `pm2 status` → yanwutang online |
| Nginx 运行 | `sudo systemctl status nginx` → active |
| 域名访问 | `curl http://你的域名/login` → 200 |
| HTTPS | `curl https://你的域名/login` → 200 (配置 SSL 后) |
| 邮箱功能 | 注册页点击"发送验证码"能收到邮件 |
