import { createHash, randomUUID } from "node:crypto";
import { constants, createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type {
  MediaStorage,
  ObjectRange,
  SaveObjectInput,
  SaveStreamObjectInput,
  StoredObjectInfo,
  StreamStoredObjectInfo,
} from "./types";

const STORAGE_KEY_PATTERN = /^(match-screenshots|post-videos)\/\d{4}\/\d{2}\/[a-f0-9-]+\.[a-z0-9]+$/;

function assertStorageRoot(root: string): string {
  const resolved = resolve(root);
  if (resolved === resolve(sep)) throw new Error("MEDIA_STORAGE_DIR cannot be a filesystem root");
  return resolved;
}

export class LocalMediaStorage implements MediaStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = assertStorageRoot(root);
  }

  private resolveKey(key: string): string {
    if (!STORAGE_KEY_PATTERN.test(key)) throw new Error("INVALID_STORAGE_KEY");
    const absolute = resolve(this.root, ...key.split("/"));
    const relation = relative(this.root, absolute);
    if (relation.startsWith("..") || relation.includes(`..${sep}`)) throw new Error("INVALID_STORAGE_KEY");
    return absolute;
  }

  async healthCheck(): Promise<void> {
    const info = await stat(this.root);
    if (!info.isDirectory()) throw new Error("MEDIA_STORAGE_DIR is not a directory");
    await access(this.root, constants.R_OK | constants.W_OK);
  }

  async save(input: SaveObjectInput): Promise<StoredObjectInfo> {
    if (!/^[a-z0-9]+$/.test(input.extension)) throw new Error("INVALID_EXTENSION");
    const now = new Date();
    const key = `${input.namespace}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.${input.extension}`;
    const target = this.resolveKey(key);
    const temporary = `${target}.tmp-${randomUUID()}`;
    await mkdir(dirname(target), { recursive: true });
    try {
      await writeFile(temporary, input.data, { flag: "wx" });
      await rename(temporary, target);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
    return { key, size: input.data.byteLength };
  }

  async saveStream(input: SaveStreamObjectInput): Promise<StreamStoredObjectInfo> {
    if (!/^[a-z0-9]+$/.test(input.extension)) throw new Error("INVALID_EXTENSION");
    const now = new Date();
    const key = `${input.namespace}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.${input.extension}`;
    const target = this.resolveKey(key);
    const temporary = `${target}.tmp-${randomUUID()}`;
    const hash = createHash("sha256");
    const headerChunks: Buffer[] = [];
    let headerSize = 0;
    let size = 0;
    const inspect = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        size += chunk.byteLength;
        hash.update(chunk);
        if (headerSize < 16) {
          const slice = chunk.subarray(0, 16 - headerSize);
          headerChunks.push(Buffer.from(slice));
          headerSize += slice.byteLength;
        }
        callback(null, chunk);
      },
    });

    await mkdir(dirname(target), { recursive: true });
    try {
      await pipeline(
        Readable.from(input.data),
        inspect,
        createWriteStream(temporary, { flags: "wx" }),
      );
      await rename(temporary, target);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
    return { key, size, sha256: hash.digest("hex"), header: Buffer.concat(headerChunks) };
  }

  async stat(key: string): Promise<StoredObjectInfo | null> {
    try {
      const info = await stat(this.resolveKey(key));
      return info.isFile() ? { key, size: info.size } : null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async open(key: string, range?: ObjectRange) {
    const target = this.resolveKey(key);
    await access(target);
    return createReadStream(target, range ? { start: range.start, end: range.end } : undefined);
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.resolveKey(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    return (await this.stat(key)) !== null;
  }
}
