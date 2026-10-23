import { acquireComposeLock } from "./compose-lock.mjs";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createManager, parseArguments } from "./compose.mjs";
import { resolveServices } from "./compose-services.mjs";
import { probeOcr } from "../docker/probe-ocr.mjs";
import { parseComposeModel } from "./compose-runtime.mjs";

const fixtures = [];
afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture({ failure, emptyDump = false, version = "2.30.0", running = "mysql\nredis\nweb\ncron\n", containerStates, psFormat = "array", invalidSecret = false, entryFailure = false, storageMode, daemonMiB = 8192, oldLimits = false, environment = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), "wzywt compose test "));
  fixtures.push(root);
  copyFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../.env.docker.example"), join(root, ".env.docker.example"));
  writeFileSync(join(root, ".env.docker"), "# credentials supplied by mocked Compose model\n");
  const calls = [];
  const logs = [];
  const model = {
    name: "wzywt", services: {
      mysql: { environment: { MYSQL_DATABASE: "wzywt", MYSQL_USER: "wzywt", MYSQL_PASSWORD: "a".repeat(64), MYSQL_ROOT_PASSWORD: "b".repeat(64) } },
      web: { environment: { SESSION_SECRET: invalidSecret ? "short" : "c".repeat(64), PUBLIC_ORIGIN: "http://localhost:8001", DEPLOY_ENVIRONMENT: "local", MATCH_OCR_ENDPOINT: "", MATCH_OCR_INTERNAL_HOST: "ocr", MATCH_OCR_TOKEN: "d".repeat(64) } },
      ocr: { environment: { OCR_TOKEN: "d".repeat(64) } },
    },
  };
  const limits = { mysql: [1024, 1, 256], redis: [768, 0.5, 128], web: [1024, 2, 256], cron: [768, 1, 128],
    ocr: [2048, 2, 128], migrate: [512, 1, 128], "storage-init": [128, 0.5, 64], "mysql-client": [256, 1, 64] };
  for (const [name, [memory, cpus, pids_limit]] of Object.entries(limits)) {
    model.services[name] ||= { environment: {} };
    Object.assign(model.services[name], { mem_limit: memory * 1_048_576, cpus, pids_limit });
  }
  model.services.mysql.command = ["mysqld", "--innodb-buffer-pool-size=256M", "--max-connections=50"];
  model.services.redis.command = ["redis-server", "--maxmemory", "256mb"];
  const startedDatastores = new Set();
  if (storageMode === "rclone") {
    writeFileSync(join(root, ".env.docker"), "STORAGE_MODE=rclone\nOSS_MOUNT_PATH=/mnt/oss\n");
    for (const service of ["web", "cron", "storage-init"]) {
      model.services[service] ||= { environment: {} };
      model.services[service].volumes = [["media", "/app/data/media"], ["heroes/images", "/app/public/heroes/images"], ["heroes/skins", "/app/public/heroes/skins"]].map(([part, target]) => ({
        type: "bind", source: `/mnt/oss/wzywt/${part}`, target, read_only: service === "web" && part !== "media", bind: { create_host_path: false },
      }));
    }
    Object.assign(model.services["storage-init"], { user: "1000:1000", environment: { STORAGE_MANAGE_PERMISSIONS: "0" } });
  }
  const run = (args, options) => {
    const index = args.indexOf("-f");
    let command = index < 0 ? args : args.slice(index + 2);
    while (command[0] === "-f") command = command.slice(2);
    while (command[0] === "--profile") command = command.slice(2);
    calls.push({ args, command, options });
    if (failure?.(command)) throw new Error("simulated Docker failure");
    if (args[0] === "compose" && args[1] === "version") return version;
    if (args[0] === "info" && args.includes("{{.MemTotal}}")) return String(daemonMiB * 1_048_576);
    if (args[0] === "info" && args.includes("{{.ID}}")) return root;
    if (args[0] === "inspect" && args.includes("{{.Image}}")) return "sha256:fixture-image";
    if (args[0] === "inspect") {
      const service = model.services[args[1]];
      return JSON.stringify({ Memory: oldLimits ? 0 : service.mem_limit, NanoCpus: oldLimits ? 0 : service.cpus * 1e9, PidsLimit: oldLimits ? 0 : service.pids_limit });
    }
    if (args[0] === "context") return "unix:///var/run/docker.sock";
    if (command.join(" ") === "config --format json") return JSON.stringify(model);
    if (command[0] === "up") for (const name of ["mysql", "redis"]) if (command.includes(name)) startedDatastores.add(name);
    if (command[0] === "ps" && command.includes("--format")) {
      const states = [...(containerStates || running.trim().split(/\r?\n/).filter(Boolean).map((Service) => ({ Service, State: "running" })))];
      for (const name of startedDatastores) if (!states.some(row => row.Service === name)) states.push({ Service: name, State: "running" });
      const identified = states.map(row => ({ ID: row.Service, ...row }));
      return psFormat === "ndjson" ? identified.map((row) => JSON.stringify(row)).join("\n") : JSON.stringify(identified);
    }
    if (options.outputFile) writeFileSync(options.outputFile, command.some(value => value.includes("mysqldump")) && emptyDump ? "" : "successful backup payload\n");
    return "";
  };
  const manage = createManager({ root, run, environment, ...(storageMode ? {
    checkMount: () => calls.push({ command: ["check-mount"], args: [], options: {} }),
    prepare: () => calls.push({ command: ["prepare-storage"], args: [], options: {} }),
  } : {}), log: (message) => logs.push(message), verifyEntry: async (origin, release) => {
    calls.push({ args: [], command: ["verify-entry", origin, release], options: {} });
    if (entryFailure) throw new Error("desktop/mobile entry mismatch");
  } });
  return { root, manage: (...args) => manage(parseArguments(args)), calls, logs, model };
}

const commands = (calls) => calls.map(({ command }) => command.join(" "));
function submittedRuntime(calls) {
  const call = calls.find(({ options }) => options.input !== undefined);
  assert.ok(call, "expected the manager to submit the runtime override through stdin");
  return parseComposeModel(call.options.input);
}
const resumeCommand = "up -d --no-deps --no-recreate --no-build --pull never --wait --wait-timeout 180";
function manifest(root) {
  const backups = join(root, "data/docker-backups");
  return join(backups, readdirSync(backups)[0], "manifest.json");
}

