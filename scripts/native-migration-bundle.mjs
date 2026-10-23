import { createReadStream, lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { fileSha256 } from "./backup-integrity.mjs";

export const nativeBackupFiles = Object.freeze([
  "database.sql", "media-manifest.json", "media.tar.gz", "avatars.tar.gz",
  "hero-assets.tar.gz", "source-database-identity.json", "source-media-before.json", "source-media-after.json",
]);
const sourceMediaFiles = ["source-media-before.json", "source-media-after.json"];
const objectKinds = { "match-screenshot": "screenshots", "combat-video": "videos", avatar: "avatars" };
const digestPattern = /^[a-f0-9]{64}$/;
const plainObject = value => value !== null && typeof value === "object" && !Array.isArray(value);

export function validateDatabaseIdentity(identity) {
  if (!plainObject(identity) || typeof identity.serverUuid !== "string"
    || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(identity.serverUuid)
    || typeof identity.database !== "string" || !identity.database.length || identity.database.length > 64
    || /[\x00-\x1f\x7f]/.test(identity.database)) throw new Error("Invalid source database identity");
  return { serverUuid: identity.serverUuid.toLowerCase(), database: identity.database };
}

export function validateMediaManifest(manifest) {
  if (!plainObject(manifest) || manifest.version !== 1 || manifest.complete !== true
    || !Array.isArray(manifest.problems) || manifest.problems.length || !Array.isArray(manifest.objects)
    || !plainObject(manifest.counts)) throw new Error("Media manifest is incomplete or invalid");
  const counts = { screenshots: 0, videos: 0, avatars: 0 };
  const seen = new Set();
  for (const item of manifest.objects) {
    if (!plainObject(item) || !Object.hasOwn(objectKinds, item.kind) || item.ok !== true
      || !Number.isSafeInteger(item.recordId) || item.recordId < 1 || !Number.isSafeInteger(item.ownerId) || item.ownerId < 1
      || typeof item.storageKey !== "string" || !item.storageKey.length
      || !Number.isSafeInteger(item.size) || item.size < 0 || typeof item.sha256 !== "string" || !digestPattern.test(item.sha256)) {
      throw new Error("Invalid object in media manifest");
    }
    const storagePattern = item.kind === "avatar" ? /^\d+_(?:\d+|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.(?:jpg|png|webp)$/
      : /^(match-screenshots|post-videos)\/\d{4}\/\d{2}\/[a-f0-9-]+\.[a-z0-9]+$/;
    if (!storagePattern.test(item.storageKey)) throw new Error("Invalid storage path in media manifest");
    const key = `${item.kind}:${item.recordId}`;
    if (seen.has(key)) throw new Error("Duplicate object in media manifest");
    seen.add(key);
    counts[objectKinds[item.kind]]++;
  }
  for (const key of Object.keys(counts)) {
    if (manifest.counts[key] !== counts[key]) throw new Error("Media manifest counts do not match objects");
  }
  return manifest;
}

export function compareMediaManifests(source, target) {
  validateMediaManifest(source);
  validateMediaManifest(target);
  const fields = ["kind", "recordId", "ownerId", "storageKey", "size", "sha256"];
  const keyed = manifest => new Map(manifest.objects.map(item => [`${item.kind}:${item.recordId}`, item]));
  const expected = keyed(source); const actual = keyed(target);
  if (expected.size !== actual.size) throw new Error("Restored media object count differs from the source");
  for (const [key, item] of expected) {
    const other = actual.get(key);
    if (!other || fields.some(field => item[field] !== other[field])) throw new Error(`Restored media differs from source: ${key}`);
  }
  return { verifiedObjects: source.objects.length, counts: source.counts };
}

/** Both listings use tar's resolved PAX/long-name paths; extraction never follows links. */
export function validateArchiveListing(namesOutput, verboseOutput, archiveName) {
  const lines = value => value.replace(/\r\n/g, "\n").split("\n").filter(Boolean);
  const names = lines(namesOutput); const details = lines(verboseOutput);
  if (names.length !== details.length || (!names.length && archiveName !== "hero-assets.tar.gz")) throw new Error(`Invalid archive listing: ${archiveName}`);
  const seen = new Map(); const ancestorPaths = new Set();
  for (let index = 0; index < names.length; index++) {
    const original = names[index]; const type = details[index][0];
    if (!["-", "d"].includes(type)) throw new Error(`Archive contains a link or special file: ${archiveName}`);
    if (!original.length || /[\\\x00-\x1f\x7f]/.test(original) || original.startsWith("/") || /^[A-Za-z]:/.test(original)) {
      throw new Error(`Unsafe archive path: ${archiveName}`);
    }
    const parts = original.split("/");
    if (parts.includes("..")) throw new Error(`Archive path traverses directories: ${archiveName}`);
    const path = parts.filter(part => part && part !== ".").join("/");
    if (!path && type !== "d") throw new Error(`Invalid archive root: ${archiveName}`);
    if (seen.has(path)) throw new Error(`Duplicate archive path: ${archiveName}`);
    for (let parent = path; parent.includes("/");) {
      parent = parent.slice(0, parent.lastIndexOf("/"));
      if (seen.get(parent) === "-") throw new Error(`Archive file is also used as a directory: ${archiveName}`);
      ancestorPaths.add(parent);
    }
    if (type === "-" && ancestorPaths.has(path)) throw new Error(`Archive directory is also used as a file: ${archiveName}`);
    seen.set(path, type);
    if (path === ".native-import.json" || path.startsWith(".native-import.json/")) throw new Error("Archive contains the migration marker");
    if (archiveName === "media.tar.gz" && (path === "avatars" || path.startsWith("avatars/"))) throw new Error("Media archive must exclude the separately imported avatars");
    if (archiveName === "hero-assets.tar.gz" && path && !/^(images|skins)(\/|$)/.test(path)) throw new Error("Hero archive may only contain images and skins");
  }
  return names.length;
}

export function inspectArchive(path, name, { tarBin = process.env.DEPLOY_TAR_BIN || "tar", run = spawnSync } = {}) {
  const listing = option => {
    const result = run(tarBin, [option, path], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, windowsHide: true });
    if (result.error || result.status !== 0 || typeof result.stdout !== "string") throw new Error(`Cannot inspect migration archive: ${name}`);
    return result.stdout;
  };
  return validateArchiveListing(listing("-tzf"), listing("-tvzf"), name);
}

/** A streaming lexer for our single-database mysqldump contract; never buffers SQL statements. */
export async function validateMigrationSql(path) {
  const forbidden = new Set(["USE", "DATABASE", "DATABASES", "SCHEMA", "SCHEMAS", "OUTFILE", "DUMPFILE", "LOAD", "SOURCE", "SYSTEM", "GRANT", "REVOKE", "DEFINER", "TRIGGER", "EVENT", "PROCEDURE", "FUNCTION", "PREPARE", "EXECUTE", "DELIMITER", "GLOBAL", "PERSIST", "PERSIST_ONLY"]);
  const starts = new Set(["SET", "DROP", "CREATE", "ALTER", "INSERT", "LOCK", "UNLOCK", "START", "COMMIT"]);
  const decoder = new StringDecoder("utf8");
  let state = "code", quote = "", token = "", carry = "", executableComment = false, escaped = false, setLiteral = "";
  let first = true, statementKind = "", tokenIndex = 0, previous = "", beforePrevious = "", statements = 0;
  let setTokens = [], restoredSqlMode = false;
  const emit = (value, quoted = false, literalValue = "") => {
    if (!value) return;
    const upper = quoted ? value : value.toUpperCase();
    if (first) {
      if (quoted || !starts.has(upper)) throw new Error("SQL contains an unsupported statement; export a single-database mysqldump");
      if (restoredSqlMode && upper !== "SET") throw new Error("SQL contains data statements after restoring the original SQL mode");
      first = false; statementKind = upper; tokenIndex = 0; statements++;
    }
    if (!quoted && forbidden.has(upper)) throw new Error("SQL contains a forbidden database or cross-database instruction");
    if (tokenIndex === 1 && ["CREATE", "DROP", "ALTER"].includes(statementKind) && upper !== "TABLE") throw new Error("SQL schema statements must target tables only");
    if (upper === "." && previous !== "SESSION" && !/^\d+$/.test(previous)) throw new Error("SQL contains a qualified cross-database name");
    if (upper === "." && previous === "SESSION" && beforePrevious !== "@") throw new Error("SQL contains a qualified cross-database name");
    if (statementKind === "SET") {
      setTokens.push(quoted ? "'" + literalValue.toUpperCase() + "'" : upper);
      if (setTokens.length > 256) throw new Error("SQL SET statement exceeds the supported dump format");
    }
    beforePrevious = previous; previous = upper; tokenIndex++;
  };
  const finishStatement = () => {
    // MySQL's NO_BACKSLASH_ESCAPES mode changes string boundaries. Only accept
    // mysqldump's exact save/set/restore sequence, never computed mode changes
    // that could hide later USE or qualified names from this streaming lexer.
    if (setTokens.some(value => value.includes("SQL_MODE"))) {
      const statement = setTokens.join(" ");
      if (statement === "SET SQL_MODE = @ OLD_SQL_MODE") restoredSqlMode = true;
      else if (statement !== "SET @ OLD_SQL_MODE = @ @ SQL_MODE , SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO'" || restoredSqlMode) throw new Error("SQL contains an unsupported SQL_MODE change");
    }
    setTokens = []; first = true; previous = ""; beforePrevious = "";
  };
  const flush = () => { if (token) { emit(token); token = ""; } };
  function consume(text, final = false) {
    let index = 0; const limit = final ? text.length : Math.max(0, text.length - 3);
    while (index < limit) {
      const char = text[index], next = text[index + 1];
      if (state === "line") { if (char === "\n") state = "code"; index++; continue; }
      if (state === "comment") { if (char === "*" && next === "/") { state = "code"; index += 2; } else index++; continue; }
      if (state === "version") { if (/\d/.test(char)) { index++; continue; } state = "code"; continue; }
      if (state === "quoted") {
        if (escaped) { escaped = false; index++; continue; }
        if (char === "\\" && quote !== "`") { escaped = true; index++; continue; }
        if (char === quote) {
          if (next === quote) { if (statementKind === "SET") setLiteral += quote; index += 2; continue; }
          state = "code"; emit(quote === "`" ? "identifier" : "literal", true, setLiteral);
        } else if (statementKind === "SET") {
          setLiteral += char;
          if (setLiteral.length > 1024) throw new Error("SQL SET literal exceeds the supported dump format");
        }
        index++; continue;
      }
      if (executableComment && char === "*" && next === "/") { flush(); executableComment = false; index += 2; continue; }
      if (char === "#" || (char === "-" && next === "-" && /\s/.test(text[index + 2] || " "))) { flush(); state = "line"; index += char === "#" ? 1 : 2; continue; }
      if (char === "/" && next === "*") { flush(); executableComment = text[index + 2] === "!"; state = executableComment ? "version" : "comment"; index += executableComment ? 3 : 2; continue; }
      if (["'", '"', "`"].includes(char)) {
        flush();
        if (statementKind === "SET" && char === "`") throw new Error("SQL SET identifiers must use the standard mysqldump form");
        state = "quoted"; quote = char; setLiteral = ""; index++; continue;
      }
      if (/[A-Za-z0-9_$]/.test(char)) { token += char; if (token.length > 256) throw new Error("SQL token exceeds the supported dump format"); index++; continue; }
      flush();
      if (char === ";") finishStatement();
      else if (char === "\\" || char === "\0") throw new Error("SQL contains an unsupported client command");
      else if (!/\s/.test(char)) emit(char);
      index++;
    }
    return text.slice(index);
  }
  for await (const chunk of createReadStream(path)) carry = consume(carry + decoder.write(chunk));
  carry += decoder.end(); consume(carry, true); flush();
  if (["quoted", "comment", "version"].includes(state) || executableComment || !first || !statements) throw new Error("SQL dump is incomplete or empty");
  return { statements };
}

export async function verifyNativeBackup(directory, options = {}) {
  const root = resolve(directory);
  const read = name => {
    const path = resolve(root, name); const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink() || !info.size) throw new Error(`Migration bundle file is missing or unsafe: ${name}`);
    return path;
  };
  const manifestPath = read("manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const source = manifest?.migrationSource;
  if (!plainObject(manifest) || manifest.complete !== true || !Array.isArray(manifest.files) || !plainObject(manifest.sha256)
    || !plainObject(source) || source.version !== 1 || source.writersStopped !== true || source.mediaVerifiedBeforeAndAfter !== true) throw new Error("Use a completed native migration export with before/after media evidence, not a general Compose backup");
  const databaseIdentity = validateDatabaseIdentity(source.databaseIdentity);
  const names = new Set(manifest.files);
  if (names.size !== manifest.files.length || nativeBackupFiles.some(name => !names.has(name))
    || manifest.files.some(name => typeof name !== "string" || !nativeBackupFiles.includes(name))) throw new Error("Native migration bundle has an invalid file set");
  for (const name of manifest.files) {
    const path = read(name);
    if (typeof manifest.sha256[name] !== "string" || !digestPattern.test(manifest.sha256[name]) || fileSha256(path) !== manifest.sha256[name]) throw new Error(`Native migration checksum mismatch: ${name}`);
    if (name.endsWith(".tar.gz")) inspectArchive(path, name, options);
  }
  const rawIdentity = JSON.parse(readFileSync(read("source-database-identity.json"), "utf8"));
  const recorded = validateDatabaseIdentity(rawIdentity);
  if (rawIdentity.version !== 1 || recorded.serverUuid !== databaseIdentity.serverUuid || recorded.database !== databaseIdentity.database) throw new Error("Source database identities disagree");
  const mediaManifest = validateMediaManifest(JSON.parse(readFileSync(read("media-manifest.json"), "utf8")));
  for (const name of sourceMediaFiles) compareMediaManifests(mediaManifest, JSON.parse(readFileSync(read(name), "utf8")));
  await validateMigrationSql(read("database.sql"));
  return { manifest, mediaManifest, databaseIdentity, files: manifest.files, integrityVerified: true, bundleSha256: fileSha256(manifestPath) };
}
