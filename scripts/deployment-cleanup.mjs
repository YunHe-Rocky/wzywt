import {
  closeSync, existsSync, fstatSync, ftruncateSync, lstatSync, mkdirSync, openSync,
  readFileSync, readSync, readdirSync, realpathSync, rmSync, writeFileSync, writeSync,
} from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { verifyBackup } from "./backup-integrity.mjs";
import { parseSelectedEnv } from "./deploy-env.mjs";

const MiB = 1_048_576;
const day = 86_400_000;
const releasePattern = /^\d{14}-[0-9a-f]{7,40}-\d+$/;
const backupPattern = /^(?:\d{14}-[0-9a-f]{7,40}-\d+|\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z-[0-9a-f]{8})$/;
const cleanupKeys = ["CLEANUP_BACKUP_RETENTION", "CLEANUP_BACKUP_MIN_AGE_DAYS", "CLEANUP_LOG_MAX_MB", "CLEANUP_IMAGE_RETENTION"];

export function cleanupSettings(content = "", environment = process.env) {
  const values = parseSelectedEnv(content, cleanupKeys);
  const integer = (key, fallback, min, max) => {
    const value = String(environment[key] ?? values.get(key) ?? fallback);
    if (!/^\d+$/.test(value) || Number(value) < min || Number(value) > max) throw new Error(`${key} must be an integer between ${min} and ${max}`);
    return Number(value);
  };
  return {
    backupRetention: integer("CLEANUP_BACKUP_RETENTION", 7, 2, 365),
    backupMinAgeDays: integer("CLEANUP_BACKUP_MIN_AGE_DAYS", 7, 1, 3650),
    logMaxBytes: integer("CLEANUP_LOG_MAX_MB", 16, 1, 1024) * MiB,
    imageRetention: integer("CLEANUP_IMAGE_RETENTION", 2, 2, 50),
  };
}

function plainDirectory(path) {
  if (!isAbsolute(path) || resolve(path) === dirname(resolve(path))) throw new Error(`Cleanup requires a dedicated absolute directory: ${path}`);
  if (!existsSync(path)) return false;
  if (!lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink() || realpathSync(path) !== resolve(path)) {
    throw new Error(`Cleanup refuses a directory reached through a symlink: ${path}`);
  }
  return true;
}

function directChild(root, path) {
  if (!plainDirectory(root) || dirname(path) !== root || dirname(realpathSync(path)) !== realpathSync(root)
    || lstatSync(path).isSymbolicLink()) throw new Error(`Cleanup path escaped its verified directory: ${path}`);
}

function sizeOf(path) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) return 0;
  return stat.isDirectory() ? readdirSync(path).reduce((bytes, name) => bytes + sizeOf(resolve(path, name)), 0) : stat.size;
}

function readJson(path) {
  if (lstatSync(path).isSymbolicLink() || !lstatSync(path).isFile()) throw new Error(`Expected a regular JSON file: ${path}`);
  return JSON.parse(readFileSync(path, "utf8"));
}

function entry(path, kind, reason, action = "keep") {
  return { path, kind, reason, action, bytes: sizeOf(path) };
}

