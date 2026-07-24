"use client";

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T;
}

export async function apiRequest<T>(
  input: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  const response = await fetch(input, init);
  const data = (await response.json().catch(() => ({}))) as T;
  return { ok: response.ok, status: response.status, data };
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

