import { join } from "node:path";
import { LocalMediaStorage } from "./local";
import type { MediaStorage } from "./types";

export type {
  MediaStorage,
  ObjectRange,
  SaveObjectInput,
  SaveStreamObjectInput,
  StoredObjectInfo,
  StreamStoredObjectInfo,
} from "./types";

let storage: MediaStorage | undefined;

export function getMediaStorage(): MediaStorage {
  if (storage) return storage;
  const configuredRoot = process.env.MEDIA_STORAGE_DIR?.trim();
  if (process.env.NODE_ENV === "production" && !configuredRoot) {
    throw new Error("MEDIA_STORAGE_DIR is required in production");
  }
  storage = new LocalMediaStorage(configuredRoot || join(process.cwd(), ".cache", "media"));
  return storage;
}

export function setMediaStorageForTests(next: MediaStorage | undefined): void {
  storage = next;
}
