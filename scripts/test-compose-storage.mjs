import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";
import { assertContainerStorage, assertRcloneMount, parseMountInfo, resolveStorage, validateStorageModel } from "./compose-storage.mjs";
import { initializeStorage } from "../docker/init-storage.mjs";

const settings = "STORAGE_MODE=rclone\nOSS_MOUNT_PATH=/mnt/oss\n";
const mountInfo = "1 0 8:1 / / rw - ext4 /dev/sda rw\n2 1 0:2 / /mnt/oss rw - fuse.rclone oss:bucket rw\n";
const storage = () => resolveStorage(settings, "/srv/app", { environment: {} });
const mountOptions = { platform: "linux", readMountInfo: () => mountInfo, canonical: path => path, exists: () => true };

test("rclone derives data and backup paths, preserves quoted paths and env/CLI priority", () => {
  const s = storage();
  assert.equal(s.dataPath, "/mnt/oss/wzywt");
  assert.equal(s.backupPath, "/mnt/oss/wzywt/backups");
  const overrides = resolveStorage(settings + 'OSS_DATA_PATH="/mnt/oss/project files" # comment\nCOMPOSE_BACKUP_DIR=/mnt/oss/history\n', "/srv/app", {
    environment: { COMPOSE_BACKUP_DIR: "/mnt/oss/env-backups" }, backupDir: "/mnt/oss/cli-backups",
  });
  assert.equal(overrides.dataPath, "/mnt/oss/project files");
  assert.equal(overrides.backupPath, "/mnt/oss/cli-backups");
  assert.equal(resolveStorage("", "/srv/app", { environment: {} }).backupPath, resolve("/srv/app", "data/docker-backups"));
});

test("storage refuses ambiguous modes, root/outside paths, interpolation and recursive backups", () => {
  for (const content of ["STORAGE_MODE=oss", "OSS_MOUNT_PATH=/mnt/oss", settings + "OSS_DATA_PATH=/other", settings + "OSS_DATA_PATH=/mnt/oss",
    "STORAGE_MODE=rclone\nOSS_MOUNT_PATH=/", "STORAGE_MODE=rclone\nOSS_MOUNT_PATH=relative", settings + "OSS_DATA_PATH=${OSS_MOUNT_PATH}/data",
    settings + "COMPOSE_BACKUP_DIR=/mnt/oss/wzywt/media/backups", settings + "COMPOSE_BACKUP_DIR=/mnt/oss/wzywt/heroes/backups",
    settings + "STORAGE_MODE=volume"]) {
    assert.throws(() => resolveStorage(content, "/srv/app", { environment: {} }));
  }
});

test("mount verification accepts only an actual rclone mount and decodes mountinfo paths", () => {
  assertRcloneMount(storage(), mountOptions);
  assert.throws(() => assertRcloneMount(storage(), { ...mountOptions, platform: "win32" }), /Linux/);
  assert.throws(() => assertRcloneMount(storage(), { ...mountOptions, readMountInfo: () => mountInfo.split("\n")[0] }), /No local fallback/);
  assert.throws(() => assertRcloneMount(storage(), { ...mountOptions, readMountInfo: () => mountInfo.replace("fuse.rclone", "ext4") }), /No local fallback/);
  assert.equal(parseMountInfo("2 1 0:2 / /mnt/cloud\\040files rw - fuse.rclone oss:bucket rw")[0].path, "/mnt/cloud files");
});

test("mount verification rejects symlink escapes and nested local mounts", () => {
  assert.throws(() => assertRcloneMount(storage(), { ...mountOptions,
    canonical: path => path === "/mnt/oss/wzywt" ? "/srv/local" : path }), /escapes/);
  assert.throws(() => assertRcloneMount(storage(), { ...mountOptions,
    readMountInfo: () => mountInfo + "3 2 8:1 / /mnt/oss/wzywt rw - ext4 /dev/sda rw\n" }), /escapes/);
  assert.throws(() => assertRcloneMount(storage(), { ...mountOptions,
    canonical: path => path === "/mnt/oss/wzywt/media" ? "/srv/local" : path }), /escapes/);
  assert.throws(() => assertRcloneMount(storage(), { ...mountOptions,
    canonical: path => path === "/mnt/oss/wzywt/backups" ? "/mnt/oss/wzywt/media/history" : path }), /resolves inside/);
});

