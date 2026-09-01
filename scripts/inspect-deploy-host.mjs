import { spawnSync } from "node:child_process";
import {
  accessSync,
  constants,
  existsSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { connect } from "node:net";
import { delimiter, extname, isAbsolute, join, resolve } from "node:path";

const MAX_OUTPUT = 4096;
const DEFAULT_TIMEOUT_MS = 5000;
const VERSION_ARGS = Object.freeze({
  node: ["--version"],
  npm: ["--version"],
  npx: ["--version"],
  git: ["--version"],
  tar: ["--version"],
  curl: ["--version"],
  flock: ["--version"],
  pm2: ["--version"],
  mysqldump: ["--version"],
  systemctl: ["--version"],
  id: ["--version"],
  realpath: ["--version"],
  mktemp: ["--version"],
});

function fail(message) {
  throw new Error(message);
}

function bounded(value) {
  return String(value ?? "").replace(/\0/g, "").trim().slice(0, MAX_OUTPUT);
}

function canonicalPath(path) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function parseArgs(argv) {
  const options = { cores: [], manifest: "-", snapshot: "", systemctl: "-" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--snapshot") options.snapshot = argv[++index] ?? "";
    else if (argument === "--manifest") options.manifest = argv[++index] ?? "";
    else if (argument === "--systemctl") options.systemctl = argv[++index] ?? "";
    else if (argument === "--core") {
      const name = argv[++index] ?? "";
      const path = argv[++index] ?? "";
      const versionPattern = argv[++index] ?? "";
      options.cores.push({ name, path, versionArgs: VERSION_ARGS[name] ?? ["--version"], versionPattern });
    } else fail(`unknown argument: ${argument}`);
  }
  if (!options.snapshot) fail("--snapshot is required");
  if (!options.manifest) fail("--manifest requires a value");
  if (!options.systemctl) fail("--systemctl requires a value");
  return options;
}

function executable(path) {
  const candidates = process.platform === "win32" && !extname(path)
    ? [path, `${path}.exe`, `${path}.cmd`, `${path}.bat`]
    : [path];
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK);
      return canonicalPath(candidate);
    } catch {}
  }
  fail(`executable is not accessible: ${path}`);
}

function resolveExecutable(command) {
  if (typeof command !== "string" || !command.trim()) fail("command must be a non-empty string");
  if (command.includes("/") || command.includes("\\")) {
    if (!isAbsolute(command)) fail(`command path must be absolute: ${command}`);
    return executable(command);
  }
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (!directory) continue;
    const candidate = join(directory, command);
    try {
      return executable(candidate);
    } catch {}
  }
  fail(`command was not found in PATH: ${command}`);
}

