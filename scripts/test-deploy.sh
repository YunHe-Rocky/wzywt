#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
DEPLOY_SCRIPT="$SCRIPT_DIR/deploy.sh"
PARSER_SCRIPT="$SCRIPT_DIR/deploy-env.mjs"

TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/wzywt-deploy-test.XXXXXX")"
SERVICE_PID=""
cleanup() {
  [[ -n "$SERVICE_PID" ]] && kill "$SERVICE_PID" >/dev/null 2>&1 || true
  case "$TEST_ROOT" in
    "${TMPDIR:-/tmp}"/wzywt-deploy-test.*) rm -rf -- "$TEST_ROOT" ;;
    *) printf '[test-deploy] refusing unexpected cleanup target: %s\n' "$TEST_ROOT" >&2 ;;
  esac
}
trap cleanup EXIT

fail() {
  printf '[test-deploy] FAIL: %s\n' "$*" >&2
  exit 1
}

assert_contains() {
  local file="$1" expected="$2"
  grep -F -- "$expected" "$file" >/dev/null || fail "$file does not contain: $expected"
}

assert_not_contains() {
  local file="$1" unexpected="$2"
  if grep -F -- "$unexpected" "$file" >/dev/null; then fail "$file unexpectedly contains: $unexpected"; fi
}

assert_current_is_old() {
  local case_dir="$1"
  local current
  current="$(readlink -f -- "$case_dir/app/current")"
  [[ "$current" == "$case_dir/app/releases/old-release" ]] \
    || fail "rollback target is $current, expected old release"
}

cat >"$TEST_ROOT/service-listener.mjs" <<'NODE'
import { writeFileSync } from "node:fs";
import { createServer } from "node:net";

const output = process.argv[2];
const server = createServer((socket) => socket.end());
server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  writeFileSync(output, `${address.port}\n`);
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
NODE
node "$TEST_ROOT/service-listener.mjs" "$TEST_ROOT/service-port" &
SERVICE_PID=$!
for _ in {1..50}; do
  [[ -s "$TEST_ROOT/service-port" ]] && break
  sleep 0.1
done
[[ -s "$TEST_ROOT/service-port" ]] || fail "test service listener did not start"
SERVICE_PORT="$(tr -d '[:space:]' <"$TEST_ROOT/service-port")"
SERVICE_USER="$(id -un)"
if ! SERVICE_GROUP="$(id -gn 2>/dev/null)"; then
  SERVICE_GROUP="$(id -g)"
fi

node --input-type=module - "$PARSER_SCRIPT" <<'NODE'
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const parserPath = process.argv[2];
const { parseDeployEnv, parseRuntimeEnv } = await import(pathToFileURL(parserPath));
const content = `
  PORT=19001
  HOST=127.0.0.2
  DEPLOY_BASE_DIR = "/opt/example" # comment
  DEPLOY_BRANCH='release/test'
  DATABASE_URL=$(touch /tmp/should-not-run)
`;
const parsed = parseDeployEnv(content);
const runtime = parseRuntimeEnv(content);
assert.equal(parsed.get("PORT"), "19001");
assert.equal(parsed.get("HOST"), "127.0.0.2");
assert.equal(parsed.get("DEPLOY_BASE_DIR"), "/opt/example");
assert.equal(parsed.get("DEPLOY_BRANCH"), "release/test");
assert.equal(parsed.has("DATABASE_URL"), false);
assert.equal(runtime.get("DATABASE_URL"), "$(touch /tmp/should-not-run)");
assert.throws(
  () => parseDeployEnv("DEPLOY_WEB_PORT=8081\nDEPLOY_WEB_PORT=8082\n"),
  /Duplicate environment key/,
);
NODE

APP_DIR="$TEST_ROOT/ecosystem-release" \
DEPLOY_PROJECT_NAME=renamed-app \
DEPLOY_WEB_HOST=127.0.0.2 \
DEPLOY_WEB_PORT=19090 \
node --input-type=commonjs - "$REPO_ROOT/ecosystem.config.js" <<'NODE'
const assert = require("node:assert/strict");
const config = require(process.argv[2]);
assert.deepEqual(config.apps.map((app) => app.name), ["renamed-app-web", "renamed-app-cron"]);
assert.equal(config.apps[0].cwd, process.env.APP_DIR);
assert.equal(config.apps[0].args, "start -H 127.0.0.2 -p 19090");
assert.equal(config.apps[0].env.DEPLOY_WEB_PORT, "19090");
assert.equal(config.apps[0].env.PORT, "19090");
NODE

APP_DIR="$TEST_ROOT/ecosystem-release" \
HOST=127.0.0.3 \
PORT=19091 \
node --input-type=commonjs - "$REPO_ROOT/ecosystem.config.js" <<'NODE'
const assert = require("node:assert/strict");
const config = require(process.argv[2]);
assert.deepEqual(config.apps.map((app) => app.name), ["wangzhe-yanwutang-web", "wangzhe-yanwutang-cron"]);
assert.equal(config.apps[0].args, "start -H 127.0.0.3 -p 19091");
assert.equal(config.apps[0].env.PORT, "19091");
NODE

