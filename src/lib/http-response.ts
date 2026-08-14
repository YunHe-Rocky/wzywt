export class ResponseBodyTooLargeError extends Error {
  constructor(public readonly maxBytes: number) {
    super(`Response body exceeds ${maxBytes} bytes`);
    this.name = "ResponseBodyTooLargeError";
  }
}

export async function readResponseBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = response.headers.get("content-length");
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    await response.body?.cancel();
    throw new ResponseBodyTooLargeError(maxBytes);
  }
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        throw new ResponseBodyTooLargeError(maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function readResponseText(response: Response, maxBytes: number): Promise<string> {
  return new TextDecoder().decode(await readResponseBytes(response, maxBytes));
}

export async function readResponseJson(response: Response, maxBytes: number): Promise<unknown> {
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(
    await readResponseBytes(response, maxBytes),
  )) as unknown;
}
