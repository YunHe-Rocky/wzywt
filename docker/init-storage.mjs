import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertContainerStorage } from "../scripts/compose-storage.mjs";

const directories = ["/app/data/media", "/app/data/media/avatars", "/app/public/heroes/images", "/app/public/heroes/skins"];

export async function initializeStorage({ managePermissions = process.env.STORAGE_MANAGE_PERMISSIONS ?? "1",
  io = fs, dropPrivileges = () => { process.setgid(1000); process.setuid(1000); } } = {}) {
  if (!["0", "1"].includes(managePermissions)) throw new Error("STORAGE_MANAGE_PERMISSIONS must be 0 or 1.");
  for (const directory of directories) {
    await io.mkdir(directory, { recursive: true });
    if (managePermissions === "1") {
      await io.chown(directory, 1000, 1000);
      await io.chmod(directory, 0o750);
    }
  }
  if (managePermissions === "1") dropPrivileges();
  // Test actual application-user I/O rather than relying on root/access bits.
  // Rclone permissions are configured on the host; chmod/chown are skipped.
  for (const directory of directories) {
    const probe = `${directory}/.wzywt-storage-check-${randomUUID()}`;
    const renamed = `${probe}.renamed`;
    try {
      await io.writeFile(probe, "storage-check", { flag: "wx" });
      await io.rename(probe, renamed);
      if (await io.readFile(renamed, "utf8") !== "storage-check") throw new Error(`Storage read failed: ${directory}`);
    } finally {
      await io.unlink(probe).catch(() => {});
      await io.unlink(renamed).catch(() => {});
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assertContainerStorage();
  await initializeStorage();
  console.log("[storage-init] persistent storage read/write/rename ready for uid/gid 1000");
}