/** Only exact, recognized application artifacts enter a deletion plan. */
export function planFileCleanup({ backupRoot, releaseRoot, currentRelease, pm2Home, webName, cronName,
  releaseRetention = 5, settings = cleanupSettings(), now = Date.now() } = {}) {
  const entries = [];
  const eligibleBackups = [];
  if (backupRoot && plainDirectory(backupRoot)) {
    for (const name of readdirSync(backupRoot).sort().reverse()) {
      const path = resolve(backupRoot, name);
      const row = entry(path, "backup", "unrecognized backup; operator review required");
      entries.push(row);
      if (!backupPattern.test(name) || lstatSync(path).isSymbolicLink() || !lstatSync(path).isDirectory()) continue;
      directChild(backupRoot, path);
      try {
        const manifest = readJson(resolve(path, "manifest.json"));
        if (manifest.migrationSource) { row.reason = "native migration export/evidence is protected"; continue; }
        if (manifest.complete !== true) { row.reason = "incomplete backup/evidence is protected"; continue; }
        const statusFile = resolve(path, "deployment-state.json");
        if (!existsSync(statusFile)) { row.reason = "legacy backup has no proven deployment outcome; protected"; continue; }
        const status = readJson(statusFile);
        if (!["success", "backup"].includes(status.status)) { row.reason = "failed or unfinished deployment/evidence is protected"; continue; }
        const allowed = new Set(["manifest.json", "deployment-state.json", "media-verification.json", ...(manifest.files || [])]);
        const required = ["database.sql", "media.tar.gz", "hero-assets.tar.gz"];
        if (!Array.isArray(manifest.files) || required.some(file => !manifest.files.includes(file))
          || manifest.files.some(file => ![...required, "avatars.tar.gz", "media-manifest.json"].includes(file))
          || readdirSync(path).some(file => !allowed.has(file) || lstatSync(resolve(path, file)).isSymbolicLink())) {
          row.reason = "backup contains unknown files or symlinks; protected"; continue;
        }
        const created = Date.parse(manifest.createdAt);
        if (!Number.isFinite(created)) { row.reason = "backup creation time is invalid; protected"; continue; }
        // Damaged newer sets must never consume the retention slots of older
        // valid sets. Count only backups whose payload hashes actually match.
        verifyBackup(path, { archives: false });
        row.createdAt = manifest.createdAt;
        row.reason = "recent complete backup retention";
        eligibleBackups.push({ row, created });
      } catch { row.reason = "backup cannot be verified; protected"; }
    }
    eligibleBackups.sort((a, b) => b.created - a.created);
    for (const { row, created } of eligibleBackups.slice(settings.backupRetention)) {
      if (now - created < settings.backupMinAgeDays * day) { row.reason = "backup minimum age retention"; continue; }
      try {
        verifyBackup(row.path, { archives: false });
        row.action = "remove"; row.reason = "complete verified backup exceeds count and minimum age";
      } catch { row.reason = "backup checksum mismatch; protected evidence"; }
    }
  }
  if (releaseRoot && plainDirectory(releaseRoot)) {
    const current = currentRelease && currentRelease !== "-" ? resolve(currentRelease) : undefined;
    const releases = readdirSync(releaseRoot).sort().reverse().map(name => resolve(releaseRoot, name));
    const shaped = releases.filter(path => releasePattern.test(basename(path)) && lstatSync(path).isDirectory() && !lstatSync(path).isSymbolicLink());
    let previous;
    const successMarker = current && resolve(current, ".deploy-success.json");
    if (successMarker && existsSync(successMarker)) {
      try {
        const marker = readJson(successMarker);
        const value = marker.previousRelease;
        if (typeof value === "string" && value !== "-" && dirname(resolve(value)) === releaseRoot
          && existsSync(value) && !lstatSync(value).isSymbolicLink()) previous = resolve(value);
      } catch { /* Fall back conservatively for older releases below. */ }
    }
    previous ||= shaped.find(path => path !== current && (!current || basename(path) < basename(current)));
    const retained = new Set(shaped.slice(0, releaseRetention));
    for (const path of releases) {
      const row = entry(path, "release", "unrecognized directory or symlink; protected");
      entries.push(row);
      if (path === current) { row.reason = "current release is protected"; continue; }
      if (path === previous) { row.reason = "previous release for rollback is protected"; continue; }
      if (!shaped.includes(path)) continue;
      directChild(releaseRoot, path);
      if (existsSync(resolve(path, ".deploy-failed.json"))
        || (existsSync(resolve(path, ".deploy-migrate.log")) && !existsSync(resolve(path, ".deploy-success.json")))) {
        row.reason = "failed or unproven migration/release evidence is protected";
        if (!retained.has(path)) {
          for (const name of ["node_modules", ".next", ".runtime-workers"]) {
            const generated = resolve(path, name);
            if (existsSync(generated) && !lstatSync(generated).isSymbolicLink() && lstatSync(generated).isDirectory()) {
              const artifact = entry(generated, "release-build", "obsolete generated files; original migration/schema/failure evidence stays in its release", "remove");
              entries.push(artifact);
              row.bytes -= artifact.bytes;
            }
          }
        }
        continue;
      }
      if (retained.has(path)) { row.reason = "recent release retention"; continue; }
      row.action = "remove"; row.reason = "old release exceeds retention";
    }
  }
  if (pm2Home && plainDirectory(pm2Home)) {
    const logs = resolve(pm2Home, "logs");
    if (plainDirectory(logs)) {
      for (const name of [webName, cronName]) {
        if (!/^[A-Za-z0-9._-]+$/.test(name || "")) throw new Error("Exact project PM2 app names are required for log cleanup");
        for (const suffix of ["out", "error"]) {
          const path = resolve(logs, `${name}-${suffix}.log`);
          if (!existsSync(path)) continue;
          if (lstatSync(path).isSymbolicLink() || !lstatSync(path).isFile()) { entries.push(entry(path, "log", "log symlink/non-file is protected")); continue; }
          directChild(logs, path);
          const row = entry(path, "log", "project log is below the tail limit");
          if (row.bytes > settings.logMaxBytes) {
            row.action = "trim"; row.reason = `retain the last ${settings.logMaxBytes} bytes of this project's PM2 log`;
            row.releaseBytes = row.bytes - settings.logMaxBytes; row.maxBytes = settings.logMaxBytes;
          }
          entries.push(row);
        }
      }
    }
  }
  return { generatedAt: new Date(now).toISOString(), entries,
    reclaimableBytes: entries.reduce((sum, row) => sum + (row.action === "remove" ? row.bytes : row.releaseBytes || 0), 0) };
}

