import { accessSync, constants, existsSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { posix, resolve } from "node:path";
import { parseSelectedEnv } from "./deploy-env.mjs";

const storageKeys = ["STORAGE_MODE", "OSS_MOUNT_PATH", "OSS_DATA_PATH", "COMPOSE_BACKUP_DIR"];

function inside(path, parent) {
  const relative = posix.relative(parent, path);
  return relative === "" || (!relative.startsWith("../") && relative !== ".." && !posix.isAbsolute(relative));
}

function absoluteDirectory(value, name) {
  if (!posix.isAbsolute(value) || value.includes("$") || value.includes("\\")) {
    throw new Error(`${name} must be a plain absolute Linux path (no variable interpolation).`);
  }
  const path = posix.normalize(value);
  if (path === "/") throw new Error(`${name} cannot be the filesystem root.`);
  return path.replace(/\/$/, "");
}

export function resolveStorage(content, root, { environment = process.env, backupDir } = {}) {
  const values = parseSelectedEnv(content, storageKeys);
  const get = (key) => (environment[key] ?? values.get(key) ?? "").trim();
  const mode = get("STORAGE_MODE") || "volume";
  if (!["volume", "rclone"].includes(mode)) throw new Error("STORAGE_MODE must be volume or rclone.");
  const mount = get("OSS_MOUNT_PATH");
  const data = get("OSS_DATA_PATH");
  if (mode === "volume" && (mount || data)) {
    throw new Error("Set STORAGE_MODE=rclone to use OSS_MOUNT_PATH / OSS_DATA_PATH.");
  }
  const mountPath = mode === "rclone" ? absoluteDirectory(mount, "OSS_MOUNT_PATH") : undefined;
  const dataPath = mode === "rclone" ? absoluteDirectory(data || `${mountPath}/wzywt`, "OSS_DATA_PATH") : undefined;
  if (dataPath && (!inside(dataPath, mountPath) || dataPath === mountPath)) {
    throw new Error("OSS_DATA_PATH must be a dedicated subdirectory of OSS_MOUNT_PATH.");
  }
  const backupValue = backupDir ?? (get("COMPOSE_BACKUP_DIR") || (dataPath ? `${dataPath}/backups` : "data/docker-backups"));
  if (backupValue.includes("$")) throw new Error("The backup path must not contain variable interpolation.");
  if (mode === "rclone" && backupDir === undefined && get("COMPOSE_BACKUP_DIR")) {
    absoluteDirectory(backupValue, "COMPOSE_BACKUP_DIR");
  }
  const backupPath = mode === "rclone" ? posix.resolve(root, backupValue) : resolve(root, backupValue);
  // On the Linux deployment host, prevent backups from entering live media/cache
  // trees: otherwise the backup archive would include its own growing output.
  if (dataPath && ["media", "heroes"].some((part) => inside(backupPath, `${dataPath}/${part}`))) {
    throw new Error("The backup directory cannot be inside live media or hero storage.");
  }
  return { mode, mountPath, dataPath, backupPath, environment: {
    STORAGE_MODE: mode, OSS_MOUNT_PATH: mountPath || "", OSS_DATA_PATH: dataPath || "",
  } };
}

export function parseMountInfo(content) {
  const decode = (value) => value.replace(/\\([0-7]{3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)));
  return content.trim().split("\n").filter(Boolean).map((line) => {
    const [fields, filesystem] = line.split(" - ");
    const mount = fields.split(" ");
    return { path: decode(mount[4]), type: filesystem?.split(" ")[0] };
  });
}

export function assertContainerStorage(mode = process.env.STORAGE_MODE || "volume",
  readMountInfo = () => readFileSync("/proc/self/mountinfo", "utf8")) {
  if (mode === "volume") return;
  if (mode !== "rclone") throw new Error("STORAGE_MODE must be volume or rclone.");
  const mounts = parseMountInfo(readMountInfo());
  for (const path of ["/app/data/media", "/app/public/heroes/images", "/app/public/heroes/skins"]) {
    if (mounts.findLast(mount => mount.path === path)?.type !== "fuse.rclone") {
      throw new Error(`Expected an active rclone bind mount at ${path}; application startup was blocked.`);
    }
  }
}

export function assertRcloneMount(storage, {
  platform = process.platform, readMountInfo = () => readFileSync("/proc/self/mountinfo", "utf8"),
  canonical = realpathSync, exists = existsSync,
} = {}) {
  if (storage.mode !== "rclone") return;
  if (platform !== "linux") throw new Error("rclone storage must be managed on the Linux server where OSS is mounted.");
  const mounts = parseMountInfo(readMountInfo());
  const resolveExisting = (path) => {
    let parent = path;
    while (!exists(parent)) parent = posix.dirname(parent);
    return posix.resolve(canonical(parent), posix.relative(parent, path));
  };
  const mountPath = canonical(storage.mountPath);
  const mounted = mounts.findLast((mount) => mount.path === mountPath);
  if (!mounted || mounted.type !== "fuse.rclone") {
    throw new Error(`OSS_MOUNT_PATH is not an active fuse.rclone mount: ${storage.mountPath}. No local fallback is allowed.`);
  }
  const livePaths = [storage.dataPath, ...["media", "media/avatars", "heroes/images", "heroes/skins"].map(part => posix.join(storage.dataPath, part))];
  const canonicalPaths = livePaths.map(resolveExisting);
  const canonicalBackup = resolveExisting(storage.backupPath);
  if (canonicalPaths.slice(1).some(path => inside(canonicalBackup, path))) {
    throw new Error("The backup directory resolves inside live media or hero storage.");
  }
  for (const path of [...livePaths, storage.backupPath]) {
    const resolved = resolveExisting(path);
    // Explicit local backup overrides remain supported, but an OSS path must
    // never escape through a symlink or a nested mount into another filesystem.
    if (inside(path, storage.mountPath)) {
      const owner = mounts.filter((mount) => inside(resolved, mount.path))
        .sort((a, b) => b.path.length - a.path.length)[0];
      if (!inside(resolved, mountPath) || owner?.path !== mountPath) {
        throw new Error(`Storage path escapes the rclone mount: ${path}`);
      }
    }
  }
}

export function prepareStorage(storage) {
  assertRcloneMount(storage);
  if (storage.mode !== "rclone") return;
  for (const part of ["media", "heroes/images", "heroes/skins"]) {
    mkdirSync(posix.join(storage.dataPath, part), { recursive: true });
  }
  mkdirSync(storage.backupPath, { recursive: true, mode: 0o700 });
  for (const path of [storage.dataPath, storage.backupPath]) accessSync(path, constants.R_OK | constants.W_OK);
}

export function validateStorageModel(model, storage) {
  if (storage.mode !== "rclone") return;
  const paths = [
    ["media", "/app/data/media"],
    ["heroes/images", "/app/public/heroes/images"],
    ["heroes/skins", "/app/public/heroes/skins"],
  ];
  for (const service of ["web", "cron", "storage-init"]) {
    for (const [source, target] of paths) {
      const volume = model.services?.[service]?.volumes?.find((item) => item.target === target);
      const readOnly = service === "web" && source !== "media";
      // Compose 2.x omits false in normalized JSON. Short bind syntax resolves
      // to true, which must still fail this check.
      const createHostPath = volume?.bind?.create_host_path;
      if (volume?.type !== "bind" || volume.source !== posix.join(storage.dataPath, source)
        || Boolean(volume.read_only) !== readOnly || (createHostPath !== undefined && createHostPath !== false)) {
        throw new Error(`Incorrect OSS bind mount for ${service}: ${target}`);
      }
    }
  }
  if (model.services["storage-init"].environment?.STORAGE_MANAGE_PERMISSIONS !== "0"
    || model.services["storage-init"].user !== "1000:1000") {
    throw new Error("rclone storage-init must run as uid/gid 1000 without chmod/chown.");
  }
}
