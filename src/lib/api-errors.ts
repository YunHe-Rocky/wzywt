import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth";
import { PermissionError } from "@/lib/permissions";
import { ServiceError } from "@/lib/service-error";

export interface ApiErrorContext {
  request?: Request;
  useCase?: string;
  startedAt?: number;
}

function requestIdFor(request?: Request): string {
  const candidate = request?.headers.get("x-request-id")?.trim();
  return candidate && /^[A-Za-z0-9._:-]{8,128}$/.test(candidate) ? candidate : randomUUID();
}

function redactedStack(error: unknown): string[] | undefined {
  if (!(error instanceof Error) || !error.stack) return undefined;
  const workspace = process.cwd().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return error.stack.split("\n").slice(1, 9).map((line) => line
    .replace(new RegExp(workspace, "gi"), "<workspace>")
    .replace(/:\/\/[^\s/@]+:[^\s/@]+@/g, "://<credentials>@")
    .replace(/(token|secret|password)=([^&\s]+)/gi, "$1=<redacted>"));
}

function logFailure(error: unknown, status: number, code: string, requestId: string, context: ApiErrorContext): void {
  const entry = {
    event: "api.failure",
    requestId,
    useCase: context.useCase ?? "unknown",
    durationMs: context.startedAt === undefined ? undefined : Math.max(0, Date.now() - context.startedAt),
    status,
    code,
    errorName: error instanceof Error ? error.name : typeof error,
    stack: redactedStack(error),
  };
  const message = JSON.stringify(entry);
  if (status >= 500) console.error(message);
  else console.warn(message);
}

export function apiErrorResponse(error: unknown, context: ApiErrorContext = {}): NextResponse {
  const requestId = requestIdFor(context.request);
  let status: number;
  let body: Record<string, unknown>;
  const headers: Record<string, string> = { "x-request-id": requestId };
  if (error instanceof AuthError) {
    status = error.code === "BANNED" ? 403 : 401;
    body = { error: error.code === "BANNED" ? "账号已被封禁" : "请先登录", code: error.code, requestId };
  } else if (error instanceof PermissionError) {
    status = 403;
    body = { error: "无权限执行此操作", code: "FORBIDDEN", requestId };
  } else if (error instanceof ServiceError) {
    status = error.status;
    body = { error: error.message, code: error.code, requestId };
    if (error.details !== undefined) body.details = error.details;
    const retryAfter = typeof error.details === "object" && error.details !== null && "retryAfterSeconds" in error.details
      ? Number((error.details as { retryAfterSeconds?: unknown }).retryAfterSeconds)
      : Number.NaN;
    if (Number.isSafeInteger(retryAfter) && retryAfter > 0) headers["Retry-After"] = String(retryAfter);
  } else {
    status = 500;
    body = { error: "服务器内部错误", code: "INTERNAL_ERROR", requestId };
  }
  logFailure(error, status, String(body.code), requestId, context);
  return NextResponse.json(body, { status, headers });
}