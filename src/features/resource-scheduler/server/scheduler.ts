import { randomUUID } from "node:crypto";
import type {
  LeaseResult,
  LeaseSnapshot,
  PageDefinition,
  ResourceContext,
  ResourceDefinition,
  ResourceMetrics,
  ResourcePayload,
  ResourceSnapshot,
  ResourceState,
} from "@/features/resource-scheduler/model";
import { ResourceSchedulerError } from "@/features/resource-scheduler/model";

interface ResourceEntry {
  definition: ResourceDefinition;
  key: string;
  context: ResourceContext;
  state: ResourceState;
  value?: ResourcePayload;
  loading?: Promise<ResourcePayload>;
  leases: Set<string>;
  loadedAt: number | null;
  expiresAt: number | null;
  idleSince: number | null;
  lastError: string | null;
  metrics: ResourceMetrics;
}

interface LeaseEntry {
  id: string;
  page: PageDefinition;
  context: ResourceContext;
  expiresAt: number;
  resourceKeys: Map<string, string>;
}

export interface ResourceSchedulerOptions {
  leaseTtlMs?: number;
  sweepIntervalMs?: number;
  now?: () => number;
  createId?: () => string;
  autoSweep?: boolean;
}

const EMPTY_METRICS = (): ResourceMetrics => ({
  loads: 0,
  sharedLoads: 0,
  cacheHits: 0,
  staleHits: 0,
  evictions: 0,
  loadErrors: 0,
});

export class ResourceScheduler {
  private readonly resources = new Map<string, ResourceDefinition>();
  private readonly pages = new Map<string, PageDefinition>();
  private readonly entries = new Map<string, ResourceEntry>();
  private readonly leases = new Map<string, LeaseEntry>();
  private readonly leaseTtlMs: number;
  private readonly now: () => number;
  private readonly createId: () => string;
  private readonly sweepTimer: ReturnType<typeof setInterval> | null;

  constructor(options: ResourceSchedulerOptions = {}) {
    this.leaseTtlMs = options.leaseTtlMs ?? 90_000;
    this.now = options.now ?? Date.now;
    this.createId = options.createId ?? randomUUID;
    if (options.autoSweep === false) {
      this.sweepTimer = null;
    } else {
      this.sweepTimer = setInterval(() => void this.sweep(), options.sweepIntervalMs ?? 5_000);
      this.sweepTimer.unref?.();
    }
  }

  registerResource(definition: ResourceDefinition): void {
    if (this.resources.has(definition.name)) throw new Error(`Resource already registered: ${definition.name}`);
    if (definition.maxAgeMs <= 0 || definition.idleTtlMs < 0) throw new Error(`Invalid lifecycle for ${definition.name}`);
    this.resources.set(definition.name, definition);
  }

  registerPage(page: PageDefinition): void {
    if (this.pages.has(page.name)) throw new Error(`Page already registered: ${page.name}`);
    const names = new Set<string>();
    for (const resource of page.resources) {
      if (!this.resources.has(resource.name)) throw new Error(`Unknown page resource: ${resource.name}`);
      if (names.has(resource.name)) throw new Error(`Duplicate page resource: ${resource.name}`);
      names.add(resource.name);
    }
    this.pages.set(page.name, page);
  }

  async acquirePage(pageName: string, userId: number | null): Promise<LeaseResult> {
    await this.sweep();
    const page = this.pages.get(pageName);
    if (!page) throw new ResourceSchedulerError("UNKNOWN_PAGE", "页面资源清单不存在");
    if (page.requiresAuth && userId === null) throw new ResourceSchedulerError("AUTH_REQUIRED", "该页面需要登录");

    const id = this.createId();
    const context = { userId };
    const resourceKeys = new Map<string, string>();
    const lease: LeaseEntry = { id, page, context, resourceKeys, expiresAt: this.now() + this.leaseTtlMs };
    this.leases.set(id, lease);

    for (const item of page.resources) {
      const entry = this.getOrCreateEntry(item.name, context);
      entry.leases.add(id);
      entry.idleSince = null;
      if (entry.value && !entry.loading) entry.state = "HOT";
      resourceKeys.set(item.name, entry.key);
    }

    try {
      const immediateEntries = page.resources.filter((item) => item.mode === "immediate");
      const values = await Promise.all(immediateEntries.map(async (item) => [item.name, await this.readEntry(this.requireEntry(lease, item.name))] as const));
      return { lease: this.toLeaseSnapshot(lease), immediate: Object.fromEntries(values) };
    } catch (error) {
      await this.releaseLease(id);
      throw error;
    }
  }