test("container restart refuses local fallback when the host starts before rclone", () => {
  const mounts = ["/app/data/media", "/app/public/heroes/images", "/app/public/heroes/skins"].map((path, index) =>
    `${index + 2} 1 0:2 / ${path} rw - fuse.rclone oss:bucket rw`).join("\n");
  assertContainerStorage("rclone", () => mounts);
  assert.throws(() => assertContainerStorage("rclone", () => mounts.replace("fuse.rclone", "ext4")), /startup was blocked/);
  assert.throws(() => assertContainerStorage("rclone", () => ""), /startup was blocked/);
  assertContainerStorage("volume", () => assert.fail("Volume mode does not require FUSE"));
});

test("OSS model keeps Web cache read-only, shares paths and disables automatic host creation", () => {
  const s = storage();
  const model = { services: {} };
  for (const service of ["web", "cron", "storage-init"]) {
    model.services[service] = { user: "1000:1000", environment: { STORAGE_MANAGE_PERMISSIONS: "0" }, volumes:
      [["media", "/app/data/media"], ["heroes/images", "/app/public/heroes/images"], ["heroes/skins", "/app/public/heroes/skins"]].map(([part, target]) => ({
        type: "bind", source: `${s.dataPath}/${part}`, target, read_only: service === "web" && part !== "media", bind: { create_host_path: false },
      })) };
  }
  validateStorageModel(model, s);
  // Compose 2.x JSON omits zero-valued false, then may omit the empty bind object.
  for (const service of Object.values(model.services)) for (const volume of service.volumes) delete volume.bind.create_host_path;
  validateStorageModel(model, s);
  for (const service of Object.values(model.services)) for (const volume of service.volumes) delete volume.bind;
  validateStorageModel(model, s);
  for (const value of [true, "false", 1]) {
    model.services.cron.volumes[0].bind = { create_host_path: value };
    assert.throws(() => validateStorageModel(model, s), /Incorrect OSS bind/);
  }
});

function fakeIo({ renameFailure = false } = {}) {
  const files = new Map();
  const calls = [];
  return { calls, files, io: {
    async mkdir(path) { calls.push(["mkdir", path]); },
    async chown(path) { calls.push(["chown", path]); },
    async chmod(path) { calls.push(["chmod", path]); },
    async writeFile(path, content) { calls.push(["write", path]); files.set(path, content); },
    async rename(from, to) { if (renameFailure) throw new Error("rename denied"); files.set(to, files.get(from)); files.delete(from); },
    async readFile(path) { return files.get(path); },
    async unlink(path) { files.delete(path); },
  } };
}

test("rclone initialization skips ownership changes and probes actual write/rename/read", async () => {
  const f = fakeIo();
  await initializeStorage({ managePermissions: "0", io: f.io, dropPrivileges: () => assert.fail("Already runs as uid 1000") });
  assert.equal(f.calls.filter(([call]) => call === "write").length, 3);
  assert.ok(!f.calls.some(([call]) => ["chown", "chmod"].includes(call)));
  assert.equal(f.files.size, 0);
});

test("volume initialization probes only after dropping privileges; failed probes are cleaned up", async () => {
  const f = fakeIo();
  await initializeStorage({ managePermissions: "1", io: f.io, dropPrivileges: () => f.calls.push(["drop"]) });
  assert.ok(f.calls.findIndex(([call]) => call === "drop") < f.calls.findIndex(([call]) => call === "write"));
  const failed = fakeIo({ renameFailure: true });
  await assert.rejects(initializeStorage({ managePermissions: "0", io: failed.io }), /rename denied/);
  assert.equal(failed.files.size, 0);
});
