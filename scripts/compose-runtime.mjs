import { parseSelectedEnv } from "./deploy-env.mjs";
import { applicationEnvironment, applicationEnvironmentKeys } from "../docker/runtime-env.mjs";

// Deployment policy lives here, not in a second set of YAML defaults.
const resources = {
  web: ["WEB", "1g", "2.0", 256], cron: ["CRON", "768m", "1.0", 128],
  mysql: ["MYSQL", "1g", "1.0", 256], redis: ["REDIS", "768m", "0.5", 128],
  ocr: ["OCR", "2g", "2.0", 128], migrate: ["MIGRATE", "512m", "1.0", 128],
  "storage-init": ["STORAGE_INIT", "128m", "0.5", 64], "mysql-client": ["MYSQL_CLIENT", "256m", "1.0", 64],
};
const resourceKeys = Object.values(resources).flatMap(([prefix]) => [`${prefix}_MEMORY_LIMIT`, `${prefix}_CPU_LIMIT`]);
const keys = [...new Set([...applicationEnvironmentKeys, ...resourceKeys,
  "MYSQL_ROOT_PASSWORD", "MYSQL_BUFFER_POOL_SIZE", "MYSQL_MAX_CONNECTIONS", "REDIS_MAXMEMORY"])];

/** A per-invocation override sent over stdin; never writes a second secret file. */
export function composeRuntime(content, { environment = process.env, selected, storage } = {}) {
  const values = parseSelectedEnv(content, keys);
  const source = Object.fromEntries(keys.filter(key => environment[key] !== undefined || values.has(key))
    .map(key => [key, String(environment[key] ?? values.get(key))]));
  const get = (key, fallback = "") => source[key]?.trim() || fallback;
  const app = applicationEnvironment({ ...source, ...selected.environment, STORAGE_MODE: storage.mode });
  const services = Object.fromEntries(Object.entries(resources).map(([name, [prefix, memory, cpus, pids]]) => [name, {
    mem_limit: get(`${prefix}_MEMORY_LIMIT`, memory), cpus: get(`${prefix}_CPU_LIMIT`, cpus), pids_limit: pids,
  }]));
  services.web.environment = app;
  services.cron.environment = { ...app };
  const database = Object.fromEntries(["MYSQL_HOST", "MYSQL_PORT", "MYSQL_DATABASE", "MYSQL_USER", "MYSQL_PASSWORD"].map(key => [key, app[key] || ""]));
  services.migrate.environment = { ...database, APP_RELEASE_ID: app.APP_RELEASE_ID, TZ: app.TZ };
  services["mysql-client"].environment = { ...database, MYSQL_PWD: database.MYSQL_PASSWORD };
  delete services["mysql-client"].environment.MYSQL_PASSWORD;
  services.mysql.environment = { TZ: app.TZ, MYSQL_DATABASE: app.MYSQL_DATABASE, MYSQL_USER: app.MYSQL_USER,
    MYSQL_PASSWORD: app.MYSQL_PASSWORD || "", MYSQL_ROOT_PASSWORD: source.MYSQL_ROOT_PASSWORD || "" };
  services.mysql.command = ["mysqld", `--innodb-buffer-pool-size=${get("MYSQL_BUFFER_POOL_SIZE", "256M")}`, `--max-connections=${get("MYSQL_MAX_CONNECTIONS", "50")}`];
  services.redis.command = ["redis-server", "--appendonly", "yes", "--maxmemory", get("REDIS_MAXMEMORY", "256mb"), "--maxmemory-policy", "noeviction"];
  services.ocr.environment = { TZ: app.TZ, OCR_TOKEN: app.MATCH_OCR_TOKEN || "" };
  services["storage-init"].environment = { STORAGE_MODE: app.STORAGE_MODE, MEDIA_STORAGE_DIR: app.MEDIA_STORAGE_DIR };
  return { services };
}

/** Escape literal dollar signs against Compose interpolation, including secrets. */
export function serializeRuntime(model) {
  return JSON.stringify(model, (_key, value) => typeof value === "string" ? value.replaceAll("$", () => "$$") : value);
}

/** `compose config` re-escapes dollars for re-use as a Compose file, including JSON. */
export function parseComposeModel(content) {
  return JSON.parse(content.replaceAll("$$", () => "$"));
}
