import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth";
import { PermissionError } from "@/lib/permissions";
import { ServiceError } from "@/lib/service-error";

export function apiErrorResponse(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { error: error.code === "BANNED" ? "账号已被封禁" : "请先登录", code: error.code },
      { status: error.code === "BANNED" ? 403 : 401 },
    );
  }
  if (error instanceof PermissionError) {
    return NextResponse.json({ error: "无权限执行此操作", code: "FORBIDDEN" }, { status: 403 });
  }
  if (error instanceof ServiceError) {
    return NextResponse.json(
      { error: error.message, code: error.code, details: error.details },
      { status: error.status },
    );
  }
  console.error("Unhandled API error", error instanceof Error ? error.name : typeof error);
  return NextResponse.json({ error: "服务器内部错误", code: "INTERNAL_ERROR" }, { status: 500 });
}
