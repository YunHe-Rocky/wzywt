#!/usr/bin/env bash
set -Eeuo pipefail
umask 027

INVOCATION_DIR="$(pwd -P)"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
SCRIPT_SOURCE_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
CHECK_ONLY=0
CLI_ENV_FILE=""

TEMP_FILES=()
RELEASE_DIR=""
RELEASES_DIR=""
CURRENT_LINK=""
MIGRATION_LOG=""
DEPLOY_LOG_DIR=""
DEPLOY_SUCCEEDED=0

log() { printf '[deploy] %s\n' "$*"; }
fail() { printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

check_source_clean() {
  local stage="$1" status_file summary_file entry
  local total shown=0 has_untracked=0 has_script_mode_changes=0
  local -a dirty_entries=()

  new_temp_file status_file
  if ! "$GIT_BIN" -C "$SOURCE_DIR" -c core.quotePath=true status --porcelain=v1 --untracked-files=all >"$status_file"; then
    fail "could not inspect production source status during $stage"
  fi
  while IFS= read -r entry || [[ -n "$entry" ]]; do
    dirty_entries+=("$entry")
    [[ "$entry" == "?? "* ]] && has_untracked=1
  done <"$status_file"
  total="${#dirty_entries[@]}"
  ((total == 0)) && return 0

  new_temp_file summary_file
  if "$GIT_BIN" -C "$SOURCE_DIR" diff --summary -- scripts >"$summary_file" 2>/dev/null; then
    while IFS= read -r entry || [[ -n "$entry" ]]; do
      if [[ "$entry" == *"mode change"* && "$entry" == *"scripts/"* ]]; then
        has_script_mode_changes=1
        break
      fi
    done <"$summary_file"
  fi

  printf '[deploy] ERROR: production source tree is dirty during %s (%s entries):\n' "$stage" "$total" >&2
  for entry in "${dirty_entries[@]}"; do
    ((shown >= 20)) && break
    printf '[deploy] ERROR:   %s\n' "$entry" >&2
    ((shown += 1))
  done
  if ((shown < total)); then
    printf '[deploy] ERROR:   ... %s more entries; run: git status --short\n' "$((total - shown))" >&2
  fi
  if ((has_script_mode_changes)); then
    printf '[deploy] ERROR: tracked script mode changes detected; verify with: git diff --summary -- scripts\n' >&2
    printf '[deploy] ERROR: if they came only from chmod -R, restore tracked top-level scripts with: find scripts -maxdepth 1 -type f -exec chmod 0644 {} +\n' >&2
  fi
  if ((has_untracked)); then
    printf '[deploy] ERROR: untracked paths detected; move deployment archives outside the source root or add only an intentional narrow ignore rule\n' >&2
  fi
  printf '[deploy] ERROR: review content with: git diff -- ; review staged content with: git diff --cached --\n' >&2
  fail "production source tree must be clean; no stash, reset, checkout, or deletion was performed"
}

usage() {
  cat <<'USAGE'
Usage: bash scripts/deploy.sh [--check] [--env-file PATH]

  --check          Resolve and validate project paths, commands, PM2 ownership,
                   and configured system services without deploying a release.
  --env-file PATH  Use this project environment file instead of auto-discovery.
USAGE
}

path_within() {
  local child="$1" parent="$2"
  [[ "$child" == "$parent" || "$child" == "$parent"/* ]]
}

cleanup_on_exit() {
  local exit_code=$?
  local file current_target=""
  for file in "${TEMP_FILES[@]:-}"; do
    [[ -n "$file" ]] && rm -f -- "$file" 2>/dev/null || true
  done

  if [[ "$DEPLOY_SUCCEEDED" != "1" && -n "$RELEASE_DIR" && -d "$RELEASE_DIR" && -n "$RELEASES_DIR" ]] \
    && path_within "$RELEASE_DIR" "$RELEASES_DIR"; then
    if [[ -n "$MIGRATION_LOG" && -f "$MIGRATION_LOG" && -n "$DEPLOY_LOG_DIR" && -d "$DEPLOY_LOG_DIR" ]]; then
      cp -- "$MIGRATION_LOG" "$DEPLOY_LOG_DIR/$(basename "$RELEASE_DIR")-migrate.log" 2>/dev/null || true
    fi
    if [[ -n "$CURRENT_LINK" && -L "$CURRENT_LINK" ]]; then
      current_target="$(readlink -f -- "$CURRENT_LINK" 2>/dev/null || true)"
    fi
    if [[ "$current_target" != "$RELEASE_DIR" ]]; then
      rm -rf -- "$RELEASE_DIR"
    fi
  fi
  return "$exit_code"
}
trap cleanup_on_exit EXIT

while (($#)); do
  case "$1" in
    --check)
      CHECK_ONLY=1
      shift
      ;;
    --env-file)
      (($# >= 2)) || fail "--env-file requires a path"
      CLI_ENV_FILE="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
done

resolve_command() {
  local label="$1" explicit="$2"
  shift 2
  local candidate resolved=""

  if [[ -n "$explicit" ]]; then
    if [[ "$explicit" == */* ]]; then
      [[ -x "$explicit" ]] || fail "$label is not executable: $explicit"
      resolved="$explicit"
    else
      resolved="$(command -v -- "$explicit" 2>/dev/null || true)"
      [[ -n "$resolved" && -x "$resolved" ]] || fail "$label command was not found: $explicit"
    fi
  else
    resolved="$(command -v -- "$label" 2>/dev/null || true)"
    if [[ -z "$resolved" || ! -x "$resolved" ]]; then
      for candidate in "$@"; do
        if [[ -n "$candidate" && -x "$candidate" ]]; then
          resolved="$candidate"
          break
        fi
      done
    fi
  fi

  [[ -n "$resolved" && -x "$resolved" ]] || fail "required command not found: $label"
  printf '%s\n' "$resolved"
}

resolve_optional_command() {
  local label="$1" explicit="$2"
  shift 2
  local candidate resolved=""
  if [[ -n "$explicit" ]]; then
    resolve_command "$label" "$explicit" "$@"
    return
  fi
  resolved="$(command -v -- "$label" 2>/dev/null || true)"
  if [[ -z "$resolved" || ! -x "$resolved" ]]; then
    for candidate in "$@"; do
      if [[ -n "$candidate" && -x "$candidate" ]]; then resolved="$candidate"; break; fi
    done
  fi
  printf '%s\n' "${resolved:--}"
}

resolve_pm2() {
  local explicit="$1" npm_bin="$2" npm_prefix="" candidate="" resolved=""
  if [[ -n "$explicit" ]]; then
    resolve_command "pm2" "$explicit"
    return
  fi
  resolved="$(command -v pm2 2>/dev/null || true)"
  if [[ -n "$resolved" && -x "$resolved" ]]; then
    printf '%s\n' "$resolved"
    return
  fi
  npm_prefix="$($npm_bin prefix -g 2>/dev/null || true)"
  for candidate in \
    "$npm_prefix/bin/pm2" \
    "$npm_prefix/lib/node_modules/pm2/bin/pm2" \
    "/usr/local/bin/pm2" \
    "/usr/bin/pm2"; do
    if [[ -n "$candidate" && -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return
    fi
  done
  fail "PM2 was not found in DEPLOY_PM2_BIN, PATH, the npm global prefix, or standard binary paths"
}

new_temp_file() {
  local variable_name="$1" file
  file="$($MKTEMP_BIN)" || fail "failed to create a temporary file"
  TEMP_FILES+=("$file")
  printf -v "$variable_name" '%s' "$file"
}

NODE_BIN="$(resolve_command node "${DEPLOY_NODE_BIN:-}" /usr/local/bin/node /usr/bin/node)"
MKTEMP_BIN="$(resolve_command mktemp "${DEPLOY_MKTEMP_BIN:-}" /usr/bin/mktemp)"
REALPATH_BIN="$(resolve_command realpath "${DEPLOY_REALPATH_BIN:-}" /usr/bin/realpath)"

SCRIPT_SOURCE_DIR="$($REALPATH_BIN -e -- "$SCRIPT_SOURCE_DIR")"
INVOCATION_DIR="$($REALPATH_BIN -e -- "$INVOCATION_DIR")"
[[ "$INVOCATION_DIR" == "$SCRIPT_SOURCE_DIR" ]] \
  || fail "run deployment from its project root: pwd=$INVOCATION_DIR script-source=$SCRIPT_SOURCE_DIR"
BOOTSTRAP_SOURCE_DIR="$SCRIPT_SOURCE_DIR"

BOOTSTRAP_BASE_DIR="${DEPLOY_BASE_DIR:-}"
if [[ -z "$BOOTSTRAP_BASE_DIR" && "$(basename -- "$BOOTSTRAP_SOURCE_DIR")" == "source" ]]; then
  BOOTSTRAP_BASE_DIR="$(dirname -- "$BOOTSTRAP_SOURCE_DIR")"
fi

ENV_FILE=""
if [[ -n "$CLI_ENV_FILE" ]]; then
  ENV_FILE="$CLI_ENV_FILE"
elif [[ -n "${DEPLOY_ENV_FILE:-}" ]]; then
  ENV_FILE="$DEPLOY_ENV_FILE"
else
  env_candidates=()
  [[ -n "$BOOTSTRAP_BASE_DIR" ]] && env_candidates+=("$BOOTSTRAP_BASE_DIR/shared/.env")
  if [[ "$(basename -- "$BOOTSTRAP_SOURCE_DIR")" == "source" ]]; then
    env_candidates+=("$(dirname -- "$BOOTSTRAP_SOURCE_DIR")/shared/.env")
  fi
  env_candidates+=("$BOOTSTRAP_SOURCE_DIR/.env")
  for candidate in "${env_candidates[@]}"; do
    if [[ -f "$candidate" ]]; then
      ENV_FILE="$candidate"
      break
    fi
  done
fi
[[ -n "$ENV_FILE" && -f "$ENV_FILE" ]] || fail "project environment file not found; pass --env-file PATH"
ENV_FILE="$($REALPATH_BIN -e -- "$ENV_FILE")"

CONFIG_FILE=""
new_temp_file CONFIG_FILE
if ! "$NODE_BIN" "$SCRIPT_DIR/deploy-env.mjs" "$ENV_FILE" >"$CONFIG_FILE"; then
  fail "could not parse deployment settings from $ENV_FILE"
fi
while IFS= read -r -d '' key; do
  IFS= read -r -d '' value || fail "deployment environment parser returned an incomplete record"
  if [[ ! -v "$key" ]]; then
    printf -v "$key" '%s' "$value"
    export "$key"
  fi
done <"$CONFIG_FILE"

SOURCE_DIR="$SCRIPT_SOURCE_DIR"
if [[ -n "${DEPLOY_SOURCE_DIR:-}" ]]; then
  [[ -d "$DEPLOY_SOURCE_DIR" ]] || fail "DEPLOY_SOURCE_DIR not found: $DEPLOY_SOURCE_DIR"
  CONFIGURED_SOURCE_DIR="$($REALPATH_BIN -e -- "$DEPLOY_SOURCE_DIR")"
  [[ "$CONFIGURED_SOURCE_DIR" == "$SOURCE_DIR" ]] \
    || fail "DEPLOY_SOURCE_DIR does not match the script project root: $CONFIGURED_SOURCE_DIR"
fi
[[ -d "$SOURCE_DIR/.git" ]] || fail "source repository not found: $SOURCE_DIR"
[[ -f "$SOURCE_DIR/package.json" ]] || fail "package.json not found in source repository"

if [[ -n "${DEPLOY_BASE_DIR:-}" ]]; then
  BASE_DIR="$DEPLOY_BASE_DIR"
elif [[ "$(basename -- "$SOURCE_DIR")" == "source" ]]; then
  BASE_DIR="$(dirname -- "$SOURCE_DIR")"
else
  BASE_DIR="${SOURCE_DIR}-runtime"
fi
BASE_DIR="$($REALPATH_BIN -m -- "$BASE_DIR")"
[[ "$BASE_DIR" == /* && "$BASE_DIR" != "/" ]] || fail "DEPLOY_BASE_DIR must be an absolute non-root path"
[[ "$SOURCE_DIR" != "$BASE_DIR" ]] || fail "source repository and deployment base must be separate directories"

RELEASES_DIR="$BASE_DIR/releases"
SHARED_DIR="$BASE_DIR/shared"
CURRENT_LINK="$BASE_DIR/current"
BACKUP_DIR="$SHARED_DIR/mysql-bak"
DEPLOY_LOG_DIR="$SHARED_DIR/deploy-logs"

MEDIA_STORAGE_DIR="${MEDIA_STORAGE_DIR:-$SHARED_DIR/media}"
AVATAR_DIR="${AVATAR_DIR:-$MEDIA_STORAGE_DIR/avatars}"
MEDIA_STORAGE_DIR="$($REALPATH_BIN -m -- "$MEDIA_STORAGE_DIR")"
AVATAR_DIR="$($REALPATH_BIN -m -- "$AVATAR_DIR")"
path_within "$MEDIA_STORAGE_DIR" "$SHARED_DIR" || fail "MEDIA_STORAGE_DIR must stay inside $SHARED_DIR"
path_within "$AVATAR_DIR" "$MEDIA_STORAGE_DIR" || fail "AVATAR_DIR must stay inside MEDIA_STORAGE_DIR"
export MEDIA_STORAGE_DIR AVATAR_DIR

PACKAGE_NAME="$($NODE_BIN -e '
const fs = require("node:fs");
const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8")).name;
if (typeof value !== "string" || !value) process.exit(1);
process.stdout.write(value);
' "$SOURCE_DIR/package.json")" || fail "package.json has no valid package name"
DEFAULT_PROJECT_NAME="$($NODE_BIN -e '
const value = process.argv[1].replace(/^@/, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
if (!value) process.exit(1);
process.stdout.write(value);
' "$PACKAGE_NAME")" || fail "package.json name cannot form a safe deployment identity"
PROJECT_NAME="${DEPLOY_PROJECT_NAME:-$DEFAULT_PROJECT_NAME}"
[[ "$PROJECT_NAME" =~ ^[A-Za-z0-9._-]+$ ]] || fail "DEPLOY_PROJECT_NAME contains unsupported characters"
DEPLOY_PROJECT_NAME="$PROJECT_NAME"
DEPLOY_PACKAGE_NAME="$PACKAGE_NAME"
DEPLOY_INVOCATION_DIR="$INVOCATION_DIR"
DEPLOY_RESOLVED_SOURCE_DIR="$SOURCE_DIR"
DEPLOY_RESOLVED_BASE_DIR="$BASE_DIR"
export DEPLOY_PROJECT_NAME DEPLOY_PACKAGE_NAME DEPLOY_INVOCATION_DIR DEPLOY_RESOLVED_SOURCE_DIR DEPLOY_RESOLVED_BASE_DIR

ID_BIN="$(resolve_command id "${DEPLOY_ID_BIN:-}" /usr/bin/id /bin/id)"
ACTUAL_RUN_USER="$($ID_BIN -un)" || fail "could not determine the current operating-system user"
if ! ACTUAL_RUN_GROUP="$($ID_BIN -gn 2>/dev/null)"; then
  ACTUAL_RUN_GROUP="$($ID_BIN -g)" || fail "could not determine the current operating-system group"
fi
EXPECTED_RUN_USER="${DEPLOY_RUN_USER:-$ACTUAL_RUN_USER}"
EXPECTED_RUN_GROUP="${DEPLOY_RUN_GROUP:-$ACTUAL_RUN_GROUP}"
for identity in "$EXPECTED_RUN_USER" "$EXPECTED_RUN_GROUP"; do
  [[ "$identity" =~ ^[A-Za-z0-9._-]+$ ]] || fail "deployment user/group contains unsupported characters: $identity"
done
[[ "$ACTUAL_RUN_USER" == "$EXPECTED_RUN_USER" ]] \
  || fail "deployment must run as user $EXPECTED_RUN_USER, current user is $ACTUAL_RUN_USER"
[[ "$ACTUAL_RUN_GROUP" == "$EXPECTED_RUN_GROUP" ]] \
  || fail "deployment must run with primary group $EXPECTED_RUN_GROUP, current group is $ACTUAL_RUN_GROUP"
DEPLOY_ACTUAL_USER="$ACTUAL_RUN_USER"
DEPLOY_ACTUAL_GROUP="$ACTUAL_RUN_GROUP"
export DEPLOY_ACTUAL_USER DEPLOY_ACTUAL_GROUP

if [[ -n "${DEPLOY_PM2_HOME:-}" ]]; then
  PM2_HOME="$DEPLOY_PM2_HOME"
elif [[ -n "${PM2_HOME:-}" ]]; then
  PM2_HOME="$PM2_HOME"
elif [[ -n "${HOME:-}" ]]; then
  PM2_HOME="$HOME/.pm2"
else
  fail "DEPLOY_PM2_HOME is required when HOME/PM2_HOME are unavailable"
fi
[[ "$PM2_HOME" == /* && "$PM2_HOME" != "/" ]] || fail "DEPLOY_PM2_HOME must resolve to an absolute non-root path"
export PM2_HOME

GIT_BIN="$(resolve_command git "${DEPLOY_GIT_BIN:-}" /usr/bin/git /usr/local/bin/git)"
CURRENT_BRANCH="$($GIT_BIN -C "$SOURCE_DIR" branch --show-current 2>/dev/null || true)"
UPSTREAM_REMOTE=""
UPSTREAM_BRANCH=""
if [[ -n "$CURRENT_BRANCH" ]]; then
  UPSTREAM_REMOTE="$($GIT_BIN -C "$SOURCE_DIR" config --get "branch.$CURRENT_BRANCH.remote" 2>/dev/null || true)"
  UPSTREAM_MERGE="$($GIT_BIN -C "$SOURCE_DIR" config --get "branch.$CURRENT_BRANCH.merge" 2>/dev/null || true)"
  if [[ "$UPSTREAM_MERGE" == refs/heads/* ]]; then UPSTREAM_BRANCH="${UPSTREAM_MERGE#refs/heads/}"; fi
fi
REMOTE="${DEPLOY_REMOTE:-${UPSTREAM_REMOTE:-origin}}"
BRANCH="${DEPLOY_BRANCH:-${UPSTREAM_BRANCH:-${CURRENT_BRANCH:-main}}}"
[[ "$REMOTE" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ ]] || fail "resolved Git remote contains unsupported characters: $REMOTE"
[[ "$BRANCH" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ ]] || fail "resolved Git branch contains unsupported characters: $BRANCH"
TARGET_REF="refs/remotes/$REMOTE/$BRANCH"

WEB_HOST="${DEPLOY_WEB_HOST:-${HOST:-127.0.0.1}}"
[[ "$WEB_HOST" =~ ^[A-Za-z0-9:._-]+$ ]] || fail "resolved application HOST is invalid: $WEB_HOST"
WEB_PORT="${DEPLOY_WEB_PORT:-${PORT:-8001}}"
[[ "$WEB_PORT" =~ ^[0-9]+$ ]] && ((WEB_PORT >= 1 && WEB_PORT <= 65535)) \
  || fail "resolved application PORT must be between 1 and 65535: $WEB_PORT"
HEALTH_URL="${DEPLOY_HEALTH_URL:-http://$WEB_HOST:$WEB_PORT/api/health}"
[[ "$HEALTH_URL" == http://* || "$HEALTH_URL" == https://* ]] || fail "DEPLOY_HEALTH_URL must use http or https"

HEALTH_ATTEMPTS="${DEPLOY_HEALTH_ATTEMPTS:-30}"
HEALTH_INTERVAL_SECONDS="${DEPLOY_HEALTH_INTERVAL_SECONDS:-2}"
HEALTH_TIMEOUT_SECONDS="${DEPLOY_HEALTH_TIMEOUT_SECONDS:-3}"
for numeric_value in HEALTH_ATTEMPTS HEALTH_INTERVAL_SECONDS HEALTH_TIMEOUT_SECONDS; do
  [[ "${!numeric_value}" =~ ^[1-9][0-9]*$ ]] || fail "$numeric_value must be a positive integer"
done
((HEALTH_ATTEMPTS <= 120)) || fail "DEPLOY_HEALTH_ATTEMPTS must not exceed 120"
((HEALTH_INTERVAL_SECONDS <= 30)) || fail "DEPLOY_HEALTH_INTERVAL_SECONDS must not exceed 30"
((HEALTH_TIMEOUT_SECONDS <= 30)) || fail "DEPLOY_HEALTH_TIMEOUT_SECONDS must not exceed 30"

PM2_CONFIG="${DEPLOY_PM2_CONFIG:-ecosystem.config.js}"
[[ "$PM2_CONFIG" != /* && "$PM2_CONFIG" != ".." && "$PM2_CONFIG" != ../* && "$PM2_CONFIG" != */../* ]] \
  || fail "DEPLOY_PM2_CONFIG must be a relative path inside each release"
PM2_WEB_NAME="${DEPLOY_PM2_WEB_NAME:-$PROJECT_NAME-web}"
PM2_CRON_NAME="${DEPLOY_PM2_CRON_NAME:-$PROJECT_NAME-cron}"
for app_name in "$PM2_WEB_NAME" "$PM2_CRON_NAME"; do
  [[ "$app_name" =~ ^[A-Za-z0-9._-]+$ ]] || fail "PM2 app name contains unsupported characters: $app_name"
done
[[ "$PM2_WEB_NAME" != "$PM2_CRON_NAME" ]] || fail "web and cron PM2 names must differ"

NODE_BIN="$(resolve_command node "${DEPLOY_NODE_BIN:-$NODE_BIN}" /usr/local/bin/node /usr/bin/node)"
TAR_BIN="$(resolve_command tar "${DEPLOY_TAR_BIN:-}" /usr/bin/tar /usr/local/bin/tar)"
NPM_BIN="$(resolve_command npm "${DEPLOY_NPM_BIN:-}" /usr/bin/npm /usr/local/bin/npm)"
NPX_BIN="$(resolve_command npx "${DEPLOY_NPX_BIN:-}" /usr/bin/npx /usr/local/bin/npx)"
CURL_BIN="$(resolve_command curl "${DEPLOY_CURL_BIN:-}" /usr/bin/curl /usr/local/bin/curl)"
FLOCK_BIN="$(resolve_command flock "${DEPLOY_FLOCK_BIN:-}" /usr/bin/flock)"
PM2_BIN="$(resolve_pm2 "${DEPLOY_PM2_BIN:-}" "$NPM_BIN")"
MYSQLDUMP_BIN="$(resolve_command mysqldump "${DEPLOY_MYSQLDUMP_BIN:-${MYSQLDUMP_BIN:-}}" /usr/bin/mysqldump /usr/local/bin/mysqldump /opt/mysql/bin/mysqldump /opt/Mysql/mysql/bin/mysqldump)"
export MYSQLDUMP_BIN

if [[ -n "${DEPLOY_REQUIRED_COMMANDS:-}" || -n "${DEPLOY_REQUIRED_SYSTEMD_SERVICES:-}" \
  || -n "${DEPLOY_AUTO_START_SERVICES:-}" ]]; then
  fail "legacy DEPLOY_REQUIRED_COMMANDS/DEPLOY_REQUIRED_SYSTEMD_SERVICES/DEPLOY_AUTO_START_SERVICES are forbidden; use DEPLOY_HOST_MANIFEST for read-only version and service checks"
fi

HOST_MANIFEST="-"
if [[ -n "${DEPLOY_HOST_MANIFEST:-}" ]]; then
  HOST_MANIFEST="$DEPLOY_HOST_MANIFEST"
  if [[ "$HOST_MANIFEST" != /* ]]; then HOST_MANIFEST="$SOURCE_DIR/$HOST_MANIFEST"; fi
  [[ -f "$HOST_MANIFEST" ]] || fail "DEPLOY_HOST_MANIFEST not found: $HOST_MANIFEST"
  HOST_MANIFEST="$($REALPATH_BIN -e -- "$HOST_MANIFEST")"
fi
SYSTEMCTL_BIN="$(resolve_optional_command systemctl "${DEPLOY_SYSTEMCTL_BIN:-}" /usr/bin/systemctl /bin/systemctl)"

HOST_CORE_ARGS=()
add_host_core() {
  local name="$1" path="$2" pattern="$3"
  [[ "$pattern" != *$'\n'* && "$pattern" != *$'\r'* && "$pattern" != *$'\t'* ]] \
    || fail "version pattern for $name must be a single line without tabs"
  HOST_CORE_ARGS+=(--core "$name" "$path" "$pattern")
}
add_host_core node "$NODE_BIN" "${DEPLOY_NODE_VERSION_PATTERN:-^v(20|22|24|26)\.}"
add_host_core npm "$NPM_BIN" "${DEPLOY_NPM_VERSION_PATTERN:-}"
add_host_core npx "$NPX_BIN" "${DEPLOY_NPX_VERSION_PATTERN:-}"
add_host_core git "$GIT_BIN" "${DEPLOY_GIT_VERSION_PATTERN:-}"
add_host_core tar "$TAR_BIN" "${DEPLOY_TAR_VERSION_PATTERN:-}"
add_host_core curl "$CURL_BIN" "${DEPLOY_CURL_VERSION_PATTERN:-}"
add_host_core flock "$FLOCK_BIN" "${DEPLOY_FLOCK_VERSION_PATTERN:-}"
add_host_core pm2 "$PM2_BIN" "${DEPLOY_PM2_VERSION_PATTERN:-^([6-9]|[1-9][0-9]+)\.}"
add_host_core mysqldump "$MYSQLDUMP_BIN" "${DEPLOY_MYSQLDUMP_VERSION_PATTERN:-}"
add_host_core id "$ID_BIN" ""
add_host_core realpath "$REALPATH_BIN" ""
add_host_core mktemp "$MKTEMP_BIN" ""
if [[ "$SYSTEMCTL_BIN" != "-" ]]; then
  add_host_core systemctl "$SYSTEMCTL_BIN" "${DEPLOY_SYSTEMCTL_VERSION_PATTERN:-}"
fi

HOST_SNAPSHOT_FILE=""
RUNTIME_SERVICE_SNAPSHOT_FILE=""
new_temp_file HOST_SNAPSHOT_FILE
new_temp_file RUNTIME_SERVICE_SNAPSHOT_FILE
HOST_SNAPSHOT_DIR="$SHARED_DIR/host-snapshots"
HOST_SNAPSHOT_NAME="$(date -u +%Y%m%d%H%M%S)-host-$$.json"
RUNTIME_SNAPSHOT_NAME="$(date -u +%Y%m%d%H%M%S)-runtime-services-$$.json"
inspect_host() {
  local host_status=0 runtime_status=0 persisted="" runtime_persisted=""
  "$NODE_BIN" "$SCRIPT_DIR/inspect-deploy-host.mjs" \
    --snapshot "$HOST_SNAPSHOT_FILE" \
    --manifest "$HOST_MANIFEST" \
    --systemctl "$SYSTEMCTL_BIN" \
    "${HOST_CORE_ARGS[@]}" || host_status=$?
  "$NODE_BIN" "$SCRIPT_DIR/inspect-runtime-services.mjs" \
    --env-file "$ENV_FILE" \
    --snapshot "$RUNTIME_SERVICE_SNAPSHOT_FILE" \
    --systemctl "$SYSTEMCTL_BIN" || runtime_status=$?
  for snapshot in "$HOST_SNAPSHOT_FILE" "$RUNTIME_SERVICE_SNAPSHOT_FILE"; do
    "$NODE_BIN" -e 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"))' "$snapshot" \
      || fail "host inspector did not produce valid JSON: $snapshot"
  done
  if [[ "$CHECK_ONLY" == "0" ]]; then
    mkdir -p -- "$HOST_SNAPSHOT_DIR"
    chmod 700 -- "$SHARED_DIR" "$HOST_SNAPSHOT_DIR"
    persisted="$HOST_SNAPSHOT_DIR/$HOST_SNAPSHOT_NAME"
    runtime_persisted="$HOST_SNAPSHOT_DIR/$RUNTIME_SNAPSHOT_NAME"
    cp -- "$HOST_SNAPSHOT_FILE" "$persisted" || fail "could not persist host snapshot"
    cp -- "$RUNTIME_SERVICE_SNAPSHOT_FILE" "$runtime_persisted" || fail "could not persist runtime service snapshot"
    chmod 600 -- "$persisted" "$runtime_persisted"
    log "host snapshots=$persisted,$runtime_persisted"
  fi
  [[ "$host_status" == "0" ]] || fail "host command/version/service verification failed before deployment"
  [[ "$runtime_status" == "0" ]] || fail "DATABASE_URL/REDIS_URL service verification failed before deployment"
}

CURRENT_TARGET="-"
resolve_current_target() {
  CURRENT_TARGET="-"
  if [[ -e "$CURRENT_LINK" || -L "$CURRENT_LINK" ]]; then
    [[ -L "$CURRENT_LINK" ]] || fail "current path exists but is not a symlink: $CURRENT_LINK"
    CURRENT_TARGET="$(readlink -f -- "$CURRENT_LINK" 2>/dev/null || true)"
    [[ -n "$CURRENT_TARGET" && -d "$CURRENT_TARGET" ]] || fail "current symlink target is missing"
    path_within "$CURRENT_TARGET" "$RELEASES_DIR" || fail "current symlink points outside the project releases directory"
  fi
}

PM2_STATE_FILE=""
new_temp_file PM2_STATE_FILE
check_pm2_ownership() {
  "$PM2_BIN" jlist >"$PM2_STATE_FILE" || fail "could not read the global PM2 process list"
  "$NODE_BIN" "$SCRIPT_DIR/verify-deploy-state.mjs" pm2-before \
    "$BASE_DIR" "$CURRENT_TARGET" "$PM2_WEB_NAME" "$PM2_CRON_NAME" <"$PM2_STATE_FILE" \
    || fail "PM2 process ownership validation failed"
}

check_source_clean "preflight"
"$GIT_BIN" -C "$SOURCE_DIR" check-ref-format --branch "$BRANCH" >/dev/null \
  || fail "DEPLOY_BRANCH is not a valid branch name"
"$GIT_BIN" -C "$SOURCE_DIR" remote get-url "$REMOTE" >/dev/null \
  || fail "DEPLOY_REMOTE is not configured in the source repository: $REMOTE"

resolve_current_target
inspect_host
check_pm2_ownership

log "project=$PROJECT_NAME package=$PACKAGE_NAME source=$SOURCE_DIR base=$BASE_DIR"
log "run-user=$ACTUAL_RUN_USER group=$ACTUAL_RUN_GROUP env=$ENV_FILE ref=$TARGET_REF"
log "PM2=$PM2_BIN home=$PM2_HOME apps=$PM2_WEB_NAME,$PM2_CRON_NAME listen=$WEB_HOST:$WEB_PORT"
log "health=$HEALTH_URL host-manifest=$HOST_MANIFEST"
log "mysqldump=$MYSQLDUMP_BIN media=$MEDIA_STORAGE_DIR"

if [[ "$CHECK_ONLY" == "1" ]]; then
  log "preflight check passed; no release was created or activated"
  exit 0
fi

mkdir -p -- "$RELEASES_DIR" "$BACKUP_DIR" "$DEPLOY_LOG_DIR" "$MEDIA_STORAGE_DIR" "$AVATAR_DIR"
chmod 700 -- "$SHARED_DIR" "$BACKUP_DIR" "$DEPLOY_LOG_DIR" "$MEDIA_STORAGE_DIR" "$AVATAR_DIR"

exec {DEPLOY_LOCK_FD}>"$SHARED_DIR/deploy.lock"
"$FLOCK_BIN" -n "$DEPLOY_LOCK_FD" || fail "another deployment holds $SHARED_DIR/deploy.lock"

# Recheck mutable ownership state after taking the project deployment lock.
check_source_clean "deployment-lock recheck"
resolve_current_target
inspect_host
check_pm2_ownership

log "fetch $REMOTE/$BRANCH"
"$GIT_BIN" -C "$SOURCE_DIR" fetch --prune "$REMOTE" "+refs/heads/$BRANCH:$TARGET_REF"
"$GIT_BIN" -C "$SOURCE_DIR" rev-parse --verify "$TARGET_REF^{commit}" >/dev/null \
  || fail "remote-tracking ref not found after fetch: $TARGET_REF"
TARGET_COMMIT="$($GIT_BIN -C "$SOURCE_DIR" rev-parse --short=12 "$TARGET_REF^{commit}")"
RELEASE_ID="$(date -u +%Y%m%d%H%M%S)-$TARGET_COMMIT-$$"
RELEASE_DIR="$RELEASES_DIR/$RELEASE_ID"
MIGRATION_LOG="$RELEASE_DIR/.deploy-migrate.log"
START_TIME="$(date +%s)"
[[ ! -e "$RELEASE_DIR" ]] || fail "release directory already exists: $RELEASE_DIR"
mkdir -- "$RELEASE_DIR"

log "prepare release $RELEASE_ID from $TARGET_REF"
"$GIT_BIN" -C "$SOURCE_DIR" archive --format=tar "$TARGET_REF" | "$TAR_BIN" -xf - -C "$RELEASE_DIR"
[[ -f "$RELEASE_DIR/$PM2_CONFIG" ]] || fail "PM2 config is missing from release: $PM2_CONFIG"
[[ ! -e "$RELEASE_DIR/.env" && ! -L "$RELEASE_DIR/.env" ]] || fail "release unexpectedly contains .env"
ln -s -- "$ENV_FILE" "$RELEASE_DIR/.env"

cd -- "$RELEASE_DIR"
log "install locked dependencies"
"$NPM_BIN" ci
"$NPX_BIN" --no-install prisma generate
"$NPX_BIN" --no-install prisma validate

log "build before touching the running service"
"$NPM_BIN" run build

log "create database backup"
"$NODE_BIN" scripts/db-backup.mjs "$BACKUP_DIR"

run_migrations() {
  "$NPX_BIN" --no-install prisma migrate deploy 2>&1 | tee "$MIGRATION_LOG"
}

log "apply database migrations"
if ! run_migrations; then
  if grep -q 'P3005' "$MIGRATION_LOG" && [[ "${ALLOW_MIGRATION_BASELINE:-0}" == "1" ]]; then
    log "explicit one-time baseline enabled; marking legacy migrations as applied"
    "$NPX_BIN" --no-install prisma migrate resolve --applied 20260623103519_init
    "$NPX_BIN" --no-install prisma migrate resolve --applied 20260623104500_add_constraints
    "$NPX_BIN" --no-install prisma migrate resolve --applied 20260725090000_add_player_identity_and_hero_secondary_lanes
    "$NPX_BIN" --no-install prisma migrate resolve --applied 20260725140000_mark_temporary_users
    "$NPX_BIN" --no-install prisma migrate resolve --applied 20260725150000_reconcile_legacy_schema
    run_migrations || fail "migration failed after the explicit legacy baseline"
  else
    fail "migration failed; automatic baseline is disabled"
  fi
fi

PREVIOUS_TARGET="$CURRENT_TARGET"
HEALTH_RESPONSE_FILE=""
new_temp_file HEALTH_RESPONSE_FILE

atomic_switch() {
  local target="$1" temporary_link="$BASE_DIR/.current-$RELEASE_ID-$$"
  [[ -d "$target" ]] || return 1
  path_within "$target" "$RELEASES_DIR" || return 1
  rm -f -- "$temporary_link"
  ln -s -- "$target" "$temporary_link" || return 1
  if ! mv -Tf -- "$temporary_link" "$CURRENT_LINK"; then
    rm -f -- "$temporary_link"
    return 1
  fi
}

reload_release() {
  local target_link="$1" resolved_target release_id
  resolved_target="$(readlink -f -- "$target_link" 2>/dev/null || true)"
  [[ -n "$resolved_target" && -d "$resolved_target" ]] || return 1
  path_within "$resolved_target" "$RELEASES_DIR" || return 1
  release_id="$(basename -- "$resolved_target")"

  APP_DIR="$target_link" \
  APP_RELEASE_ID="$release_id" \
  DEPLOY_PROJECT_NAME="$PROJECT_NAME" \
  DEPLOY_PM2_WEB_NAME="$PM2_WEB_NAME" \
  DEPLOY_PM2_CRON_NAME="$PM2_CRON_NAME" \
  DEPLOY_WEB_HOST="$WEB_HOST" \
  DEPLOY_WEB_PORT="$WEB_PORT" \
    "$PM2_BIN" startOrReload "$target_link/$PM2_CONFIG" \
      --only "$PM2_WEB_NAME,$PM2_CRON_NAME" --update-env || return 1

  "$PM2_BIN" jlist >"$PM2_STATE_FILE" || return 1
  "$NODE_BIN" "$SCRIPT_DIR/verify-deploy-state.mjs" pm2-after \
    "$resolved_target" "$release_id" "$PM2_WEB_NAME" "$PM2_CRON_NAME" <"$PM2_STATE_FILE"
}

wait_for_health() {
  local expected_release="$1" attempt
  for ((attempt = 1; attempt <= HEALTH_ATTEMPTS; attempt += 1)); do
    if "$CURL_BIN" --fail --silent --show-error \
      --connect-timeout "$HEALTH_TIMEOUT_SECONDS" \
      --max-time "$HEALTH_TIMEOUT_SECONDS" \
      --output "$HEALTH_RESPONSE_FILE" "$HEALTH_URL" \
      && "$NODE_BIN" "$SCRIPT_DIR/verify-deploy-state.mjs" health "$expected_release" \
        <"$HEALTH_RESPONSE_FILE" >/dev/null 2>&1; then
      log "release-aware health passed for $expected_release"
      return 0
    fi
    ((attempt < HEALTH_ATTEMPTS)) && sleep "$HEALTH_INTERVAL_SECONDS"
  done
  return 1
}

rollback_release() {
  local reason="$1" rollback_ok=0
  log "activation failed: $reason"
  if [[ "$PREVIOUS_TARGET" != "-" && -d "$PREVIOUS_TARGET" ]]; then
    log "roll back current link and PM2 to $PREVIOUS_TARGET"
    if atomic_switch "$PREVIOUS_TARGET" \
      && reload_release "$CURRENT_LINK" \
      && wait_for_health "$(basename -- "$PREVIOUS_TARGET")"; then
      rollback_ok=1
      "$PM2_BIN" save >/dev/null || rollback_ok=0
    fi
    if [[ "$rollback_ok" == "1" ]]; then
      fail "release $RELEASE_ID was rolled back: $reason"
    fi
    fail "release $RELEASE_ID failed and the previous release could not be fully restored: $reason"
  fi

  if [[ -L "$CURRENT_LINK" && "$(readlink -f -- "$CURRENT_LINK" 2>/dev/null || true)" == "$RELEASE_DIR" ]]; then
    rm -- "$CURRENT_LINK"
  fi
  "$PM2_BIN" delete "$PM2_WEB_NAME" "$PM2_CRON_NAME" >/dev/null 2>&1 || true
  "$PM2_BIN" save >/dev/null 2>&1 || true
  fail "first release activation failed and no previous release exists: $reason"
}

log "atomically switch current link to $RELEASE_ID"
atomic_switch "$RELEASE_DIR" || rollback_release "could not switch the current release link"
log "activate the project through PM2"
reload_release "$CURRENT_LINK" || rollback_release "PM2 start/reload or release ownership verification failed"
wait_for_health "$RELEASE_ID" || rollback_release "release-aware health check did not pass"
"$PM2_BIN" save || rollback_release "PM2 state could not be saved for reboot recovery"

DEPLOY_SUCCEEDED=1
log "release $RELEASE_ID is active and healthy; completed in $(( $(date +%s) - START_TIME ))s"
log "hero synchronization remains decoupled; cron or an administrator triggers it"
