import { mkdirSync, readdirSync, renameSync, writeFileSync, existsSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { fileSha256, verifyBackup } from "./backup-integrity.mjs";

const [directory, oldRelease] = process.argv.slice(2);
const tarBin = process.env.DEPLOY_TAR_BIN || "tar";
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const migrationExport = process.env.NATIVE_MIGRATION_EXPORT === "1";
if (!directory || !process.env.MEDIA_STORAGE_DIR || !process.env.AVATAR_DIR) throw new Error("Backup paths must be resolved by deploy.sh");
mkdirSync(directory, { recursive: true, mode: 0o700 });
const run = (command, args) => { const result = spawnSync(command, args, { stdio: "inherit", windowsHide: true }); if (result.status !== 0) throw new Error(`Backup command failed: ${command}`); };
run(process.execPath, [resolve(scriptDirectory, "db-backup.mjs"), directory]);
const sql = readdirSync(directory).filter(name => name.endsWith(".sql"));
if (sql.length !== 1) throw new Error("Expected one SQL backup in the unique backup set");
renameSync(resolve(directory, sql[0]), resolve(directory, "database.sql"));
run(process.execPath, [resolve(scriptDirectory, "media-manifest.mjs"), resolve(directory, "media-manifest.json")]);
const avatarRelative = relative(process.env.MEDIA_STORAGE_DIR, process.env.AVATAR_DIR);
const excludeAvatars = migrationExport && avatarRelative && avatarRelative !== ".." && !avatarRelative.startsWith(".." + sep) && !isAbsolute(avatarRelative)
  ? ["--exclude=./" + avatarRelative.split(sep).join("/")] : [];
run(tarBin, [...excludeAvatars, "-czf", resolve(directory, "media.tar.gz"), "-C", process.env.MEDIA_STORAGE_DIR, "."]);
run(tarBin, ["-czf", resolve(directory, "avatars.tar.gz"), "-C", process.env.AVATAR_DIR, "."]);
const heroes = resolve(oldRelease && oldRelease !== "-" ? oldRelease : process.cwd(), "public/heroes");
const present = existsSync(heroes);
const heroEntries = migrationExport ? ["images", "skins"].filter(name => existsSync(resolve(heroes, name))) : ["."];
run(tarBin, ["-czf", resolve(directory, "hero-assets.tar.gz"), ...(present && heroEntries.length ? ["-C", heroes, ...heroEntries] : ["--files-from", process.platform === "win32" ? "NUL" : "/dev/null"])]);
const files = ["database.sql", "media-manifest.json", "media.tar.gz", "avatars.tar.gz", "hero-assets.tar.gz"];
if (files.some(name => statSync(resolve(directory, name)).size === 0)) throw new Error("Backup contains an empty file; no complete manifest was published");
writeFileSync(resolve(directory, "manifest.json"), JSON.stringify({ complete: true, createdAt: new Date().toISOString(),
  sourceRelease: oldRelease, candidateRelease: process.env.APP_RELEASE_ID, heroAssetsPresent: present, files,
  sha256: Object.fromEntries(files.map(name => [name, fileSha256(resolve(directory, name))])),
  restoreVerified: false, remoteUploadVerified: false }, null, 2), { flag: "wx", mode: 0o600 });
verifyBackup(directory);
console.log(`[backup] integrity verified: ${directory}; independent restore remains required`);
