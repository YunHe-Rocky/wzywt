import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { assertEmptyMigrationTargets, auditMedia, beginNativeImport, checkTargetDatabase, guardNativeImport, preflightNativeImport, readImportMarker, restoreNativeMedia, verifyNativeImport } from "./native-migration.mjs";

const identity = { serverUuid: "12345678-1234-1234-1234-123456789abc", database: "wzywt" };
const manifest = { version: 1, complete: true, counts: { screenshots: 0, videos: 0, avatars: 0 }, objects: [], problems: [] };
const bundle = { bundleSha256: "a".repeat(64), mediaManifest: manifest, databaseIdentity: identity };
const verify = async () => bundle;
function setup(t) {
  const root = mkdtempSync(join(tmpdir(), "wzywt-native-helper-test-"));
  t.after(() => { assert.ok(resolve(root).startsWith(resolve(tmpdir()))); rmSync(root, { recursive: true, force: true }); });
  const directories = { media: join(root, "media"), avatars: join(root, "media", "avatars"), heroes: join(root, "heroes") };
  for (const directory of [directories.avatars, join(directories.heroes, "images"), join(directories.heroes, "skins")]) mkdirSync(directory, { recursive: true });
  for (const name of ["media.tar.gz", "avatars.tar.gz", "hero-assets.tar.gz"]) writeFileSync(join(root, name), "fixture archive opened before injected extraction");
  return { root, directories, verify };
}
test("database preflight permits only empty container DB or identical external database", () => {
  checkTargetDatabase("container", identity, identity, 0);
  assert.throws(() => checkTargetDatabase("container", identity, identity, 1), /not empty/);
  checkTargetDatabase("external", identity, identity, 100);
  assert.throws(() => checkTargetDatabase("external", { ...identity, database: "another" }, identity, 0), /differs/);
  assert.throws(() => checkTargetDatabase("external", { ...identity, serverUuid: "ffffffff-1234-1234-1234-123456789abc" }, identity, 0), /differs/);
});
test("preflight inspects injected DB without modifying storage and rejects existing files", async t => {
  const options = setup(t); let calls = 0;
  const inspectDatabase = async () => { calls++; return { identity, tableCount: 0 }; };
  assert.equal((await preflightNativeImport(options.root, "container", { ...options, inspectDatabase })).databaseVerified, true);
  assert.equal(calls, 1); assert.equal(readImportMarker(options.directories), null);
  writeFileSync(join(options.directories.media, "old.mp4"), "existing");
  await assert.rejects(preflightNativeImport(options.root, "container", { ...options, inspectDatabase }), /already contains files/);
  assert.equal(calls, 1);
});
test("begin writes guard before SQL; failed extraction keeps marker and refuses normal operations", async t => {
  const options = setup(t); await beginNativeImport(options.root, options);
  assert.equal(readImportMarker(options.directories).state, "pending");
  assert.throws(() => guardNativeImport(options.directories), /incomplete/);
  await assert.rejects(restoreNativeMedia(options.root, { ...options, run: () => ({ status: 2 }) }), /extraction failed/);
  assert.equal(readImportMarker(options.directories).state, "pending");
  await assert.rejects(beginNativeImport(options.root, options), /incomplete/);
  await assert.rejects(preflightNativeImport(options.root, "container", options), /incomplete/);
});
test("restore keeps application uid files separate, never overwrites and rejects mismatched bundle", async t => {
  const options = setup(t); await beginNativeImport(options.root, options); const commands = [];
  await restoreNativeMedia(options.root, { ...options, run: (command, args, settings) => { commands.push([command, args, settings]); return { status: 0 }; } });
  assert.equal(commands.length, 3);
  assert.ok(commands.every(([, args]) => args.includes("--no-same-owner") && args.includes("--no-same-permissions") && args.includes("--keep-old-files") && args.includes("--no-overwrite-dir")));
  assert.ok(commands[1][1].includes(options.directories.avatars));
  assert.ok(commands[2][1].includes(options.directories.heroes));
  assert.ok(commands.every(([, args, settings]) => args[args.indexOf("--file") + 1] === "-" && Number.isInteger(settings.stdio[0])));
  if (typeof process.getuid === "function" && process.getuid() === 0) assert.ok(commands.every(([, , settings]) => settings.uid === 1000 && settings.gid === 1000));
  await assert.rejects(restoreNativeMedia(options.root, { ...options, verify: async () => ({ ...bundle, bundleSha256: "b".repeat(64) }) }), /matching pending/);
  writeFileSync(join(options.directories.media, "imported.mp4"), "partial import");
  assert.throws(() => assertEmptyMigrationTargets(options.directories, { allowMarker: true }), /already contains files/);
});
test("verify clears pending only after exact manifest verification and successful audit command", async t => {
  const options = setup(t); await beginNativeImport(options.root, options);
  const printed = []; const broken = { ...manifest, complete: false, problems: [{ kind: "combat-video", recordId: 7, problem: "MISSING" }] };
  await assert.rejects(verifyNativeImport(options.root, { ...options, collect: () => ({ manifest: broken, commandSucceeded: false }), printManifest: value => printed.push(value) }), /incomplete/);
  assert.equal(JSON.parse(printed[0]).problems[0].problem, "MISSING");
  await assert.rejects(verifyNativeImport(options.root, { ...options, collect: () => ({ manifest, commandSucceeded: false }) }), /command failed/);
  assert.equal(readImportMarker(options.directories).state, "pending");
  const result = await verifyNativeImport(options.root, { ...options, collect: () => ({ manifest, commandSucceeded: true }) });
  assert.equal(result.state, "completed"); assert.equal(guardNativeImport(options.directories).pendingImport, false);
  assert.equal(JSON.parse(readFileSync(join(options.directories.media, ".native-import.json"))).state, "completed");
});
test("normal audit preserves structured failure evidence on stdout and refuses pending migration", async t => {
  const options = setup(t); const printed = [];
  const broken = { ...manifest, complete: false, problems: [{ kind: "combat-video", recordId: 7, problem: "MISSING" }] };
  assert.throws(() => auditMedia("-", { ...options, collect: () => ({ manifest: broken, commandSucceeded: false }), print: text => printed.push(text) }), /incomplete/);
  assert.equal(JSON.parse(printed[0]).problems[0].problem, "MISSING");
  await beginNativeImport(options.root, options);
  let collected = false;
  assert.throws(() => auditMedia("-", { ...options, collect: () => { collected = true; } }), /incomplete/);
  assert.equal(collected, false);
});
