import { ServiceError } from "@/lib/service-error";
import { resolveOcrEndpoint } from "@/lib/public-origin";
import { recognitionFailureMessage, isRetryableRecognitionFailure } from "../recognition-errors";

export class RecognitionProviderError extends ServiceError {
  constructor(public readonly failureCode: string) {
    super(isRetryableRecognitionFailure(failureCode) ? "SERVICE_UNAVAILABLE" : "BUSINESS_VALIDATION_FAILED",
      recognitionFailureMessage(failureCode) ?? "识别失败");
  }
}

export interface RecognitionProviderFile {
  type: string;
  filename: string;
  mimeType: string;
  data: Buffer;
}

const MAX_OCR_RESPONSE_BYTES = 5 * 1024 * 1024;

async function providerFailure(response: Response): Promise<RecognitionProviderError> {
  // Only inspect bounded, known protocol messages; never echo tokens, HTML or paths.
  let legacyPreview = false;
  if (response.status === 400 || response.status === 422) {
    try {
      const payload = await readBoundedJson(response);
      const detail = typeof payload === "object" && payload !== null && "detail" in payload ? payload.detail : null;
      legacyPreview = typeof detail === "string" && /Maximum number of files is 1|Preview accepts exactly one|Only DATA \/ 双方 is supported/.test(detail);
    } catch {
      // A malformed error body must not hide the known HTTP failure category.
    }
  } else await response.body?.cancel();
  const code = legacyPreview ? "OCR_UPGRADE_REQUIRED"
    : [401, 403].includes(response.status) ? "OCR_AUTH_FAILED"
    : response.status === 413 ? "OCR_IMAGE_TOO_LARGE"
    : [400, 415, 422].includes(response.status) ? "OCR_INPUT_INVALID"
    : response.status === 429 ? "OCR_BUSY" : "OCR_UNAVAILABLE";
  return new RecognitionProviderError(code);
}

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

export function getRecognitionProviderUrl(): URL {
  const endpoint = process.env.MATCH_OCR_ENDPOINT?.trim();
  if (!endpoint) {
    throw new ServiceError("SERVICE_UNAVAILABLE", "尚未配置 MATCH_OCR_ENDPOINT，无法启动 OCR");
  }
  try {
    return resolveOcrEndpoint(endpoint, process.env.DEPLOY_ENVIRONMENT, process.env.NODE_ENV === "production");
  } catch (error) {
    throw new ServiceError("SERVICE_UNAVAILABLE", error instanceof Error ? error.message : "MATCH_OCR_ENDPOINT 配置无效");
  }
}

export async function recognizeMatchScreenshots(files: RecognitionProviderFile[], signal?: AbortSignal): Promise<unknown> {
  const url = getRecognitionProviderUrl();
  const form = new FormData();
  for (const file of files) {
    form.append("screenshots", new Blob([Uint8Array.from(file.data)], { type: file.mimeType }), file.filename);
    form.append("types", file.type);
  }
  const token = process.env.MATCH_OCR_TOKEN?.trim();
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(90_000)]) : AbortSignal.timeout(90_000),
      redirect: "error",
    });
    if (!response.ok) throw await providerFailure(response);
    return await readBoundedJson(response);
  } catch (error) {
    if (signal?.aborted) {
      throw signal.reason instanceof Error ? signal.reason : new ServiceError("SERVICE_UNAVAILABLE", "OCR 任务租约已失效");
    }
    if (error instanceof ServiceError) throw error;
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    throw new RecognitionProviderError(timedOut ? "OCR_TIMEOUT" : "OCR_UNAVAILABLE");
  }
}