test("init creates independent random secrets and refuses to overwrite existing credentials", async () => {
  const f = fixture();
  rmSync(join(f.root, ".env.docker"));
  await f.manage("init", "--ocr");
  const contents = readFileSync(join(f.root, ".env.docker"), "utf8");
  assert.doesNotMatch(contents, /__GENERATE_/);
  assert.match(contents, /^MATCH_OCR_ENDPOINT=http:\/\/ocr:8010\/recognize$/m);
  const secrets = [...contents.matchAll(/^(?:MYSQL_PASSWORD|MYSQL_ROOT_PASSWORD|SESSION_SECRET|MATCH_OCR_TOKEN)=([a-f0-9]{64})$/gm)].map((match) => match[1]);
  assert.equal(secrets.length, 4);
  assert.equal(new Set(secrets).size, 4);
  await assert.rejects(f.manage("init"), /already exists/);
  assert.equal(readFileSync(join(f.root, ".env.docker"), "utf8"), contents);
  assert.equal(f.calls.length, 0);
});

test("init reuses persisted shared secrets without copying or changing them", async () => {
  const f = fixture();
  const shared = "SESSION_SECRET=persisted-session-secret-more-than-32-characters\nMATCH_OCR_TOKEN=persisted-ocr-token-more-than-32-characters\n";
  writeFileSync(join(f.root, ".env"), shared);
  rmSync(join(f.root, ".env.docker"));
  await f.manage("init");
  const contents = readFileSync(join(f.root, ".env.docker"), "utf8");
  assert.doesNotMatch(contents, /^(?:SESSION_SECRET|MATCH_OCR_TOKEN)=/m);
  assert.doesNotMatch(contents, /persisted-session-secret|persisted-ocr-token/);
  assert.match(contents, /^MYSQL_PASSWORD=[a-f0-9]{64}$/m);
  assert.match(contents, /^MYSQL_ROOT_PASSWORD=[a-f0-9]{64}$/m);
  assert.equal(readFileSync(join(f.root, ".env"), "utf8"), shared);
  await f.manage("check");
  const app = submittedRuntime(f.calls).services.web.environment;
  assert.equal(app.SESSION_SECRET, "persisted-session-secret-more-than-32-characters");
  assert.equal(app.MATCH_OCR_TOKEN, "persisted-ocr-token-more-than-32-characters");
  assert.ok(f.logs.every(message => !message.includes("persisted-")));
});

test("init persists missing or empty shared secrets even when the process temporarily supplies them", async () => {
  for (const shared of [undefined, "SESSION_SECRET=\nMATCH_OCR_TOKEN=\n", "SESSION_SECRET=persisted-session-secret-more-than-32-characters\n"]) {
    const environment = { SESSION_SECRET: "temporary-session-secret-more-than-32-characters", MATCH_OCR_TOKEN: "temporary-ocr-token-more-than-32-characters" };
    const f = fixture({ environment });
    if (shared !== undefined) writeFileSync(join(f.root, ".env"), shared);
    rmSync(join(f.root, ".env.docker"));
    await f.manage("init");
    const contents = readFileSync(join(f.root, ".env.docker"), "utf8");
    const session = contents.match(/^SESSION_SECRET=([a-f0-9]{64})$/m)?.[1];
    const token = contents.match(/^MATCH_OCR_TOKEN=([a-f0-9]{64})$/m)?.[1];
    if (shared?.includes("persisted-session")) assert.equal(session, undefined);
    else assert.equal(session?.length, 64);
    assert.equal(token?.length, 64);
    assert.doesNotMatch(contents, /temporary-session-secret|temporary-ocr-token/);
    delete environment.SESSION_SECRET;
    delete environment.MATCH_OCR_TOKEN;
    await f.manage("check");
    const app = submittedRuntime(f.calls).services.web.environment;
    assert.equal(app.SESSION_SECRET, session || "persisted-session-secret-more-than-32-characters");
    assert.equal(app.MATCH_OCR_TOKEN, token);
  }
});

test("init with OCR replaces a persisted native endpoint with the internal container endpoint", async () => {
  const f = fixture();
  const shared = "SESSION_SECRET=persisted-session-secret-more-than-32-characters\nMATCH_OCR_TOKEN=persisted-ocr-token-more-than-32-characters\nMATCH_OCR_ENDPOINT=http://127.0.0.1:8010/recognize\nMATCH_OCR_INTERNAL_HOST=native-ocr\n";
  writeFileSync(join(f.root, ".env"), shared);
  rmSync(join(f.root, ".env.docker"));
  await f.manage("init", "--ocr");
  const contents = readFileSync(join(f.root, ".env.docker"), "utf8");
  assert.match(contents, /^OCR_MODE=container$/m);
  assert.match(contents, /^MATCH_OCR_ENDPOINT=http:\/\/ocr:8010\/recognize$/m);
  assert.doesNotMatch(contents, /^(?:SESSION_SECRET|MATCH_OCR_TOKEN)=/m);
  f.model.services.web.environment.MATCH_OCR_ENDPOINT = "http://ocr:8010/recognize";
  await f.manage("check");
  const runtime = submittedRuntime(f.calls);
  assert.equal(runtime.services.web.environment.MATCH_OCR_ENDPOINT, "http://ocr:8010/recognize");
  assert.equal(runtime.services.web.environment.MATCH_OCR_INTERNAL_HOST, "ocr");
  assert.equal(runtime.services.ocr.environment.OCR_TOKEN, "persisted-ocr-token-more-than-32-characters");
  assert.equal(readFileSync(join(f.root, ".env"), "utf8"), shared);
});

test("argument parser rejects accidental destructive flags and malformed options", () => {
  assert.throws(() => parseArguments(["down", "--volumes"]), /Unknown argument/);
  assert.throws(() => parseArguments(["up", "--env-file"]), /requires a path/);
  assert.throws(() => parseArguments(["logs", "unknown-service"]), /Unknown argument/);
});

