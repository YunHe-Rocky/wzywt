import { readResourceSettings, resourceSettingKeys } from "../src/core/resource-settings.ts";

const containerBindings = Object.freeze({
  NODE_ENV: "production", APP_RUNTIME: "docker", HOST: "0.0.0.0", PORT: "8001",
  REDIS_URL: "redis://redis:6379/0", REDIS_REQUIRED: "1",
  MEDIA_STORAGE_DIR: "/app/data/media", AVATAR_DIR: "/app/data/media/avatars",
});
const defaults = Object.freeze({
  ...containerBindings, TZ: "Asia/Shanghai",
  DEPLOY_ENVIRONMENT: "local", PUBLIC_ORIGIN: "http://localhost:8001", SESSION_COOKIE_SECURE: "",
  MYSQL_HOST: "mysql", MYSQL_PORT: "3306", MYSQL_DATABASE: "wzywt", MYSQL_USER: "wzywt",
  STORAGE_MODE: "volume", APP_RELEASE_ID: "local",
});
export const applicationEnvironmentKeys = Object.freeze([...Object.keys(defaults),
  "SESSION_SECRET", "MYSQL_PASSWORD", "HEALTH_DETAILS_TOKEN", "MATCH_OCR_ENDPOINT", "MATCH_OCR_TOKEN", "MATCH_OCR_INTERNAL_HOST",
  "TRUST_PROXY", "MEDIA_USER_STORED_QUOTA_BYTES", "MEDIA_USER_DAILY_QUOTA_BYTES",
  "MEDIA_GLOBAL_STORED_QUOTA_BYTES", "MEDIA_MIN_FREE_BYTES", "MATCH_OCR_QUEUE_LIMIT",
  "COMBAT_VIDEO_UPLOAD_TIMEOUT_SECONDS", "COMBAT_VIDEO_MAX_SIZE_MB", "COMBAT_VIDEO_MAX_DURATION_SECONDS", "FFMPEG_BIN", ...resourceSettingKeys]);

/** Shared by the deployment adapter and container startup. No admin credentials. */
export function applicationEnvironment(environment) {
  const selected = Object.fromEntries(applicationEnvironmentKeys.filter(key => environment[key] !== undefined
    && (!Object.hasOwn(defaults, key) || String(environment[key]).trim() !== ""))
    .map(key => [key, String(environment[key])]));
  const effective = { ...defaults, ...selected, ...containerBindings };
  readResourceSettings(effective);
  for (const key of ["MEDIA_USER_STORED_QUOTA_BYTES", "MEDIA_USER_DAILY_QUOTA_BYTES", "MEDIA_GLOBAL_STORED_QUOTA_BYTES", "MEDIA_MIN_FREE_BYTES", "MATCH_OCR_QUEUE_LIMIT"]) {
    const value = effective[key];
    if (value !== undefined && value !== "" && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < (key === "MATCH_OCR_QUEUE_LIMIT" ? 1 : 0))) throw new Error(`${key} must be a valid non-negative safe integer`);
  }
  if (effective.TRUST_PROXY !== undefined && !["", "0", "1"].includes(effective.TRUST_PROXY)) throw new Error("TRUST_PROXY must be 0 or 1");
  return effective;
}

/** Construct the Prisma URL without interpolating raw passwords into a URI. */
export function databaseUrl(environment) {
  if (environment.DATABASE_URL) return environment.DATABASE_URL;
  const { MYSQL_USER: user, MYSQL_PASSWORD: password, MYSQL_DATABASE: database } = environment;
  if (!user || !password || !database) throw new Error("MYSQL_USER, MYSQL_PASSWORD and MYSQL_DATABASE are required");
  const host = environment.MYSQL_HOST || "mysql";
  const port = environment.MYSQL_PORT || "3306";
  if (!/^[a-zA-Z0-9.-]+$/.test(host) || !/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error("Invalid MYSQL_HOST or MYSQL_PORT");
  }
  return `mysql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}?connection_limit=10&connect_timeout=5&pool_timeout=10`;
}

export function runtimeEnvironment(environment) {
  const effective = { ...environment, ...applicationEnvironment(environment) };
  return { ...effective, DATABASE_URL: databaseUrl(effective) };
}

/** A heartbeat from an earlier container must not make a new worker healthy. */
export function healthyHeartbeat(value, releaseId, startedAt, now = Date.now()) {
  try {
    const heartbeat = JSON.parse(value);
    return heartbeat?.version === 1 && heartbeat.releaseId === releaseId
      && Number.isSafeInteger(heartbeat.timestamp) && Number.isSafeInteger(startedAt)
      && heartbeat.timestamp >= startedAt && heartbeat.timestamp <= now
      && now - heartbeat.timestamp <= 90_000;
  } catch {
    return false;
  }
}
