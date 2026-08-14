import { constants } from "node:fs";
import { access, mkdir, stat } from "node:fs/promises";
import { join, parse, resolve } from "node:path";

export function getAvatarDirectory(): string {
  const configured = process.env.AVATAR_DIR?.trim();
  const mediaRoot = process.env.MEDIA_STORAGE_DIR?.trim();
  const directory = resolve(configured || (mediaRoot ? join(mediaRoot, "avatars") : join(process.cwd(), ".cache", "avatars")));
  if (directory === parse(directory).root) throw new Error("AVATAR_DIR cannot be a filesystem root");
  return directory;
}

export async function ensureAvatarDirectory(): Promise<string> {
  const directory = getAvatarDirectory();
  await mkdir(directory, { recursive: true });
  return directory;
}

export async function checkAvatarStorageHealth(): Promise<void> {
  const directory = getAvatarDirectory();
  const info = await stat(directory);
  if (!info.isDirectory()) throw new Error("AVATAR_DIR is not a directory");
  await access(directory, constants.R_OK | constants.W_OK);
}