test("native migration arguments separate source configuration and require explicit stopped writers", () => {
  for (const args of [["export-native"], ["export-native", "--backup-dir", "snapshots"],
    ["export-native", "--writers-stopped"], ["import-native"], ["up", "--from-backup", "snapshot"],
    ["export-native", "--env-file", "wrong.env"], ["export-native", "--ocr"]]) assert.throws(() => parseArguments(args));
  const source = parseArguments(["export-native", "--source-root", "old site", "--source-env", "native.env", "--source-media", "uploads",
    "--source-avatars", "avatars", "--backup-dir", "snapshots", "--writers-stopped"]);
  assert.equal(source.sourceRoot, "old site"); assert.equal(source.sourceEnv, "native.env"); assert.equal(source.writersStopped, true);
  assert.equal(parseArguments(["import-native", "--from-backup", "snapshot", "--env-file", "target.env"]).envFile, "target.env");
});

test("build prepares images before native downtime without starting or stopping anything", async () => {
  const f = fixture(); await f.manage("build");
  assert.ok(commands(f.calls).includes("build web cron migrate storage-init"));
  assert.ok(!commands(f.calls).some(command => /^(run|up|stop|down|exec) /.test(command)));
});

test("incomplete native import blocks normal deployment before schema migration or activation", async () => {
  const f = fixture({ failure: command => command.includes("docker/native-migration.mjs") && command.at(-1) === "guard" });
  await assert.rejects(f.manage("up"), /simulated/);
  assert.ok(!commands(f.calls).includes("run --rm --no-deps migrate"));
  assert.ok(!commands(f.calls).some(command => command.startsWith("up -d --no-deps")));
});

test("missing media after migration blocks activation and leaves a verification report with writers stopped", async () => {
  const f = fixture({ failure: command => command.includes("docker/native-migration.mjs") && command.includes("audit") });
  await assert.rejects(f.manage("update"), /Deployment stopped after migration began/);
  assert.ok(commands(f.calls).includes("run --rm --no-deps migrate"));
  assert.ok(!commands(f.calls).some(command => command.startsWith("up -d --no-deps")));
  assert.equal(commands(f.calls).at(-1), "stop web cron");
  assert.ok(f.calls.some(({ command, options }) => command.includes("audit") && options.outputFile.endsWith("media-verification.json")));
});

test("the manager inherits shared application settings from the root env through stdin", async () => {
  const f = fixture();
  const secret = 'fixture$session:${HOME} # "quoted"-more-than-32-characters';
  const shared = `SESSION_SECRET='${secret}'\nPUBLIC_ORIGIN=http://192.168.1.20:8001\nDEPLOY_ENVIRONMENT=local\nSESSION_COOKIE_SECURE=0\nHEALTH_DETAILS_TOKEN=fixture-health-token\nMATCH_OCR_ENDPOINT=http://host-machine:8011/recognize\nMATCH_OCR_TOKEN=fixture-ocr-token\nRESOURCE_EXTERNAL_RPS=9\nSPLIT_WORKER_HEAP_MB=96\nMEDIA_USER_STORED_QUOTA_BYTES=0\nCOMBAT_VIDEO_MAX_SIZE_MB=123\nTRUST_PROXY=0\nTZ=UTC\n`;
  writeFileSync(join(f.root, ".env"), shared);
  await f.manage("check");
  const runtime = submittedRuntime(f.calls);
  for (const role of ["web", "cron"]) {
    const app = runtime.services[role].environment;
    assert.equal(app.SESSION_SECRET, secret);
    assert.equal(app.PUBLIC_ORIGIN, "http://192.168.1.20:8001");
    assert.equal(app.DEPLOY_ENVIRONMENT, "local");
    assert.equal(app.SESSION_COOKIE_SECURE, "0");
    assert.equal(app.HEALTH_DETAILS_TOKEN, "fixture-health-token");
    assert.equal(app.MATCH_OCR_ENDPOINT, "http://host-machine:8011/recognize");
    assert.equal(app.MATCH_OCR_TOKEN, "fixture-ocr-token");
    assert.equal(app.RESOURCE_EXTERNAL_RPS, "9");
    assert.equal(app.SPLIT_WORKER_HEAP_MB, "96");
    assert.equal(app.MEDIA_USER_STORED_QUOTA_BYTES, "0");
    assert.equal(app.COMBAT_VIDEO_MAX_SIZE_MB, "123");
    assert.equal(app.TRUST_PROXY, "0");
    assert.equal(app.TZ, "UTC");
  }
  assert.equal(runtime.services.migrate.environment.TZ, "UTC");
  assert.equal(runtime.services.migrate.environment.SESSION_SECRET, undefined);
  assert.equal(runtime.services.migrate.environment.HEALTH_DETAILS_TOKEN, undefined);
  assert.equal(runtime.services.ocr.environment.OCR_TOKEN, "fixture-ocr-token");
  assert.equal(readFileSync(join(f.root, ".env"), "utf8"), shared);
  assert.ok(f.calls.every(call => call.args.every(arg => !arg.includes(secret))));
  assert.ok(f.logs.every(message => !message.includes(secret)));
});

test("existing Docker settings and explicit empty assignments override shared values", async () => {
  const f = fixture();
  writeFileSync(join(f.root, ".env"), "SESSION_SECRET=shared-session-secret-more-than-32-characters\nPUBLIC_ORIGIN=http://192.168.1.20:8001\nRESOURCE_EXTERNAL_RPS=9\nSESSION_COOKIE_SECURE=1\nMATCH_OCR_ENDPOINT=http://host-machine:8011/recognize\nMATCH_OCR_TOKEN=shared-ocr-token\nMEDIA_USER_STORED_QUOTA_BYTES=0\n");
  writeFileSync(join(f.root, ".env.docker"), "SESSION_SECRET=existing-docker-secret-more-than-32-characters\nPUBLIC_ORIGIN=http://192.168.1.30:8001\nRESOURCE_EXTERNAL_RPS=12\nSESSION_COOKIE_SECURE=\nMATCH_OCR_ENDPOINT=\nMATCH_OCR_TOKEN=\nMEDIA_USER_STORED_QUOTA_BYTES=\n");
  await f.manage("check");
  const app = submittedRuntime(f.calls).services.web.environment;
  assert.equal(app.SESSION_SECRET, "existing-docker-secret-more-than-32-characters");
  assert.equal(app.PUBLIC_ORIGIN, "http://192.168.1.30:8001");
  assert.equal(app.RESOURCE_EXTERNAL_RPS, "12");
  assert.equal(app.SESSION_COOKIE_SECURE, "");
  assert.equal(app.MATCH_OCR_ENDPOINT, "");
  assert.equal(app.MATCH_OCR_TOKEN, "");
  assert.equal(app.MEDIA_USER_STORED_QUOTA_BYTES, "");
  assert.ok(f.logs.some(message => message.includes("OCR=off")));
});

