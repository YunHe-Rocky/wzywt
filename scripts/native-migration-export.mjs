import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, parse, relative, resolve, sep } from "node:path";
import { fileSha256, verifyBackup } from "./backup-integrity.mjs";
import { parseSelectedEnv } from "./deploy-env.mjs";
import { verifyNativeBackup } from "./native-migration-bundle.mjs";

const sourceKeys = ["DATABASE_URL", "MEDIA_STORAGE_DIR", "AVATAR_DIR", "DEPLOY_BASE_DIR", "DEPLOY_PROJECT_NAME", "MYSQLDUMP_BIN", "DEPLOY_MYSQLDUMP_BIN", "DEPLOY_TAR_BIN"];
const hostKeys = ["PATH", "Path", "PATHEXT", "SystemRoot", "SYSTEMROOT", "ComSpec", "COMSPEC", "TEMP", "TMP", "TMPDIR", "HOME", "USERPROFILE", "LANG", "LC_ALL", "TZ"];

function within(parent, child) {
  const value = relative(parent, child);
  return !value || (value !== ".." && !value.startsWith(".." + sep) && !isAbsolute(value));
}

// Do not follow a directory link into a different storage tree or backup target.
function noLinkedParents(path) {
  let current = parse(path).root;
  for (const part of relative(current, path).split(sep).filter(Boolean)) {
    current = resolve(current, part);
    try {
      if (lstatSync(current).isSymbolicLink()) throw new Error(`Symbolic links are not allowed in storage/backup paths: ${current}`);
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
}

function checkStorageTree(path) {
  noLinkedParents(path);
  if (path === parse(path).root || !lstatSync(path).isDirectory()) throw new Error(`Storage must be a non-root directory: ${path}`);
  const pending = [path];
  while (pending.length) {
    for (const entry of readdirSync(pending.pop(), { withFileTypes: true })) {
      const child = resolve(entry.parentPath, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not allowed in exported storage: ${child}`);
      if (entry.isDirectory()) pending.push(child);
      else if (!entry.isFile()) throw new Error(`Unsupported storage object: ${child}`);
    }
  }
}

function selectDirectory(label, explicit, candidates, sourceRoot) {
  if (explicit?.trim()) {
    const selected = resolve(sourceRoot, explicit);
    checkStorageTree(selected);
    return selected;
  }
  const present = [...new Set(candidates.map(path => resolve(path)))].filter(existsSync);
  if (present.length !== 1) throw new Error(`${label}: ${present.length ? "multiple source directories exist" : "source directory not found"}; pass --source-${label} explicitly`);
  checkStorageTree(present[0]);
  return present[0];
}

function runtimeBases(sourceRoot, settings) {
  const bases = [resolve(sourceRoot + "-runtime")];
  if (settings.DEPLOY_BASE_DIR?.trim()) bases.push(resolve(sourceRoot, settings.DEPLOY_BASE_DIR));
  if (["source", "current"].includes(basename(sourceRoot))) bases.push(dirname(sourceRoot));
  if (basename(dirname(sourceRoot)) === "releases") bases.push(dirname(dirname(sourceRoot)));
  return [...new Set(bases)];
}

export function resolveNativeSource({ root, sourceRoot = root, sourceEnv, sourceMedia, sourceAvatars }) {
  if (!root || !sourceRoot) throw new Error("A project root is required for native export");
  // The native deployer intentionally uses current and release/.env links.
  const directory = realpathSync(resolve(sourceRoot));
  const envFile = realpathSync(resolve(directory, sourceEnv || ".env"));
  const settings = Object.fromEntries(parseSelectedEnv(readFileSync(envFile, "utf8"), sourceKeys));
  let url;
  try { url = new URL(settings.DATABASE_URL); }
  catch { throw new Error("The selected source environment must contain a valid DATABASE_URL"); }
  let database;
  try { database = decodeURIComponent(url.pathname.slice(1)); }
  catch { throw new Error("The selected source DATABASE_URL has an invalid database name"); }
  if (url.protocol !== "mysql:" || !url.hostname || !/^[A-Za-z0-9_][A-Za-z0-9_$-]*$/.test(database)) {
    throw new Error("The selected source DATABASE_URL must identify one MySQL database");
  }
  const media = selectDirectory("media", sourceMedia || settings.MEDIA_STORAGE_DIR,
    [resolve(directory, ".cache/media"), ...runtimeBases(directory, settings).map(base => resolve(base, "shared/media"))], directory);
  const avatars = selectDirectory("avatars", sourceAvatars || settings.AVATAR_DIR,
    [resolve(media, "avatars"), resolve(directory, ".cache/avatars")], directory);
  const heroes = resolve(directory, "public/heroes");
  if (existsSync(heroes)) checkStorageTree(heroes);
  else noLinkedParents(heroes);
  const project = settings.DEPLOY_PROJECT_NAME?.trim() || JSON.parse(readFileSync(resolve(directory, "package.json"), "utf8")).name;
  if (typeof project !== "string" || !project.trim()) throw new Error("Source package.json or DEPLOY_PROJECT_NAME must identify the project");
  const env = Object.fromEntries(hostKeys.filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  Object.assign(env, {
    NODE_ENV: "production", __NEXT_PROCESSED_ENV: "true",
    DATABASE_URL: settings.DATABASE_URL, MEDIA_STORAGE_DIR: media, AVATAR_DIR: avatars,
    DEPLOY_PROJECT_NAME: project, MYSQLDUMP_BIN: settings.DEPLOY_MYSQLDUMP_BIN || settings.MYSQLDUMP_BIN || "mysqldump",
    DEPLOY_TAR_BIN: settings.DEPLOY_TAR_BIN || "tar", APP_RELEASE_ID: "native-migration-export", NATIVE_MIGRATION_EXPORT: "1",
  });
  return { directory, envFile, database, media, avatars, heroes, env };
}

function defaultRun(command, args, options) {
  const result = spawnSync(command, args, { ...options, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024, windowsHide: true, shell: false });
  // Child failures can include connection details. Never echo their output or env.
  if (result.error || result.status !== 0) throw new Error("Native backup subprocess failed");
}

function stableManifest(path) {
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  if (manifest.complete !== true || !Array.isArray(manifest.objects) || !Array.isArray(manifest.problems) || manifest.problems.length) {
    throw new Error("Source media manifest is incomplete");
  }
  const { generatedAt: _generatedAt, ...content } = manifest;
  return JSON.stringify(content);
}

function publishManifest(directory, manifest) {
  const temporary = resolve(directory, `manifest-${randomUUID()}.tmp`);
  writeFileSync(temporary, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  renameSync(temporary, resolve(directory, "manifest.json"));
}

/** Create a portable native backup after the operator has stopped every writer. */
export async function exportNative({ root, sourceRoot = root, sourceEnv, sourceMedia, sourceAvatars, backupDir, writersStopped = false }, { run = defaultRun, log = console.log, verify = verifyNativeBackup } = {}) {
  if (writersStopped !== true) throw new Error("Stop the source Web, Cron and other writers, then pass --writers-stopped; export never stops an unknown PM2 process");
  const source = resolveNativeSource({ root, sourceRoot, sourceEnv, sourceMedia, sourceAvatars });
  const workingRoot = realpathSync(resolve(root));
  const parent = resolve(workingRoot, backupDir || "data/docker-backups");
  const directory = resolve(parent, `native-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}`);
  for (const path of [source.media, source.avatars, source.heroes]) {
    if (within(path, directory) || within(directory, path)) throw new Error("Native export destination must be outside source media, avatars and hero storage");
  }
  noLinkedParents(directory);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  mkdirSync(directory, { mode: 0o700 });
  const options = { cwd: source.directory, env: source.env };
  const script = name => resolve(workingRoot, "scripts", name);
  let stage = "source media verification";
  let manifest = { complete: false, createdAt: new Date().toISOString(), files: [], sha256: {} };
  try {
    log("[export-native] Verifying source media before backup");
    await run(process.execPath, [script("native-db-identity.mjs"), resolve(directory, "source-database-identity.json")], options);
    const identity = JSON.parse(readFileSync(resolve(directory, "source-database-identity.json"), "utf8"));
    if (identity.version !== 1 || identity.database !== source.database || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(identity.serverUuid)) throw new Error("Source database identity is invalid");
    await run(process.execPath, [script("media-manifest.mjs"), resolve(directory, "source-media-before.json")], options);
    const before = stableManifest(resolve(directory, "source-media-before.json"));
    stage = "database and files backup";
    log("[export-native] Exporting database, media, avatars and hero assets");
    await run(process.execPath, [script("native-release-backup.mjs"), directory, source.directory], options);
    manifest = JSON.parse(readFileSync(resolve(directory, "manifest.json"), "utf8"));
    if (manifest.complete !== true) throw new Error("Native backup is incomplete");
    manifest.complete = false;
    publishManifest(directory, manifest);
    stage = "source media consistency verification";
    await run(process.execPath, [script("media-manifest.mjs"), resolve(directory, "source-media-after.json")], options);
    if (before !== stableManifest(resolve(directory, "media-manifest.json")) || before !== stableManifest(resolve(directory, "source-media-after.json"))) {
      throw new Error("Source media changed while exporting");
    }
    for (const path of [source.media, source.avatars, ...(existsSync(source.heroes) ? [source.heroes] : [])]) checkStorageTree(path);
    for (const name of ["source-database-identity.json", "source-media-before.json", "source-media-after.json"]) {
      manifest.files.push(name);
      manifest.sha256[name] = fileSha256(resolve(directory, name));
    }
    manifest.migrationSource = {
      version: 1, writersStopped: true, database: source.database, root: source.directory,
      databaseIdentity: { serverUuid: identity.serverUuid, database: identity.database },
      media: source.media, avatars: source.avatars, heroAssetsPresent: existsSync(source.heroes),
      mediaVerifiedBeforeAndAfter: true,
    };
    for (const name of manifest.files) chmodSync(resolve(directory, name), 0o600);
    manifest.complete = true;
    publishManifest(directory, manifest);
    verifyBackup(directory, { archives: false });
    stage = "migration package validation (single-database table dump, safe archives and before/after media evidence; custom routines/triggers/events are unsupported)";
    await verify(directory, { tarBin: source.env.DEPLOY_TAR_BIN });
    log(`[export-native] Complete backup: ${directory}; source files and database were retained`);
    return directory;
  } catch {
    // Even a child that already published a complete native manifest cannot turn
    // a failed consistency check into a usable migration package.
    manifest.complete = false;
    publishManifest(directory, manifest);
    throw new Error(`Native export failed during ${stage}; incomplete evidence retained at ${directory}. Check the selected source database, media and stopped writers before retrying`);
  }
}
