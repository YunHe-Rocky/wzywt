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

function fixture({ failure, emptyDump = false, version = "2.30.0", running = "mysql\nredis\nweb\ncron\n", containerStates, psFormat = "array", invalidSecret = false, entryFailure = false, storageMode, daemonMiB = 8192, oldLimits = false } = {}) {
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
  const manage = createManager({ root, run, environment: {}, ...(storageMode ? {
    checkMount: () => calls.push({ command: ["check-mount"], args: [], options: {} }),
    prepare: () => calls.push({ command: ["prepare-storage"], args: [], options: {} }),
  } : {}), log: (message) => logs.push(message), verifyEntry: async (origin, release) => {
    calls.push({ args: [], command: ["verify-entry", origin, release], options: {} });
    if (entryFailure) throw new Error("desktop/mobile entry mismatch");
  } });
  return { root, manage: (...args) => manage(parseArguments(args)), calls, logs, model };
}

const commands = (calls) => calls.map(({ command }) => command.join(" "));
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

test("argument parser rejects accidental destructive flags and malformed options", () => {
  assert.throws(() => parseArguments(["down", "--volumes"]), /Unknown argument/);
  assert.throws(() => parseArguments(["up", "--env-file"]), /requires a path/);
  assert.throws(() => parseArguments(["logs", "unknown-service"]), /Unknown argument/);
});

test("custom env file feeds one stdin override through validation, deployment and backup streams", async () => {
  const f = fixture();
  const secret = 'fixture$secret:${HOME} # "quoted"';
  const file = join(f.root, "deployment settings.env");
  writeFileSync(file, `MYSQL_PASSWORD='${secret}'\nWEB_MEMORY_LIMIT=768m\nRESOURCE_EXTERNAL_RPS=12\n`);
  await f.manage("update", "--env-file", file);
  const calls = f.calls.filter(({ args }) => args[0] === "compose" && args[1] !== "version");
  const input = calls[0].options.input;
  const model = parseComposeModel(input);
  assert.equal(model.services.web.environment.MYSQL_PASSWORD, secret);
  assert.equal(model.services.web.environment.RESOURCE_EXTERNAL_RPS, "12");
  assert.equal(model.services.web.mem_limit, "768m");
  for (const call of calls) {
    assert.ok(call.args.includes(file));
    assert.ok(call.args.some((value, index) => value === "-f" && call.args[index + 1] === "-"));
    assert.equal(call.options.input, input);
    assert.equal(call.options.environment.WZYWT_COMPOSE_MANAGED, "1");
    assert.ok(!call.args.some(value => value.includes(secret)));
  }
  assert.equal(calls.filter(call => call.options.outputFile).length, 3);
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
  for (const options of [{ emptyDump: true }, { failure: (command) => command.includes("--entrypoint") }]) {
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
  mkdirSync(join(f.root, ".cache/compose-deploy.lock"), { recursive: true });
  await assert.rejects(f.manage("update"), /Another operation holds/);
  assert.ok(!commands(f.calls).some((command) => /^(build|up|stop|run) /.test(command)));
  const config = f.calls.find(({ command }) => command[0] === "config");
  assert.ok(config.args.includes(join(f.root, ".env.docker")));
  assert.ok(existsSync(join(f.root, ".cache/compose-deploy.lock")));
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