test("explicit process values override both env files including an empty OCR endpoint", async () => {
  const f = fixture({ environment: { SESSION_SECRET: "process-session-secret-more-than-32-characters", PUBLIC_ORIGIN: "http://192.168.1.40:8001", RESOURCE_EXTERNAL_RPS: "7", MATCH_OCR_ENDPOINT: "" } });
  writeFileSync(join(f.root, ".env"), "SESSION_SECRET=shared-session-secret-more-than-32-characters\nPUBLIC_ORIGIN=http://192.168.1.20:8001\nRESOURCE_EXTERNAL_RPS=9\nMATCH_OCR_ENDPOINT=http://host-machine:8011/recognize\n");
  writeFileSync(join(f.root, ".env.docker"), "SESSION_SECRET=docker-session-secret-more-than-32-characters\nPUBLIC_ORIGIN=http://192.168.1.30:8001\nRESOURCE_EXTERNAL_RPS=12\nMATCH_OCR_ENDPOINT=http://host-machine:8012/recognize\n");
  await f.manage("check");
  const app = submittedRuntime(f.calls).services.web.environment;
  assert.equal(app.SESSION_SECRET, "process-session-secret-more-than-32-characters");
  assert.equal(app.PUBLIC_ORIGIN, "http://192.168.1.40:8001");
  assert.equal(app.RESOURCE_EXTERNAL_RPS, "7");
  assert.equal(app.MATCH_OCR_ENDPOINT, "");
  assert.ok(f.logs.some(message => message.includes("OCR=off")));
});

test("shared native infrastructure and host paths cannot change container bindings or Compose interpolation", async () => {
  const f = fixture();
  const native = {
    DATABASE_URL: "mysql://native:host-password@127.0.0.1/native_db", MYSQL_MODE: "external", MYSQL_HOST: "127.0.0.1", MYSQL_PORT: "3307",
    MYSQL_USER: "native_user", MYSQL_PASSWORD: "native-password", MYSQL_ROOT_PASSWORD: "native-root-password", MYSQL_DATABASE: "native_db",
    REDIS_URL: "redis://127.0.0.1:6380", REDIS_REQUIRED: "0", HOST: "127.0.0.1", PORT: "9001", BIND_ADDRESS: "127.0.0.1",
    MEDIA_STORAGE_DIR: "/host/media", AVATAR_DIR: "/host/avatars", FFMPEG_BIN: "/host/bin/ffmpeg", COMPOSE_PROJECT_NAME: "native-project",
    APP_RELEASE_ID: "native-release", WEB_MEMORY_LIMIT: "128m", NODE_IMAGE: "native-node:latest", STORAGE_MODE: "rclone", OSS_MOUNT_PATH: "/host/oss",
  };
  writeFileSync(join(f.root, ".env"), Object.entries(native).map(([key, value]) => `${key}=${value}`).join("\n") + "\n");
  await f.manage("check");
  const runtime = submittedRuntime(f.calls);
  const app = runtime.services.web.environment;
  assert.equal(app.DATABASE_URL, undefined);
  assert.equal(app.MYSQL_HOST, "mysql");
  assert.equal(app.MYSQL_PORT, "3306");
  assert.equal(app.MYSQL_USER, "wzywt");
  assert.equal(app.MYSQL_DATABASE, "wzywt");
  assert.equal(app.MYSQL_PASSWORD, undefined);
  assert.equal(runtime.services.mysql.environment.MYSQL_ROOT_PASSWORD, "");
  assert.equal(app.REDIS_URL, "redis://redis:6379/0");
  assert.equal(app.REDIS_REQUIRED, "1");
  assert.equal(app.HOST, "0.0.0.0");
  assert.equal(app.PORT, "8001");
  assert.equal(app.MEDIA_STORAGE_DIR, "/app/data/media");
  assert.equal(app.AVATAR_DIR, "/app/data/media/avatars");
  assert.equal(app.FFMPEG_BIN, undefined);
  assert.equal(app.APP_RELEASE_ID, "local");
  assert.equal(app.STORAGE_MODE, "volume");
  assert.equal(runtime.services.web.mem_limit, "1g");
  for (const call of f.calls.filter(({ options }) => options.input !== undefined)) {
    for (const [key, value] of Object.entries(native)) {
      assert.notEqual(call.options.environment[key], value, `${key} must not be inherited into the Docker process`);
    }
  }
});

test("custom env file feeds one stdin override through validation, deployment and backup streams", async () => {
  const f = fixture();
  const secret = 'fixture$secret:${HOME} # "quoted"';
  const directory = join(f.root, "deployment settings");
  mkdirSync(directory);
  const file = join(directory, "selected.env");
  writeFileSync(join(f.root, ".env"), "PUBLIC_ORIGIN=http://192.168.1.20:8001\nRESOURCE_EXTERNAL_RPS=9\nSESSION_SECRET=shared-session-secret-more-than-32-characters\n");
  writeFileSync(join(directory, ".env"), "PUBLIC_ORIGIN=http://192.168.1.99:8001\nSESSION_SECRET=wrong-directory-session-secret-more-than-32-characters\n");
  writeFileSync(file, `MYSQL_PASSWORD='${secret}'\nWEB_MEMORY_LIMIT=768m\nRESOURCE_EXTERNAL_RPS=12\n`);
  await f.manage("update", "--env-file", file);
  const calls = f.calls.filter(({ args }) => args[0] === "compose" && args[1] !== "version");
  const input = calls[0].options.input;
  const model = parseComposeModel(input);
  assert.equal(model.services.web.environment.MYSQL_PASSWORD, secret);
  assert.equal(model.services.web.environment.RESOURCE_EXTERNAL_RPS, "12");
  assert.equal(model.services.web.environment.PUBLIC_ORIGIN, "http://192.168.1.20:8001");
  assert.equal(model.services.web.environment.SESSION_SECRET, "shared-session-secret-more-than-32-characters");
  assert.equal(model.services.web.mem_limit, "768m");
  for (const call of calls) {
    assert.ok(call.args.includes(file));
    assert.ok(call.args.some((value, index) => value === "-f" && call.args[index + 1] === "-"));
    assert.equal(call.options.input, input);
    assert.equal(call.options.environment.WZYWT_COMPOSE_MANAGED, "1");
    assert.ok(!call.args.some(value => value.includes(secret)));
  }
  assert.equal(calls.filter(call => call.options.outputFile?.endsWith(".partial")).length, 3);
  assert.equal(calls.filter(call => call.options.outputFile?.endsWith("media-verification.json")).length, 1);
  assert.ok(!f.logs.some(message => message.includes(secret)));
});

