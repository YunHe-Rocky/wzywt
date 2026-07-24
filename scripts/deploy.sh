#!/bin/bash
# 王者演武堂部署脚本
set -e

START_TIME=$(date +%s)
cd /opt/yanwutang

# ---- 解析 .env ----
DB_URL=$(grep -oP 'DATABASE_URL="\K[^"]+' .env)

# ---- 停服 ----
echo ">>> 停止旧服务..."
pm2 stop yanwutang-web yanwutang-cron 2>/dev/null || true
pm2 delete yanwutang-web yanwutang-cron 2>/dev/null || true
fuser -k 8081/tcp 2>/dev/null || true
sleep 1

# ---- 拉代码 ----
echo ">>> git pull..."
git stash 2>/dev/null || true
git pull origin master

# ---- 备份数据库 ----
BACKUP_DIR="data/mysql-bak"
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/yanwutang-$(date +%F-%H%M).sql"
echo ">>> 备份数据库 → $BACKUP_FILE"

# Node.js 解析 URL（处理特殊字符转义）
export DB_URL
eval $(node -e "
  const u = new URL(process.env.DB_URL.replace('mysql://', 'http://'));
  process.stdout.write('DB_HOST=' + u.hostname + '\n');
  process.stdout.write('DB_USER=' + u.username + '\n');
  process.stdout.write('DB_PASS=' + decodeURIComponent(u.password) + '\n');
  process.stdout.write('DB_NAME=' + u.pathname.replace('/','') + '\n');
")
export MYSQL_PWD="$DB_PASS"

mysqldump -h"$DB_HOST" -u"$DB_USER" \
  --single-transaction "$DB_NAME" > "$BACKUP_FILE" 2>/dev/null \
  && echo "  备份完成 ($(du -h "$BACKUP_FILE" | cut -f1))" \
  || echo "  备份失败，继续部署..."

unset MYSQL_PWD DB_PASS

# 保留最近 10 个备份
ls -t "$BACKUP_DIR"/yanwutang-*.sql 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null || true

# ---- 安装依赖 ----
echo ">>> npm install..."
npm install

# ---- 数据库迁移 ----
echo ">>> prisma migrate deploy..."
if npx prisma migrate deploy 2>&1 | tee /tmp/migrate.log; then
  echo "  迁移完成"
elif grep -q "P3005" /tmp/migrate.log; then
  echo "  首次部署，基线已有表结构..."
  npx prisma migrate resolve --applied 20260623103519_init
  npx prisma migrate resolve --applied 20260623104500_add_constraints
  echo "  重新部署迁移..."
  npx prisma migrate deploy
else
  echo "  迁移失败，检查 /tmp/migrate.log"
  exit 1
fi

echo ">>> prisma generate..."
npx prisma generate

# ---- 数据迁移 ----
echo ">>> 数据脚本..."
npx tsx scripts/migrate-announcements.ts 2>/dev/null || echo "  公告迁移 (skipped)"
npx tsx scripts/migrate-mingge.ts 2>/dev/null || echo "  命格绑定 (skipped)"

# ---- 英雄同步 ----
echo ">>> 同步英雄数据..."
npm run sync-heroes 2>/dev/null && echo "  英雄同步完成" || echo "  ⚠ 英雄同步失败"

# ---- 构建 ----
echo ">>> 清理构建缓存..."
rm -rf .next

echo ">>> npm run build..."
npm run build

# ---- 启动 ----
echo ">>> 启动 PM2..."
pm2 start ecosystem.config.js

# ---- 完成 ----
ELAPSED=$(($(date +%s) - START_TIME))
echo ""
echo "=== 部署完成 (${ELAPSED}s) ==="
pm2 status
pm2 save
