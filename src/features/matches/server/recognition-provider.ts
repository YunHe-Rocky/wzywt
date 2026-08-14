import { ServiceError } from "@/lib/service-error";

export interface RecognitionProviderFile {
  type: string;
  filename: string;
  mimeType: string;
  data: Buffer;
}

const MAX_OCR_RESPONSE_BYTES = 5 * 1024 * 1024;

async function readBoundedJson(response: Response): Promise<unknown> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null && Number(declaredLength) > MAX_OCR_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new ServiceError("SERVICE_UNAVAILABLE", "OCR 响应超过大小限制");
  }
  if (!response.body) throw new ServiceError("SERVICE_UNAVAILABLE", "OCR 服务返回空响应");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_OCR_RESPONSE_BYTES) {
        await reader.cancel();
        throw new ServiceError("SERVICE_UNAVAILABLE", "OCR 响应超过大小限制");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const payload = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    payload.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(payload)) as unknown;
  } catch {
    throw new ServiceError("SERVICE_UNAVAILABLE", "OCR 服务返回了无效 JSON");
  }
}

export async function recognizeMatchScreenshots(files: RecognitionProviderFile[]): Promise<unknown> {
  const endpoint = process.env.MATCH_OCR_ENDPOINT?.trim();
  if (!endpoint) {
    throw new ServiceError("SERVICE_UNAVAILABLE", "尚未配置 MATCH_OCR_ENDPOINT，无法启动 OCR");
  }
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new ServiceError("SERVICE_UNAVAILABLE", "MATCH_OCR_ENDPOINT 配置无效");
  }
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new ServiceError("SERVICE_UNAVAILABLE", "生产环境 MATCH_OCR_ENDPOINT 必须使用 HTTPS");
  }
  const form = new FormData();
  for (const file of files) {
    form.append("screenshots", new Blob([Uint8Array.from(file.data)], { type: file.mimeType }), file.filename);
    form.append("types", file.type);
  }
  const token = process.env.MATCH_OCR_TOKEN?.trim();
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
      signal: AbortSignal.timeout(90_000),
      redirect: "error",
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    throw new ServiceError("SERVICE_UNAVAILABLE", timedOut ? "OCR 请求超时" : "OCR 服务连接失败");
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new ServiceError("SERVICE_UNAVAILABLE", `OCR 服务返回 ${response.status}`);
  }
  return readBoundedJson(response);
}