test("preflight rejects outdated Compose and invalid secrets before mutation", async () => {
  const old = fixture({ version: "2.19.1" });
  await assert.rejects(old.manage("up"), />=2.20/);
  assert.equal(old.calls.length, 1);
  const invalid = fixture({ invalidSecret: true });
  await assert.rejects(invalid.manage("up"), /SESSION_SECRET/);
  assert.ok(!commands(invalid.calls).some((command) => /^(build|up|stop|run) /.test(command)));
  assert.ok(!existsSync(join(invalid.root, ".cache/compose-deploy.lock")));
});

test("capacity preflight rejects oversubscription before build/stop and includes optional OCR and one-shot jobs", async () => {
  const small = fixture({ daemonMiB: 4_096 });
  await assert.rejects(small.manage("update"), /Memory budget exceeds/);
  assert.ok(!commands(small.calls).some(command => /^(build|up|stop|run) /.test(command)));
  const optional = fixture({ daemonMiB: 6_144 });
  writeFileSync(join(optional.root, ".env.docker"), "OCR_MODE=container\n");
  optional.model.services.web.environment.MATCH_OCR_ENDPOINT = "http://ocr:8010/recognize";
  await assert.rejects(optional.manage("check"), /Memory budget exceeds/);
  const job = fixture({ daemonMiB: 5_120 });
  await assert.rejects(job.manage("sync-heroes"), /Memory budget exceeds/);
  assert.ok(!commands(job.calls).some(command => command.startsWith("run ")));
});

test("data service overhead and existing live limits are checked without recreating datastores", async () => {
  const insufficient = fixture();
  insufficient.model.services.redis.mem_limit = 256 * 1_048_576;
  await assert.rejects(insufficient.manage("update"), /AOF\/process overhead/);
  assert.ok(!commands(insufficient.calls).some(command => command.startsWith("build ")));
  const existing = fixture({ oldLimits: true });
  await assert.rejects(existing.manage("update"), /old or missing container limits/);
  assert.ok(!commands(existing.calls).some(command => command.startsWith("stop ")));
  assert.ok(commands(existing.calls).includes("up -d --no-recreate --wait --wait-timeout 180 mysql redis"));
});

test("capacity headroom includes same-host external services and rejects missing/invalid limits", async () => {
  const external = fixture();
  writeFileSync(join(external.root, ".env.docker"), "COMPOSE_EXTERNAL_MEMORY_MB=4096\n");
  await assert.rejects(external.manage("check"), /Memory budget exceeds/);
  const missing = fixture(); delete missing.model.services.cron.mem_limit;
  await assert.rejects(missing.manage("check"), /cron.mem_limit/);
  const mysql = fixture(); mysql.model.services.mysql.command = ["mysqld", "--innodb-buffer-pool-size=1g", "--max-connections=1000"];
  await assert.rejects(mysql.manage("check"), /MYSQL_MEMORY_LIMIT/);
});

test("the documented smaller fresh-deployment profile fits 4 GiB without removing the reserve", async () => {
  const f = fixture({ daemonMiB: 4096 });
  for (const [name, memory] of Object.entries({ web: 768, cron: 512, mysql: 768, redis: 512 })) f.model.services[name].mem_limit = memory * 1_048_576;
  f.model.services.redis.command = ["redis-server", "--maxmemory", "128mb"];
  await f.manage("check");
  assert.ok(f.logs.some(line => line.includes("4096 MiB / 4096 MiB")));
  assert.ok(!commands(f.calls).some(command => /^(build|up|stop|run) /.test(command)));
});

test("update gates migration on completed SQL and media backups, then waits for app health", async () => {
  const f = fixture();
  await f.manage("update");
  const calls = commands(f.calls);
  const build = calls.findIndex((command) => command.startsWith("build "));
  const stop = calls.indexOf("stop web cron");
  const dump = calls.findIndex((command) => command.startsWith("exec -T mysql"));
  const media = calls.findIndex((command) => command.includes("--entrypoint tar"));
  const migrate = calls.indexOf("run --rm --no-deps migrate");
  const activate = calls.findIndex((command) => command.startsWith("up -d --no-deps --wait"));
  assert.ok(build < stop && stop < dump && dump < media && media < migrate && migrate < activate);
  assert.ok(calls.includes("up -d --no-recreate --wait --wait-timeout 180 mysql redis"));
  assert.ok(calls.indexOf("verify-entry http://localhost:8001 local") > activate);
  assert.equal(JSON.parse(readFileSync(manifest(f.root), "utf8")).complete, true);
  const backup = JSON.parse(readFileSync(manifest(f.root), "utf8"));
  assert.deepEqual(backup.files, ["database.sql", "media.tar.gz", "hero-assets.tar.gz"]);
  assert.equal(backup.remoteUploadVerified, false);
  assert.ok(calls.some(command => command.endsWith("web -C /app/public/heroes -czf - images skins")));
  assert.ok(!calls.some((command) => command.startsWith("start ")));
  assert.ok(!existsSync(join(f.root, ".cache/compose-deploy.lock")));
  assert.ok(!f.calls.some(({ args }) => args.includes("--volumes")));
});

test("desktop/mobile entry failure does not report success and stops application writers", async () => {
  const f = fixture({ entryFailure: true });
  await assert.rejects(f.manage("update"), /desktop\/mobile entry mismatch/);
  assert.equal(commands(f.calls).at(-1), "stop web cron");
  assert.ok(!f.logs.some(message => message.includes("Deployment completed")));
  assert.equal(JSON.parse(readFileSync(manifest(f.root), "utf8")).complete, true);
});

