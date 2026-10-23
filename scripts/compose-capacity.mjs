import { parseSelectedEnv } from "./deploy-env.mjs";

const MiB = 1_048_576;
export function memoryBytes(value, label = "memory limit") {
  const match = /^(\d+(?:\.\d+)?)\s*([kmgt]?)(?:i?b)?$/i.exec(String(value ?? "").trim());
  const bytes = match ? Number(match[1]) * 1024 ** Math.max(0, " kmgt".indexOf(match[2].toLowerCase())) : NaN;
  if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new Error(`Invalid ${label}; set an explicit positive memory limit.`);
  return bytes;
}

export function assertLiveLimits(name, service, hostConfig) {
  const configured = memoryBytes(service.mem_limit, `${name}.mem_limit`);
  const memory = Number(hostConfig.Memory), cpus = Number(hostConfig.NanoCpus), pids = Number(hostConfig.PidsLimit);
  if (!(memory > 0 && memory <= configured) || !(cpus > 0 && cpus <= Number(service.cpus) * 1e9)
    || !(pids > 0 && pids <= Number(service.pids_limit))) {
    throw new Error(`${name} still has old or missing container limits. Writers were not stopped. Back up first and follow the datastore resource maintenance procedure in docs/operations/docker.md; update never recreates datastores automatically.`);
  }
}

/** Capacity planning is conservative; OS/build/other applications need reserves. */
export function capacityPlan(model, selected, daemonBytes, { action = "check", content = "", environment = {} } = {}) {
  if (!Number.isSafeInteger(daemonBytes) || daemonBytes <= 0) throw new Error("Docker did not report its memory capacity.");
  const keys = ["COMPOSE_MEMORY_RESERVE_MB", "COMPOSE_EXTERNAL_MEMORY_MB"];
  const values = parseSelectedEnv(content, keys);
  const number = (key, fallback) => {
    const raw = (environment[key] ?? values.get(key) ?? "").trim();
    const value = raw ? Number(raw) : fallback;
    if (!Number.isSafeInteger(value) || value < 0 || value > 1_048_576) throw new Error(`Invalid ${key}`);
    return value * MiB;
  };
  const reserveBytes = number(keys[0], 1024), externalBytes = number(keys[1], 0);
  const resident = ["web", "cron", "redis", ...(selected.mysql === "container" ? ["mysql"] : []), ...(selected.ocr === "container" ? ["ocr"] : [])];
  const required = [...new Set([...resident, "storage-init", "migrate", "mysql-client"])];
  const limits = Object.fromEntries(required.map(name => {
    const service = model.services?.[name];
    if (!service) throw new Error(`Missing resource configuration for ${name}.`);
    const bytes = memoryBytes(service.mem_limit, `${name}.mem_limit`);
    if (!(Number(service.cpus) > 0) || !Number.isSafeInteger(Number(service.pids_limit)) || Number(service.pids_limit) <= 0) {
      throw new Error(`${name} requires positive cpus and pids_limit.`);
    }
    return [name, bytes];
  }));
  const redisArgs = model.services.redis.command;
  const redisMaximum = memoryBytes(redisArgs?.[redisArgs.indexOf("--maxmemory") + 1], "REDIS_MAXMEMORY");
  // AOF rewrite/fork and process overhead are outside Redis's data limit.
  if (limits.redis < 2 * redisMaximum + 64 * MiB) throw new Error("REDIS_MEMORY_LIMIT must cover twice REDIS_MAXMEMORY plus 64 MiB for AOF/process overhead.");
  if (selected.mysql === "container") {
    const args = model.services.mysql.command || [];
    const pool = memoryBytes(args.find(value => value.startsWith("--innodb-buffer-pool-size="))?.split("=")[1], "MYSQL_BUFFER_POOL_SIZE");
    const connections = Number(args.find(value => value.startsWith("--max-connections="))?.split("=")[1]);
    if (!Number.isSafeInteger(connections) || connections < 10 || connections > 1_000) throw new Error("MYSQL_MAX_CONNECTIONS must be an integer from 10 to 1000.");
    if (limits.mysql < pool * 1.25 + connections * 2 * MiB + 128 * MiB) throw new Error("MYSQL_MEMORY_LIMIT is too small for MYSQL_BUFFER_POOL_SIZE and MYSQL_MAX_CONNECTIONS.");
  }
  const residentBytes = resident.reduce((sum, name) => sum + limits[name], 0);
  const oneShotBytes = action === "sync-heroes" ? Math.max(limits.cron, limits["storage-init"])
    : Math.max(limits.cron, limits.migrate, limits["storage-init"], limits["mysql-client"], selected.ocr === "external" ? limits.web : 0);
  const plannedBytes = residentBytes + oneShotBytes + reserveBytes + externalBytes;
  if (plannedBytes > daemonBytes) throw new Error(`Memory budget exceeds Docker capacity: planned ${Math.ceil(plannedBytes / MiB)} MiB > ${Math.floor(daemonBytes / MiB)} MiB. Adjust service limits/reserves or increase Docker/host memory.`);
  return { daemonBytes, residentBytes, oneShotBytes, reserveBytes, externalBytes, plannedBytes, limits };
}
