import { basename } from "node:path";
import { ServiceError } from "@/lib/service-error";

export const MAX_MATCH_SCREENSHOT_SIZE = 12 * 1024 * 1024;
export const MAX_COMBAT_VIDEO_SIZE = 256 * 1024 * 1024;
export const MAX_SCREENSHOT_DIMENSION = 8192;
export const MAX_SCREENSHOT_PIXELS = 40_000_000;

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

export interface ImageDimensions {
  width: number;
  height: number;
}

function jpegDimensions(data: Buffer): ImageDimensions | null {
  let offset = 2;
  while (offset + 8 < data.length) {
    if (data[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = data[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    if (offset + 4 > data.length) return null;
    const length = data.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > data.length) return null;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (length < 7) return null;
      return { height: data.readUInt16BE(offset + 5), width: data.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

export function inspectImageDimensions(data: Buffer, mimeType: string): ImageDimensions | null {
  if (mimeType === "image/png") {
    if (data.length < 24 || data.subarray(12, 16).toString("ascii") !== "IHDR") return null;
    return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  }
  if (mimeType === "image/jpeg") return jpegDimensions(data);
  if (mimeType === "image/webp") {
    if (data.length < 30) return null;
    const chunkType = data.subarray(12, 16).toString("ascii");
    if (chunkType === "VP8X") {
      return { width: 1 + data.readUIntLE(24, 3), height: 1 + data.readUIntLE(27, 3) };
    }
    if (chunkType === "VP8 " && data.subarray(23, 26).equals(Buffer.from([0x9d, 0x01, 0x2a]))) {
      return { width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff };
    }
    if (chunkType === "VP8L" && data[20] === 0x2f) {
      const b1 = data[21]; const b2 = data[22]; const b3 = data[23]; const b4 = data[24];
      return {
        width: 1 + b1 + ((b2 & 0x3f) << 8),
        height: 1 + (b2 >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10),
      };
    }
  }
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
  const dimensions = inspectImageDimensions(data, detected.mimeType);
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    throw new ServiceError("UNSUPPORTED_MEDIA_TYPE", "图片结构或尺寸无效");
  }
  if (
    dimensions.width > MAX_SCREENSHOT_DIMENSION
    || dimensions.height > MAX_SCREENSHOT_DIMENSION
    || dimensions.width * dimensions.height > MAX_SCREENSHOT_PIXELS
  ) {
    throw new ServiceError("PAYLOAD_TOO_LARGE", "图片像素尺寸超过限制");
  }
  return { data, ...detected, originalFilename: cleanOriginalFilename(file.name) };
}

export async function validateCombatVideo(file: File): Promise<ValidatedMediaFile> {
  const data = await readFile(file, MAX_COMBAT_VIDEO_SIZE);
  const detected = detectVideo(data);
  if (!detected || file.type !== detected.mimeType) throw new ServiceError("UNSUPPORTED_MEDIA_TYPE", "仅支持真实的 MP4 或 WebM 视频");
  return { data, ...detected, originalFilename: cleanOriginalFilename(file.name) };
}