  async getResource(leaseId: string, resourceName: string, refresh = false): Promise<ResourcePayload> {
    await this.sweep();
    const lease = this.leases.get(leaseId);
    if (!lease) throw new ResourceSchedulerError("LEASE_NOT_FOUND", "页面租约不存在或已过期");
    const entry = this.requireEntry(lease, resourceName);
    return this.readEntry(entry, refresh);
  }

  renewLease(leaseId: string): LeaseSnapshot {
    const lease = this.leases.get(leaseId);
    if (!lease || lease.expiresAt <= this.now()) {
      if (lease) void this.releaseLease(leaseId);
      throw new ResourceSchedulerError("LEASE_NOT_FOUND", "页面租约不存在或已过期");
    }
    lease.expiresAt = this.now() + this.leaseTtlMs;
    return this.toLeaseSnapshot(lease);
  }

  async releaseLease(leaseId: string): Promise<boolean> {
    const lease = this.leases.get(leaseId);
    if (!lease) return false;
    this.leases.delete(leaseId);
    const now = this.now();
    for (const key of lease.resourceKeys.values()) {
      const entry = this.entries.get(key);
      if (!entry) continue;
      entry.leases.delete(leaseId);
      if (entry.leases.size === 0 && entry.state !== "COLD" && entry.state !== "EVICTED") {
        entry.state = "IDLE";
        entry.idleSince = now;
      }
    }
    return true;
  }

  async invalidate(resourceName: string, userId?: number): Promise<void> {
    for (const entry of this.entries.values()) {
      if (entry.definition.name !== resourceName) continue;
      if (userId !== undefined && entry.context.userId !== userId) continue;
      entry.expiresAt = 0;
    }
  }

  async sweep(): Promise<void> {
    const now = this.now();
    const expired = [...this.leases.values()].filter((lease) => lease.expiresAt <= now);
    await Promise.all(expired.map((lease) => this.releaseLease(lease.id)));

    for (const entry of this.entries.values()) {
      if (entry.state !== "IDLE" || entry.loading || entry.idleSince === null) continue;
      if (now - entry.idleSince < entry.definition.idleTtlMs) continue;
      if (entry.value && entry.definition.dispose) await entry.definition.dispose(entry.value.data);
      entry.value = undefined;
      entry.loadedAt = null;
      entry.expiresAt = null;
      entry.idleSince = null;
      entry.state = "EVICTED";
      entry.metrics.evictions++;
    }
  }

  snapshots(): { resources: ResourceSnapshot[]; leases: LeaseSnapshot[] } {
    const resources = [...this.entries.values()].map((entry) => this.toResourceSnapshot(entry));
    const instantiated = new Set(resources.map((resource) => resource.name));
    for (const definition of this.resources.values()) {
      if (instantiated.has(definition.name)) continue;
      resources.push({
        key: `${definition.name}|${definition.scope}`,
        name: definition.name,
        scope: definition.scope,
        state: "COLD",
        leases: 0,
        version: null,
        loadedAt: null,
        expiresAt: null,
        idleSince: null,
        lastError: null,
        ...EMPTY_METRICS(),
      });
    }
    return {
      resources: resources.sort((a, b) => a.key.localeCompare(b.key)),
      leases: [...this.leases.values()].map((lease) => this.toLeaseSnapshot(lease)),
    };
  }