export function applyFileCleanup(plan, { beforeMutation = () => {} } = {}) {
  for (const row of plan.entries) {
    if (row.action === "keep") continue;
    beforeMutation();
    directChild(dirname(row.path), row.path);
    if (row.action === "remove") {
      if (row.kind === "backup") verifyBackup(row.path, { archives: false });
      rmSync(row.path, { recursive: true });
    } else if (row.action === "trim") {
      // Keep the inode open in PM2. Rename/replace would leave PM2 writing to an
      // unlinked large file, so disk space would not actually be reclaimed.
      const fd = openSync(row.path, "r+");
      try {
        const stat = fstatSync(fd);
        if (!stat.isFile() || stat.size <= row.maxBytes) continue;
        const tail = Buffer.alloc(row.maxBytes);
        const read = readSync(fd, tail, 0, tail.length, stat.size - tail.length);
        const newline = tail.subarray(0, read).indexOf(10);
        const content = tail.subarray(newline >= 0 ? newline + 1 : 0, read);
        ftruncateSync(fd, 0);
        writeSync(fd, content, 0, content.length, 0);
      } finally { closeSync(fd); }
    }
  }
}

export function reportCleanup(plan, { apply = false, log = console.log } = {}) {
  log(`[cleanup] ${apply ? "Apply" : "Preview"}: reclaimable up to ${Math.floor(plan.reclaimableBytes / MiB)} MiB; ${plan.entries.length} project artifacts inspected.`);
  for (const row of plan.entries) log(`[cleanup] ${row.action.toUpperCase()} ${row.path} (${row.bytes} bytes): ${row.reason}`);
}

export function writeCleanupReport(directory, plan, applied) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = resolve(directory, `cleanup-${Date.now()}-${randomUUID().slice(0, 8)}.json`);
  writeFileSync(path, JSON.stringify({ ...plan, applied }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  // These reports contain no database/media data or failure evidence. Bound the
  // report directory itself so cleanup does not create another unbounded store.
  const previous = readdirSync(directory).filter(name => /^cleanup-\d+-[0-9a-f]{8}\.json$/.test(name)).sort().reverse();
  for (const name of previous.slice(20)) {
    const candidate = resolve(directory, name);
    if (!lstatSync(candidate).isSymbolicLink() && lstatSync(candidate).isFile()) rmSync(candidate);
  }
  return path;
}

export function markBackupState(directory, status, releaseId) {
  writeFileSync(resolve(directory, "deployment-state.json"), JSON.stringify({ status, releaseId, recordedAt: new Date().toISOString() }) + "\n", { mode: 0o600 });
}

export function recordDeploymentImages(root, project, releaseId, images) {
  const directory = resolve(root, ".cache/deployment-images");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (!/^[A-Za-z0-9._-]+$/.test(releaseId)) throw new Error("Invalid deployment image record identity");
  const path = resolve(directory, `${releaseId}.json`);
  writeFileSync(path, JSON.stringify({ project, releaseId, createdAt: new Date().toISOString(), status: "pending", images }, null, 2), { flag: "wx", mode: 0o600 });
}

export function markDeploymentImages(root, releaseId, status) {
  if (!/^[A-Za-z0-9._-]+$/.test(releaseId) || !["built", "success", "failed"].includes(status)) throw new Error("Invalid deployment image status");
  const path = resolve(root, ".cache/deployment-images", `${releaseId}.json`);
  const record = readJson(path);
  writeFileSync(path, JSON.stringify({ ...record, status }, null, 2), { mode: 0o600 });
}

/** No daemon-wide prune: delete only exact references registered by this project. */
export function planDockerCleanup({ root, project, docker, settings = cleanupSettings() }) {
  const directory = resolve(root, ".cache/deployment-images");
  if (!plainDirectory(directory)) return { generatedAt: new Date().toISOString(), entries: [], reclaimableBytes: 0 };
  const records = [];
  for (const name of readdirSync(directory)) {
    const path = resolve(directory, name);
    if (!name.endsWith(".json") || lstatSync(path).isSymbolicLink() || !lstatSync(path).isFile()) continue;
    try {
      const record = readJson(path);
      if (record.project === project && Array.isArray(record.images) && Number.isFinite(Date.parse(record.createdAt))) records.push(record);
    } catch { /* Unrecognized ownership never authorizes image deletion. */ }
  }
  records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (!records.length) return { generatedAt: new Date().toISOString(), entries: [], reclaimableBytes: 0 };
  const lines = value => value.trim().split(/\r?\n/).filter(Boolean);
  const imageRows = lines(docker(["image", "ls", "--no-trunc", "--format", "{{json .}}"], { capture: true })).map(line => JSON.parse(line));
  const containers = lines(docker(["ps", "--all", "--quiet", "--no-trunc"], { capture: true }));
  const inUse = new Set(containers.map(id => docker(["inspect", id, "--format", "{{.Image}}"], { capture: true }).trim()));
  // Failed attempts have their own retention; they cannot evict either of the
  // last two successful releases needed for a real application rollback.
  const successes = records.filter(record => record.status === "success").slice(0, settings.imageRetention);
  const attempts = records.filter(record => record.status !== "success").slice(0, settings.imageRetention);
  const retained = new Set([...successes, ...attempts].flatMap(record => record.images));
  const entries = [];
  const observed = new Set();
  for (const record of records) {
    for (const reference of record.images) {
      if (typeof reference !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._/:@-]+$/.test(reference) || observed.has(reference)) continue;
      observed.add(reference);
      const image = imageRows.find(row => `${row.Repository}:${row.Tag}` === reference);
      if (!image || !/^sha256:[0-9a-f]{64}$/.test(image.ID)) continue;
      const id = image.ID;
      const bytes = Number(docker(["image", "inspect", reference, "--format", "{{.Size}}"], { capture: true }).trim());
      if (!Number.isFinite(bytes) || bytes < 0) throw new Error(`Could not inspect registered image size: ${reference}`);
      const reason = inUse.has(id) ? "image is referenced by an existing container; protected"
        : retained.has(reference) ? "current/previous image retention" : "unused registered project image exceeds retention";
      entries.push({ path: reference, kind: "image", id, bytes, reason, action: inUse.has(id) || retained.has(reference) ? "keep" : "remove" });
    }
  }
  return { generatedAt: new Date().toISOString(), entries,
    reclaimableBytes: [...new Map(entries.filter(row => row.action === "remove").map(row => [row.id, row.bytes])).values()].reduce((sum, bytes) => sum + bytes, 0) };
}

