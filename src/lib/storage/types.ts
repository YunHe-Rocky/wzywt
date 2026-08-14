import type { ReadStream } from "node:fs";

export interface SaveObjectInput {
  namespace: "match-screenshots" | "post-videos";
  extension: string;
  data: Buffer;
}

export interface SaveStreamObjectInput {
  namespace: SaveObjectInput["namespace"];
  extension: string;
  data: AsyncIterable<Uint8Array>;
}

export interface StoredObjectInfo {
  key: string;
  size: number;
}

export interface StreamStoredObjectInfo extends StoredObjectInfo {
  sha256: string;
  header: Buffer;
}

export interface ObjectRange {
  start: number;
  end: number;
}

export interface MediaStorage {
  healthCheck?(): Promise<void>;
  save(input: SaveObjectInput): Promise<StoredObjectInfo>;
  saveStream?(input: SaveStreamObjectInput): Promise<StreamStoredObjectInfo>;
  stat(key: string): Promise<StoredObjectInfo | null>;
  open(key: string, range?: ObjectRange): Promise<ReadStream>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
