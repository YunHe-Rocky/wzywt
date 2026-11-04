import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileSha256 } from "./backup-integrity.mjs";
import { applyDockerCleanup, applyFileCleanup, cleanupSettings, markBackupState, markDeploymentImages, planDockerCleanup,
  planFileCleanup, recordDeploymentImages, writeCleanupReport } from "./deployment-cleanup.mjs";

const roots = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const fixture = () => { const root = mkdtempSync(join(tmpdir(), "wzywt-cleanup-")); roots.push(root); return root; };
const settings = () => ({ ...cleanupSettings("", {}), backupRetention: 2, backupMinAgeDays: 7 });

function backup(root, index, status = "success") {
  const directory = join(root, "backups", `2026-01-${String(index).padStart(2, "0")}T00-00-00-000Z-abcdef12`);
  mkdirSync(directory, { recursive: true });
  const files = ["database.sql", "media.tar.gz", "hero-assets.tar.gz"];
  for (const file of files) writeFileSync(join(directory, file), `fixture ${file}\n`);
  writeFileSync(join(directory, "manifest.json"), JSON.stringify({ complete: true, createdAt: `2026-01-${String(index).padStart(2, "0")}T00:00:00Z`, files,
    sha256: Object.fromEntries(files.map(file => [file, fileSha256(join(directory, file))])) }));
  if (status) markBackupState(directory, status, "fixture-release");
  return directory;
}

test("backup cleanup retains recent, failed, legacy, corrupt and native migration evidence while removing only verified excess", () => {
  const root = fixture();
  const old = backup(root, 1);
  const corrupted = backup(root, 2); writeFileSync(join(corrupted, "database.sql"), "changed");
  const failed = backup(root, 3, "failed");
  const legacy = backup(root, 4, undefined); rmSync(join(legacy, "deployment-state.json"));
  const migration = backup(root, 5);
  const manifest = JSON.parse(readFileSync(join(migration, "manifest.json"), "utf8"));
  writeFileSync(join(migration, "manifest.json"), JSON.stringify({ ...manifest, migrationSource: {} }));
  const recent = [backup(root, 6), backup(root, 7)];
  const plan = planFileCleanup({ backupRoot: join(root, "backups"), settings: settings(), now: Date.parse("2026-03-01") });
  assert.deepEqual(plan.entries.filter(row => row.action === "remove").map(row => row.path), [old]);
  assert.ok(plan.reclaimableBytes > 0);
  applyFileCleanup(plan);
  assert.equal(existsSync(old), false);
  for (const directory of [corrupted, failed, legacy, migration, ...recent]) assert.ok(existsSync(directory));
});

test("backups younger than the minimum age remain even when the retained count is exceeded", () => {
  const root = fixture(); backup(root, 1); backup(root, 2); backup(root, 3);
  const plan = planFileCleanup({ backupRoot: join(root, "backups"), settings: settings(), now: Date.parse("2026-01-03T01:00:00Z") });
  assert.equal(plan.reclaimableBytes, 0);
  assert.ok(plan.entries.some(row => row.reason.includes("minimum age")));
});

test("newer damaged backups never consume retention slots belonging to older recoverable sets", () => {
  const root = fixture();
  const good = [backup(root, 1), backup(root, 2)];
  for (const index of [3, 4]) {
    const damaged = backup(root, index);
    writeFileSync(join(damaged, "media.tar.gz"), "corrupt payload");
  }
  const plan = planFileCleanup({ backupRoot: join(root, "backups"), settings: settings(), now: Date.parse("2026-03-01") });
  assert.equal(plan.entries.filter(row => row.action === "remove").length, 0);
  applyFileCleanup(plan);
  for (const directory of good) assert.ok(existsSync(directory));
});

test("release cleanup protects actual current/previous and failure evidence but reclaims obsolete failed build output", () => {
  const root = fixture(); const releaseRoot = join(root, "releases"); mkdirSync(releaseRoot);
  const directories = Array.from({ length: 6 }, (_, index) => {
    const path = join(releaseRoot, `2026010${index + 1}000000-abcdef123456-${index + 1}`);
    mkdirSync(path); writeFileSync(join(path, "package.json"), "{}"); return path;
  });
  const [failed, old, previous, , current, newerFailure] = directories;
  writeFileSync(join(current, ".deploy-success.json"), JSON.stringify({ status: "success", previousRelease: previous }));
  writeFileSync(join(failed, ".deploy-migrate.log"), "migration evidence");
  writeFileSync(join(newerFailure, ".deploy-failed.json"), "{}");
  mkdirSync(join(failed, "node_modules")); writeFileSync(join(failed, "node_modules", "large.bin"), Buffer.alloc(1024));
  const unknown = join(releaseRoot, "operator-notes"); mkdirSync(unknown);
  const plan = planFileCleanup({ releaseRoot, currentRelease: current, releaseRetention: 2, settings: settings() });
  assert.equal(plan.entries.find(row => row.path === previous).action, "keep");
  assert.equal(plan.entries.find(row => row.path === current).action, "keep");
  assert.equal(plan.entries.find(row => row.path === newerFailure).action, "keep");
  assert.equal(plan.entries.find(row => row.path === failed).action, "keep");
  assert.equal(plan.entries.find(row => row.path === join(failed, "node_modules")).action, "remove");
  assert.equal(existsSync(old), true, "preview must remain read only");
  applyFileCleanup(plan);
  assert.equal(existsSync(old), false);
  assert.equal(existsSync(join(failed, "node_modules")), false);
  assert.equal(readFileSync(join(failed, ".deploy-migrate.log"), "utf8"), "migration evidence");
  assert.ok(existsSync(unknown));
});