export function applyDockerCleanup(plan, docker) {
  for (const row of plan.entries.filter(row => row.action === "remove")) {
    const actual = docker(["image", "inspect", row.path, "--format", "{{.Id}}"], { capture: true }).trim();
    if (actual !== row.id) throw new Error(`Image reference changed during cleanup; preserved: ${row.path}`);
    docker(["image", "rm", row.path]); // No --force: Docker protects newly referenced images, too.
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [mode, ...args] = process.argv.slice(2);
    if (mode === "mark-backup") {
      markBackupState(args[0], args[1], args[2]);
      process.exit(0);
    }
    if (mode === "mark-release") {
      writeFileSync(resolve(args[0], ".deploy-success.json"), JSON.stringify({ status: "success", previousRelease: args[1] }) + "\n", { mode: 0o600 });
      process.exit(0);
    }
    if (mode !== "native") throw new Error("Use deploy.sh --cleanup [--apply] so project paths and the deployment lock are resolved safely");
    const [releaseRoot, currentRelease, backupRoot, pm2Home, webName, cronName, retention, envFile, reportDir] = args.filter(arg => arg !== "--apply");
    if (!reportDir) throw new Error("Native cleanup requires resolved deployment paths");
    const apply = args.includes("--apply");
    const plan = planFileCleanup({ releaseRoot: resolve(releaseRoot), currentRelease, backupRoot: resolve(backupRoot),
      pm2Home: resolve(pm2Home), webName, cronName, releaseRetention: Number(retention), settings: cleanupSettings(readFileSync(envFile, "utf8")) });
    reportCleanup(plan, { apply });
    if (apply) {
      const report = writeCleanupReport(reportDir, plan, false);
      console.log(`[cleanup] Report: ${report}`);
      applyFileCleanup(plan);
      writeFileSync(report, JSON.stringify({ ...plan, applied: true }, null, 2) + "\n", { mode: 0o600 });
      const kept = plan.entries.filter(row => row.kind === "release" && releasePattern.test(basename(row.path))
        && existsSync(row.path) && lstatSync(row.path).isDirectory() && !lstatSync(row.path).isSymbolicLink()).length;
      console.log(`[deploy] release retention complete: kept=${kept} removed=${plan.entries.filter(row => row.kind === "release" && row.action === "remove").length} limit=${retention}`);
    }
  } catch (error) { console.error(`[cleanup] ${error.message}`); process.exitCode = 1; }
}
