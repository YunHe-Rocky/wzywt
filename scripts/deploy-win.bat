<# :
@echo off
cd /d "%~dp0\.."
powershell -ExecutionPolicy Bypass -Command "Invoke-Expression (Get-Content -Raw '%~f0')"
pause
exit /b
#>

$ErrorActionPreference = "Stop"
$Port = 8001
$ProjectDir = $PSScriptRoot

function log($m) { Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $m" -ForegroundColor Cyan }

Set-Location $ProjectDir

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  王者演武堂 Windows 部署" -ForegroundColor Green
Write-Host "============================================"
Write-Host ""
Write-Host "模式: npm run dev (开发)" -ForegroundColor Yellow
Write-Host ""

# ========================================
# 1. 停止服务
# ========================================
log "正在停止所有服务..."

netstat -ano | Select-String "LISTENING" | Select-String ":$Port\b" | ForEach-Object {
  $p = ($_ -split '\s+')[-1]
  if ($p -ne "0") {
    log "  终止端口 $Port (PID $p)"
    Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
  }
}

Get-Process -Name "node" -ErrorAction SilentlyContinue | ForEach-Object {
  try {
    $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine
    if ($cmd -match "next|tsx|cron\.ts") {
      log "  终止进程 (PID $($_.Id))"
      Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
  } catch {}
}

Start-Sleep -Seconds 2
log "服务已停止"
Write-Host ""

# ========================================
# 2. 部署
# ========================================
log "git pull..."
git stash 2>$null
git pull origin master
if ($LASTEXITCODE -ne 0) { Write-Host "git pull 失败" -ForegroundColor Red; pause; exit 1 }

log "npm install..."
npm install 2>&1 | Select-Object -Last 2

log "prisma generate + db push..."
npx prisma generate 2>&1 | Select-Object -Last 1
npx prisma db push 2>&1 | Select-Object -Last 2

log "数据迁移..."
npx tsx scripts/migrate-announcements.ts 2>$null
npx tsx scripts/migrate-mingge.ts 2>$null

log "英雄同步..."
npx tsx -e "import('src/lib/heroes/sync').then(m=>m.syncHeroes().then(r=>console.log('synced:',r.inserted,'new,',r.updated,'updated')).catch(e=>console.error(e)))" 2>$null

log "清理构建缓存 + build..."
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "构建失败" -ForegroundColor Red; pause; exit 1 }

# ========================================
# 3. 启动服务
# ========================================
log "启动服务..."
Start-Process -FilePath "cmd" -ArgumentList "/c npm run dev:all" -WindowStyle Normal

Start-Sleep -Seconds 3
log "服务已启动: http://localhost:$Port"

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  部署完成" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