test("origin, cookie and OCR policy errors are rejected before build or downtime", async () => {
  for (const override of [
    { PUBLIC_ORIGIN: "http://localhost:8001/incorrect-path" },
    { PUBLIC_ORIGIN: "https://example.com", SESSION_COOKIE_SECURE: "0" },
    { SESSION_COOKIE_SECURE: "false" },
    { MATCH_OCR_ENDPOINT: "http://untrusted.example/recognize" },
  ]) {
    const f = fixture();
    Object.assign(f.model.services.web.environment, override);
    await assert.rejects(f.manage("update"));
    assert.ok(!commands(f.calls).some((command) => /^(build|up|stop|run) /.test(command)));
  }
});

test("build failure leaves running applications untouched", async () => {
  const f = fixture({ failure: (command) => command[0] === "build" });
  await assert.rejects(f.manage("update"), /simulated/);
  assert.ok(!commands(f.calls).some((command) => /^(up|stop|run) /.test(command)));
});

test("SQL backup failure blocks migration and resumes only previously running writers", async () => {
  const f = fixture({ running: "mysql\nredis\nweb\n", failure: (command) => command[0] === "exec" });
  await assert.rejects(f.manage("update"), /simulated/);
  const calls = commands(f.calls);
  assert.ok(!calls.includes("run --rm --no-deps migrate"));
  assert.ok(calls.includes(`${resumeCommand} web`));
  assert.ok(!existsSync(manifest(f.root)));
});

test("empty backup and media backup failure each block migration", async () => {
  for (const options of [{ emptyDump: true }, { failure: (command) => command.includes("--entrypoint") && command.includes("tar") }]) {
    const f = fixture(options);
    await assert.rejects(f.manage("update"));
    assert.ok(!commands(f.calls).includes("run --rm --no-deps migrate"));
    assert.ok(commands(f.calls).includes(`${resumeCommand} web cron`));
    assert.ok(!existsSync(manifest(f.root)));
  }
});

test("migration failure keeps writers stopped and reports backup location", async () => {
  const f = fixture({ failure: (command) => command.at(-1) === "migrate" && command[0] === "run" });
  await assert.rejects(f.manage("update"), /after migration began.*\n|Backup:/);
  const calls = commands(f.calls);
  assert.ok(!calls.some((command) => command.startsWith("up -d --no-deps") || command.startsWith("start ")));
  assert.equal(calls.at(-1), "stop web cron");
  assert.ok(existsSync(manifest(f.root)));
});

test("activation health failure stops both writers without touching database volumes", async () => {
  const f = fixture({ failure: (command) => command[0] === "up" && command.includes("--no-deps") });
  await assert.rejects(f.manage("up"), /after migration began/);
  assert.equal(commands(f.calls).at(-1), "stop web cron");
  assert.ok(!commands(f.calls).some((command) => command.startsWith("down") || command.startsWith("start ")));
});

test("backup resumes existing containers without rebuilding or migrating", async () => {
  const f = fixture();
  await f.manage("backup", "--backup-dir", "custom backups");
  const calls = commands(f.calls);
  assert.equal(calls.at(-1), `${resumeCommand} web cron`);
  assert.ok(!calls.some((command) => command.startsWith("build ") || command.endsWith(" migrate")));
  assert.equal(readdirSync(join(f.root, "custom backups")).length, 1);
});

test("env backup directory applies to updates and backups; CLI takes precedence", async () => {
  const f = fixture();
  writeFileSync(join(f.root, ".env.docker"), 'COMPOSE_BACKUP_DIR="env backups"\n');
  await f.manage("update");
  assert.equal(readdirSync(join(f.root, "env backups")).length, 1);
  assert.ok(!existsSync(join(f.root, "data/docker-backups")));
  await f.manage("backup", "--backup-dir", "cli backups");
  assert.equal(readdirSync(join(f.root, "cli backups")).length, 1);
});

test("crawler archive failure blocks migration and resumes previous writers", async () => {
  const f = fixture({ failure: command => command.includes("/app/public/heroes") });
  await assert.rejects(f.manage("update"), /simulated/);
  assert.ok(!commands(f.calls).includes("run --rm --no-deps migrate"));
  assert.equal(commands(f.calls).at(-1), `${resumeCommand} web cron`);
  assert.ok(!existsSync(manifest(f.root)));
});

test("missing OSS mount blocks deployment but down remains usable", async () => {
  const f = fixture();
  writeFileSync(join(f.root, ".env.docker"), "STORAGE_MODE=rclone\nOSS_MOUNT_PATH=/mnt/oss\n");
  const run = (args) => {
    f.calls.push({ args, command: args, options: {} });
    if (args[0] === "compose" && args[1] === "version") return "2.30.0";
    if (args[0] === "info" && args.includes("{{.ID}}")) return f.root;
    return "";
  };
  const manage = createManager({ root: f.root, run, environment: {},
    checkMount: () => { throw new Error("OSS mount unavailable"); } });
  await assert.rejects(manage(parseArguments(["update"])), /OSS mount unavailable/);
  assert.ok(!f.calls.some(({ args }) => args.includes("build") || args.includes("stop")));
  await manage(parseArguments(["down"]));
  assert.equal(f.calls.at(-1).args.at(-1), "down");
  assert.ok(f.calls.at(-1).args.includes(join(f.root, "compose.oss.yaml")));
});

test("rclone preflight and hero sync select the overlay and pass derived paths to Compose", async () => {
  const f = fixture({ storageMode: "rclone" });
  await f.manage("check");
  const config = f.calls.find(({ command }) => command.join(" ") === "config --format json");
  assert.ok(config.args.includes(join(f.root, "compose.oss.yaml")));
  assert.equal(config.options.environment.OSS_DATA_PATH, "/mnt/oss/wzywt");
  assert.ok(!commands(f.calls).some(command => /^(build|up|stop|run) /.test(command)));
  await f.manage("sync-heroes");
  const calls = commands(f.calls);
  assert.ok(calls.indexOf("prepare-storage") < calls.indexOf("run --rm --no-deps storage-init"));
  assert.equal(calls.at(-1), "run --rm --no-deps cron sync-heroes");
});

test("backup stops a restarting cron and resumes it, accepting array and NDJSON state output", async () => {
  for (const psFormat of ["array", "ndjson"]) {
    const f = fixture({ psFormat, containerStates: [
      { Service: "mysql", State: "running" },
      { Service: "web", State: "running" },
      { Service: "cron", State: "restarting" },
    ] });
    await f.manage("backup");
    const calls = commands(f.calls);
    assert.ok(calls.indexOf("stop web cron") < calls.findIndex((command) => command.startsWith("exec -T mysql")));
    assert.equal(calls.at(-1), `${resumeCommand} web cron`);
  }
});