VERIFY_ROOT="$TEST_ROOT/verify"
mkdir -p -- "$VERIFY_ROOT/release"
VERIFY_WEB_PID_FILE="$VERIFY_ROOT/verify-web.pid"
VERIFY_CRON_PID_FILE="$VERIFY_ROOT/verify-cron.pid"
printf '%s\n' "$SERVICE_PID" >"$VERIFY_WEB_PID_FILE"
printf '%s\n' "$SERVICE_PID" >"$VERIFY_CRON_PID_FILE"
VERIFY_PROCESS_CWD="$VERIFY_ROOT/release"
VERIFY_WEB_PID_JSON="$VERIFY_WEB_PID_FILE"
VERIFY_CRON_PID_JSON="$VERIFY_CRON_PID_FILE"
if command -v cygpath >/dev/null 2>&1; then
  VERIFY_PROCESS_CWD="$(cygpath -m "$VERIFY_ROOT/release")"
  VERIFY_WEB_PID_JSON="$(cygpath -m "$VERIFY_WEB_PID_FILE")"
  VERIFY_CRON_PID_JSON="$(cygpath -m "$VERIFY_CRON_PID_FILE")"
fi
printf '{"ok":true,"releaseId":"verify-release","checks":{"database":"ok","cron":"ok"}}\n' \
  | node "$SCRIPT_DIR/verify-deploy-state.mjs" health verify-release >/dev/null
printf '[{"name":"verify-web","pid":%s,"pm2_env":{"pm_cwd":"%s","pm_pid_path":"%s","status":"online","APP_RELEASE_ID":"verify-release"}},{"name":"verify-cron","pid":%s,"pm2_env":{"pm_cwd":"%s","pm_pid_path":"%s","status":"online","APP_RELEASE_ID":"verify-release"}}]\n' \
  "$SERVICE_PID" "$VERIFY_PROCESS_CWD" "$VERIFY_WEB_PID_JSON" \
  "$SERVICE_PID" "$VERIFY_PROCESS_CWD" "$VERIFY_CRON_PID_JSON" \
  | node "$SCRIPT_DIR/verify-deploy-state.mjs" pm2-after \
      "$VERIFY_ROOT/release" verify-release verify-web verify-cron >/dev/null
if printf '[{"name":"verify-web","pm2_env":{"pm_cwd":"%s","status":"online","APP_RELEASE_ID":"foreign"}}]\n' "$VERIFY_PROCESS_CWD" \
  | node "$SCRIPT_DIR/verify-deploy-state.mjs" pm2-before "$VERIFY_ROOT" - verify-web verify-cron >/dev/null 2>&1; then
  fail "foreign PM2 ownership unexpectedly passed the standalone verifier"
fi

mkdir -p -- "$TEST_ROOT/symlink-target"
ln -s -- "$TEST_ROOT/symlink-target" "$TEST_ROOT/symlink-probe"
if [[ ! -L "$TEST_ROOT/symlink-probe" ]]; then
  printf '[test-deploy] PASS: env parser and deploy-state verifiers\n'
  printf '[test-deploy] SKIP: full release activation requires native Unix symlink semantics\n'
  exit 0
fi

FAKE_BIN="$TEST_ROOT/fake-bin"
mkdir -p -- "$FAKE_BIN"

cat >"$FAKE_BIN/git" <<'SH'
#!/usr/bin/env bash
set -Eeuo pipefail
if [[ "${1:-}" == "--version" ]]; then printf 'git version 2.50.0\n'; exit 0; fi
if [[ "${1:-}" == "-C" ]]; then shift 2; fi
if [[ "${1:-}" == "-c" && "${2:-}" == "core.quotePath=true" ]]; then shift 2; fi
case "${1:-}" in
  status) printf '%s' "${TEST_GIT_STATUS:-}" ;;
  diff) printf '%s' "${TEST_GIT_DIFF_SUMMARY:-}" ;;
  branch) [[ "${2:-}" == "--show-current" ]] && printf 'main\n' ;;
  config)
    case "${3:-}" in
      branch.main.remote) printf 'origin\n' ;;
      branch.main.merge) printf 'refs/heads/main\n' ;;
    esac
    ;;
  check-ref-format) exit 0 ;;
  remote) printf 'https://example.invalid/wzywt.git\n' ;;
  fetch) exit 0 ;;
  rev-parse)
    if [[ "${2:-}" == "--verify" ]]; then printf '%s\n' abcdef1234567890; else printf '%s\n' abcdef123456; fi
    ;;
  archive)
    tar -cf - -C "$TEST_ARCHIVE_DIR" .
    ;;
  *) printf 'unexpected fake git command: %s\n' "$*" >&2; exit 90 ;;
esac
SH

cat >"$FAKE_BIN/npm" <<'SH'
#!/usr/bin/env bash
set -Eeuo pipefail
if [[ "${1:-}" == "--version" ]]; then printf '10.9.0\n'; exit 0; fi
printf 'npm %s\n' "$*" >>"$TEST_COMMAND_LOG"
if [[ "${1:-}" == "prefix" ]]; then printf '%s\n' "$TEST_FAKE_BIN"; fi
SH

cat >"$FAKE_BIN/npx" <<'SH'
#!/usr/bin/env bash
set -Eeuo pipefail
if [[ "${1:-}" == "--version" ]]; then printf '10.9.0\n'; exit 0; fi
printf 'npx %s\n' "$*" >>"$TEST_COMMAND_LOG"
if [[ "$*" == *"prisma migrate deploy"* ]]; then printf 'migrations applied\n'; fi
SH

