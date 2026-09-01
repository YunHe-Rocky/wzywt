#!/usr/bin/env bash
set -Eeuo pipefail
umask 027

INVOCATION_DIR="$(pwd -P)"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
SOURCE_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
[[ "$INVOCATION_DIR" == "$SOURCE_DIR" ]] || {
  printf '[stop] ERROR: run from the script project root: pwd=%s source=%s\n' "$INVOCATION_DIR" "$SOURCE_DIR" >&2
  exit 1
}

ENV_FILE=""
if [[ "${1:-}" == "--env-file" && -n "${2:-}" && $# == 2 ]]; then
  ENV_FILE="$2"
elif (($#)); then
  printf 'Usage: bash scripts/stop.sh [--env-file PATH]\n' >&2
  exit 2
elif [[ "$(basename -- "$SOURCE_DIR")" == "source" && -f "$(dirname -- "$SOURCE_DIR")/shared/.env" ]]; then
  ENV_FILE="$(dirname -- "$SOURCE_DIR")/shared/.env"
elif [[ -f "$SOURCE_DIR/.env" ]]; then
  ENV_FILE="$SOURCE_DIR/.env"
else
  printf '[stop] ERROR: project environment file not found; pass --env-file PATH\n' >&2
  exit 1
fi

NODE_BIN="${DEPLOY_NODE_BIN:-$(command -v node 2>/dev/null || true)}"
REALPATH_BIN="${DEPLOY_REALPATH_BIN:-$(command -v realpath 2>/dev/null || true)}"
[[ -n "$NODE_BIN" && -x "$NODE_BIN" ]] || { printf '[stop] ERROR: node not found\n' >&2; exit 1; }
[[ -n "$REALPATH_BIN" && -x "$REALPATH_BIN" ]] || { printf '[stop] ERROR: realpath not found\n' >&2; exit 1; }
ENV_FILE="$($REALPATH_BIN -e -- "$ENV_FILE")"

# The shared preflight is the ownership and host-state gate. stop.sh never kills a port.
bash "$SCRIPT_DIR/deploy.sh" --check --env-file "$ENV_FILE"

CONFIG_FILE="$(mktemp)"
STATE_FILE="$(mktemp)"
trap 'rm -f -- "$CONFIG_FILE" "$STATE_FILE"' EXIT
"$NODE_BIN" "$SCRIPT_DIR/deploy-env.mjs" "$ENV_FILE" >"$CONFIG_FILE"
while IFS= read -r -d '' key; do
  IFS= read -r -d '' value || { printf '[stop] ERROR: incomplete env record\n' >&2; exit 1; }
  if [[ ! -v "$key" ]]; then printf -v "$key" '%s' "$value"; export "$key"; fi
done <"$CONFIG_FILE"

PACKAGE_NAME="$($NODE_BIN -e '
const value = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).name;
if (typeof value !== "string" || !value) process.exit(1);
const slug = value.replace(/^@/, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
if (!slug) process.exit(1);
process.stdout.write(slug);
' "$SOURCE_DIR/package.json")" || { printf '[stop] ERROR: invalid package name\n' >&2; exit 1; }
PROJECT_NAME="${DEPLOY_PROJECT_NAME:-$PACKAGE_NAME}"
WEB_NAME="${DEPLOY_PM2_WEB_NAME:-$PROJECT_NAME-web}"
CRON_NAME="${DEPLOY_PM2_CRON_NAME:-$PROJECT_NAME-cron}"
for name in "$PROJECT_NAME" "$WEB_NAME" "$CRON_NAME"; do
  [[ "$name" =~ ^[A-Za-z0-9._-]+$ ]] || { printf '[stop] ERROR: invalid project/PM2 name: %s\n' "$name" >&2; exit 1; }
done

if [[ -n "${DEPLOY_BASE_DIR:-}" ]]; then
  BASE_DIR="$($REALPATH_BIN -m -- "$DEPLOY_BASE_DIR")"
elif [[ "$(basename -- "$SOURCE_DIR")" == "source" ]]; then
  BASE_DIR="$(dirname -- "$SOURCE_DIR")"
else
  BASE_DIR="$($REALPATH_BIN -m -- "${SOURCE_DIR}-runtime")"
fi
CURRENT_LINK="$BASE_DIR/current"
[[ -L "$CURRENT_LINK" ]] || { printf '[stop] ERROR: current release link is missing\n' >&2; exit 1; }
CURRENT_TARGET="$(readlink -f -- "$CURRENT_LINK")"

NPM_BIN="${DEPLOY_NPM_BIN:-$(command -v npm 2>/dev/null || true)}"
PM2_BIN="${DEPLOY_PM2_BIN:-$(command -v pm2 2>/dev/null || true)}"
if [[ -z "$PM2_BIN" && -n "$NPM_BIN" ]]; then
  NPM_PREFIX="$($NPM_BIN prefix -g 2>/dev/null || true)"
  for candidate in "$NPM_PREFIX/bin/pm2" "$NPM_PREFIX/lib/node_modules/pm2/bin/pm2" /usr/local/bin/pm2 /usr/bin/pm2; do
    if [[ -x "$candidate" ]]; then PM2_BIN="$candidate"; break; fi
  done
fi
[[ -n "$PM2_BIN" && -x "$PM2_BIN" ]] || { printf '[stop] ERROR: PM2 not found\n' >&2; exit 1; }
PM2_HOME="${DEPLOY_PM2_HOME:-${PM2_HOME:-${HOME:-}/.pm2}}"
[[ "$PM2_HOME" == /* && "$PM2_HOME" != "/" ]] || { printf '[stop] ERROR: invalid PM2 home\n' >&2; exit 1; }
export PM2_HOME

"$PM2_BIN" jlist >"$STATE_FILE"
"$NODE_BIN" "$SCRIPT_DIR/verify-deploy-state.mjs" pm2-before \
  "$BASE_DIR" "$CURRENT_TARGET" "$WEB_NAME" "$CRON_NAME" <"$STATE_FILE"

printf '[stop] stopping exact project apps %s and %s\n' "$WEB_NAME" "$CRON_NAME"
"$PM2_BIN" stop "$WEB_NAME" "$CRON_NAME"
"$PM2_BIN" jlist >"$STATE_FILE"
"$NODE_BIN" "$SCRIPT_DIR/verify-deploy-state.mjs" pm2-stopped \
  "$CURRENT_TARGET" "$WEB_NAME" "$CRON_NAME" <"$STATE_FILE"
"$PM2_BIN" save
printf '[stop] project apps are stopped; no unrelated process or port was touched\n'
