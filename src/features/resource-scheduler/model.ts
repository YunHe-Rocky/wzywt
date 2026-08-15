export type ResourceState = "COLD" | "WARMING" | "HOT" | "IDLE" | "EVICTED";
export type ResourceScope = "public" | "user";
export type ResourceLoadMode = "immediate" | "deferred" | "interaction";

export interface ResourceContext {
  userId: number | null;
}

export interface ResourcePayload<T = unknown> {
  data: T;
  version: string;
}

export interface ResourceDefinition<T = unknown> {
  name: string;
  scope: ResourceScope;
  maxAgeMs: number;
  idleTtlMs: number;
  loader(context: ResourceContext): Promise<ResourcePayload<T>>;
  dispose?(value: T): Promise<void> | void;
}

export interface PageResourceDefinition {
  name: string;
  mode: ResourceLoadMode;
}

export interface PageDefinition {
  name: string;
  requiresAuth: boolean;
  resources: readonly PageResourceDefinition[];
}

export interface ResourceMetrics {
  loads: number;
  sharedLoads: number;
  cacheHits: number;
  staleHits: number;
  evictions: number;
  loadErrors: number;
}

export interface ResourceSnapshot extends ResourceMetrics {
  key: string;
  name: string;
  scope: ResourceScope;
  state: ResourceState;
  leases: number;
  version: string | null;
  loadedAt: string | null;
  expiresAt: string | null;
  idleSince: string | null;
  lastError: string | null;
}

export interface LeaseSnapshot {
  id: string;
  page: string;
  userId: number | null;
  expiresAt: string;
  resources: string[];
}

export interface LeaseResult {
  lease: LeaseSnapshot;
  immediate: Record<string, ResourcePayload>;
}

export class ResourceSchedulerError extends Error {
  constructor(
    public readonly code: "UNKNOWN_PAGE" | "UNKNOWN_RESOURCE" | "AUTH_REQUIRED" | "LEASE_NOT_FOUND" | "RESOURCE_NOT_ALLOWED",
    message: string,
  ) {
    super(message);
    this.name = "ResourceSchedulerError";
  }
}
