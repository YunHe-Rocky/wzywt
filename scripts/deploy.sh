#!/bin/bash
# 王者演武堂部署脚本 — 带数据库备份保护
set -e

cd /opt/yanwutang

echo ">>> stop old services..."
pm2 stop all 2>/dev/null || true
pm2 delete all 2>/dev/null || true
fuser -k 8081/tcp 2>/dev/null || true
sleep 1

echo ">>> git pull..."
git stash 2>/dev/null || true
git pull origin master

# ---- 备份数据库 ----
BACKUP_DIR="data/mysql-bak"
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/yanwutang-$(date +%F).sql"
echo ">>> 备份数据库到 $BACKUP_FILE ..."
# 从 .env 提取数据库连接信息
DB_URL=$(grep DATABASE_URL .env | cut -d'"' -f2)
DB_HOST=$(echo "$DB_URL" | sed -n 's/.*@\([^:]*\).*/\1/p')
DB_USER=$(echo "$DB_URL" | sed -n 's/.*:\/\/\([^:]*\).*/\1/p')
DB_PASS_ENC=$(echo "$DB_URL" | sed -n 's/.*:\/\/[^:]*:\([^@]*\).*/\1/p')
DB_PASS=$(echo "$DB_PASS_ENC" | sed 's/%40/@/g; s/%21/!/g; s/%23/#/g; s/%24/$/g; s/%25/%/g; s/%26/\&/g; s/%2A/*/g; s/%2F/\//g; s/%3A/:/g')
DB_NAME=$(echo "$DB_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')
mysqldump -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASS" --single-transaction "$DB_NAME" > "$BACKUP_FILE" 2>/dev/null && echo "  备份完成 ($(du -h "$BACKUP_FILE" | cut -f1))" || echo "  备份失败，继续部署..."

# ---- 保留最近 10 个备份 ----
ls -t "$BACKUP_DIR"/yanwutang-*.sql 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null || true

echo ">>> npm install..."
npm install

echo ">>> prisma generate..."
npx prisma generate

echo ">>> prisma db push..."
npx prisma db push --skip-generate

echo ">>> migrate announcements..."
npx tsx scripts/migrate-announcements.ts 2>/dev/null || echo "  (skipped)"

echo ">>> bind mingge relationships..."
npx tsx scripts/migrate-mingge.ts 2>/dev/null || echo "  (skipped)"

echo ">>> sync heroes data..."
npx tsx -e "import('src/lib/heroes/sync').then(m=>m.syncHeroes().then(r=>console.log('synced:',r.inserted,'new,',r.updated,'updated')).catch(e=>console.error(e)))" 2>/dev/null || echo "  (skipped)"

echo ">>> clean build cache..."
rm -rf .next

echo ">>> npm run build..."
npm run build

echo ">>> start pm2..."
pm2 start ecosystem.config.js

echo ""
echo "=== 部署完成 ==="
pm2 status
pm2 save