cat >"$FAKE_BIN/pm2" <<'SH'
#!/usr/bin/env bash
set -Eeuo pipefail
command_name="${1:-}"
shift || true
case "$command_name" in
  --version)
    printf '%s\n' "${TEST_PM2_VERSION:-6.0.0}"
    ;;
  jlist)
    if [[ -f "$TEST_PM2_STATE" ]]; then cat -- "$TEST_PM2_STATE"; else printf '[]\n'; fi
    ;;
  startOrReload)
    printf 'pm2 startOrReload release=%s cwd=%s\n' "$APP_RELEASE_ID" "$APP_DIR" >>"$TEST_COMMAND_LOG"
    if [[ "${TEST_FAIL_PM2_NEW:-0}" == "1" && "$APP_RELEASE_ID" != "$TEST_OLD_RELEASE_ID" ]]; then
      exit 41
    fi
    resolved_cwd="$(readlink -f -- "$APP_DIR")"
    if command -v cygpath >/dev/null 2>&1; then resolved_cwd="$(cygpath -m "$resolved_cwd")"; fi
    printf '%s\n' "$TEST_RUNTIME_PID" >"$TEST_WEB_PID_FILE"
    printf '%s\n' "$TEST_RUNTIME_PID" >"$TEST_CRON_PID_FILE"
    printf '[{"name":"%s","pid":%s,"pm2_env":{"pm_cwd":"%s","pm_pid_path":"%s","status":"online","APP_RELEASE_ID":"%s"}},{"name":"%s","pid":%s,"pm2_env":{"pm_cwd":"%s","pm_pid_path":"%s","status":"online","APP_RELEASE_ID":"%s"}}]\n' \
      "$DEPLOY_PM2_WEB_NAME" "$TEST_RUNTIME_PID" "$resolved_cwd" "$TEST_WEB_PID_JSON" "$APP_RELEASE_ID" \
      "$DEPLOY_PM2_CRON_NAME" "$TEST_RUNTIME_PID" "$resolved_cwd" "$TEST_CRON_PID_JSON" "$APP_RELEASE_ID" >"$TEST_PM2_STATE"
    ;;
  stop)
    web_name="${1:-}"
    cron_name="${2:-}"
    resolved_cwd="$(readlink -f -- "$TEST_BASE_DIR/current")"
    if command -v cygpath >/dev/null 2>&1; then resolved_cwd="$(cygpath -m "$resolved_cwd")"; fi
    printf '[{"name":"%s","pid":0,"pm2_env":{"pm_cwd":"%s","status":"stopped","APP_RELEASE_ID":"old-release"}},{"name":"%s","pid":0,"pm2_env":{"pm_cwd":"%s","status":"stopped","APP_RELEASE_ID":"old-release"}}]\n' \
      "$web_name" "$resolved_cwd" "$cron_name" "$resolved_cwd" >"$TEST_PM2_STATE"
    printf 'pm2 stop %s %s\n' "$web_name" "$cron_name" >>"$TEST_COMMAND_LOG"
    ;;  save)
    printf 'pm2 save\n' >>"$TEST_COMMAND_LOG"
    ;;
  delete)
    printf '[]\n' >"$TEST_PM2_STATE"
    printf 'pm2 delete %s\n' "$*" >>"$TEST_COMMAND_LOG"
    ;;
  logs)
    app_name="${1:-unknown}"
    printf '[TAILING] last 40 lines for %s\n' "$app_name"
    if [[ "$app_name" == *-cron ]]; then
      printf '[cron] bootstrap failed fixture-env-loader\n'
    else
      printf '[web] health endpoint returned fixture status\n'
    fi
    ;;
  *) printf 'unexpected fake pm2 command: %s %s\n' "$command_name" "$*" >&2; exit 91 ;;
esac
SH

cat >"$FAKE_BIN/curl" <<'SH'
#!/usr/bin/env bash
set -Eeuo pipefail
if [[ "${1:-}" == "--version" ]]; then printf 'curl 8.12.0 fake\n'; exit 0; fi
output_file=""
write_out=0
while (($#)); do
  case "$1" in
    --output) output_file="$2"; shift 2 ;;
    --write-out) write_out=1; shift 2 ;;
    *) shift ;;
  esac
done
[[ -n "$output_file" ]] || exit 92
release_id="$(basename -- "$(readlink -f -- "$TEST_BASE_DIR/current")")"
if [[ "${TEST_FAIL_HEALTH_NEW:-0}" == "1" && "$release_id" != "$TEST_OLD_RELEASE_ID" ]]; then
  printf '{"ok":false,"releaseId":"%s","checks":{"database":"ok","mediaStorage":"ok","avatarStorage":"ok","cron":"failed","redis":"degraded"}}\n' "$release_id" >"$output_file"
  ((write_out == 0)) || printf '503'
else
  printf '{"ok":true,"releaseId":"%s","checks":{"database":"ok","mediaStorage":"ok","avatarStorage":"ok","cron":"ok","redis":"ok"}}\n' "$release_id" >"$output_file"
  ((write_out == 0)) || printf '200'
fi
SH