test("failed update backup resumes restarting cron but does not start intentionally stopped web", async () => {
  const f = fixture({ failure: (command) => command[0] === "exec", containerStates: [
    { Service: "mysql", State: "running" },
    { Service: "web", State: "exited" },
    { Service: "cron", State: "restarting" },
  ] });
  await assert.rejects(f.manage("update"), /simulated/);
  const calls = commands(f.calls);
  assert.ok(calls.includes("stop web cron"));
  assert.equal(calls.at(-1), `${resumeCommand} cron`);
  assert.ok(!calls.includes("run --rm --no-deps migrate"));
});

test("backup does not start intentionally stopped writers or accept a restarting MySQL", async () => {
  const stopped = fixture({ containerStates: [
    { Service: "mysql", State: "running" },
    { Service: "web", State: "exited" },
    { Service: "cron", State: "exited" },
  ] });
  await stopped.manage("backup");
  assert.ok(commands(stopped.calls).includes("stop web cron"));
  assert.ok(!commands(stopped.calls).some((command) => command.startsWith("up ")));
  const restarting = fixture({ containerStates: [{ Service: "mysql", State: "restarting" }] });
  await assert.rejects(restarting.manage("backup"), /MySQL is not running/);
  assert.ok(!commands(restarting.calls).some((command) => /^(stop|exec|run|up) /.test(command)));
});

test("down preserves volumes and works with credentials that fail update validation", async () => {
  const f = fixture({ invalidSecret: true });
  await f.manage("down");
  assert.equal(commands(f.calls).at(-1), "down");
  const args = f.calls.at(-1).args;
  assert.ok(args.includes("ocr") && args.includes("mysql"));
  assert.ok(!commands(f.calls).includes("config --format json"));
});

test("existing lock prevents concurrent mutation; paths containing spaces stay single arguments", async () => {
  const f = fixture();
  const releaseLock = acquireComposeLock(f.root, "wzywt", "test");
  await assert.rejects(f.manage("update"), /Another operation holds/);
  assert.ok(!commands(f.calls).some((command) => /^(build|up|stop|run) /.test(command)));
  const config = f.calls.find(({ command }) => command[0] === "config");
  assert.ok(config.args.includes(join(f.root, ".env.docker")));
  releaseLock();
});

test("optional OCR requires endpoint and participates only when requested", async () => {
  const f = fixture();
  await assert.rejects(f.manage("up", "--ocr"), /MATCH_OCR_ENDPOINT/);
  f.model.services.web.environment.MATCH_OCR_ENDPOINT = "http://ocr:8010/recognize";
  await f.manage("up", "--ocr");
  assert.ok(commands(f.calls).some((command) => command.startsWith("build ") && command.endsWith(" ocr")));
  assert.ok(commands(f.calls).some((command) => command.startsWith("up -d --no-deps --wait --wait-timeout 600") && command.endsWith(" ocr")));
});

test("optional OCR rejects short or mismatched service tokens before mutation", async () => {
  for (const token of ["x".repeat(16), "x".repeat(64)]) {
    const f = fixture();
    Object.assign(f.model.services.web.environment, { MATCH_OCR_ENDPOINT: "http://ocr:8010/recognize", MATCH_OCR_TOKEN: token });
    await assert.rejects(f.manage("up", "--ocr"), /MATCH_OCR_TOKEN|same OCR token/);
    assert.ok(!commands(f.calls).some((command) => /^(build|up|stop|run) /.test(command)));
  }
});

function externalMysql(f, extra = "") {
  writeFileSync(join(f.root, ".env.docker"), `MYSQL_MODE=external\n${extra}`);
  Object.assign(f.model.services.web.environment, {
    MYSQL_HOST: "host-machine", MYSQL_PORT: "3306", MYSQL_DATABASE: "existing_db",
    MYSQL_USER: "existing_user", MYSQL_PASSWORD: "existing-secret",
  });
  delete f.model.services.mysql;
}

test("service choices preserve legacy selection, derive defaults and allow mixed deployments", () => {
  const choose = (content, options = {}) => resolveServices(content, { environment: {}, ...options });
  assert.equal(choose("").mysql, "container");
  assert.equal(choose("").ocr, "off");
  assert.equal(choose("", { ocr: true }).ocr, "container");
  assert.equal(choose("MATCH_OCR_ENDPOINT=http://ocr:8010/recognize").ocr, "container");
  const selected = choose("MYSQL_MODE=external\nOCR_MODE=external\nMATCH_OCR_ENDPOINT=http://host-machine:8011/recognize");
  assert.equal(selected.environment.MYSQL_HOST, "host-machine");
  assert.equal(selected.environment.MATCH_OCR_INTERNAL_HOST, "host-machine");
  assert.equal(choose("MYSQL_MODE=external\nOCR_MODE=container").ocr, "container");
  assert.equal(choose("MYSQL_MODE=external\nMYSQL_HOST=10.0.0.4\nMYSQL_PORT=3307").environment.MYSQL_PORT, "3307");
  assert.equal(choose("MYSQL_MODE=external", { environment: { MYSQL_MODE: "container" } }).mysql, "container");
  for (const content of ["MYSQL_MODE=typo", "OCR_MODE=typo", "OCR_MODE=external", "OCR_MODE=off\nMATCH_OCR_ENDPOINT=https://ocr.example/recognize",
    "MYSQL_MODE=external\nMYSQL_HOST=localhost", "OCR_MODE=external\nMATCH_OCR_ENDPOINT=http://127.0.0.1:8010/recognize",
    "OCR_MODE=container\nMATCH_OCR_ENDPOINT=https://ocr.example/recognize"]) {
    assert.throws(() => choose(content), undefined, content);
  }
  assert.throws(() => choose("OCR_MODE=external\nMATCH_OCR_ENDPOINT=https://ocr.example/recognize", { ocr: true }), /conflicts/);
});

