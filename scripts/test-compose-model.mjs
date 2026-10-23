import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { composeRuntime, serializeRuntime, parseComposeModel } from "./compose-runtime.mjs";
import { resolveServices } from "./compose-services.mjs";
import { resolveStorage, validateStorageModel } from "./compose-storage.mjs";
import { capacityPlan } from "./compose-capacity.mjs";
import { validateModel } from "./compose.mjs";
import { composeEnvironment, initializeComposeEnv, readSharedComposeEnv } from "./compose-env.mjs";

// Real Compose parsing, without starting containers or requiring a Docker daemon.
// COMPOSE_TEST_BIN optionally names a standalone Compose executable.
const root = resolve(import.meta.dirname, "..");
const tool = process.env.COMPOSE_TEST_BIN || "docker";
const prefix = process.env.COMPOSE_TEST_BIN ? [] : ["compose"];
const temporary = mkdtempSync(join(tmpdir(), "wzywt compose model "));
const secret = 'pass$word:${HOME} $$pair # "quotes" \\end';
const run = (args, options = {}) => spawnSync(tool, [...prefix, ...args], {
  cwd: root, encoding: "utf8", windowsHide: true, ...options,
});
let cases = 0;
try {
  const shared = {
    SESSION_SECRET: 'fixture-session$literal:${HOME} $$pair # "quotes"-more-than-32',
    MATCH_OCR_TOKEN: "fixture-ocr-$token:${HOME}-characters-more-than-32",
    PUBLIC_ORIGIN: "http://192.168.1.10:8001", DEPLOY_ENVIRONMENT: "local", RESOURCE_EXTERNAL_RPS: "12",
    PORT: "9001", BIND_ADDRESS: "127.0.0.1", FFMPEG_BIN: "/native/bin/ffmpeg",
    DATABASE_URL: "mysql://native:host-password@127.0.0.1/native_db", REDIS_URL: "redis://127.0.0.1:6380",
  };
  const sharedFile = join(temporary, ".env");
  const sharedContent = Object.entries(shared).map(([key, value]) => `${key}='${value}'`).join("\n") + "\n";
  writeFileSync(sharedFile, sharedContent, { mode: 0o600 });
  const base = initializeComposeEnv(readFileSync(resolve(root, ".env.docker.example"), "utf8"), readSharedComposeEnv(temporary));
  assert.doesNotMatch(base, /^(?:SESSION_SECRET|MATCH_OCR_TOKEN)=/m);
  const version = run(["version", "--short"]);
  assert.ifError(version.error); assert.equal(version.status, 0, version.stderr);
  console.log(`Compose model verification: ${version.stdout.trim()}`);
  for (const mysql of ["container", "external"]) for (const ocr of ["off", "container", "external"]) for (const mode of ["volume", "rclone"]) {
    const overrides = { MYSQL_MODE: mysql, OCR_MODE: ocr, MYSQL_HOST: mysql === "external" ? "host-machine" : "",
      MATCH_OCR_ENDPOINT: ocr === "external" ? "http://host-machine:8011/recognize" : "",
      STORAGE_MODE: mode, OSS_MOUNT_PATH: mode === "rclone" ? "/mnt/fixture-oss" : "",
      MYSQL_PASSWORD: secret };
    if (mysql === "external" && ocr === "external" && mode === "rclone") {
      Object.assign(overrides, { RESOURCE_EXTERNAL_RPS: "15", PUBLIC_ORIGIN: "http://192.168.1.30:8001" });
    }
    const content = base.replace(/^([A-Z_]+)=(.*)$/gm, (line, key) => Object.hasOwn(overrides, key) ? "" : line)
      + "\n" + Object.entries(overrides).map(([key, value]) => `${key}='${value}'`).join("\n") + "\n";
    const file = join(temporary, `custom deployment ${++cases}.env`);
    writeFileSync(file, content, { mode: 0o600 });
    const configuration = composeEnvironment(temporary, content, {});
    const selected = resolveServices(content, { environment: configuration });
    const storage = resolveStorage(content, root, { environment: configuration });
    const runtime = composeRuntime(content, { environment: configuration, selected, storage });
    const args = ["--project-directory", root, "--env-file", file, "-f", "compose.yaml"];
    if (mode === "rclone") args.push("-f", "compose.oss.yaml");
    args.push("-f", "-", "--profile", "tools");
    if (mysql === "container") args.push("--profile", "mysql");
    if (ocr === "container") args.push("--profile", "ocr");
    args.push("config", "--format", "json");
    const environment = { ...process.env, ...configuration, ...selected.environment, ...storage.environment,
      WZYWT_COMPOSE_MANAGED: "1", COMPOSE_CONVERT_WINDOWS_PATHS: "0", COMPOSE_PROFILES: "" };
    const child = run(args, { input: serializeRuntime(runtime), env: environment });
    assert.ifError(child.error);
    assert.equal(child.status, 0, child.stderr);
    const model = parseComposeModel(child.stdout);
    validateModel(model, ocr === "container", mysql);
    validateStorageModel(model, storage);
    for (const role of ["web", "cron", "migrate"]) assert.equal(model.services[role].environment.MYSQL_PASSWORD, secret);
    assert.equal(model.services["mysql-client"].environment.MYSQL_PWD, secret);
    for (const role of ["web", "cron"]) {
      assert.equal(model.services[role].environment.SESSION_SECRET, shared.SESSION_SECRET);
      assert.equal(model.services[role].environment.MATCH_OCR_TOKEN, shared.MATCH_OCR_TOKEN);
      assert.equal(model.services[role].environment.PUBLIC_ORIGIN, overrides.PUBLIC_ORIGIN ?? shared.PUBLIC_ORIGIN);
      assert.equal(model.services[role].environment.RESOURCE_EXTERNAL_RPS, overrides.RESOURCE_EXTERNAL_RPS ?? shared.RESOURCE_EXTERNAL_RPS);
      assert.equal(model.services[role].environment.DATABASE_URL, undefined);
      assert.equal(model.services[role].environment.REDIS_URL, "redis://redis:6379/0");
      assert.equal(model.services[role].environment.FFMPEG_BIN, undefined);
      assert.equal(model.services[role].environment.PORT, "8001");
    }
    assert.equal(model.services.migrate.environment.SESSION_SECRET, undefined);
    if (ocr === "container") assert.equal(model.services.ocr.environment.OCR_TOKEN, shared.MATCH_OCR_TOKEN);
    const published = model.services.web.ports;
    assert.equal(published.length, 1);
    assert.equal(String(published[0].published), "8001");
    assert.equal(published[0].target, 8001);
    assert.equal(published[0].host_ip, "0.0.0.0");
    for (const role of ["web", "cron", "migrate", "mysql-client", "storage-init"]) assert.equal(model.services[role].environment?.MYSQL_ROOT_PASSWORD, undefined);
    assert.equal(!!model.services.mysql, mysql === "container");
    assert.equal(!!model.services.ocr, ocr === "container");
    assert.equal(Number(model.services.web.mem_limit), 1024 ** 3);
    assert.equal(Number(model.services.cron.mem_limit), 768 * 1024 ** 2);
    assert.equal(Number(model.services.web.cpus), 2);
    assert.equal(model.services.web.pids_limit, 256);
    assert.equal(model.services.web.build.context, root);
    const plan = capacityPlan(model, selected, 8 * 1024 ** 3);
    const expectedMiB = 5376 - (mysql === "external" ? 1024 : 0) + (ocr === "container" ? 2048 : ocr === "external" ? 256 : 0);
    assert.equal(plan.plannedBytes / 1024 ** 2, expectedMiB);
    console.log(`PASS: MySQL=${mysql}, OCR=${ocr}, storage=${mode}, budget=${expectedMiB} MiB; shared env inheritance, literal credentials and container boundaries verified.`);
  }
  assert.equal(readFileSync(sharedFile, "utf8"), sharedContent);
  const environment = { ...process.env }; delete environment.WZYWT_COMPOSE_MANAGED;
  const raw = run(["-f", "compose.yaml", "config"], { env: environment });
  assert.ifError(raw.error);
  assert.notEqual(raw.status, 0);
  assert.match(raw.stderr, /Use node scripts\/compose.mjs/);
  console.log(`PASS: ${cases} Compose model combinations and raw-deployment guard. No containers started.`);
} finally { rmSync(temporary, { recursive: true, force: true }); }