cat >"$FAKE_BIN/systemctl" <<'SH'
#!/usr/bin/env bash
set -Eeuo pipefail
if [[ "${1:-}" == "--version" ]]; then printf 'systemd 252 (fake)\n'; exit 0; fi
if [[ "${1:-}" == "--user" ]]; then shift; fi
action="${1:-}"
case "$action" in
  show)
    unit="${2:-}"
    if [[ "$unit" == "mysql.service" ]]; then
      printf 'LoadState=loaded\nActiveState=active\nSubState=running\nMainPID=%s\nUser=%s\nFragmentPath=/etc/systemd/system/mysql.service\n' \
        "$TEST_SERVICE_PID" "$TEST_SERVICE_USER"
    else
      printf 'LoadState=not-found\nActiveState=inactive\nSubState=dead\nMainPID=0\nUser=\nFragmentPath=\n'
    fi
    ;;
  *) exit 93 ;;
esac
SH

cat >"$FAKE_BIN/mysqldump" <<'SH'
#!/usr/bin/env bash
printf 'mysqldump  Ver 8.4.0 for Linux on x86_64 (fake)\n'
SH
cat >"$FAKE_BIN/nginx" <<'SH'
#!/usr/bin/env bash
printf 'nginx version: nginx/1.30.2\n' >&2
SH
cat >"$FAKE_BIN/flock" <<'SH'
#!/usr/bin/env bash
if [[ "${1:-}" == "--version" ]]; then printf 'flock from util-linux 2.39.0\n'; exit 0; fi
exit 0
SH
chmod +x -- "$FAKE_BIN"/*

prepare_case() {
  local name="$1" case_dir base source archive old_process_cwd
  local service_pid_file service_lock_file web_pid_file cron_pid_file
  local service_pid_json service_lock_json web_pid_json cron_pid_json nginx_json
  case_dir="$TEST_ROOT/$name"
  base="$case_dir/app"
  source="$case_dir/app/source"
  archive="$case_dir/archive"
  old_process_cwd="$base/releases/old-release"
  service_pid_file="$case_dir/mysql.pid"
  service_lock_file="$case_dir/mysql.lock"
  web_pid_file="$case_dir/web.pid"
  cron_pid_file="$case_dir/cron.pid"
  service_pid_json="$service_pid_file"
  service_lock_json="$service_lock_file"
  web_pid_json="$web_pid_file"
  cron_pid_json="$cron_pid_file"
  nginx_json="$FAKE_BIN/nginx"
  if command -v cygpath >/dev/null 2>&1; then
    old_process_cwd="$(cygpath -m "$old_process_cwd")"
    service_pid_json="$(cygpath -m "$service_pid_file")"
    service_lock_json="$(cygpath -m "$service_lock_file")"
    web_pid_json="$(cygpath -m "$web_pid_file")"
    cron_pid_json="$(cygpath -m "$cron_pid_file")"
    nginx_json="$(cygpath -m "$FAKE_BIN/nginx")"
  fi
  mkdir -p -- "$source/.git" "$source/scripts" "$base/shared/pm2" "$base/releases/old-release" "$archive/scripts"
  cp -- "$SCRIPT_DIR/deploy.sh" "$SCRIPT_DIR/deploy-env.mjs" "$SCRIPT_DIR/verify-deploy-state.mjs" \
    "$SCRIPT_DIR/inspect-deploy-host.mjs" "$SCRIPT_DIR/inspect-runtime-services.mjs" \
    "$SCRIPT_DIR/stop.sh" "$source/scripts/"
  printf '{"name":"renamed-package-%s"}\n' "$name" >"$source/package.json"
  printf 'module.exports = { apps: [] };\n' >"$base/releases/old-release/ecosystem.config.js"
  printf 'module.exports = { apps: [] };\n' >"$archive/ecosystem.config.js"
  cat >"$archive/scripts/db-backup.mjs" <<'JS'
import { writeFileSync } from "node:fs";
writeFileSync(process.env.TEST_BACKUP_MARKER, "backup-ok\n");
JS
  ln -s -- "$base/releases/old-release" "$base/current"
  printf '%s\n' "$SERVICE_PID" >"$service_pid_file"
  : >"$service_lock_file"
  printf '%s\n' "$SERVICE_PID" >"$web_pid_file"
  printf '%s\n' "$SERVICE_PID" >"$cron_pid_file"

  cat >"$case_dir/host-manifest.json" <<JSON
{
  "version": 1,
  "commands": [
    {"name":"nginx","command":"$nginx_json","versionArgs":["-v"],"versionPattern":"nginx/1\\\\.30\\\\.2"}
  ],
  "services": [
    {
      "name":"mysql",
      "scope":"system",
      "units":["mysqld.service","mysql.service"],
      "user":"$SERVICE_USER",
      "subStates":["running"],
      "pidFile":"$service_pid_json",
      "lockFile":"$service_lock_json",
      "host":"127.0.0.1",
      "port":$SERVICE_PORT,
      "timeoutMs":2000
    }
  ]
}
JSON

  cat >"$case_dir/project.env" <<ENV
DEPLOY_PROJECT_NAME=$name
DEPLOY_BASE_DIR='$base'
DEPLOY_SOURCE_DIR="$source"
DEPLOY_RUN_USER=$SERVICE_USER
DEPLOY_RUN_GROUP=$SERVICE_GROUP
DEPLOY_REMOTE=origin
DEPLOY_BRANCH=main
DEPLOY_WEB_HOST=127.0.0.1
DEPLOY_WEB_PORT=18081
DEPLOY_HEALTH_URL=http://127.0.0.1:18081/api/health
DEPLOY_HEALTH_ATTEMPTS=2
DEPLOY_HEALTH_INTERVAL_SECONDS=1
DEPLOY_HEALTH_TIMEOUT_SECONDS=1
DEPLOY_PM2_HOME=$base/shared/pm2
DEPLOY_GIT_BIN=$FAKE_BIN/git
DEPLOY_NPM_BIN=$FAKE_BIN/npm
DEPLOY_NPX_BIN=$FAKE_BIN/npx
DEPLOY_CURL_BIN=$FAKE_BIN/curl
DEPLOY_FLOCK_BIN=$FAKE_BIN/flock
DEPLOY_PM2_BIN=$FAKE_BIN/pm2
DEPLOY_MYSQLDUMP_BIN=$FAKE_BIN/mysqldump
DEPLOY_SYSTEMCTL_BIN=$FAKE_BIN/systemctl
DEPLOY_NODE_VERSION_PATTERN='.*'
DEPLOY_NPM_VERSION_PATTERN='.*'
DEPLOY_NPX_VERSION_PATTERN='.*'
DEPLOY_GIT_VERSION_PATTERN='.*'
DEPLOY_TAR_VERSION_PATTERN='.*'
DEPLOY_CURL_VERSION_PATTERN='.*'
DEPLOY_FLOCK_VERSION_PATTERN='.*'
DEPLOY_PM2_VERSION_PATTERN='^6\\.'
DEPLOY_MYSQLDUMP_VERSION_PATTERN='.*'
DEPLOY_SYSTEMCTL_VERSION_PATTERN='.*'
DEPLOY_HOST_MANIFEST=$case_dir/host-manifest.json
MEDIA_STORAGE_DIR=$base/shared/media
AVATAR_DIR=$base/shared/media/avatars
DATABASE_URL=mysql://app:password@127.0.0.1:$SERVICE_PORT/app
SESSION_SECRET=\$(touch "$case_dir/pwned")
ENV

  printf '[{"name":"%s-web","pid":%s,"pm2_env":{"pm_cwd":"%s","pm_pid_path":"%s","status":"online","APP_RELEASE_ID":"old-release"}},{"name":"%s-cron","pid":%s,"pm2_env":{"pm_cwd":"%s","pm_pid_path":"%s","status":"online","APP_RELEASE_ID":"old-release"}}]\n' \
    "$name" "$SERVICE_PID" "$old_process_cwd" "$web_pid_json" \
    "$name" "$SERVICE_PID" "$old_process_cwd" "$cron_pid_json" >"$case_dir/pm2-state.json"
  : >"$case_dir/commands.log"
  printf '%s\n' "$case_dir"
}

run_deploy() {
  local case_dir="$1" fail_pm2=0 fail_health=0 pm2_version=6.0.0 argument
  local git_status="" git_diff_summary=""
  local web_pid_json="$case_dir/web.pid" cron_pid_json="$case_dir/cron.pid"
  local -a deploy_args=()
  shift
  for argument in "$@"; do
    case "$argument" in
      TEST_FAIL_PM2_NEW=1) fail_pm2=1 ;;
      TEST_FAIL_HEALTH_NEW=1) fail_health=1 ;;
      TEST_PM2_VERSION=*) pm2_version="${argument#*=}" ;;
      TEST_GIT_STATUS=*) git_status="${argument#*=}" ;;
      TEST_GIT_DIFF_SUMMARY=*) git_diff_summary="${argument#*=}" ;;
      --check) deploy_args+=("--check") ;;
      *) fail "unsupported run_deploy argument: $argument" ;;
    esac
  done
  if command -v cygpath >/dev/null 2>&1; then
    web_pid_json="$(cygpath -m "$web_pid_json")"
    cron_pid_json="$(cygpath -m "$cron_pid_json")"
  fi
  (
    cd -- "$case_dir/app/source"
    env \
      PATH="$FAKE_BIN:$PATH" \
      TEST_FAIL_PM2_NEW="$fail_pm2" \
      TEST_FAIL_HEALTH_NEW="$fail_health" \
      TEST_PM2_VERSION="$pm2_version" \
      TEST_GIT_STATUS="$git_status" \
      TEST_GIT_DIFF_SUMMARY="$git_diff_summary" \
      TEST_ARCHIVE_DIR="$case_dir/archive" \
      TEST_BASE_DIR="$case_dir/app" \
      TEST_PM2_STATE="$case_dir/pm2-state.json" \
      TEST_COMMAND_LOG="$case_dir/commands.log" \
      TEST_FAKE_BIN="$FAKE_BIN" \
      TEST_BACKUP_MARKER="$case_dir/backup.marker" \
      TEST_OLD_RELEASE_ID=old-release \
      TEST_RUNTIME_PID="$SERVICE_PID" \
      TEST_WEB_PID_FILE="$case_dir/web.pid" \
      TEST_CRON_PID_FILE="$case_dir/cron.pid" \
      TEST_WEB_PID_JSON="$web_pid_json" \
      TEST_CRON_PID_JSON="$cron_pid_json" \
      TEST_SERVICE_PID="$SERVICE_PID" \
      TEST_SERVICE_USER="$SERVICE_USER" \
      bash scripts/deploy.sh --env-file "$case_dir/project.env" "${deploy_args[@]}"
  )
}

run_stop() {
  local case_dir="$1"
  (
    cd -- "$case_dir/app/source"
    env \
      PATH="$FAKE_BIN:$PATH" \
      TEST_PM2_VERSION=6.0.0 \
      TEST_ARCHIVE_DIR="$case_dir/archive" \
      TEST_BASE_DIR="$case_dir/app" \
      TEST_PM2_STATE="$case_dir/pm2-state.json" \
      TEST_COMMAND_LOG="$case_dir/commands.log" \
      TEST_FAKE_BIN="$FAKE_BIN" \
      TEST_OLD_RELEASE_ID=old-release \
      TEST_RUNTIME_PID="$SERVICE_PID" \
      TEST_WEB_PID_FILE="$case_dir/web.pid" \
      TEST_CRON_PID_FILE="$case_dir/cron.pid" \
      TEST_SERVICE_PID="$SERVICE_PID" \
      TEST_SERVICE_USER="$SERVICE_USER" \
      bash scripts/stop.sh --env-file "$case_dir/project.env"
  )
}
success_case="$(prepare_case success)"
if ! run_deploy "$success_case" --check >"$success_case/check.log" 2>&1; then
  cat -- "$success_case/check.log" >&2
  fail "preflight scenario failed"
fi
assert_contains "$success_case/check.log" "command nginx ->"
assert_contains "$success_case/check.log" "service mysql -> mysql.service pid=$SERVICE_PID user=$SERVICE_USER"
assert_contains "$success_case/check.log" "preflight check passed; no release was created or activated"
assert_contains "$success_case/check.log" "[runtime-services] database 127.0.0.1:$SERVICE_PORT"
[[ ! -e "$success_case/app/shared/host-snapshots" ]] || fail "check-only persisted a host snapshot"

ordinary_root="$TEST_ROOT/ordinary-root"
mkdir -p -- "$ordinary_root/.git" "$ordinary_root/scripts"
cp -- "$SCRIPT_DIR/deploy.sh" "$SCRIPT_DIR/deploy-env.mjs" "$SCRIPT_DIR/verify-deploy-state.mjs" \
  "$SCRIPT_DIR/inspect-deploy-host.mjs" "$SCRIPT_DIR/inspect-runtime-services.mjs" "$ordinary_root/scripts/"
printf '{"name":"ordinary-root"}\n' >"$ordinary_root/package.json"
cat >"$ordinary_root/.env" <<ENV
DATABASE_URL=mysql://app:password@127.0.0.1:$SERVICE_PORT/app
SESSION_SECRET=ordinary-test-secret-not-for-production
ENV
mkdir -p -- "${ordinary_root}-pm2/pids"
printf '[]\n' >"$ordinary_root/pm2-state.json"
: >"$ordinary_root/commands.log"
if ! (
  cd -- "$ordinary_root"
  env \
    PATH="$FAKE_BIN:$PATH" \
    HOME="$ordinary_root/home" \
    TEST_PM2_STATE="$ordinary_root/pm2-state.json" \
    TEST_COMMAND_LOG="$ordinary_root/commands.log" \
    TEST_FAKE_BIN="$FAKE_BIN" \
    TEST_SERVICE_PID="$SERVICE_PID" \
    TEST_SERVICE_USER="$SERVICE_USER" \
    bash scripts/deploy.sh --check
) >"$ordinary_root/check.log" 2>&1; then
  cat -- "$ordinary_root/check.log" >&2
  fail "ordinary .env zero-config preflight failed"
fi
assert_not_contains "$ordinary_root/.env" "DEPLOY_"
assert_contains "$ordinary_root/check.log" "project=ordinary-root package=ordinary-root source=$ordinary_root base=${ordinary_root}-runtime"
assert_contains "$ordinary_root/check.log" "listen=127.0.0.1:8001"
assert_contains "$ordinary_root/check.log" "PM2=$FAKE_BIN/pm2 home=${ordinary_root}-pm2"
assert_contains "$ordinary_root/check.log" "ref=refs/remotes/origin/main"
assert_contains "$ordinary_root/check.log" "[runtime-services] database 127.0.0.1:$SERVICE_PORT"
assert_contains "$ordinary_root/check.log" "media=${ordinary_root}-runtime/shared/media"
assert_contains "$ordinary_root/check.log" "preflight check passed; no release was created or activated"
assert_not_contains "$ordinary_root/check.log" "mysql://"
assert_not_contains "$ordinary_root/check.log" "password"
assert_not_contains "$ordinary_root/check.log" "ordinary-test-secret"
assert_contains "$SCRIPT_DIR/deploy.sh" "/opt/runtime/NodeJS/node-v*-linux-x64/bin/node"
assert_contains "$SCRIPT_DIR/deploy.sh" "/opt/middleware/Mysql/mysql/bin/mysqldump"
assert_contains "$SCRIPT_DIR/../.gitignore" "/*.zip"

dirty_case="$(prepare_case dirty-source)"
dirty_status=$' M scripts/deploy.sh\n?? release-bundle.zip\n'
dirty_summary=$' mode change 100644 => 100755 scripts/deploy.sh\n'
if run_deploy "$dirty_case" --check "TEST_GIT_STATUS=$dirty_status" "TEST_GIT_DIFF_SUMMARY=$dirty_summary" >"$dirty_case/check.log" 2>&1; then
  fail "dirty source scenario unexpectedly passed"
fi
assert_contains "$dirty_case/check.log" "production source tree is dirty during preflight (2 entries)"
assert_contains "$dirty_case/check.log" " M scripts/deploy.sh"
assert_contains "$dirty_case/check.log" "?? release-bundle.zip"
assert_contains "$dirty_case/check.log" "tracked script mode changes detected"
assert_contains "$dirty_case/check.log" "find scripts -maxdepth 1 -type f -exec chmod 0644 {} +"
assert_contains "$dirty_case/check.log" "untracked paths detected"
assert_contains "$dirty_case/check.log" "no stash, reset, checkout, or deletion was performed"
assert_current_is_old "$dirty_case"
[[ ! -e "$dirty_case/backup.marker" ]] || fail "dirty source reached the database backup step"

pm2_banner=$'-------------\n[PM2] Runtime Edition\n6.7.1'
if ! run_deploy "$success_case" "TEST_PM2_VERSION=$pm2_banner" >"$success_case/deploy.log" 2>&1; then
  cat -- "$success_case/deploy.log" >&2
  fail "successful deployment scenario failed"
fi
new_target="$(readlink -f -- "$success_case/app/current")"
[[ "$new_target" != "$success_case/app/releases/old-release" ]] || fail "successful deployment did not switch releases"
[[ -d "$new_target" && -L "$new_target/.env" ]] || fail "successful release or env symlink is missing"
[[ "$(readlink -f -- "$new_target/.env")" == "$success_case/project.env" ]] || fail "release env symlink is wrong"
[[ -f "$success_case/backup.marker" ]] || fail "database backup step was not executed"
[[ ! -e "$success_case/pwned" ]] || fail "non-whitelisted env content was executed"
assert_contains "$success_case/deploy.log" "is active and healthy"
assert_contains "$success_case/deploy.log" "command pm2 ->"
assert_contains "$success_case/deploy.log" "(6.7.1)"
assert_not_contains "$success_case/deploy.log" "(-------------)"
assert_contains "$success_case/commands.log" "pm2 save"
assert_not_contains "$success_case/commands.log" "systemctl start"
host_snapshot="$(find "$success_case/app/shared/host-snapshots" -maxdepth 1 -type f -name '*-host-*.json' -print -quit)"
[[ -n "$host_snapshot" ]] || fail "successful deployment did not persist a host snapshot"
node --input-type=module - "$host_snapshot" <<'NODE'
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const snapshot = JSON.parse(readFileSync(process.argv[2], "utf8"));
assert.equal(snapshot.ok, true);
assert.equal(snapshot.identity.projectName, "success");
assert.notEqual(snapshot.identity.packageName, snapshot.identity.projectName);
assert.equal(snapshot.services[0].properties.ActiveState, "active");
assert.ok(snapshot.commands.every((entry) => entry.path && entry.versionOutput && entry.versionLine));
const pm2 = snapshot.commands.find((entry) => entry.name === "pm2");
assert.equal(pm2.versionLine, "6.7.1");
assert.match(pm2.versionOutput, /-------------/);
NODE

pm2_failure_case="$(prepare_case pm2-failure)"
if run_deploy "$pm2_failure_case" TEST_FAIL_PM2_NEW=1 >"$pm2_failure_case/deploy.log" 2>&1; then
  fail "PM2 activation failure unexpectedly succeeded"
fi
assert_current_is_old "$pm2_failure_case"
assert_contains "$pm2_failure_case/deploy.log" "was rolled back"
[[ "$(find "$pm2_failure_case/app/releases" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')" == "2" ]] \
  || fail "failed PM2 release was not preserved"
assert_contains "$pm2_failure_case/deploy.log" "failed release preserved for diagnosis"

health_failure_case="$(prepare_case health-failure)"
if run_deploy "$health_failure_case" TEST_FAIL_HEALTH_NEW=1 >"$health_failure_case/deploy.log" 2>&1; then
  fail "health failure unexpectedly succeeded"
fi
assert_current_is_old "$health_failure_case"
assert_contains "$health_failure_case/deploy.log" "release-aware health check did not pass"
assert_contains "$health_failure_case/deploy.log" "was rolled back"
assert_contains "$health_failure_case/deploy.log" "health attempt 1/"
assert_contains "$health_failure_case/deploy.log" "http=503"
assert_contains "$health_failure_case/deploy.log" "cron=failed"
assert_contains "$health_failure_case/deploy.log" "bootstrap failed fixture-env-loader"
health_diagnostic="$(find "$health_failure_case/app/shared/deploy-logs" -maxdepth 1 -type f -name '*-health.json' -print -quit)"
pm2_diagnostic="$(find "$health_failure_case/app/shared/deploy-logs" -maxdepth 1 -type f -name '*-pm2.log' -print -quit)"
[[ -s "$health_diagnostic" && -s "$pm2_diagnostic" ]] || fail "activation diagnostics were not persisted"

collision_case="$(prepare_case collision)"
outside="$TEST_ROOT/unrelated"
mkdir -p -- "$outside"
outside_process_cwd="$outside"
if command -v cygpath >/dev/null 2>&1; then outside_process_cwd="$(cygpath -m "$outside")"; fi
printf '[{"name":"collision-web","pm2_env":{"pm_cwd":"%s","status":"online","APP_RELEASE_ID":"foreign"}}]\n' "$outside_process_cwd" >"$collision_case/pm2-state.json"
if run_deploy "$collision_case" --check >"$collision_case/check.log" 2>&1; then
  fail "foreign PM2 ownership unexpectedly passed"
fi
assert_contains "$collision_case/check.log" "belongs to a different cwd"

first_success_case="$(prepare_case first-success)"
rm -- "$first_success_case/app/current"
printf '[]\n' >"$first_success_case/pm2-state.json"
if ! run_deploy "$first_success_case" >"$first_success_case/deploy.log" 2>&1; then
  cat -- "$first_success_case/deploy.log" >&2
  fail "first deployment success scenario failed"
fi
[[ -L "$first_success_case/app/current" ]] || fail "first deployment did not create current symlink"
assert_contains "$first_success_case/deploy.log" "is active and healthy"

first_failure_case="$(prepare_case first-failure)"
rm -- "$first_failure_case/app/current"
printf '[]\n' >"$first_failure_case/pm2-state.json"
if run_deploy "$first_failure_case" TEST_FAIL_PM2_NEW=1 >"$first_failure_case/deploy.log" 2>&1; then
  fail "first deployment PM2 failure unexpectedly succeeded"
fi
[[ ! -e "$first_failure_case/app/current" && ! -L "$first_failure_case/app/current" ]] \
  || fail "failed first deployment left a current link"
assert_contains "$first_failure_case/deploy.log" "first release activation failed and no previous release exists"
[[ "$(tr -d '[:space:]' <"$first_failure_case/pm2-state.json")" == "[]" ]] \
  || fail "failed first deployment left project PM2 apps"
[[ "$(find "$first_failure_case/app/releases" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')" == "2" ]] \
  || fail "failed first release was not preserved"
assert_contains "$first_failure_case/deploy.log" "failed release preserved for diagnosis"

version_case="$(prepare_case version-mismatch)"
if run_deploy "$version_case" TEST_PM2_VERSION=5.0.0 >"$version_case/deploy.log" 2>&1; then
  fail "incompatible PM2 version unexpectedly deployed"
fi
assert_current_is_old "$version_case"
assert_contains "$version_case/deploy.log" "pm2 version does not match"
assert_contains "$version_case/deploy.log" "host command/version/service verification failed before deployment"
[[ ! -e "$version_case/backup.marker" ]] || fail "version mismatch reached database backup"
version_snapshot="$(find "$version_case/app/shared/host-snapshots" -maxdepth 1 -type f -name '*-host-*.json' -print -quit)"
[[ -n "$version_snapshot" ]] || fail "version mismatch did not persist a host snapshot"
node --input-type=module - "$version_snapshot" <<'NODE'
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const snapshot = JSON.parse(readFileSync(process.argv[2], "utf8"));
assert.equal(snapshot.ok, false);
assert.ok(snapshot.errors.some((message) => message.includes("pm2 version does not match")));
NODE

pid_case="$(prepare_case pid-mismatch)"
printf '999999\n' >"$pid_case/mysql.pid"
if run_deploy "$pid_case" >"$pid_case/deploy.log" 2>&1; then
  fail "mismatched service PID file unexpectedly deployed"
fi
assert_current_is_old "$pid_case"
assert_contains "$pid_case/deploy.log" "PID file"
[[ ! -e "$pid_case/backup.marker" ]] || fail "PID mismatch reached database backup"

lock_case="$(prepare_case lock-missing)"
rm -- "$lock_case/mysql.lock"
if run_deploy "$lock_case" >"$lock_case/deploy.log" 2>&1; then
  fail "missing service lock file unexpectedly deployed"
fi
assert_current_is_old "$lock_case"
assert_contains "$lock_case/deploy.log" "lock file is missing"

cwd_case="$(prepare_case cwd-mismatch)"
if (cd -- "$TEST_ROOT" && bash "$cwd_case/app/source/scripts/deploy.sh" --env-file "$cwd_case/project.env") \
  >"$cwd_case/deploy.log" 2>&1; then
  fail "deployment from a different pwd unexpectedly passed"
fi
assert_contains "$cwd_case/deploy.log" "run deployment from its project root"
assert_current_is_old "$cwd_case"

stop_case="$(prepare_case stop-safe)"
if ! run_stop "$stop_case" >"$stop_case/stop.log" 2>&1; then
  cat -- "$stop_case/stop.log" >&2
  fail "safe stop scenario failed"
fi
assert_current_is_old "$stop_case"
assert_contains "$stop_case/commands.log" "pm2 stop stop-safe-web stop-safe-cron"
assert_contains "$stop_case/stop.log" "no unrelated process or port was touched"
assert_not_contains "$stop_case/commands.log" "fuser"
printf '[test-deploy] PASS: ordinary .env auto-discovery, pwd/source identity, renamed projects, command versions, runtime/systemd evidence, activation, rollback, and PM2 ownership\n'
