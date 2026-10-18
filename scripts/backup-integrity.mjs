import { createHash } from "node:crypto";
import { closeSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function fileSha256(path) {
  const file = openSync(path, "r"); const buffer = Buffer.alloc(1024 * 1024); const hash = createHash("sha256");
  try { let bytes; while ((bytes = readSync(file, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, bytes)); }
  finally { closeSync(file); }
  return hash.digest("hex");
}
export function verifyBackup(directory, { archives = true, tarBin = process.env.DEPLOY_TAR_BIN || "tar" } = {}) {
  const manifest = JSON.parse(readFileSync(resolve(directory, "manifest.json"), "utf8"));
  if (manifest.complete !== true || !Array.isArray(manifest.files) || !manifest.files.length || !manifest.sha256) throw new Error("Backup manifest has no integrity evidence");
  for (const name of manifest.files) {
    if (typeof name !== "string" || basename(name) !== name) throw new Error("Invalid backup filename");
    const file = resolve(directory, name);
    if (!statSync(file).isFile() || !statSync(file).size || manifest.sha256[name] !== fileSha256(file)) throw new Error(`Backup checksum mismatch: ${name}`);
    if (archives && name.endsWith(".tar.gz")) {
      const result = spawnSync(tarBin, ["-tzf", file], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, windowsHide: true });
      if (result.status !== 0) throw new Error(`Invalid backup archive: ${name}`);
      if (result.stdout.split(/\r?\n/).some(path => path.startsWith("/") || path.split("/").includes(".."))) throw new Error(`Unsafe archive path: ${name}`);
    }
  }
  return { integrityVerified: true, restoreVerified: false, remoteUploadVerified: false, files: manifest.files };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(verifyBackup(resolve(process.argv[2] || "")), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
