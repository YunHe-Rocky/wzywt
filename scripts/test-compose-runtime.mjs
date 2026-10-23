import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { composeRuntime, serializeRuntime, parseComposeModel } from "./compose-runtime.mjs";
import { resolveServices } from "./compose-services.mjs";
import { applicationEnvironment, runtimeEnvironment } from "../docker/runtime-env.mjs";
import { readResourceSettings } from "../src/core/resource-settings.ts";
import { capacityPlan } from "./compose-capacity.mjs";
import { runtimeCommand } from "./runtime-command.mjs";
import { createRequire } from "node:module";

const content = "MYSQL_USER=site\nMYSQL_DATABASE=site\nMYSQL_PASSWORD=fixture-password-long-enough\nMYSQL_ROOT_PASSWORD=fixture-admin-password-long-enough\nSESSION_SECRET=fixture-session-secret-more-than-32-characters\n";
const build = (extra = "", environment = {}) => {
  const text = content + extra;
  return composeRuntime(text, { environment, selected: resolveServices(text, { environment }), storage: { mode: "volume" } });
};

test("runtime defaults are supplied by shared scripts while Compose keeps topology", () => {
  const yaml = readFileSync(new URL("../compose.yaml", import.meta.url), "utf8");
  assert.doesNotMatch(yaml, /RESOURCE_|SPLIT_WORKER_|mem_limit:|MYSQL_PASSWORD:|SESSION_SECRET:|--max-connections/);
  assert.match(yaml, /WZYWT_COMPOSE_MANAGED/);
  const model = build();
  assert.equal(model.services.web.environment.PUBLIC_ORIGIN, "http://localhost:8001");
  assert.equal(model.services.web.environment.RESOURCE_EXTERNAL_CONCURRENCY, undefined);
  assert.equal(readResourceSettings(model.services.web.environment).RESOURCE_EXTERNAL_CONCURRENCY, 32);
  assert.equal(model.services.web.mem_limit, "1g");
  assert.equal(model.services.web.environment.REDIS_URL, "redis://redis:6379/0");
  const resolved = runtimeEnvironment(model.services.web.environment);
  assert.equal(resolved.APP_RUNTIME, "docker"); assert.ok(resolved.DATABASE_URL.includes("@mysql:3306/site"));
});

test("custom configuration and explicit overrides follow one path into runtime and capacity planning", () => {
  const model = build("WEB_MEMORY_LIMIT=768m\nRESOURCE_EXTERNAL_RPS=12\nSPLIT_WORKER_HEAP_MB=96\n", { RESOURCE_EXTERNAL_RPS: "9" });
  assert.equal(model.services.web.mem_limit, "768m");
  for (const role of ["web", "cron"]) {
    assert.equal(model.services[role].environment.RESOURCE_EXTERNAL_RPS, "9");
    assert.equal(model.services[role].environment.SPLIT_WORKER_HEAP_MB, "96");
  }
  const planned = capacityPlan(model, { mysql: "container", ocr: "off" }, 8 * 1024 ** 3);
  assert.equal(planned.plannedBytes / 1024 ** 2, 5120);
  assert.equal(planned.oneShotBytes / 1024 ** 2, 768, "include the Cron-image media verification helper");
  assert.throws(() => build("RESOURCE_SUBSCRIPTION_CONCURRENCY=0\n"), /RESOURCE_SUBSCRIPTION_CONCURRENCY/);
});

test("each service receives only its credentials; root password never enters application or tool roles", () => {
  const model = build("MATCH_OCR_TOKEN=fixture-ocr-token\n");
  for (const [name, service] of Object.entries(model.services)) {
    if (name !== "mysql") assert.equal(service.environment?.MYSQL_ROOT_PASSWORD, undefined, name);
  }
  assert.equal(model.services["storage-init"].environment.MYSQL_PASSWORD, undefined);
  assert.equal(model.services["storage-init"].environment.SESSION_SECRET, undefined);
  assert.equal(model.services.migrate.environment.SESSION_SECRET, undefined);
  assert.equal(model.services["mysql-client"].environment.MYSQL_PWD, "fixture-password-long-enough");
  assert.equal(model.services.ocr.environment.OCR_TOKEN, "fixture-ocr-token");
  assert.equal(model.services.ocr.environment.MYSQL_PASSWORD, undefined);
  assert.equal(applicationEnvironment({ MYSQL_ROOT_PASSWORD: "never-forward", UNRELATED_SECRET: "never-forward" }).UNRELATED_SECRET, undefined);
});

test("external service derivation and storage mode are reused instead of copied into YAML", () => {
  const model = build("MYSQL_MODE=external\nMYSQL_HOST=10.0.0.4\nMYSQL_PORT=3307\nOCR_MODE=external\nMATCH_OCR_ENDPOINT=http://host-machine:8011/recognize\n");
  assert.equal(model.services.web.environment.MYSQL_HOST, "10.0.0.4");
  assert.equal(model.services["mysql-client"].environment.MYSQL_HOST, "10.0.0.4");
  assert.equal(model.services.web.environment.MATCH_OCR_INTERNAL_HOST, "host-machine");
  assert.equal(model.services.web.environment.MATCH_OCR_ENDPOINT, "http://host-machine:8011/recognize");
  assert.ok(runtimeEnvironment(model.services.web.environment).DATABASE_URL.includes("@10.0.0.4:3307/site"));
  const bound = build("", { PORT: "9001", REDIS_URL: "redis://localhost:6379", MEDIA_STORAGE_DIR: "/host/path" }).services.web.environment;
  assert.equal(bound.PORT, "8001");
  assert.equal(bound.REDIS_URL, "redis://redis:6379/0");
  assert.equal(bound.MEDIA_STORAGE_DIR, "/app/data/media");
});

test("in-memory override escapes Compose interpolation without putting secrets in command arguments", () => {
  const secret = 'pass$word:${HOME} # "quotes" \\end';
  const model = build("", { MYSQL_PASSWORD: secret });
  const text = serializeRuntime(model);
  assert.equal(JSON.parse(text).services.web.environment.MYSQL_PASSWORD, 'pass$$word:$${HOME} # "quotes" \\end');
  assert.equal(parseComposeModel(text).services.web.environment.MYSQL_PASSWORD, secret);
  const doubled = serializeRuntime(build("", { MYSQL_PASSWORD: "literal$$pair" }));
  assert.equal(parseComposeModel(doubled).services.web.environment.MYSQL_PASSWORD, "literal$$pair");
  assert.equal(model.services.web.environment.MYSQL_PASSWORD, secret);
});

test("PM2 and container runtime use the same direct Node commands", () => {
  const nativeRequire = createRequire(import.meta.url);
  const config = nativeRequire("../ecosystem.config.js");
  const web = runtimeCommand("web", config.apps[0].env), cron = runtimeCommand("cron");
  assert.equal(config.apps[0].script, web.script); assert.deepEqual(config.apps[0].args, web.args);
  assert.equal(config.apps[1].script, cron.script);
  assert.ok(config.apps[1].node_args.slice(-2).every((value, index) => value === cron.nodeArgs[index]));
  assert.deepEqual(runtimeCommand("migrate").args, ["migrate", "deploy"]);
  assert.throws(() => runtimeCommand("toString"), /Expected/);
});
