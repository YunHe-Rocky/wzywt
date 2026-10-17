const rules: Record<string, readonly [number, number, number]> = {
  RESOURCE_GOVERNOR_ENABLED: [1, 0, 1],
  RESOURCE_WEB_MEMORY_MB: [0, 0, 1_048_576], RESOURCE_CRON_MEMORY_MB: [0, 0, 1_048_576],
  RESOURCE_EXTERNAL_RPS: [30, 1, 10_000], RESOURCE_EXTERNAL_BURST: [30, 1, 10_000],
  RESOURCE_EXTERNAL_CONCURRENCY: [32, 1, 2_048], RESOURCE_INTERNAL_CONCURRENCY: [4, 1, 16],
  RESOURCE_SUBSCRIPTION_CONCURRENCY: [8, 1, 100], RESOURCE_SUBSCRIPTION_MAX_SECONDS: [300, 10, 3_600],
  RESOURCE_DRAIN_SECONDS: [30, 1, 300], RESOURCE_RECLAIM_SECONDS: [15, 5, 600],
  RESOURCE_INTERNAL_QUEUE_LIMIT: [32, 1, 256], RESOURCE_INTERNAL_MAX_WAIT_SECONDS: [900, 1, 7_200],
  RESOURCE_RECOVERY_SECONDS: [30, 0, 600], RESOURCE_LOG_SECONDS: [30, 5, 600], RESOURCE_RECYCLE_SECONDS: [180, 0, 3_600],
  SPLIT_WORKER_CONCURRENCY: [0, 0, 4], SPLIT_WORKER_QUEUE_LIMIT: [8, 1, 32],
  SPLIT_WORKER_TIMEOUT_MS: [8_000, 500, 30_000], SPLIT_WORKER_IDLE_SECONDS: [60, 1, 3_600],
  SPLIT_WORKER_HEAP_MB: [64, 16, 1_024],
};

export const resourceSettingKeys = Object.keys(rules);

/** Same soft envelope in PM2 and the governor, including native cgroup limits. */
export function resourceMemoryBudget(capacityBytes: number, role: "web" | "cron", configuredMiB = 0, runtime = "native") {
  if (!Number.isFinite(capacityBytes) || capacityBytes <= 0) throw new Error("Invalid memory capacity");
  const fraction = runtime === "docker" ? 0.85 : role === "web" ? 0.35 : 0.20;
  const softBytes = Math.max(1, Math.floor(Math.min(capacityBytes * 0.85,
    configuredMiB > 0 ? configuredMiB * 1_048_576 : capacityBytes * fraction)));
  return { softBytes, restartBytes: Math.min(Math.floor(capacityBytes), Math.ceil(softBytes * 1.20)) };
}

/** Shared fail-closed validation for PM2, Compose preflight and live runtime. */
export function readResourceSettings(environment: Record<string, string | undefined>): Record<string, number> {
  return Object.fromEntries(Object.entries(rules).map(([key, [fallback, minimum, maximum]]) => {
    const raw = environment[key]?.trim();
    const value = raw ? Number(raw) : fallback;
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum
      || (key.endsWith("MEMORY_MB") && value > 0 && value < 64)) throw new Error(`Invalid ${key}`);
    return [key, value];
  }));
}
