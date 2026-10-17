import { open } from "node:fs/promises";
import { join } from "node:path";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const HERO_ID = /^[1-9][0-9]{0,9}$/;
const IMAGE_NAME = /^[1-9][0-9]{0,9}\.jpg$/;

/** Only the generated JPEG cache is public; .source files and other paths are private. */
export async function readHeroAsset(segments: readonly string[], projectRoot = process.cwd()): Promise<Uint8Array<ArrayBuffer> | null> {
  const avatar = segments.length === 2 && segments[0] === "images" && IMAGE_NAME.test(segments[1]);
  const skin = segments.length === 3 && segments[0] === "skins"
    && HERO_ID.test(segments[1]) && IMAGE_NAME.test(segments[2]);
  if (!avatar && !skin) return null;

  let file;
  try {
    file = await open(join(projectRoot, "public", "heroes", ...segments), "r");
    const info = await file.stat();
    if (!info.isFile() || info.size === 0 || info.size > MAX_IMAGE_BYTES) return null;
    // Bound reads even when the file changes while a sync job is writing it.
    const data = new Uint8Array(info.size);
    let offset = 0;
    while (offset < data.length) {
      const { bytesRead } = await file.read(data, offset, data.length - offset, offset);
      if (bytesRead === 0) return null;
      offset += bytesRead;
    }
    return data;
  } catch (error) {
    if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code || "")) return null;
    throw error;
  } finally {
    await file?.close();
  }
}
