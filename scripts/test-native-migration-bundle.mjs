import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileSha256 } from "./backup-integrity.mjs";
import { compareMediaManifests, nativeBackupFiles, validateArchiveListing, validateMediaManifest, validateMigrationSql, verifyNativeBackup } from "./native-migration-bundle.mjs";

const identity = { version: 1, serverUuid: "12345678-1234-1234-1234-123456789abc", database: "wzywt" };
const emptyMedia = () => ({ version: 1, complete: true, counts: { screenshots: 0, videos: 0, avatars: 0 }, objects: [], problems: [] });
const video = () => ({ kind: "combat-video", recordId: 4, ownerId: 2, storageKey: "post-videos/2026/10/abcdef.mp4", size: 5, sha256: "a".repeat(64), ok: true });
function temporary(t) {
  const directory = mkdtempSync(join(tmpdir(), "wzywt-native-bundle-test-"));
  t.after(() => { assert.ok(resolve(directory).startsWith(resolve(tmpdir()))); rmSync(directory, { recursive: true, force: true }); });
  return directory;
}
function makeBundle(t) {
  const directory = temporary(t); const files = join(directory, "contents"); mkdirSync(files);
  for (const name of ["media.tar.gz", "avatars.tar.gz", "hero-assets.tar.gz"]) {
    const result = spawnSync("tar", ["-czf", join(directory, name), "-C", files, "."], { encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
  }
  writeFileSync(join(directory, "database.sql"), "CREATE TABLE `User` (`id` int); INSERT INTO `User` VALUES (1);\n");
  for (const name of ["media-manifest.json", "source-media-before.json", "source-media-after.json"]) writeFileSync(join(directory, name), JSON.stringify(emptyMedia()));
  writeFileSync(join(directory, "source-database-identity.json"), JSON.stringify(identity));
  const manifest = { complete: true, migrationSource: { version: 1, writersStopped: true, mediaVerifiedBeforeAndAfter: true, databaseIdentity: identity }, files: [...nativeBackupFiles], sha256: {} };
  const save = () => {
    manifest.sha256 = Object.fromEntries(manifest.files.map(name => [name, fileSha256(join(directory, name))]));
    writeFileSync(join(directory, "manifest.json"), JSON.stringify(manifest));
  };
  save(); return { directory, manifest, save };
}

test("native bundle validates required files, source identity and archive checksums", async t => {
  const { directory } = makeBundle(t); const result = await verifyNativeBackup(directory);
  assert.equal(result.integrityVerified, true); assert.equal(result.databaseIdentity.database, "wzywt");
  assert.match(result.bundleSha256, /^[a-f0-9]{64}$/);
});
test("native bundle rejects regular Compose backups and incomplete stopped-source evidence", async t => {
  const bundle = makeBundle(t); delete bundle.manifest.migrationSource; bundle.save();
  await assert.rejects(verifyNativeBackup(bundle.directory), /completed native migration export/);
});
test("native bundle rejects missing files, altered bytes and conflicting database identity", async t => {
  const bundle = makeBundle(t);
  bundle.manifest.files = bundle.manifest.files.filter(name => name !== "avatars.tar.gz"); bundle.save();
  await assert.rejects(verifyNativeBackup(bundle.directory), /file set/);
  bundle.manifest.files = [...nativeBackupFiles]; bundle.save();
  writeFileSync(join(bundle.directory, "database.sql"), "USE stolen;\n");
  await assert.rejects(verifyNativeBackup(bundle.directory), /checksum mismatch/);
  bundle.save();
  await assert.rejects(verifyNativeBackup(bundle.directory), /unsupported statement|forbidden/);
  writeFileSync(join(bundle.directory, "database.sql"), "CREATE TABLE t (id int);\n");
  writeFileSync(join(bundle.directory, "source-database-identity.json"), JSON.stringify({ ...identity, database: "other" })); bundle.save();
  await assert.rejects(verifyNativeBackup(bundle.directory), /identities disagree/);
});
test("native bundle cannot skip before/after evidence or falsely declare it verified", async t => {
  const bundle = makeBundle(t);
  for (const name of ["source-media-before.json", "source-media-after.json"]) {
    bundle.manifest.files = nativeBackupFiles.filter(file => file !== name); bundle.save();
    await assert.rejects(verifyNativeBackup(bundle.directory), /file set/);
  }
  bundle.manifest.files = [...nativeBackupFiles]; bundle.manifest.migrationSource.mediaVerifiedBeforeAndAfter = false; bundle.save();
  await assert.rejects(verifyNativeBackup(bundle.directory), /before\/after media evidence/);
  bundle.manifest.migrationSource.mediaVerifiedBeforeAndAfter = true;
  writeFileSync(join(bundle.directory, "source-media-after.json"), JSON.stringify({ ...emptyMedia(), counts: { screenshots: 0, videos: 1, avatars: 0 }, objects: [video()] })); bundle.save();
  await assert.rejects(verifyNativeBackup(bundle.directory), /count differs/);
});
test("media manifests require all object hashes and exact identity, ownership and counts after restore", () => {
  const source = { ...emptyMedia(), counts: { screenshots: 0, videos: 1, avatars: 0 }, objects: [video()] };
  assert.equal(compareMediaManifests(source, structuredClone(source)).verifiedObjects, 1);
  for (const field of ["recordId", "ownerId", "size"]) {
    const target = structuredClone(source); target.objects[0][field]++;
    assert.throws(() => compareMediaManifests(source, target), /differs/);
  }
  assert.throws(() => validateMediaManifest({ ...source, problems: ["missing"] }), /incomplete/);
  assert.throws(() => validateMediaManifest({ ...source, counts: emptyMedia().counts }), /counts/);
  assert.throws(() => validateMediaManifest({ ...source, objects: [{ ...video(), storageKey: "../secret" }] }), /storage path/);
});
test("tar preflight rejects traversal, absolute paths, links, devices, duplicates and wrong archive scope", () => {
  const listing = (path, type = "-") => () => validateArchiveListing(path + "\n", `${type}rw-r--r-- user/group 1 2026-01-01 ${path}\n`, "media.tar.gz");
  for (const path of ["../escape", "/absolute", "C:/absolute", "./a/../../b", "a\\b", "avatars/file", ".native-import.json"]) assert.throws(listing(path));
  for (const type of ["l", "h", "b", "c", "p", "s"]) assert.throws(listing("file", type), /link or special/);
  assert.throws(() => validateArchiveListing("a\n./a\n", "- a\n- ./a\n", "media.tar.gz"), /Duplicate/);
  assert.throws(() => validateArchiveListing("a\na/b\n", "- a\n- a\/b\n", "media.tar.gz"), /also used/);
  assert.throws(() => validateArchiveListing("scripts/payload.js\n", "- scripts/payload.js\n", "hero-assets.tar.gz"), /images and skins/);
  assert.equal(validateArchiveListing("./\n./post-videos/\n./post-videos/a.mp4\n", "d root\nd post-videos\n- file\n", "media.tar.gz"), 3);
  assert.equal(validateArchiveListing("", "", "hero-assets.tar.gz"), 0);
});
test("SQL lexer accepts mysqldump comments, session settings and long escaped data without buffering statements", async t => {
  const directory = temporary(t); const path = join(directory, "database.sql");
  writeFileSync(path, "-- MySQL dump\n/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;\n/*!80000 SET @@SESSION.SQL_LOG_BIN= 0 */;\n/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;\nDROP TABLE IF EXISTS `User`;\nCREATE TABLE `User` (`id` int, `text` longtext);\nLOCK TABLES `User` WRITE;\nINSERT INTO `User` VALUES (1,'" + "text USE other; /* not a comment */ 中文 ".repeat(5000) + "it\\'s fine');\nUNLOCK TABLES;\n/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;\n");
  assert.equal((await validateMigrationSql(path)).statements, 9);
});
test("SQL lexer rejects database switching, executable comment bypass, cross-database names and client commands", async t => {
  const directory = temporary(t); const path = join(directory, "database.sql");
  for (const sql of ["USE other;", "CREATE DATABASE stolen;", "DROP DATABASE original;", "INSERT INTO `other`.`User` VALUES (1);", "/*!50000 USE other */;", "SET @@GLOBAL.read_only=0;", "SOURCE /tmp/other.sql;", "\\! touch /tmp/unsafe\n", "CREATE TABLE t (id int); INSERT INTO t VALUES ('unterminated", "SET @q='USE other'; PREPARE x FROM @q;", "CREATE TABLE t AS SELECT * FROM other.User;", "SET sql_mode='NO_BACKSLASH_ESCAPES'; INSERT INTO t VALUES ('\\'); USE other; -- ');", "SET SQL_MODE=1048576;", "SET @OLD_SQL_MODE=1048576; SET SQL_MODE=@OLD_SQL_MODE;", "SET SQL_MODE=@OLD_SQL_MODE; INSERT INTO t VALUES (1);"]) {
    writeFileSync(path, sql); await assert.rejects(validateMigrationSql(path), undefined, sql);
  }
});
