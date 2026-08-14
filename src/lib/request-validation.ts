import { NextResponse } from "next/server";
import { ServiceError } from "@/lib/service-error";

export type JsonRequestResult<T> =
  | { ok: true; value: T }
  | { ok: false; response: NextResponse };

export function parseRouteId(value: string, label: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new ServiceError("VALIDATION_ERROR", `${label}无效`);
  }
  return id;
}

function parseContentLength(request: Request, maxBytes: number): void {
  const raw = request.headers.get("content-length");
  if (raw === null) return;
  if (!/^\d+$/.test(raw)) {
    throw new ServiceError("VALIDATION_ERROR", "Content-Length 格式错误");
  }
  const length = Number(raw);
  if (!Number.isSafeInteger(length) || length > maxBytes) {
    throw new ServiceError("PAYLOAD_TOO_LARGE", "请求体超过大小限制");
  }
}

function createLimitedBodyRequest(request: Request, maxBytes: number): Request {
  parseContentLength(request, maxBytes);
  if (!request.body) return request;

  let received = 0;
  const limitedBody = request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      received += chunk.byteLength;
      if (received > maxBytes) {
        controller.error(new ServiceError("PAYLOAD_TOO_LARGE", "请求体超过大小限制"));
        return;
      }
      controller.enqueue(chunk);
    },
  }));

  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: limitedBody,
    signal: request.signal,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

export async function readJsonRequest(request: Request, maxBytes = 256 * 1024): Promise<unknown> {
  try {
    const text = await createLimitedBodyRequest(request, maxBytes).text();
    if (!text.trim()) throw new ServiceError("VALIDATION_ERROR", "JSON 请求体不能为空");
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError("VALIDATION_ERROR", "JSON 请求体格式错误");
  }
}

export async function tryReadJsonRequest<T = unknown>(
  request: Request,
  maxBytes = 256 * 1024,
): Promise<JsonRequestResult<T>> {
  try {
    return { ok: true, value: await readJsonRequest(request, maxBytes) as T };
  } catch (error) {
    const serviceError = error instanceof ServiceError
      ? error
      : new ServiceError("VALIDATION_ERROR", "JSON 请求体格式错误");
    return {
      ok: false,
      response: NextResponse.json(
        { error: serviceError.message, code: serviceError.code },
        { status: serviceError.status },
      ),
    };
  }
}

export async function readFormDataRequest(request: Request, maxBytes: number): Promise<FormData> {
  try {
    return await createLimitedBodyRequest(request, maxBytes).formData();
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError("VALIDATION_ERROR", "multipart 请求体格式错误");
  }
}
