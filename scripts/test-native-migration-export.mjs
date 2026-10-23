import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { afterEach, test } from "node:test";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fileSha256 } from "./backup-integrity.mjs";
import { exportNative, resolveNativeSource } from "./native-migration-export.mjs";
import { verifyNativeBackup } from "./native-migration-bundle.mjs";

const fixtures = [];
afterEach(() => { for (const path of fixtures.splice(0)) rmSync(path, { recursive: true, force: true }); });

function fixture({ native = false, changed = false, failure, incomplete = false, unsafeSql = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "native migration "));
  fixtures.push(root);
  const source = join(root, native ? "runtime/source" : "old checkout");
  const media = join(root, native ? "runtime/shared/media" : "old checkout/.cache/media");
  const avatars = native ? join(media, "avatars") : join(source, ".cache/avatars");
  for (const path of [source, media, avatars, join(source, "public/heroes")]) mkdirSync(path, { recursive: true });
  writeFileSync(join(source, "package.json"), JSON.stringify({ name: "native-source" }));
  const password = "never-print-source-password";
  const databaseUrl = `mysql://source-user:${password}@source-db:3307/old_site`;
  writeFileSync(join(source, ".env"), `DATABASE_URL=${databaseUrl}\nSESSION_SECRET=never-copy-session-secret\n`);
  writeFileSync(join(root, ".env"), "DATABASE_URL=mysql://wrong:wrong@new-container/wrong_site\n");
  writeFileSync(join(media, "original-video.mp4"), "retained source video");
  const mediaManifest = () => ({ version: 1, generatedAt: new Date().toISOString(), complete: true, counts: { screenshots: 0, videos: 1, avatars: 0 }, objects: [{ kind: "combat-video", recordId: 42, ownerId: 1, storageKey: "post-videos/2026/10/abcdef.mp4", size: 21, sha256: "a".repeat(64), ok: true }], problems: [] });
  const archiveRoot = join(root, "archive-fixture"); mkdirSync(archiveRoot);
  const calls = []; const logs = [];
  const run = (command, args, options) => {
    calls.push({ command, args, options });
    if (failure?.(args)) throw new Error(`Database connection failed: ${databaseUrl}`);
    if (basename(args[0]) === "native-db-identity.mjs") {
      writeFileSync(args[1], JSON.stringify({ version: 1, serverUuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", database: "old_site" }));
    } else if (basename(args[0]) === "media-manifest.mjs") {
      const manifest = mediaManifest();
      if (changed && args[1].endsWith("source-media-after.json")) manifest.objects[0].sha256 = "b".repeat(64);
      if (incomplete) { manifest.complete = false; manifest.problems.push({ problem: "MISSING" }); }
      writeFileSync(args[1], JSON.stringify(manifest));
    } else if (basename(args[0]) === "native-release-backup.mjs") {
      const directory = args[1];
      const files = ["database.sql", "media-manifest.json", "media.tar.gz", "avatars.tar.gz", "hero-assets.tar.gz"];
      for (const name of files) {
        if (name.endsWith(".tar.gz")) {
          const result = spawnSync("tar", ["-czf", join(directory, name), "-C", archiveRoot, "."], { encoding: "utf8", windowsHide: true });
          assert.equal(result.status, 0, result.stderr);
        } else writeFileSync(join(directory, name), name === "media-manifest.json" ? JSON.stringify(mediaManifest()) : unsafeSql ? "USE another;" : "CREATE TABLE `User` (`id` int);\n");
      }
      writeFileSync(join(directory, "manifest.json"), JSON.stringify({ complete: true, files, sha256: Object.fromEntries(files.map(name => [name, fileSha256(join(directory, name))])) }));
    } else throw new Error("Unexpected backup command");
  };
  return { root, source, media, avatars, password, databaseUrl, calls, logs, run, verify: directory => verifyNativeBackup(directory, { tarBin: "tar" }), log: message => logs.push(message), options: { root, sourceRoot: source, writersStopped: true } };
}

test("native export preserves source paths and creates complete checksummed evidence without credentials", async () => {
  const f = fixture();
  const directory = await exportNative(f.options, f);
  const manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8"));
  assert.equal(manifest.complete, true);
  assert.deepEqual(manifest.migrationSource, { version: 1, writersStopped: true, database: "old_site", databaseIdentity: { serverUuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", database: "old_site" }, root: f.source, media: f.media, avatars: f.avatars, heroAssetsPresent: true, mediaVerifiedBeforeAndAfter: true });
  assert.equal(manifest.files.length, 8);
  for (const name of manifest.files) assert.equal(manifest.sha256[name], fileSha256(join(directory, name)));
  assert.equal(readFileSync(join(f.media, "original-video.mp4"), "utf8"), "retained source video");
  assert.equal(f.calls[2].args[2], f.source);
  assert.equal(f.calls[2].options.cwd, f.source);
  assert.equal(f.calls[2].options.env.MEDIA_STORAGE_DIR, f.media);
  assert.equal(f.calls[2].options.env.AVATAR_DIR, f.avatars);
  assert.equal(f.calls[2].options.env.DEPLOY_PROJECT_NAME, "native-source");
  assert.equal(f.calls[2].args[0], join(f.root, "scripts/native-release-backup.mjs"));
  const publicOutput = JSON.stringify({ manifest, logs: f.logs, args: f.calls.map(call => call.args) });
  assert.ok(!publicOutput.includes(f.password));
  assert.ok(!publicOutput.includes(f.databaseUrl));
  assert.ok(!readdirSync(directory).some(name => name.includes(".env")));
  if (process.platform !== "win32") assert.equal(statSync(directory).mode & 0o777, 0o700);
});

test("source configuration wins over stale shell connections and excludes unrelated secrets", async () => {
  const f = fixture();
  const saved = Object.fromEntries(["DATABASE_URL", "MEDIA_STORAGE_DIR", "AVATAR_DIR", "SESSION_SECRET", "MYSQLDUMP_BIN", "NODE_OPTIONS"].map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, { DATABASE_URL: "mysql://stale:secret@stale/stale", MEDIA_STORAGE_DIR: "wrong/media", AVATAR_DIR: "wrong/avatars", SESSION_SECRET: "shell-secret", MYSQLDUMP_BIN: "wrong-dump", NODE_OPTIONS: "--trace-warnings" });
    writeFileSync(join(f.source, "selected.env"), `DATABASE_URL=${f.databaseUrl}\nMEDIA_STORAGE_DIR=.cache/media\nAVATAR_DIR=.cache/avatars\nDEPLOY_PROJECT_NAME=selected-project\nDEPLOY_MYSQLDUMP_BIN=source-dump\nDEPLOY_TAR_BIN=source-tar\n`);
    await exportNative({ ...f.options, sourceEnv: "selected.env" }, f);
    const env = f.calls[0].options.env;
    assert.equal(env.DATABASE_URL, f.databaseUrl);
    assert.equal(env.MEDIA_STORAGE_DIR, f.media);
    assert.equal(env.AVATAR_DIR, f.avatars);
    assert.equal(env.MYSQLDUMP_BIN, "source-dump");
    assert.equal(env.DEPLOY_TAR_BIN, "source-tar");
    assert.equal(env.DEPLOY_PROJECT_NAME, "selected-project");
    assert.equal(env.SESSION_SECRET, undefined);
    assert.equal(env.NODE_OPTIONS, undefined);
    assert.equal(env.__NEXT_PROCESSED_ENV, "true");
  } finally {
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test("writers-stopped is required before any backup operation", async () => {
  const f = fixture();
  await assert.rejects(exportNative({ ...f.options, writersStopped: false }, f), /--writers-stopped/);
  assert.equal(f.calls.length, 0);
  assert.ok(!existsSync(join(f.root, "data")));
});

test("missing or invalid source database never falls back to the active shell or Docker env", () => {
  const f = fixture();
  for (const value of ["", "DATABASE_URL=invalid-secret-value", "DATABASE_URL=mysql://user:secret@host/-unsafe"]) {
    writeFileSync(join(f.source, ".env"), value);
    assert.throws(() => resolveNativeSource(f.options), error => /DATABASE_URL/.test(error.message) && !error.message.includes("secret"));
  }
});

test("recognizes native shared storage from source and versioned release roots", () => {
  const f = fixture({ native: true });
  assert.equal(resolveNativeSource(f.options).media, f.media);
  const release = join(f.root, "runtime/releases/release-1");
  mkdirSync(release, { recursive: true });
  writeFileSync(join(release, ".env"), `DATABASE_URL=${f.databaseUrl}\nDEPLOY_PROJECT_NAME=release\n`);
  assert.equal(resolveNativeSource({ root: f.root, sourceRoot: release }).media, f.media);
  assert.equal(resolveNativeSource({ root: f.root, sourceRoot: release }).avatars, f.avatars);
});

test("multiple candidate media or avatar directories require an explicit source", () => {
  const f = fixture({ native: true });
  const development = join(f.source, ".cache/media");
  mkdirSync(development, { recursive: true });
  assert.throws(() => resolveNativeSource(f.options), /multiple source directories.*--source-media/);
  mkdirSync(join(f.source, ".cache/avatars"), { recursive: true });
  assert.throws(() => resolveNativeSource({ ...f.options, sourceMedia: f.media }), /multiple source directories.*--source-avatars/);
  assert.equal(resolveNativeSource({ ...f.options, sourceMedia: f.media, sourceAvatars: f.avatars }).media, f.media);
});

test("cannot export a backup into source media, avatars or hero assets", async () => {
  const f = fixture();
  for (const backupDir of [f.media, f.avatars, join(f.source, "public/heroes/backups")]) {
    await assert.rejects(exportNative({ ...f.options, backupDir }, f), /outside source/);
  }
  assert.equal(f.calls.length, 0);
});

test("source links and backup directory links cannot escape into another tree", async () => {
  const f = fixture();
  const outside = join(f.root, "outside");
  mkdirSync(outside);
  symlinkSync(outside, join(f.media, "linked-directory"), process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(exportNative(f.options, f), /Symbolic links/);
  rmSync(join(f.media, "linked-directory"));
  symlinkSync(outside, join(f.root, "linked-backups"), process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(exportNative({ ...f.options, backupDir: "linked-backups" }, f), /Symbolic links/);
  assert.equal(f.calls.length, 0);
});

test("post-backup changes invalidate a child complete manifest and preserve all evidence", async () => {
  const f = fixture({ changed: true });
  await assert.rejects(exportNative(f.options, f), /source media consistency verification/);
  const parent = join(f.root, "data/docker-backups");
  const directory = join(parent, readdirSync(parent)[0]);
  assert.equal(JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8")).complete, false);
  assert.ok(existsSync(join(directory, "database.sql")));
  assert.ok(existsSync(join(directory, "source-media-after.json")));
  assert.ok(!f.logs.some(message => message.includes("Complete backup")));
});

test("subprocess failure preserves incomplete evidence and never exposes a source connection", async () => {
  const f = fixture({ failure: args => basename(args[0]) === "native-release-backup.mjs" });
  await assert.rejects(exportNative(f.options, f), error => /incomplete evidence retained/.test(error.message) && !error.message.includes(f.password));
  const parent = join(f.root, "data/docker-backups");
  const directory = join(parent, readdirSync(parent)[0]);
  assert.equal(JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8")).complete, false);
  assert.ok(existsSync(join(directory, "source-media-before.json")));
});

test("incomplete source manifest stops before taking a database backup", async () => {
  const f = fixture({ incomplete: true });
  await assert.rejects(exportNative(f.options, f), /source media verification/);
  assert.equal(f.calls.length, 2);
});
test("export rejects an unimportable SQL bundle and retains incomplete evidence", async () => {
  const f = fixture({ unsafeSql: true });
  await assert.rejects(exportNative(f.options, f), /migration package validation/);
  const parent = join(f.root, "data/docker-backups"); const directory = join(parent, readdirSync(parent)[0]);
  assert.equal(JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8")).complete, false);
  assert.ok(existsSync(join(directory, "database.sql")));
  assert.ok(!f.logs.some(message => message.includes("Complete backup")));
});

test("repeated exports always create distinct directories without overwriting a prior backup", async () => {
  const f = fixture();
  const first = await exportNative(f.options, f);
  const second = await exportNative(f.options, f);
  assert.notEqual(first, second);
  assert.equal(JSON.parse(readFileSync(join(first, "manifest.json"), "utf8")).complete, true);
  assert.equal(JSON.parse(readFileSync(join(second, "manifest.json"), "utf8")).complete, true);
});

test("native backup invokes current tool scripts from the source cwd and separates migration archives", () => {
  const f = fixture({ native: true });
  const toolScripts = join(f.root, "tools/scripts");
  mkdirSync(toolScripts, { recursive: true });
  for (const name of ["native-release-backup.mjs", "backup-integrity.mjs"]) {
    copyFileSync(fileURLToPath(new URL(name, import.meta.url)), join(toolScripts, name));
  }
  writeFileSync(join(toolScripts, "db-backup.mjs"), 'import {writeFileSync} from "node:fs"; import {resolve} from "node:path"; writeFileSync(resolve(process.argv[2], "source.sql"), "SELECT 1;\\n");');
  writeFileSync(join(toolScripts, "media-manifest.mjs"), 'import {writeFileSync} from "node:fs"; writeFileSync(process.argv[2], JSON.stringify({complete:true,objects:[],problems:[]}));');
  writeFileSync(join(f.avatars, "avatar.png"), "avatar fixture");
  const heroes = join(f.source, "public/heroes");
  mkdirSync(join(heroes, "images"));
  writeFileSync(join(heroes, "images/hero.png"), "hero fixture");
  writeFileSync(join(heroes, "not-a-generated-asset.txt"), "source-only hero metadata");
  for (const migration of [true, false]) {
    const directory = join(f.root, migration ? "migration-archive" : "release-archive");
    const result = spawnSync(process.execPath, [join(toolScripts, "native-release-backup.mjs"), directory, f.source], {
      cwd: f.source, encoding: "utf8", windowsHide: true,
      env: { ...process.env, MEDIA_STORAGE_DIR: f.media, AVATAR_DIR: f.avatars, NATIVE_MIGRATION_EXPORT: migration ? "1" : "0", DEPLOY_TAR_BIN: "tar" },
    });
    assert.equal(result.status, 0, result.stderr);
    const listing = name => {
      const archive = spawnSync("tar", ["-tzf", join(directory, name)], { encoding: "utf8", windowsHide: true });
      assert.equal(archive.status, 0, archive.stderr);
      return archive.stdout;
    };
    assert.equal(listing("media.tar.gz").includes("avatars/avatar.png"), !migration);
    assert.ok(listing("avatars.tar.gz").includes("avatar.png"));
    assert.ok(listing("hero-assets.tar.gz").includes("images/hero.png"));
    assert.equal(listing("hero-assets.tar.gz").includes("not-a-generated-asset.txt"), !migration);
    assert.equal(JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8")).complete, true);
  }
});
