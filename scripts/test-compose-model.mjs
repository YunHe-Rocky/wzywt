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

// Real Compose parsing, without starting containers or requiring a Docker daemon.
// COMPOSE_TEST_BIN optionally names a standalone Compose executable.
const root = resolve(import.meta.dirname, "..");
const tool = process.env.COMPOSE_TEST_BIN || "docker";
const prefix = process.env.COMPOSE_TEST_BIN ? [] : ["compose"];
const temporary = mkdtempSync(join(tmpdir(), "wzywt compose model "));
const base = readFileSync(resolve(root, ".env.docker.example"), "utf8")
  .replaceAll(/__GENERATE_[A-Z_]+__/g, "fixture-" + "a".repeat(48));
const secret = 'pass$word:${HOME} $$pair # "quotes" \\end';
const run = (args, options = {}) => spawnSync(tool, [...prefix, ...args], {
  cwd: root, encoding: "utf8", windowsHide: true, ...options,
});
let cases = 0;
try {
  for (const mysql of ["container", "external"]) for (const ocr of ["off", "container", "external"]) for (const mode of ["volume", "rclone"]) {
    const overrides = { MYSQL_MODE: mysql, OCR_MODE: ocr, MYSQL_HOST: mysql === "external" ? "host-machine" : "",
      MATCH_OCR_ENDPOINT: ocr === "external" ? "http://host-machine:8011/recognize" : "",
      STORAGE_MODE: mode, OSS_MOUNT_PATH: mode === "rclone" ? "/mnt/fixture-oss" : "",
      MYSQL_PASSWORD: secret, RESOURCE_EXTERNAL_RPS: "12", PUBLIC_ORIGIN: "http://192.168.1.10:8001" };
    const content = base.replace(/^([A-Z_]+)=(.*)$/gm, (line, key) => Object.hasOwn(overrides, key) ? `${key}='${overrides[key]}'` : line);
    const file = join(temporary, `custom deployment ${++cases}.env`);
    writeFileSync(file, content, { mode: 0o600 });
    const selected = resolveServices(content, { environment: {} });
    const storage = resolveStorage(content, root, { environment: {} });
    const runtime = composeRuntime(content, { environment: {}, selected, storage });
    const args = ["--project-directory", root, "--env-file", file, "-f", "compose.yaml"];
    if (mode === "rclone") args.push("-f", "compose.oss.yaml");
    args.push("-f", "-", "--profile", "tools");
    if (mysql === "container") args.push("--profile", "mysql");
    if (ocr === "container") args.push("--profile", "ocr");
    args.push("config", "--format", "json");
    const environment = { ...process.env, ...selected.environment, ...storage.environment,
      WZYWT_COMPOSE_MANAGED: "1", COMPOSE_CONVERT_WINDOWS_PATHS: "0", COMPOSE_PROFILES: "" };
    const child = run(args, { input: serializeRuntime(runtime), env: environment });
    assert.ifError(child.error);
    assert.equal(child.status, 0, child.stderr);
    const model = parseComposeModel(child.stdout);
    validateModel(model, ocr === "container", mysql);
    validateStorageModel(model, storage);
    for (const role of ["web", "cron", "migrate"]) assert.equal(model.services[role].environment.MYSQL_PASSWORD, secret);
    assert.equal(model.services["mysql-client"].environment.MYSQL_PWD, secret);
    assert.equal(model.services.web.environment.PUBLIC_ORIGIN, overrides.PUBLIC_ORIGIN);
    assert.equal(model.services.web.environment.RESOURCE_EXTERNAL_RPS, "12");
    for (const role of ["web", "cron", "migrate", "mysql-client", "storage-init"]) assert.equal(model.services[role].environment?.MYSQL_ROOT_PASSWORD, undefined);
    assert.equal(!!model.services.mysql, mysql === "container");
    assert.equal(!!model.services.ocr, ocr === "container");
    assert.equal(Number(model.services.web.mem_limit), 1024 ** 3);
    assert.equal(Number(model.services.cron.mem_limit), 768 * 1024 ** 2);
    assert.equal(Number(model.services.web.cpus), 2);
    assert.equal(model.services.web.pids_limit, 256);
    assert.equal(model.services.web.build.context, root);
    const plan = capacityPlan(model, selected, 8 * 1024 ** 3);
    const expectedMiB = 5120 - (mysql === "external" ? 1024 : 0) + (ocr === "container" ? 2048 : ocr === "external" ? 512 : 0);
    assert.equal(plan.plannedBytes / 1024 ** 2, expectedMiB);
    console.log(`PASS: MySQL=${mysql}, OCR=${ocr}, storage=${mode}, budget=${expectedMiB} MiB; literal credentials and service boundaries verified.`);
  }
  const environment = { ...process.env }; delete environment.WZYWT_COMPOSE_MANAGED;
  const raw = run(["-f", "compose.yaml", "config"], { env: environment });
  assert.ifError(raw.error);
  assert.notEqual(raw.status, 0);
  assert.match(raw.stderr, /Use node scripts\/compose.mjs/);
  console.log(`PASS: ${cases} Compose model combinations and raw-deployment guard. No containers started.`);
} finally { rmSync(temporary, { recursive: true, force: true }); }
