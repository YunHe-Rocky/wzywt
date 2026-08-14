export interface ByteRange {
  start: number;
  end: number;
}

export type ByteRangeResult =
  | { kind: "full" }
  | { kind: "partial"; range: ByteRange }
  | { kind: "invalid" };

export function parseByteRange(header: string | null, size: number): ByteRangeResult {
  if (!header) return { kind: "full" };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || size <= 0) return { kind: "invalid" };
  const [, startText, endText] = match;
  if (!startText && !endText) return { kind: "invalid" };
  if (!startText) {
    const suffix = Number(endText);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return { kind: "invalid" };
    return { kind: "partial", range: { start: Math.max(0, size - suffix), end: size - 1 } };
  }
  const start = Number(startText);
  const requestedEnd = endText ? Number(endText) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start < 0 || start >= size || requestedEnd < start) {
    return { kind: "invalid" };
  }
  return { kind: "partial", range: { start, end: Math.min(requestedEnd, size - 1) } };
}
