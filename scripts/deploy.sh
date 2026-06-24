#!/bin/bash
set -e

cd /opt/yanwutang

echo ">>> git pull..."
git pull origin master

echo ">>> npm install..."
npm install

echo ">>> prisma db push..."
npx prisma db push

echo ">>> npm run build..."
npm run build

echo ">>> restart pm2..."
pm2 restart all

echo ""
echo "=== 部署完成 ==="
pm2 status
