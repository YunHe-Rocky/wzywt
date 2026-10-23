import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importNativeBackup } from "./compose-native-import.mjs";

const fixtures = [];
afterEach(() => { for (const path of fixtures.splice(0)) rmSync(path, { recursive: true, force: true }); });
function fixture({ mysql = "container", ocr = "off", states = "[]", failure } = {}) {
  const root = mkdtempSync(join(tmpdir(), "native import orchestration ")); fixtures.push(root);
  const directory = join(root, "private source backup"); mkdirSync(directory);
  writeFileSync(join(directory, "manifest.json"), '{"fixture":true}\n');
  const calls = []; const logs = [];
  const options = {
    root, directory, model: { name: "isolated-target" }, selected: { mysql, ocr }, storage: { mode: "local" },
    bundle: { databaseIdentity: { serverUuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", database: "native_site" },
      mediaManifest: { counts: { avatars: 1, combatVideos: 1, matchScreenshots: 0 } } },
    checkMount: () => calls.push({ args: ["check-mount"] }), prepare: () => calls.push({ args: ["prepare"] }),
    verifyDataServices: () => { calls.push({ args: ["verify-limits"] }); if (failure?.(["verify-limits"])) throw new Error("unsafe container limits"); },
    log: message => logs.push(message),
    compose: (args, execution = {}) => {
      calls.push({ args, execution });
      if (failure?.(args)) throw new Error("simulated failure");
      if (args[0] === "ps") return states;
      if (execution.outputFile) writeFileSync(execution.outputFile, '{"complete":true}\n');
      return "";
    },
  };
  return { root, calls, logs, run: () => importNativeBackup(options), report: () => {
    const reports = join(root, ".cache/native-migrations");
    const directories = readdirSync(reports);
    return JSON.parse(readFileSync(join(reports, directories.at(-1), "report.json"), "utf8"));
  } };
}
const phase = args => args.includes("docker/native-migration.mjs") ? args[args.indexOf("docker/native-migration.mjs") + 1] : undefined;
const sqlImport = args => args.includes("mysql-client") && args.some(value => value.includes("< /wzywt-import/database.sql"));
const startedWriters = calls => calls.some(({ args }) => ["start", "restart", "up"].includes(args[0]) && args.some(name => ["web", "cron"].includes(name)));

test("container import fences SQL before restoring and verifies after migration, keeping writers stopped", () => {
  const f = fixture(); const result = f.run();
  const index = predicate => f.calls.findIndex(({ args }) => predicate(args));
  const preflight = index(args => phase(args) === "preflight");
  const fence = index(args => phase(args) === "begin");
  const database = index(sqlImport);
  const restore = index(args => phase(args) === "restore");
  const migration = index(args => args[0] === "run" && args.at(-1) === "migrate");
  const verification = index(args => phase(args) === "verify");
  assert.ok(preflight >= 0 && preflight < fence && fence < database && database < restore && restore < migration && migration < verification);
  assert.equal(startedWriters(f.calls), false);
  assert.equal(result.status, "complete");
  assert.equal(result.runtimeVerified, false); assert.equal(result.playbackVerified, false);
  assert.deepEqual(f.report(), result);
  for (const { args } of f.calls.filter(({ args }) => phase(args) || sqlImport(args))) {
    assert.equal(args[args.indexOf("--volume") + 1], `${join(f.root, "private source backup")}:/wzywt-import:ro`);
    assert.equal(args[args.indexOf("--user") + 1], "0:0");
    assert.ok(!args.includes("--privileged"));
  }
});

test("external import verifies the original database identity and never restores SQL or starts MySQL", () => {
  const f = fixture({ mysql: "external", ocr: "container" }); f.run();
  assert.ok(f.calls.some(({ args }) => phase(args) === "preflight" && args.at(-1) === "external"));
  assert.ok(!f.calls.some(({ args }) => sqlImport(args) || args.includes("mysql-client")));
  assert.ok(f.calls.some(({ args }) => args[0] === "build" && args.includes("ocr")));
  assert.ok(f.calls.filter(({ args }) => args[0] === "up").every(({ args }) => !args.includes("mysql") && !args.includes("ocr")));
  assert.equal(startedWriters(f.calls), false);
});

test("running, restarting, paused or unverifiable target writers prevent all changes", () => {
  for (const states of [
    JSON.stringify([{ Service: "web", State: "running" }]),
    JSON.stringify([{ Service: "cron", State: "restarting" }]),
    '{"Service":"web","State":"exited"}\n{"Service":"cron","State":"paused"}\n',
    '[{"Service":"web"}]', 'invalid',
  ]) {
    const f = fixture({ states }); assert.throws(f.run);
    assert.ok(!f.calls.some(({ args }) => ["build", "run", "up", "stop"].includes(args[0])));
    assert.equal(f.report().status, "failed"); assert.equal(f.report().phase, "preflight");
  }
});

test("each failed import phase retains a failed report and never starts or automatically cleans target data", () => {
  for (const [expected, predicate] of [
    ["build", args => args[0] === "build"],
    ["data-service-limits", args => args[0] === "verify-limits"],
    ["check-empty-target", args => phase(args) === "preflight"],
    ["begin", args => phase(args) === "begin"],
    ["import-database", sqlImport],
    ["restore-media", args => phase(args) === "restore"],
    ["schema-migration", args => args[0] === "run" && args.at(-1) === "migrate"],
    ["verify-media", args => phase(args) === "verify"],
  ]) {
    const f = fixture({ failure: predicate }); assert.throws(f.run, new RegExp(`failed at ${expected}`));
    assert.equal(f.report().status, "failed"); assert.equal(f.report().phase, expected);
    assert.equal(startedWriters(f.calls), false);
    assert.ok(!f.calls.some(({ args }) => ["down", "stop", "rm", "volume"].includes(args[0]) || args.some(value => /DROP DATABASE|--volumes/.test(value))));
    assert.ok(!f.logs.some(message => message.includes("snapshot imported")));
  }
});
