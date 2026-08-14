"use client";

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T;
}

export type ApiConnectionErrorCode = "TIMEOUT" | "ABORTED" | "NETWORK" | "INVALID_RESPONSE";

export class ApiConnectionError extends Error {
  constructor(
    public readonly code: ApiConnectionErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ApiConnectionError";
  }
}

export interface ApiRequestInit extends RequestInit {
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export async function apiRequest<T>(
  input: string,
  init: ApiRequestInit = {},
): Promise<ApiResult<T>> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: callerSignal, ...requestInit } = init;
  const effectiveTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  let timedOut = false;
  const onCallerAbort = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) onCallerAbort();
  else callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException("Request timed out", "TimeoutError"));
  }, effectiveTimeout);

  try {
    const response = await fetch(input, { ...requestInit, signal: controller.signal });
    const text = await response.text();
    let data: T;
    if (!text.trim()) {
      data = {} as T;
    } else {
      try {
        data = JSON.parse(text) as T;
      } catch (error) {
        throw new ApiConnectionError(
          "INVALID_RESPONSE",
          "服务器返回了无法识别的响应，请稍后重试",
          { cause: error },
        );
      }
    }
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    if (error instanceof ApiConnectionError) throw error;
    if (timedOut) {
      throw new ApiConnectionError("TIMEOUT", "请求超时，请检查网络后重试", { cause: error });
    }
    if (callerSignal?.aborted) {
      throw new ApiConnectionError("ABORTED", "请求已取消", { cause: error });
    }
    throw new ApiConnectionError("NETWORK", "网络连接失败，请稍后重试", { cause: error });
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", onCallerAbort);
  }
}

export function jsonRequest<T>(
  input: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<ApiResult<T>> {
  return apiRequest<T>(input, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
