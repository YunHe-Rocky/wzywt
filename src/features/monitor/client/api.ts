"use client";

import type { ResourceSnapshot } from "@/features/resource-scheduler/model";
import { apiRequest, type ApiResult } from "@/features/shared/client/api";

interface MonitorError {
  error?: string;
}

export function getResourceSnapshots(signal?: AbortSignal): Promise<ApiResult<{ resources?: ResourceSnapshot[] } & MonitorError>> {
  return apiRequest("/api/admin/resources", { signal, timeoutMs: 10_000 });
}

export function queueMonitorCheck(signal?: AbortSignal): Promise<ApiResult<MonitorError>> {
  return apiRequest("/api/heroes/watch", {
    method: "POST",
    signal,
    timeoutMs: 15_000,
  });
}

export function openMonitorEvents(): EventSource {
  return new EventSource("/api/heroes/watch");
}
