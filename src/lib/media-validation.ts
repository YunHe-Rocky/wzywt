import { basename } from "node:path";
import { ServiceError } from "@/lib/service-error";

export const MAX_MATCH_SCREENSHOT_SIZE = 12 * 1024 * 1024;
export const MAX_COMBAT_VIDEO_SIZE = 256 * 1024 * 1024;

export interface ValidatedMediaFile {
  data: Buffer;
  mimeType: string;
  extension: string;
  originalFilename: string;
}

export function cleanOriginalFilename(name: string): string {
  const cleaned = basename(name).replace(/[\u0000-\u001f\u007f]/g, "").replace(/[^\p{L}\p{N}._()\- ]/gu, "_").trim();
  return (cleaned || "upload").slice(0, 255);
}

function detectImage(data: Buffer): { mimeType: string; extension: string } | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return { mimeType: "image/jpeg", extension: "jpg" };
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mimeType: "image/png", extension: "png" };
  if (data.length >= 12 && data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP") return { mimeType: "image/webp", extension: "webp" };
  return null;
}

export function detectVideo(data: Buffer): { mimeType: string; extension: string } | null {
  if (data.length >= 12 && data.subarray(4, 8).toString("ascii") === "ftyp") return { mimeType: "video/mp4", extension: "mp4" };
  if (data.length >= 4 && data.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return { mimeType: "video/webm", extension: "webm" };
  return null;
}

async function readFile(file: File, maxSize: number): Promise<Buffer> {
  if (file.size === 0) throw new ServiceError("VALIDATION_ERROR", "文件不能为空");
  if (file.size > maxSize) throw new ServiceError("PAYLOAD_TOO_LARGE", "文件超过大小限制");
  return Buffer.from(await file.arrayBuffer());
}

export async function validateScreenshotFile(file: File): Promise<ValidatedMediaFile> {
  const data = await readFile(file, MAX_MATCH_SCREENSHOT_SIZE);
  const detected = detectImage(data);
  if (!detected || file.type !== detected.mimeType) throw new ServiceError("UNSUPPORTED_MEDIA_TYPE", "仅支持真实的 JPG、PNG 或 WebP 图片");
  return { data, ...detected, originalFilename: cleanOriginalFilename(file.name) };
}

export async function validateCombatVideo(file: File): Promise<ValidatedMediaFile> {
  const data = await readFile(file, MAX_COMBAT_VIDEO_SIZE);
  const detected = detectVideo(data);
  if (!detected || file.type !== detected.mimeType) throw new ServiceError("UNSUPPORTED_MEDIA_TYPE", "仅支持真实的 MP4 或 WebM 视频");
  return { data, ...detected, originalFilename: cleanOriginalFilename(file.name) };
}
