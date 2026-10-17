import { open } from "node:fs/promises";

/** Stream with backpressure and a byte cap; the caller commits by rename. */
export async function streamResponseToFile(response: Response, path: string, maximum: number, minimum = 1): Promise<void> {
  const declared = Number(response.headers.get("content-length"));
  if (declared > maximum) { await response.body?.cancel(); throw new Error("DOWNLOAD_TOO_LARGE"); }
  if (!response.body) throw new Error("DOWNLOAD_EMPTY");
  const reader = response.body.getReader();
  let file: Awaited<ReturnType<typeof open>> | undefined;
  let received = 0;
  try {
    file = await open(path, "wx", 0o600);
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maximum) throw new Error("DOWNLOAD_TOO_LARGE");
      let offset = 0;
      while (offset < value.byteLength) {
        const { bytesWritten } = await file.write(value, offset, value.byteLength - offset);
        if (!bytesWritten) throw new Error("DOWNLOAD_WRITE_FAILED");
        offset += bytesWritten;
      }
    }
    if (received < minimum) throw new Error("DOWNLOAD_TOO_SMALL");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
    await file?.close();
  }
}
