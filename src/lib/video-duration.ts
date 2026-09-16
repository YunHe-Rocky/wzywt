import type { MediaStorage } from "@/lib/storage";
import { ServiceError } from "@/lib/service-error";

function invalid(): never { throw new ServiceError("UNSUPPORTED_MEDIA_TYPE", "无法读取视频时长，请导出为含完整时长信息的 MP4 或 WebM 后重试"); }

// Read container metadata by range. Never buffer the full uploaded video.
export async function inspectVideoDuration(storage: MediaStorage, key: string, size: number, mimeType: string): Promise<number> {
  let reads = 0;
  async function read(offset: number, length: number) {
    if (++reads > 4096 || length <= 0 || length > 65536 || offset < 0 || offset + length > size) invalid();
    const stream = await storage.open(key, { start: offset, end: offset + length - 1 });
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const result = Buffer.concat(chunks);
    if (result.length !== length) invalid();
    return result;
  }
  function duration(value: number) { if (!Number.isFinite(value) || value <= 0) invalid(); return value; }
  if (mimeType === "video/mp4") {
    async function scan(start: number, end: number, insideMoov: boolean): Promise<number | null> {
      for (let offset = start; offset + 8 <= end;) {
        const header = await read(offset, 8);
        let length = header.readUInt32BE(0); let headerSize = 8;
        const type = header.toString("ascii", 4, 8);
        if (length === 1) { length = Number((await read(offset + 8, 8)).readBigUInt64BE()); headerSize = 16; }
        else if (length === 0) length = end - offset;
        if (!Number.isSafeInteger(length) || length < headerSize || offset + length > end) invalid();
        if (type === "moov" && !insideMoov) {
          const result = await scan(offset + headerSize, offset + length, true);
          if (result !== null) return result;
        }
        if (type === "mvhd" && insideMoov) {
          const bytes = await read(offset + headerSize, Math.min(length - headerSize, 32));
          if (bytes[0] === 0 && bytes.length >= 20) {
            const scale = bytes.readUInt32BE(12); if (!scale) invalid();
            return duration(bytes.readUInt32BE(16) / scale);
          }
          if (bytes[0] === 1 && bytes.length >= 32) {
            const scale = bytes.readUInt32BE(20); if (!scale) invalid();
            const ticks = Number(bytes.readBigUInt64BE(24)); if (!Number.isSafeInteger(ticks)) invalid();
            return duration(ticks / scale);
          }
          invalid();
        }
        offset += length;
      }
      return null;
    }
    const result = await scan(0, size, false);
    return result === null ? invalid() : result;
  }
  if (mimeType !== "video/webm") invalid();
  async function element(offset: number, end: number) {
    const head = await read(offset, Math.min(12, end - offset));
    function vint(at: number, identifier: boolean) {
      const first = head[at]; if (!first) invalid();
      let width = 1; while (width <= 8 && !(first & (0x80 >> (width - 1)))) width++;
      if (width > (identifier ? 4 : 8) || at + width > head.length) invalid();
      let value = BigInt(identifier ? first : first & (0xff >> width));
      for (let i = 1; i < width; i++) value = value * BigInt(256) + BigInt(head[at + i]);
      return { width, value, unknown: !identifier && value === (BigInt(1) << BigInt(7 * width)) - BigInt(1) };
    }
    const id = vint(0, true); const length = vint(id.width, false);
    const start = offset + id.width + length.width;
    const stop = length.unknown ? end : start + Number(length.value);
    if (!Number.isSafeInteger(stop) || stop > end || stop < start) invalid();
    return { id: Number(id.value), start, end: stop };
  }
  let offset = 0;
  while (offset < size) {
    const outer = await element(offset, size);
    if (outer.id === 0x18538067) {
      let childOffset = outer.start;
      while (childOffset < outer.end) {
        const child = await element(childOffset, outer.end);
        if (child.id === 0x1549a966) {
          let scale = 1_000_000; let ticks: number | null = null; let infoOffset = child.start;
          while (infoOffset < child.end) {
            const info = await element(infoOffset, child.end);
            if (info.id === 0x2ad7b1 || info.id === 0x4489) {
              const length = info.end - info.start; if (length > 8 || length < 1) invalid();
              const bytes = await read(info.start, length);
              if (info.id === 0x4489) ticks = length === 4 ? bytes.readFloatBE() : length === 8 ? bytes.readDoubleBE() : invalid();
              else { let value = BigInt(0); for (const byte of bytes) value = value * BigInt(256) + BigInt(byte); scale = Number(value); if (!Number.isSafeInteger(scale) || scale <= 0) invalid(); }
            }
            infoOffset = info.end;
          }
          return ticks === null ? invalid() : duration(ticks * scale / 1_000_000_000);
        }
        childOffset = child.end;
      }
    }
    offset = outer.end;
  }
  return invalid();
}
