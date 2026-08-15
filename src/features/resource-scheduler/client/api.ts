"use client";

import { apiRequest, jsonRequest, type ApiResult } from "@/features/shared/client/api";
import type { LeaseResult, LeaseSnapshot, ResourcePayload } from "@/features/resource-scheduler/model";

interface SchedulerError {
  error?: string;
  code?: string;
}

export function acquirePageLease(page: string, signal?: AbortSignal): Promise<ApiResult<LeaseResult & SchedulerError>> {
  return apiRequest("/api/resources/leases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ page }),
    signal,
  });
}

export function renewPageLease(leaseId: string): Promise<ApiResult<{ lease?: LeaseSnapshot } & SchedulerError>> {
  return jsonRequest("/api/resources/leases", "PATCH", { leaseId });
}

export function releasePageLease(leaseId: string): Promise<ApiResult<{ ok?: boolean } & SchedulerError>> {
  return apiRequest("/api/resources/leases", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leaseId }),
    keepalive: true,
    timeoutMs: 5_000,
  });
}

export function loadPageResource<T>(
  leaseId: string,
  resource: string,
  options: { refresh?: boolean; signal?: AbortSignal } = {},
): Promise<ApiResult<ResourcePayload<T> & SchedulerError>> {
  const params = new URLSearchParams({ leaseId, resource });
  if (options.refresh) params.set("refresh", "true");
  return apiRequest(`/api/resources/data?${params}`, { signal: options.signal });
}
