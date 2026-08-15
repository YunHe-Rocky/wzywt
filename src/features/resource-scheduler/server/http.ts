import { NextResponse } from "next/server";
import { ResourceSchedulerError } from "@/features/resource-scheduler/model";

export function resourceSchedulerErrorResponse(error: unknown): NextResponse {
  if (!(error instanceof ResourceSchedulerError)) throw error;
  const status = error.code === "AUTH_REQUIRED" ? 401
    : error.code === "LEASE_NOT_FOUND" ? 410
      : error.code === "UNKNOWN_PAGE" || error.code === "UNKNOWN_RESOURCE" || error.code === "RESOURCE_NOT_ALLOWED" ? 400
        : 500;
  return NextResponse.json({ error: error.message, code: error.code }, { status });
}