test("external MySQL checks connectivity before downtime and backs up the selected database without root/server operations", async () => {
  const f = fixture({ running: "redis\nweb\ncron\n" });
  externalMysql(f);
  await f.manage("update");
  const calls = commands(f.calls);
  const probe = calls.findIndex(command => command.includes("SELECT 1"));
  const dump = calls.findIndex(command => command.includes("mysqldump"));
  assert.ok(probe < calls.indexOf("stop web cron") && calls.indexOf("stop web cron") < dump);
  assert.ok(calls[dump].startsWith("run --rm --no-deps -T mysql-client"));
  assert.ok(!calls.some(command => command.includes("MYSQL_ROOT_PASSWORD") || command.startsWith("exec -T mysql")));
  assert.ok(calls.includes("up -d --no-recreate --wait --wait-timeout 180 redis"));
  assert.ok(!f.calls.some(({ args }) => args.includes("--profile") && args.includes("mysql")));
  assert.ok(calls.indexOf("run --rm --no-deps migrate") > dump);
  assert.equal(JSON.parse(readFileSync(manifest(f.root), "utf8")).mysqlMode, "external");
});

test("unreachable external MySQL leaves writers running; dump failure/empty dump blocks migration and resumes writers", async () => {
  const unreachable = fixture({ running: "web\ncron\n", failure: command => command.some(value => value.includes("SELECT 1")) });
  externalMysql(unreachable);
  await assert.rejects(unreachable.manage("update"), /simulated/);
  assert.ok(!commands(unreachable.calls).some(command => command.startsWith("stop ")));
  for (const options of [{ emptyDump: true }, { failure: command => command.some(value => value.includes("mysqldump")) }]) {
    const f = fixture({ running: "web\ncron\n", ...options });
    externalMysql(f);
    await assert.rejects(f.manage("update"));
    assert.ok(!commands(f.calls).includes("run --rm --no-deps migrate"));
    assert.equal(commands(f.calls).at(-1), `${resumeCommand} web cron`);
  }
});

test("explicit container OCR works without repeated flags and external OCR is never built or started", async () => {
  const internal = fixture();
  writeFileSync(join(internal.root, ".env.docker"), "OCR_MODE=container\n");
  internal.model.services.web.environment.MATCH_OCR_ENDPOINT = "http://ocr:8010/recognize";
  await internal.manage("up");
  assert.ok(commands(internal.calls).some(command => command.startsWith("build ") && command.endsWith(" ocr")));
  const external = fixture();
  writeFileSync(join(external.root, ".env.docker"), "OCR_MODE=external\nMATCH_OCR_ENDPOINT=http://host-machine:8011/recognize\n");
  Object.assign(external.model.services.web.environment, {
    MATCH_OCR_ENDPOINT: "http://host-machine:8011/recognize", MATCH_OCR_INTERNAL_HOST: "host-machine",
  });
  await external.manage("update");
  const calls = commands(external.calls);
  assert.ok(calls.findIndex(command => command.endsWith("docker/probe-ocr.mjs")) < calls.indexOf("stop web cron"));
  assert.ok(!calls.some(command => /^(build|up).* ocr$/.test(command)));
});

test("external OCR preflight failure stops deployment before writer downtime", async () => {
  const f = fixture({ failure: command => command.includes("docker/probe-ocr.mjs") });
  externalMysql(f, "OCR_MODE=external\nMATCH_OCR_ENDPOINT=http://host-machine:8011/recognize\n");
  Object.assign(f.model.services.web.environment, { MATCH_OCR_ENDPOINT: "http://host-machine:8011/recognize", MATCH_OCR_INTERNAL_HOST: "host-machine" });
  await assert.rejects(f.manage("update"), /simulated/);
  assert.ok(!commands(f.calls).some(command => command.startsWith("stop ")));
});

test("maintenance commands remain available with an invalid external endpoint or conflicting OCR flag", async () => {
  for (const action of ["status", "logs", "down"]) {
    const f = fixture();
    writeFileSync(join(f.root, ".env.docker"), "OCR_MODE=external\nMATCH_OCR_ENDPOINT=invalid\nMYSQL_MODE=external\nMYSQL_HOST=localhost\nRESOURCE_EXTERNAL_CONCURRENCY=invalid\n");
    await f.manage(action, "--ocr");
    assert.ok(!commands(f.calls).some(command => /^(build|up|stop|run) /.test(command)));
    for (const call of f.calls.filter(({ args }) => args[0] === "compose" && args[1] !== "version")) {
      assert.equal(call.options.input, undefined);
      assert.ok(!call.args.includes("-"));
      assert.equal(call.options.environment.WZYWT_COMPOSE_MANAGED, "1");
    }
  }
});

test("malformed shared env blocks startup but does not block inspecting or stopping existing containers", async () => {
  for (const action of ["check", "status", "logs", "down"]) {
    const f = fixture();
    writeFileSync(join(f.root, ".env"), "SESSION_SECRET='unterminated-private-value\nRESOURCE_EXTERNAL_RPS=invalid\n");
    if (action === "check") {
      await assert.rejects(f.manage(action), /Unterminated|SESSION_SECRET/);
      assert.equal(f.calls.length, 0);
      continue;
    }
    await f.manage(action);
    assert.ok(!commands(f.calls).some(command => /^(build|up|stop|run) /.test(command)));
    assert.ok(f.calls.every(({ options }) => options.input === undefined));
    assert.ok(f.logs.every(message => !message.includes("unterminated-private-value")));
  }
});

test("external OCR health probe requires the six-page service and hides response/token details on failure", async () => {
  const environment = { MATCH_OCR_ENDPOINT: "http://host-machine:8011/recognize", MATCH_OCR_INTERNAL_HOST: "host-machine", DEPLOY_ENVIRONMENT: "production", MATCH_OCR_TOKEN: "private-token" };
  await probeOcr(environment, async (url, options) => {
    assert.equal(url.href, "http://host-machine:8011/health");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.Authorization, "Bearer private-token");
    return { ok: true, json: async () => ({ status: "ok", service: "wzywt-ocr-preview", fullMatchReady: true }) };
  });
  for (const payload of [{ status: "ok" }, { status: "ok", service: "wzywt-ocr-preview", fullMatchReady: false }]) {
    await assert.rejects(probeOcr(environment, async () => ({ ok: true, json: async () => payload })), /health\/six-page/);
  }
  await assert.rejects(probeOcr(environment, async () => { throw new Error("private-token"); }), error => !error.message.includes("private-token"));
});
