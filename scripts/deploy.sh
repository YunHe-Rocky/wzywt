#!/usr/bin/env bash
set -Eeuo pipefail

BASE_DIR="${APP_BASE_DIR:-/opt/yanwutang}"
SOURCE_DIR="${APP_SOURCE_DIR:-$BASE_DIR}"
RELEASES_DIR="$BASE_DIR/releases"
SHARED_DIR="$BASE_DIR/shared"
CURRENT_LINK="$BASE_DIR/current"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8081/api/health}"
RELEASE_ID="$(date -u +%Y%m%d%H%M%S)"
RELEASE_DIR="$RELEASES_DIR/$RELEASE_ID"
MIGRATION_LOG="$RELEASE_DIR/.deploy-migrate.log"
START_TIME="$(date +%s)"

log() { printf '[deploy] %s\n' "$*"; }
fail() { printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

[[ -d "$SOURCE_DIR/.git" ]] || fail "source repository not found: $SOURCE_DIR"
[[ -f "$SHARED_DIR/.env" ]] || fail "shared environment file not found: $SHARED_DIR/.env"
[[ -z "$(git -C "$SOURCE_DIR" status --porcelain)" ]] || fail "production source tree is dirty; resolve it manually"

mkdir -p "$RELEASES_DIR" "$SHARED_DIR/mysql-bak"
git -C "$SOURCE_DIR" fetch --prune origin main
mkdir "$RELEASE_DIR"

cleanup_failed_release() {
  if [[ "$RELEASE_DIR" == "$RELEASES_DIR"/20* ]] \
    && [[ ! -L "$CURRENT_LINK" || "$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)" != "$RELEASE_DIR" ]]; then
    rm -rf -- "$RELEASE_DIR"
  fi
}
trap cleanup_failed_release EXIT

log "prepare release $RELEASE_ID from origin/main"
git -C "$SOURCE_DIR" archive --format=tar origin/main | tar -xf - -C "$RELEASE_DIR"
ln -s "$SHARED_DIR/.env" "$RELEASE_DIR/.env"

cd "$RELEASE_DIR"
log "install locked dependencies"
npm ci
npx --no-install prisma generate
npx --no-install prisma validate

log "build before touching the running service"
npm run build

log "create database backup"
node scripts/db-backup.mjs "$SHARED_DIR/mysql-bak"

run_migrations() {
  npx --no-install prisma migrate deploy 2>&1 | tee "$MIGRATION_LOG"
}

log "apply database migrations"
if ! run_migrations; then
  if grep -q 'P3005' "$MIGRATION_LOG" && [[ "${ALLOW_MIGRATION_BASELINE:-0}" == "1" ]]; then
    log "explicit baseline enabled; marking legacy migrations as applied"
    npx --no-install prisma migrate resolve --applied 20260623103519_init
    npx --no-install prisma migrate resolve --applied 20260623104500_add_constraints
    npx --no-install prisma migrate resolve --applied 20260725090000_add_player_identity_and_hero_secondary_lanes
    npx --no-install prisma migrate resolve --applied 20260725140000_mark_temporary_users
    npx --no-install prisma migrate resolve --applied 20260725150000_reconcile_legacy_schema
    run_migrations
  else
    fail "migration failed; automatic baseline is disabled"
  fi
fi

PREVIOUS_TARGET="$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)"
ln -sfn "$RELEASE_DIR" "$CURRENT_LINK"

reload_release() {
  local target="$1"
  APP_DIR="$target" pm2 startOrReload "$target/ecosystem.config.js" --update-env
}

rollback() {
  [[ -n "$PREVIOUS_TARGET" && -d "$PREVIOUS_TARGET" ]] || fail "health check failed and no previous release exists"
  log "health check failed; roll back to $PREVIOUS_TARGET"
  ln -sfn "$PREVIOUS_TARGET" "$CURRENT_LINK"
  reload_release "$CURRENT_LINK"
  fail "release $RELEASE_ID rolled back"
}

log "switch PM2 to the new release"
reload_release "$CURRENT_LINK"

healthy=0
for _ in {1..15}; do
  if curl --fail --silent --show-error --max-time 3 "$HEALTH_URL" >/dev/null; then
    healthy=1
    break
  fi
  sleep 2
done
[[ "$healthy" == "1" ]] || rollback

pm2 save
log "release $RELEASE_ID healthy; completed in $(( $(date +%s) - START_TIME ))s"
log "hero synchronization remains decoupled; cron or an administrator triggers it"
