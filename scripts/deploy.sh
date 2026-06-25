#!/bin/bash
set -e

cd /opt/yanwutang

echo ">>> git pull..."
git pull origin master

echo ">>> npm install..."
npm install

echo ">>> prisma db push..."
npx prisma db push

echo ">>> migrate announcements..."
npx tsx scripts/migrate-announcements.ts

echo ">>> npm run build..."
npm run build

echo ">>> kill old port..."
fuser -k 8081/tcp 2>/dev/null || true

echo ">>> restart pm2..."
pm2 delete ecosystem.config.js 2>/dev/null
pm2 start ecosystem.config.js

echo ""
echo "=== 部署完成 ==="
pm2 status
pm2 save
