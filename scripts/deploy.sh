#!/bin/bash
# 王者演武堂部署脚本 — 每步有容错，不因清理失败而中断
set -e

cd /opt/yanwutang

echo ">>> stop old services..."
pm2 stop all 2>/dev/null || true
pm2 delete all 2>/dev/null || true
fuser -k 8081/tcp 2>/dev/null || true
sleep 1

echo ">>> setup SSL (one-time)..."
bash scripts/setup-ssl.sh 2>/dev/null || echo "  (SSL setup skipped)"

echo ">>> git pull..."
git stash 2>/dev/null || true
git pull origin master

echo ">>> npm install..."
npm install

echo ">>> prisma generate..."
npx prisma generate

echo ">>> prisma db push..."
npx prisma db push

echo ">>> migrate announcements..."
npx tsx scripts/migrate-announcements.ts 2>/dev/null || echo "  (no legacy files to migrate)"

echo ">>> bind mingge relationships..."
npx tsx scripts/migrate-mingge.ts 2>/dev/null || echo "  (heroes not yet synced)"

echo ">>> sync heroes data..."
npx tsx -e "import('src/lib/heroes/sync').then(m=>m.syncHeroes().then(r=>console.log('synced:',r.inserted,'new,',r.updated,'updated')).catch(e=>console.error(e)))" 2>/dev/null || echo "  (hero sync skipped)"

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
