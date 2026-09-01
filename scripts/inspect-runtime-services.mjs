import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { extname } from "node:path";
import { readRuntimeEnv } from "./deploy-env.mjs";

const CONNECT_TIMEOUT_MS = 2000;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const options = { envFile: "", snapshot: "", systemctl: "-" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--env-file") options.envFile = argv[++index] ?? "";
    else if (argument === "--snapshot") options.snapshot = argv[++index] ?? "";
    else if (argument === "--systemctl") options.systemctl = argv[++index] ?? "";
    else fail(`unknown argument: ${argument}`);
  }
  if (!options.envFile) fail("--env-file is required");
  if (!options.snapshot) fail("--snapshot is required");
  if (!options.systemctl) fail("--systemctl requires a value");
  return options;
}

function normalizeHost(hostname) {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

function parseEndpoint(name, rawUrl, protocols, defaultPort, required, units) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    fail(`${name} URL is invalid`);
  }
  if (!protocols.includes(parsed.protocol)) {
    fail(`${name} URL protocol must be ${protocols.join(" or ")}`);
  }
  const host = normalizeHost(parsed.hostname);
  const port = parsed.port ? Number(parsed.port) : defaultPort;
  if (!host) fail(`${name} URL has no hostname`);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    fail(`${name} URL port must be between 1 and 65535`);
  }
  return { name, required, host, port, units };
}

function definitionsFromEnv(filePath) {
  const values = readRuntimeEnv(filePath);
  const databaseUrl = values.get("DATABASE_URL")?.trim();
  if (!databaseUrl) fail("DATABASE_URL is required in the project .env");

  const definitions = [
    parseEndpoint(
      "database",
      databaseUrl,
      ["mysql:"],
      3306,
      true,
      ["mysqld.service", "mysql.service", "mariadb.service"],
    ),
  ];

  const redisUrl = values.get("REDIS_URL")?.trim();
  if (redisUrl) {
    definitions.push(parseEndpoint(
      "redis",
      redisUrl,
      ["redis:", "rediss:"],
      6379,
      values.get("REDIS_REQUIRED") === "1",
      ["redis.service", "redis-server.service"],
    ));
  }
  return definitions;
}

function checkPort(host, port) {
  return new Promise((resolvePromise, reject) => {
    const socket = connect({ host, port });
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolvePromise();
    };
    socket.setTimeout(CONNECT_TIMEOUT_MS, () => finish(new Error(`connection timed out after ${CONNECT_TIMEOUT_MS}ms`)));
    socket.once("connect", () => finish());
    socket.once("error", finish);
  });
}

function parseProperties(output) {
  const properties = {};
  for (const line of output.split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator > 0) properties[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return properties;
}

function queryUnit(systemctlPath, unit) {
  let executable = systemctlPath;
  let args = [
    "show",
    unit,
    "--no-pager",
    "--property=LoadState",
    "--property=ActiveState",
    "--property=SubState",
    "--property=MainPID",
    "--property=User",
    "--property=FragmentPath",
  ];
  if (process.platform === "win32" && ![".exe", ".cmd", ".bat"].includes(extname(systemctlPath).toLowerCase())) {
    if (!process.env.BASH_BIN) fail("BASH_BIN is required to inspect extensionless fixtures on Windows");
    executable = process.env.BASH_BIN;
    args = [systemctlPath, ...args];
  }
  const execution = spawnSync(executable, args, {
    encoding: "utf8",
    shell: false,
    timeout: 5000,
    maxBuffer: 64 * 1024,
    windowsHide: true,
  });
  if (execution.error) fail(`systemctl show ${unit} failed: ${execution.error.message}`);
  if (execution.signal) fail(`systemctl show ${unit} ended by ${execution.signal}`);
  if (execution.status !== 0) fail(`systemctl show ${unit} exited ${execution.status}`);
  return parseProperties(execution.stdout ?? "");
}

function validateLoadedUnit(service, properties) {
  if (properties.ActiveState !== "active") {
    fail(`${service.name} systemd ActiveState is ${properties.ActiveState || "<missing>"}`);
  }
  if (!["running", "listening"].includes(properties.SubState)) {
    fail(`${service.name} systemd SubState is ${properties.SubState || "<missing>"}`);
  }
  if (!properties.FragmentPath) fail(`${service.name} systemd unit has no FragmentPath`);
  const pid = Number(properties.MainPID);
  if (!Number.isSafeInteger(pid) || pid <= 0) fail(`${service.name} systemd unit has no positive MainPID`);
  if (process.platform !== "win32" && !existsSync(`/proc/${pid}`)) {
    fail(`${service.name} MainPID ${pid} is not present in /proc`);
  }
}

async function inspectService(definition, systemctlPath) {
  const result = {
    name: definition.name,
    required: definition.required,
    endpoint: { host: definition.host, port: definition.port },
    unitCandidates: definition.units,
    unit: null,
    properties: null,
    endpointReachable: false,
    ok: false,
    errors: [],
    warnings: [],
  };

  try {
    await checkPort(definition.host, definition.port);
    result.endpointReachable = true;

    if (LOCAL_HOSTS.has(definition.host) && systemctlPath !== "-") {
      for (const unit of definition.units) {
        const properties = queryUnit(systemctlPath, unit);
        if (properties.LoadState === "loaded") {
          result.unit = unit;
          result.properties = properties;
          validateLoadedUnit(definition, properties);
          break;
        }
      }
      if (!result.unit) {
        result.warnings.push(`${definition.name} endpoint is reachable but no standard systemd unit was loaded`);
      }
    }
    result.ok = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (definition.required) result.errors.push(message);
    else result.warnings.push(message);
  }
  return result;
}

let snapshotPath = "";
let snapshot;
try {
  const options = parseArgs(process.argv.slice(2));
  snapshotPath = options.snapshot;
  const definitions = definitionsFromEnv(options.envFile);
  const services = [];
  for (const definition of definitions) {
    services.push(await inspectService(definition, options.systemctl));
  }
  const errors = services.flatMap((service) => service.errors.map((message) => `${service.name}: ${message}`));
  const warnings = services.flatMap((service) => service.warnings.map((message) => `${service.name}: ${message}`));
  snapshot = {
    snapshotVersion: 1,
    capturedAt: new Date().toISOString(),
    services,
    ok: errors.length === 0,
    errors,
    warnings,
  };
} catch (error) {
  snapshot = {
    snapshotVersion: 1,
    capturedAt: new Date().toISOString(),
    services: [],
    ok: false,
    errors: [error instanceof Error ? error.message : String(error)],
    warnings: [],
  };
}

if (snapshotPath) {
  try {
    writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "w" });
  } catch (error) {
    console.error(`[runtime-services] could not write snapshot: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

for (const service of snapshot.services) {
  const unit = service.unit ?? "endpoint-only";
  const pid = service.properties?.MainPID ?? "-";
  console.log(`[runtime-services] ${service.name} ${service.endpoint.host}:${service.endpoint.port} unit=${unit} pid=${pid}`);
}
for (const warning of snapshot.warnings) console.warn(`[runtime-services] warning: ${warning}`);
if (!snapshot.ok) {
  for (const error of snapshot.errors) console.error(`[runtime-services] ${error}`);
  process.exit(1);
}
console.log(`[runtime-services] verification passed (${snapshot.services.length} configured services)`);
