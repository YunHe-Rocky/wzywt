import { randomUUID } from "node:crypto";
import { chownSync, closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { compareMediaManifests, validateDatabaseIdentity, validateMediaManifest, verifyNativeBackup } from "../scripts/native-migration-bundle.mjs";
import { runtimeEnvironment } from "./runtime-env.mjs";
import { assertContainerStorage } from "../scripts/compose-storage.mjs";

export const migrationDirectories = Object.freeze({ media: "/app/data/media", avatars: "/app/data/media/avatars", heroes: "/app/public/heroes" });
const markerName = ".native-import.json";
const applicationIdentity = () => typeof process.getuid === "function" && process.getuid() === 0 ? { uid: 1000, gid: 1000 } : {};
function ownMarker(path) {
  // Rclone can expose all files as uid 1000 while rejecting chown. In that case
  // the marker already belongs to the application and needs no metadata change.
  const info = lstatSync(path);
  if (typeof process.getuid === "function" && process.getuid() === 0 && (info.uid !== 1000 || info.gid !== 1000)) chownSync(path, 1000, 1000);
}

export function readImportMarker(directories = migrationDirectories) {
  const path = join(directories.media, markerName);
  let info;
  try { info = lstatSync(path); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
  if (!info.isFile() || info.isSymbolicLink()) throw new Error("Unsafe native migration marker");
  const marker = JSON.parse(readFileSync(path, "utf8"));
  if (marker?.version !== 1 || !["pending", "completed"].includes(marker.state) || !/^[a-f0-9]{64}$/.test(marker.bundleSha256)) throw new Error("Invalid native migration marker; preserve it for recovery");
  return marker;
}

export function guardNativeImport(directories = migrationDirectories) {
  if (readImportMarker(directories)?.state === "pending") throw new Error("A native migration is incomplete. Preserve its database, volumes and report; use a new empty target for a fresh import.");
  return { pendingImport: false };
}

export function assertEmptyMigrationTargets(directories = migrationDirectories, { allowMarker = false } = {}) {
  const roots = [directories.media, join(directories.heroes, "images"), join(directories.heroes, "skins")];
  function walk(path, isMediaRoot = false) {
    if (!existsSync(path)) return;
    const info = lstatSync(path);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error("Migration target must be a real empty directory");
    for (const item of readdirSync(path, { withFileTypes: true })) {
      if (isMediaRoot && allowMarker && item.name === markerName && item.isFile()) continue;
      if (!item.isDirectory() || item.isSymbolicLink()) throw new Error("Migration target already contains files; existing data will not be overwritten");
      walk(join(path, item.name));
    }
  }
  for (const root of roots) walk(root, root === directories.media);
}

export function checkTargetDatabase(mode, identity, sourceIdentity, tableCount) {
  if (!["container", "external"].includes(mode)) throw new Error("Migration MYSQL_MODE must be container or external");
  if (mode === "container") {
    if (Number(tableCount) !== 0) throw new Error("Container database is not empty; refusing to overwrite existing tables");
  } else {
    const actual = validateDatabaseIdentity(identity); const source = validateDatabaseIdentity(sourceIdentity);
    if (actual.serverUuid !== source.serverUuid || actual.database !== source.database) throw new Error("External database identity differs from the stopped native source; no SQL will be imported");
  }
}

async function databaseState(environment) {
  const { PrismaClient } = await import("@prisma/client");
  let prisma;
  try {
    prisma = new PrismaClient({ datasources: { db: { url: runtimeEnvironment(environment).DATABASE_URL } } });
    const [identity] = await prisma.$queryRawUnsafe("SELECT @@server_uuid AS serverUuid, DATABASE() AS `database`");
    const [tables] = await prisma.$queryRawUnsafe("SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema = DATABASE()");
    return { identity, tableCount: Number(tables.total) };
  } catch {
    throw new Error("Cannot inspect target MySQL identity and tables; check its connection and database permissions");
  } finally { await prisma?.$disconnect(); }
}

export async function preflightNativeImport(directory, mode, { directories = migrationDirectories, environment = process.env, inspectDatabase = databaseState, verify = verifyNativeBackup } = {}) {
  guardNativeImport(directories);
  assertEmptyMigrationTargets(directories);
  const bundle = await verify(directory);
  const state = await inspectDatabase(environment);
  checkTargetDatabase(mode, state.identity, bundle.databaseIdentity, state.tableCount);
  return { integrityVerified: true, emptyStorageVerified: true, databaseMode: mode, databaseVerified: true };
}

export async function beginNativeImport(directory, { directories = migrationDirectories, verify = verifyNativeBackup } = {}) {
  guardNativeImport(directories);
  assertEmptyMigrationTargets(directories);
  const bundle = await verify(directory);
  mkdirSync(directories.media, { recursive: true });
  const path = join(directories.media, markerName);
  writeFileSync(path, JSON.stringify({ version: 1, state: "pending", bundleSha256: bundle.bundleSha256, startedAt: new Date().toISOString() }) + "\n", { flag: "wx", mode: 0o600 });
  ownMarker(path);
  return { state: "pending", bundleSha256: bundle.bundleSha256 };
}

function requireMatchingPending(bundle, directories) {
  const marker = readImportMarker(directories);
  if (marker?.state !== "pending" || marker.bundleSha256 !== bundle.bundleSha256) throw new Error("Native import requires the matching pending marker created before SQL import");
  return marker;
}

export async function restoreNativeMedia(directory, { directories = migrationDirectories, verify = verifyNativeBackup, run = spawnSync, tarBin = "tar" } = {}) {
  const bundle = await verify(directory);
  requireMatchingPending(bundle, directories);
  assertEmptyMigrationTargets(directories, { allowMarker: true });
  for (const [name, destination] of [["media.tar.gz", directories.media], ["avatars.tar.gz", directories.avatars], ["hero-assets.tar.gz", directories.heroes]]) {
    mkdirSync(destination, { recursive: true });
    // The privileged parent can open a private 0700/0600 backup. Only the open
    // descriptor crosses into tar, which extracts as uid/gid 1000 and cannot
    // traverse the source directory or create root-owned files in app storage.
    const input = openSync(resolve(directory, name), "r");
    try {
      const result = run(tarBin, ["--extract", "--gzip", "--file", "-", "--directory", destination,
        "--no-same-owner", "--no-same-permissions", "--keep-old-files", "--no-overwrite-dir"], { ...applicationIdentity(), stdio: [input, "pipe", "pipe"], encoding: "utf8", maxBuffer: 1024 * 1024, windowsHide: true });
      if (result.error || result.status !== 0) throw new Error(`Native media extraction failed: ${name}; pending marker retained`);
    } finally { closeSync(input); }
  }
  return { mediaRestored: true, state: "pending" };
}

export function collectMediaManifest({ environment = process.env, run = spawnSync, temporaryDirectory = tmpdir() } = {}) {
  const output = join(temporaryDirectory, `wzywt-media-${randomUUID()}.json`);
  try {
    const result = run(process.execPath, ["scripts/media-manifest.mjs", output], { ...applicationIdentity(), env: runtimeEnvironment(environment), encoding: "utf8", maxBuffer: 1024 * 1024, windowsHide: true });
    if (!existsSync(output)) throw new Error("Media audit could not produce a manifest; verify database connectivity and storage permissions");
    const manifest = JSON.parse(readFileSync(output, "utf8"));
    return { manifest, commandSucceeded: !result.error && result.status === 0 };
  } finally { if (existsSync(output)) unlinkSync(output); }
}

export async function verifyNativeImport(directory, { directories = migrationDirectories, verify = verifyNativeBackup, collect = collectMediaManifest, printManifest = () => {} } = {}) {
  const bundle = await verify(directory); const marker = requireMatchingPending(bundle, directories);
  const { manifest, commandSucceeded } = collect();
  printManifest(JSON.stringify(manifest, null, 2));
  const summary = compareMediaManifests(bundle.mediaManifest, manifest);
  if (!commandSucceeded) throw new Error("Media verification command failed; pending marker retained");
  const path = join(directories.media, markerName); const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify({ ...marker, state: "completed", completedAt: new Date().toISOString(), ...summary }) + "\n", { flag: "wx", mode: 0o600 });
  ownMarker(temporary);
  renameSync(temporary, path);
  return { ...summary, state: "completed" };
}

export function auditMedia(output, { directories = migrationDirectories, collect = collectMediaManifest, print = value => console.log(value) } = {}) {
  guardNativeImport(directories);
  const { manifest, commandSucceeded } = collect();
  const serialized = JSON.stringify(manifest, null, 2) + "\n";
  if (output === "-") print(serialized.trimEnd());
  else { mkdirSync(dirname(resolve(output)), { recursive: true }); writeFileSync(resolve(output), serialized, { flag: "wx", mode: 0o600 }); }
  validateMediaManifest(manifest);
  if (!commandSucceeded) throw new Error("Media audit command failed");
  return { verifiedObjects: manifest.objects.length, counts: manifest.counts };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, argument, mode] = process.argv.slice(2);
  try {
    assertContainerStorage();
    const importing = ["preflight", "begin", "restore", "verify"].includes(command);
    if (typeof process.getuid === "function" && process.getuid() !== 1000 && !(importing && process.getuid() === 0)) throw new Error("Native migration must run as uid 1000, or as the scoped import helper");
    let result;
    if (command === "guard") result = guardNativeImport();
    else if (command === "preflight" && argument) result = await preflightNativeImport(argument, mode);
    else if (command === "begin" && argument) result = await beginNativeImport(argument);
    else if (command === "restore" && argument) result = await restoreNativeMedia(argument);
    else if (command === "verify" && argument) result = await verifyNativeImport(argument, { printManifest: value => console.log(value) });
    else if (command === "audit" && argument) result = auditMedia(argument);
    else throw new Error("usage: native-migration.mjs guard | preflight BACKUP MODE | begin BACKUP | restore BACKUP | verify BACKUP | audit OUTPUT-or-dash");
    if (command !== "verify" && !(command === "audit" && argument === "-")) console.log(JSON.stringify(result));
  } catch (error) { console.error(`[native-migration] ${error.message}`); process.exitCode = 1; }
}