function validatePattern(pattern, label) {
  if (!pattern) return null;
  try {
    return new RegExp(pattern);
  } catch (error) {
    fail(`${label} has an invalid versionPattern: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function spawnPortable(path, args) {
  let executablePath = path;
  let executableArgs = args;
  if (process.platform === "win32" && ![".exe", ".cmd", ".bat"].includes(extname(path).toLowerCase())) {
    const firstLine = readFileSync(path, "utf8").split(/\r?\n/, 1)[0];
    if (!/^#!.*\bbash\b/.test(firstLine)) fail(`Windows cannot execute non-bash script directly: ${path}`);
    executablePath = resolveExecutable("bash");
    executableArgs = [path, ...args];
  }
  return spawnSync(executablePath, executableArgs, {
    encoding: "utf8",
    shell: false,
    timeout: DEFAULT_TIMEOUT_MS,
    maxBuffer: 64 * 1024,
    windowsHide: true,
  });
}

function inspectCommand(definition) {
  const result = {
    name: definition.name,
    requested: definition.path ?? definition.command,
    path: null,
    versionArgs: definition.versionArgs,
    versionPattern: definition.versionPattern || null,
    versionOutput: null,
    exitCode: null,
    ok: false,
    errors: [],
  };
  try {
    if (!/^[A-Za-z0-9._-]+$/.test(definition.name)) fail(`invalid command name: ${definition.name}`);
    if (!Array.isArray(definition.versionArgs) || definition.versionArgs.length > 16
      || definition.versionArgs.some((entry) => typeof entry !== "string" || /[\0\r\n]/.test(entry))) {
      fail(`${definition.name} versionArgs must contain at most 16 single-line strings`);
    }
    const path = definition.path ? executable(definition.path) : resolveExecutable(definition.command);
    result.path = path;
    const execution = spawnPortable(path, definition.versionArgs);
    result.exitCode = execution.status;
    result.versionOutput = bounded(`${execution.stdout ?? ""}\n${execution.stderr ?? ""}`);
    if (execution.error) fail(`${definition.name} version command failed: ${execution.error.message}`);
    if (execution.signal) fail(`${definition.name} version command ended by ${execution.signal}`);
    if (execution.status !== 0) fail(`${definition.name} version command exited ${execution.status}`);
    if (!result.versionOutput) fail(`${definition.name} version command returned no output`);
    const versionPattern = validatePattern(definition.versionPattern, definition.name);
    if (versionPattern && !versionPattern.test(result.versionOutput)) {
      fail(`${definition.name} version does not match ${definition.versionPattern}`);
    }
    result.ok = true;
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
  }
  return result;
}

function parseManifest(filePath) {
  if (filePath === "-") return { version: 1, commands: [], services: [] };
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`could not read host manifest ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!manifest || manifest.version !== 1) fail("host manifest version must be 1");
  if (manifest.commands !== undefined && !Array.isArray(manifest.commands)) fail("host manifest commands must be an array");
  if (manifest.services !== undefined && !Array.isArray(manifest.services)) fail("host manifest services must be an array");
  return { version: 1, commands: manifest.commands ?? [], services: manifest.services ?? [] };
}

function manifestCommand(definition) {
  if (!definition || typeof definition !== "object") fail("host manifest command must be an object");
  const name = definition.name;
  const command = definition.command;
  const versionArgs = definition.versionArgs ?? ["--version"];
  const versionPattern = definition.versionPattern;
  if (typeof versionPattern !== "string" || !versionPattern) {
    fail(`host manifest command ${name ?? "<unknown>"} requires versionPattern`);
  }
  return { name, command, versionArgs, versionPattern };
}

function parseProperties(output) {
  const properties = {};
  for (const line of output.split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator > 0) properties[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return properties;
}

function queryUnit(systemctlPath, scope, unit) {
  const args = [];
  if (scope === "user") args.push("--user");
  args.push(
    "show",
    unit,
    "--no-pager",
    "--property=LoadState",
    "--property=ActiveState",
    "--property=SubState",
    "--property=MainPID",
    "--property=User",
    "--property=FragmentPath",
  );
  const execution = spawnPortable(systemctlPath, args);
  if (execution.error) fail(`systemctl show ${unit} failed: ${execution.error.message}`);
  if (execution.signal) fail(`systemctl show ${unit} ended by ${execution.signal}`);
  if (execution.status !== 0) fail(`systemctl show ${unit} exited ${execution.status}: ${bounded(execution.stderr)}`);
  return parseProperties(execution.stdout ?? "");
}

function validateAbsoluteOptional(path, label) {
  if (path === undefined) return null;
  if (typeof path !== "string" || !isAbsolute(path)) fail(`${label} must be an absolute path`);
  return path;
}

function checkPid(pid, label) {
  if (!Number.isSafeInteger(pid) || pid <= 0) fail(`${label} has no positive MainPID`);
  if (process.platform !== "win32") {
    const processPath = `/proc/${pid}`;
    if (!existsSync(processPath)) fail(`${label} MainPID ${pid} is not present in /proc`);
  }
}

function checkPidFile(filePath, pid, label) {
  const value = readFileSync(filePath, "utf8").trim();
  if (!/^[1-9][0-9]*$/.test(value)) fail(`${label} PID file is not numeric: ${filePath}`);
  if (Number(value) !== pid) fail(`${label} PID file ${filePath} contains ${value}, expected ${pid}`);
}

function checkLockFile(filePath, pid, containsPid, label) {
  if (!existsSync(filePath)) fail(`${label} lock file is missing: ${filePath}`);
  if (containsPid) {
    const value = readFileSync(filePath, "utf8").trim();
    if (value !== String(pid)) fail(`${label} lock file ${filePath} does not contain MainPID ${pid}`);
  }
}

function checkPort(host, port, timeoutMs) {
  return new Promise((resolvePromise, reject) => {
    const socket = connect({ host, port });
    const finish = (error) => {
      socket.destroy();
      if (error) reject(error);
      else resolvePromise();
    };
    socket.setTimeout(timeoutMs, () => finish(new Error(`connection timed out after ${timeoutMs}ms`)));
    socket.once("connect", () => finish());
    socket.once("error", finish);
  });
}

async function inspectService(definition, systemctlPath, actualRunUser) {
  const result = {
    name: definition?.name ?? null,
    scope: definition?.scope ?? "system",
    candidates: definition?.units ?? null,
    unit: null,
    properties: null,
    pidFile: definition?.pidFile ?? null,
    lockFile: definition?.lockFile ?? null,
    endpoint: definition?.port === undefined ? null : { host: definition?.host ?? "127.0.0.1", port: definition.port },
    ok: false,
    errors: [],
  };
  try {
    if (!definition || typeof definition !== "object") fail("service entry must be an object");
    if (!/^[A-Za-z0-9._-]+$/.test(definition.name ?? "")) fail("service name is invalid");
    const scope = definition.scope ?? "system";
    if (scope !== "system" && scope !== "user") fail(`${definition.name} scope must be system or user`);
    if (!Array.isArray(definition.units) || definition.units.length === 0
      || definition.units.some((unit) => typeof unit !== "string" || !/^[A-Za-z0-9_.@:-]+$/.test(unit))) {
      fail(`${definition.name} units must be a non-empty array of exact systemd unit names`);
    }
    if (systemctlPath === "-") fail(`${definition.name} requires systemctl but none was resolved`);
    const allowedSubStates = definition.subStates ?? ["running"];
    if (!Array.isArray(allowedSubStates) || allowedSubStates.length === 0
      || allowedSubStates.some((state) => typeof state !== "string" || !state)) {
      fail(`${definition.name} subStates must be a non-empty string array`);
    }

    let properties = null;
    for (const unit of definition.units) {
      const candidateProperties = queryUnit(systemctlPath, scope, unit);
      if (candidateProperties.LoadState === "loaded") {
        result.unit = unit;
        properties = candidateProperties;
        break;
      }
    }
    if (!properties) fail(`${definition.name} has no loaded systemd unit among ${definition.units.join(", ")}`);
    result.properties = properties;
    if (properties.ActiveState !== "active") fail(`${definition.name} ActiveState is ${properties.ActiveState || "<missing>"}`);
    if (!allowedSubStates.includes(properties.SubState)) {
      fail(`${definition.name} SubState is ${properties.SubState || "<missing>"}, expected ${allowedSubStates.join("|")}`);
    }
    if (!properties.FragmentPath) fail(`${definition.name} has no FragmentPath`);
    const pid = Number(properties.MainPID);
    checkPid(pid, definition.name);

    const expectedUser = definition.user;
    const actualUser = properties.User || (scope === "user" ? actualRunUser : "root");
    if (expectedUser !== undefined && (typeof expectedUser !== "string" || !expectedUser)) {
      fail(`${definition.name} user must be a non-empty string`);
    }
    if (expectedUser && actualUser !== expectedUser) {
      fail(`${definition.name} systemd User is ${actualUser}, expected ${expectedUser}`);
    }
    result.properties.User = actualUser;

    const pidFile = validateAbsoluteOptional(definition.pidFile, `${definition.name} pidFile`);
    if (pidFile) checkPidFile(pidFile, pid, definition.name);
    const lockFile = validateAbsoluteOptional(definition.lockFile, `${definition.name} lockFile`);
    if (lockFile) checkLockFile(lockFile, pid, definition.lockFileContainsPid === true, definition.name);

    if (definition.port !== undefined) {
      if (!Number.isSafeInteger(definition.port) || definition.port < 1 || definition.port > 65535) {
        fail(`${definition.name} port must be between 1 and 65535`);
      }
      const host = definition.host ?? "127.0.0.1";
      if (typeof host !== "string" || !host || /[\0\r\n]/.test(host)) fail(`${definition.name} host is invalid`);
      const timeoutMs = definition.timeoutMs ?? 2000;
      if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 10000) {
        fail(`${definition.name} timeoutMs must be between 100 and 10000`);
      }
      try {
        await checkPort(host, definition.port, timeoutMs);
      } catch (error) {
        fail(`${definition.name} ${host}:${definition.port} is not reachable: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    result.ok = true;
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
  }
  return result;
}

function identitySnapshot() {
  return {
    projectName: process.env.DEPLOY_PROJECT_NAME || null,
    packageName: process.env.DEPLOY_PACKAGE_NAME || null,
    invocationDir: process.env.DEPLOY_INVOCATION_DIR || null,
    sourceDir: process.env.DEPLOY_RESOLVED_SOURCE_DIR || null,
    baseDir: process.env.DEPLOY_RESOLVED_BASE_DIR || null,
    runUser: process.env.DEPLOY_ACTUAL_USER || null,
    runGroup: process.env.DEPLOY_ACTUAL_GROUP || null,
    uid: typeof process.getuid === "function" ? process.getuid() : null,
    gid: typeof process.getgid === "function" ? process.getgid() : null,
    pm2Home: process.env.PM2_HOME || null,
  };
}

let snapshotPath = null;
let snapshot = null;
try {
  const options = parseArgs(process.argv.slice(2));
  snapshotPath = options.snapshot;
  const manifest = parseManifest(options.manifest);
  const commandDefinitions = [
    ...options.cores,
    ...manifest.commands.map(manifestCommand),
  ];
  const duplicateNames = commandDefinitions.map((entry) => entry.name)
    .filter((name, index, names) => names.indexOf(name) !== index);
  if (duplicateNames.length) fail(`duplicate command names: ${[...new Set(duplicateNames)].join(", ")}`);

  const commands = commandDefinitions.map(inspectCommand);
  const services = [];
  for (const service of manifest.services) {
    services.push(await inspectService(service, options.systemctl, process.env.DEPLOY_ACTUAL_USER || ""));
  }
  const errors = [
    ...commands.flatMap((entry) => entry.errors.map((message) => `command ${entry.name}: ${message}`)),
    ...services.flatMap((entry) => entry.errors.map((message) => `service ${entry.name ?? "<unknown>"}: ${message}`)),
  ];
  snapshot = {
    snapshotVersion: 1,
    capturedAt: new Date().toISOString(),
    manifestPath: options.manifest === "-" ? null : canonicalPath(options.manifest),
    identity: identitySnapshot(),
    commands,
    services,
    ok: errors.length === 0,
    errors,
  };
} catch (error) {
  snapshot = {
    snapshotVersion: 1,
    capturedAt: new Date().toISOString(),
    identity: identitySnapshot(),
    commands: [],
    services: [],
    ok: false,
    errors: [error instanceof Error ? error.message : String(error)],
  };
}

if (snapshotPath) {
  try {
    writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "w" });
  } catch (error) {
    console.error(`[deploy-host] could not write snapshot ${snapshotPath}: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

for (const command of snapshot.commands) {
  const version = command.versionOutput?.split(/\r?\n/, 1)[0] || "<unavailable>";
  console.log(`[deploy-host] command ${command.name} -> ${command.path ?? command.requested} (${version})`);
}
for (const service of snapshot.services) {
  const pid = service.properties?.MainPID ?? "?";
  const user = service.properties?.User ?? "?";
  console.log(`[deploy-host] service ${service.name} -> ${service.unit ?? "<missing>"} pid=${pid} user=${user}`);
}
if (!snapshot.ok) {
  for (const error of snapshot.errors) console.error(`[deploy-host] ${error}`);
  process.exit(1);
}
console.log(`[deploy-host] host verification passed (${snapshot.commands.length} commands, ${snapshot.services.length} services)`);
