import type { RedisOptions } from "ioredis";

export function redisRetryDelay(times: number): number {
  const exponent = Math.min(Math.max(times - 1, 0), 5);
  return Math.min(250 * (2 ** exponent), 5_000);
}

// Shared by the application and the authenticated deployment probe.
export function redisConnectionOptions(): RedisOptions {
  return {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: redisRetryDelay,
    connectTimeout: 5000,
    commandTimeout: 5000,
    enableReadyCheck: true,
    enableOfflineQueue: true,
    reconnectOnError(error) {
      return error.message.includes("READONLY") ? 2 : false;
    },
  };
}
