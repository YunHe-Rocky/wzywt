import * as iconv from "iconv-lite";

/** Official pages include GBK archives and UTF-8 pages. Never guess GBK first. */
export function decodeHtmlBytes(bytes: Uint8Array, contentType = ""): string {
  const buffer = Buffer.from(bytes);
  const declared = `${contentType} ${buffer.subarray(0, 2048).toString("ascii")}`
    .match(/charset\s*=\s*["']?\s*([\w-]+)/i)?.[1]?.toLowerCase();
  if (declared && iconv.encodingExists(declared)) return iconv.decode(buffer, declared).replace(/\0/g, "");
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/\0/g, ""); }
  catch { return iconv.decode(buffer, "gbk").replace(/\0/g, ""); }
}
