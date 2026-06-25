#!/bin/bash
# 王者演武堂部署脚本 — 每步有容错，不因清理失败而中断
set -e

cd /opt/yanwutang

echo ">>> stop old services..."
pm2 stop all 2>/dev/null || true
pm2 delete all 2>/dev/null || true
fuser -k 8081/tcp 2>/dev/null || true
sleep 1

echo ">>> git pull..."
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