test("cleanup never follows a release or backup symlink to another directory", t => {
  const root = fixture(); const releases = join(root, "releases"); const outside = join(root, "outside");
  mkdirSync(releases); mkdirSync(outside); writeFileSync(join(outside, "keep"), "safe");
  const link = join(releases, "20260101000000-abcdef123456-1");
  try { symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir"); }
  catch (error) { if (error.code === "EPERM") { t.skip("symlink privilege unavailable"); return; } throw error; }
  const plan = planFileCleanup({ releaseRoot: releases, settings: settings() });
  assert.equal(plan.entries[0].action, "keep"); applyFileCleanup(plan);
  assert.equal(readFileSync(join(outside, "keep"), "utf8"), "safe");
  assert.throws(() => planFileCleanup({ releaseRoot: link, settings: settings() }), /symlink/);
});

test("only exact project PM2 log files are trimmed in place, preserving their newest complete lines", () => {
  const root = fixture(); const logs = join(root, "logs"); mkdirSync(logs);
  const target = join(logs, "project-web-out.log"); const other = join(logs, "other-project-out.log");
  const payload = "old log\n".repeat(500) + "latest diagnostic\n";
  writeFileSync(target, payload); writeFileSync(other, payload);
  const inode = statSync(target).ino;
  const plan = planFileCleanup({ pm2Home: root, webName: "project-web", cronName: "project-cron", settings: { ...settings(), logMaxBytes: 128 } });
  assert.equal(plan.entries[0].action, "trim"); applyFileCleanup(plan);
  assert.equal(statSync(target).ino, inode);
  assert.ok(statSync(target).size <= 128);
  assert.match(readFileSync(target, "utf8"), /latest diagnostic\n$/);
  assert.equal(readFileSync(other, "utf8"), payload);
});

test("cleanup reports retain twenty records and invalid retention settings are rejected", () => {
  const root = fixture(); const reports = join(root, "reports"); mkdirSync(reports);
  for (let index = 1; index <= 25; index++) writeFileSync(join(reports, `cleanup-${index}-abcdef12.json`), "{}");
  writeCleanupReport(reports, { entries: [] }, true);
  assert.equal(readdirSync(reports).length, 20);
  assert.throws(() => cleanupSettings("CLEANUP_BACKUP_RETENTION=1", {}), /between 2 and/);
  assert.throws(() => cleanupSettings("CLEANUP_BACKUP_MIN_AGE_DAYS=0", {}), /between 1 and/);
});

test("Docker cleanup uses registered project references, preserves all container image IDs and avoids global prune", () => {
  const root = fixture();
  const ids = Array.from({ length: 5 }, (_, i) => `sha256:${String(i).repeat(64)}`);
  for (let index = 0; index < 5; index++) recordDeploymentImages(root, "ours", `release-${index}`, [`wzywt:release-${index}`]);
  // Stable test ordering independent of clock granularity.
  const registry = join(root, ".cache/deployment-images");
  for (const file of readdirSync(registry)) {
    const value = JSON.parse(readFileSync(join(registry, file), "utf8"));
    value.createdAt = `2026-01-0${Number(basename(file).match(/\d+/)[0]) + 1}T00:00:00Z`;
    writeFileSync(join(registry, file), JSON.stringify(value));
  }
  const calls = [];
  const docker = args => {
    calls.push(args);
    if (args[0] === "image" && args[1] === "ls") return ids.map((ID, i) => JSON.stringify({ ID, Repository: "wzywt", Tag: `release-${i}` })).join("\n");
    if (args[0] === "ps") return "other-project-stopped-container\n";
    if (args[0] === "inspect") return ids[1];
    if (args.includes("{{.Size}}")) return "1024";
    if (args.includes("{{.Id}}")) return ids[Number(args[2].match(/\d+$/)[0])];
    return "";
  };
  const plan = planDockerCleanup({ root, project: "ours", docker, settings: settings() });
  assert.deepEqual(plan.entries.filter(row => row.action === "remove").map(row => row.path).sort(), ["wzywt:release-0", "wzywt:release-2"]);
  applyDockerCleanup(plan, docker);
  assert.deepEqual(calls.filter(args => args[1] === "rm").map(args => args[2]).sort(), ["wzywt:release-0", "wzywt:release-2"]);
  assert.ok(calls.every(args => !args.includes("prune") && !args.includes("--force")));
  markDeploymentImages(root, "release-0", "success");
  markDeploymentImages(root, "release-2", "success");
  const retryPlan = planDockerCleanup({ root, project: "ours", docker, settings: settings() });
  for (const reference of ["wzywt:release-0", "wzywt:release-2"]) {
    assert.equal(retryPlan.entries.find(row => row.path === reference).action, "keep", "two newer failed attempts must not evict the previous successful images");
  }
});
