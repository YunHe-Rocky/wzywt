import type { IncomingHttpHeaders } from "node:http";
import { Readable, Transform } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { pipeline } from "node:stream/promises";
import busboy from "busboy";
import {
  cleanOriginalFilename,
  detectVideo,
  MAX_COMBAT_VIDEO_SIZE,
} from "@/lib/media-validation";
import { ServiceError } from "@/lib/service-error";
import { getMediaStorage } from "@/lib/storage";

const MAX_MULTIPART_OVERHEAD = 256 * 1024;
const MAX_FIELD_SIZE = 64 * 1024;
const UPLOAD_IDLE_TIMEOUT_MS = 30_000;
const ALLOWED_FIELDS = new Set(["title", "content", "matchId", "tournamentId"]);

export interface StreamedCombatVideo {
  key: string;
  size: number;
  sha256: string;
  mimeType: "video/mp4" | "video/webm";
  originalFilename: string;
}

export interface CombatPostUpload {
  fields: Record<string, string>;
  video: StreamedCombatVideo;
}

function requestHeaders(request: Request): IncomingHttpHeaders {
  const headers: IncomingHttpHeaders = {};
  request.headers.forEach((value, key) => { headers[key.toLowerCase()] = value; });
  return headers;
}

function assertDeclaredSize(request: Request): void {
  const value = request.headers.get("content-length");
  if (value === null) return;
  if (!/^\d+$/.test(value)) throw new ServiceError("VALIDATION_ERROR", "Content-Length 格式错误");
  const size = Number(value);
  if (!Number.isSafeInteger(size) || size > MAX_COMBAT_VIDEO_SIZE + MAX_MULTIPART_OVERHEAD) {
    throw new ServiceError("PAYLOAD_TOO_LARGE", "请求体超过大小限制");
  }
}

export async function readCombatPostUpload(request: Request): Promise<CombatPostUpload> {
  assertDeclaredSize(request);
  if (!request.body) throw new ServiceError("VALIDATION_ERROR", "multipart 请求体不能为空");

  const storage = getMediaStorage();
  if (!storage.saveStream) throw new ServiceError("SERVICE_UNAVAILABLE", "媒体存储不支持流式上传");
  const fields: Record<string, string> = {};
  let fatalError: unknown;
  let storedVideo: StreamedCombatVideo | null = null;
  let videoPromise: Promise<StreamedCombatVideo> | null = null;

  const fail = (error: unknown) => { fatalError ??= error; };
  let parser;
  try {
    parser = busboy({
      headers: requestHeaders(request),
      defParamCharset: "utf8",
      limits: {
        fieldNameSize: 64,
        fieldSize: MAX_FIELD_SIZE,
        fields: ALLOWED_FIELDS.size,
        fileSize: MAX_COMBAT_VIDEO_SIZE,
        files: 1,
        parts: ALLOWED_FIELDS.size + 1,
        headerPairs: 50,
      },
    });
  } catch {
    throw new ServiceError("VALIDATION_ERROR", "multipart 请求体格式错误");
  }

  parser.on("field", (name, value, info) => {
    if (!ALLOWED_FIELDS.has(name) || info.nameTruncated || info.valueTruncated) {
      fail(new ServiceError("VALIDATION_ERROR", "multipart 文本字段无效"));
      return;
    }
    fields[name] = value;
  });
  parser.on("file", (name, stream, info) => {
    if (name !== "video" || videoPromise) {
      stream.resume();
      fail(new ServiceError("VALIDATION_ERROR", "只允许上传一个 video 文件"));
      return;
    }
    const claimed = info.mimeType === "video/mp4"
      ? { mimeType: "video/mp4" as const, extension: "mp4" }
      : info.mimeType === "video/webm"
        ? { mimeType: "video/webm" as const, extension: "webm" }
        : null;
    if (!claimed) {
      stream.resume();
      fail(new ServiceError("UNSUPPORTED_MEDIA_TYPE", "仅支持真实的 MP4 或 WebM 视频"));
      return;
    }

    const chunks = async function* () {
      for await (const chunk of stream) yield chunk as Buffer;
      if (stream.truncated) throw new ServiceError("PAYLOAD_TOO_LARGE", "文件超过大小限制");
    };
    videoPromise = storage.saveStream!({
      namespace: "post-videos",
      extension: claimed.extension,
      data: chunks(),
    }).then(async (stored) => {
      if (stored.size === 0) {
        await storage.delete(stored.key);
        throw new ServiceError("VALIDATION_ERROR", "文件不能为空");
      }
      const detected = detectVideo(stored.header);
      if (!detected || detected.mimeType !== claimed.mimeType) {
        await storage.delete(stored.key);
        throw new ServiceError("UNSUPPORTED_MEDIA_TYPE", "仅支持真实的 MP4 或 WebM 视频");
      }
      storedVideo = {
        key: stored.key,
        size: stored.size,
        sha256: stored.sha256,
        mimeType: claimed.mimeType,
        originalFilename: cleanOriginalFilename(info.filename),
      };
      return storedVideo;
    });
    void videoPromise.catch(() => undefined);
  });
  parser.on("fieldsLimit", () => fail(new ServiceError("VALIDATION_ERROR", "multipart 文本字段过多")));
  parser.on("filesLimit", () => fail(new ServiceError("VALIDATION_ERROR", "只允许上传一个 video 文件")));
  parser.on("partsLimit", () => fail(new ServiceError("VALIDATION_ERROR", "multipart 字段过多")));
  parser.on("error", fail);

  let received = 0;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const resetIdleTimer = (stream: Transform) => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      stream.destroy(new ServiceError("REQUEST_TIMEOUT", "上传连接长时间无数据"));
    }, UPLOAD_IDLE_TIMEOUT_MS);
  };
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.byteLength;
      if (received > MAX_COMBAT_VIDEO_SIZE + MAX_MULTIPART_OVERHEAD) {
        callback(new ServiceError("PAYLOAD_TOO_LARGE", "请求体超过大小限制"));
        return;
      }
      resetIdleTimer(this);
      callback(null, chunk);
    },
  });
  resetIdleTimer(limiter);
  const source = Readable.fromWeb(request.body as unknown as NodeReadableStream);
  const onAbort = () => source.destroy(new ServiceError("REQUEST_TIMEOUT", "上传连接已中断"));
  request.signal.addEventListener("abort", onAbort, { once: true });

  try {
    await pipeline(source, limiter, parser);
    if (idleTimer) clearTimeout(idleTimer);
    if (fatalError) throw fatalError;
    if (!videoPromise) throw new ServiceError("VALIDATION_ERROR", "请选择视频文件");
    const video = await videoPromise;
    if (fatalError) throw fatalError;
    return { fields, video };
  } catch (error) {
    if (idleTimer) clearTimeout(idleTimer);
    let cleanupVideo = storedVideo as StreamedCombatVideo | null;
    const pendingVideo = videoPromise as Promise<StreamedCombatVideo> | null;
    if (!cleanupVideo && pendingVideo) cleanupVideo = await pendingVideo.catch(() => null);
    if (cleanupVideo) await storage.delete(cleanupVideo.key).catch(() => undefined);
    if (error instanceof ServiceError) throw error;
    throw new ServiceError("VALIDATION_ERROR", "multipart 请求体格式错误");
  } finally {
    request.signal.removeEventListener("abort", onAbort);
  }
}