  close(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  private getOrCreateEntry(name: string, context: ResourceContext): ResourceEntry {
    const definition = this.resources.get(name);
    if (!definition) throw new ResourceSchedulerError("UNKNOWN_RESOURCE", "资源不存在");
    if (definition.scope === "user" && context.userId === null) {
      throw new ResourceSchedulerError("AUTH_REQUIRED", "用户资源需要登录");
    }
    const scopeKey = definition.scope === "public" ? "public" : `user:${context.userId}`;
    const key = `${name}|${scopeKey}`;
    const existing = this.entries.get(key);
    if (existing) return existing;
    const entry: ResourceEntry = {
      definition,
      key,
      context,
      state: "COLD",
      leases: new Set(),
      loadedAt: null,
      expiresAt: null,
      idleSince: null,
      lastError: null,
      metrics: EMPTY_METRICS(),
    };
    this.entries.set(key, entry);
    return entry;
  }

  private requireEntry(lease: LeaseEntry, resourceName: string): ResourceEntry {
    const key = lease.resourceKeys.get(resourceName);
    if (!key) throw new ResourceSchedulerError("RESOURCE_NOT_ALLOWED", "资源不属于当前页面");
    const entry = this.entries.get(key);
    if (!entry) throw new ResourceSchedulerError("UNKNOWN_RESOURCE", "资源不存在");
    return entry;
  }

  private async readEntry(entry: ResourceEntry, refresh = false): Promise<ResourcePayload> {
    const now = this.now();
    if (entry.loading) {
      entry.metrics.sharedLoads++;
      return entry.loading;
    }
    if (!refresh && entry.value && entry.expiresAt !== null && entry.expiresAt > now) {
      entry.metrics.cacheHits++;
      entry.state = entry.leases.size > 0 ? "HOT" : "IDLE";
      return entry.value;
    }
    if (!refresh && entry.value) {
      entry.metrics.staleHits++;
      void this.loadEntry(entry).catch(() => undefined);
      return entry.value;
    }
    return this.loadEntry(entry);
  }

  private loadEntry(entry: ResourceEntry): Promise<ResourcePayload> {
    if (entry.loading) {
      entry.metrics.sharedLoads++;
      return entry.loading;
    }
    entry.state = "WARMING";
    entry.metrics.loads++;
    const loading = entry.definition.loader(entry.context)
      .then((value) => {
        const now = this.now();
        entry.value = value;
        entry.loadedAt = now;
        entry.expiresAt = now + entry.definition.maxAgeMs;
        entry.lastError = null;
        entry.state = entry.leases.size > 0 ? "HOT" : "IDLE";
        entry.idleSince = entry.leases.size > 0 ? null : now;
        return value;
      })
      .catch((error) => {
        entry.metrics.loadErrors++;
        entry.lastError = error instanceof Error ? error.message : String(error);
        entry.state = entry.value ? (entry.leases.size > 0 ? "HOT" : "IDLE") : "COLD";
        throw error;
      })
      .finally(() => {
        entry.loading = undefined;
      });
    entry.loading = loading;
    return loading;
  }

  private toLeaseSnapshot(lease: LeaseEntry): LeaseSnapshot {
    return {
      id: lease.id,
      page: lease.page.name,
      userId: lease.context.userId,
      expiresAt: new Date(lease.expiresAt).toISOString(),
      resources: [...lease.resourceKeys.keys()],
    };
  }

  private toResourceSnapshot(entry: ResourceEntry): ResourceSnapshot {
    return {
      key: entry.key,
      name: entry.definition.name,
      scope: entry.definition.scope,
      state: entry.state,
      leases: entry.leases.size,
      version: entry.value?.version ?? null,
      loadedAt: entry.loadedAt === null ? null : new Date(entry.loadedAt).toISOString(),
      expiresAt: entry.expiresAt === null ? null : new Date(entry.expiresAt).toISOString(),
      idleSince: entry.idleSince === null ? null : new Date(entry.idleSince).toISOString(),
      lastError: entry.lastError,
      ...entry.metrics,
    };
  }
}
