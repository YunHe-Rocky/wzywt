import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";

function fail(message) {
  throw new Error(message);
}

function readStdinJson() {
  const raw = readFileSync(0, "utf8");
  try {
    return JSON.parse(raw);
  } catch {
    return fail("input is not valid JSON");
  }
}

function realpath(path) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function isWithin(path, parent) {
  const normalizedPath = realpath(path);
  const normalizedParent = realpath(parent);
  return normalizedPath === normalizedParent || normalizedPath.startsWith(`${normalizedParent}${sep}`);
}

function processCwd(processDescription) {
  const cwd = processDescription?.pm2_env?.pm_cwd;
  if (typeof cwd !== "string" || !cwd.trim()) fail(`PM2 app ${processDescription?.name ?? "<unknown>"} has no cwd`);
  return cwd;
}

function releaseId(processDescription) {
  const environment = processDescription?.pm2_env;
  return environment?.APP_RELEASE_ID ?? environment?.env?.APP_RELEASE_ID;
}

function verifyLiveProcess(processDescription, name) {
  const pid = processDescription?.pid;
  if (!Number.isSafeInteger(pid) || pid <= 0) fail(`PM2 app ${name} has no positive PID`);
  const pidFile = processDescription?.pm2_env?.pm_pid_path;
  if (typeof pidFile !== "string" || !pidFile.trim()) fail(`PM2 app ${name} has no PID file path`);
  if (!existsSync(pidFile)) fail(`PM2 app ${name} PID file is missing: ${pidFile}`);
  const pidFileValue = readFileSync(pidFile, "utf8").trim();
  if (!/^[1-9][0-9]*$/.test(pidFileValue) || Number(pidFileValue) !== pid) {
    fail(`PM2 app ${name} PID file contains ${pidFileValue || "<empty>"}, expected ${pid}`);
  }

  if (process.platform !== "win32") {
    const processPath = `/proc/${pid}`;
    if (!existsSync(processPath)) fail(`PM2 app ${name} PID ${pid} is not present in /proc`);
    if (typeof process.geteuid === "function" && statSync(processPath).uid !== process.geteuid()) {
      fail(`PM2 app ${name} PID ${pid} belongs to a different operating-system user`);
    }
  }
}

function verifyIfOnline(processDescription, name) {
  if (processDescription?.pm2_env?.status === "online") verifyLiveProcess(processDescription, name);
}

function expectedProcesses(processes, names) {
  if (!Array.isArray(processes)) fail("PM2 process list is not an array");
  return names.map((name) => {
    const matches = processes.filter((entry) => entry?.name === name);
    if (matches.length > 1) fail(`PM2 app ${name} is ambiguous (${matches.length} entries)`);
    return { name, process: matches[0] };
  });
}

function verifyBefore(baseDir, currentTarget, names) {
  const processes = readStdinJson();
  const expectedNames = new Set(names);
  const projectProcesses = processes.filter((entry) => {
    try {
      return isWithin(processCwd(entry), baseDir);
    } catch {
      return false;
    }
  });
  const unexpected = projectProcesses.filter((entry) => !expectedNames.has(entry.name));
  if (unexpected.length) fail(`unexpected PM2 apps own the project path: ${unexpected.map((entry) => entry.name).join(", ")}`);

  for (const { name, process: processDescription } of expectedProcesses(processes, names)) {
    if (!processDescription) continue;
    if (currentTarget === "-") fail(`PM2 app ${name} exists but the current release link is missing`);
    if (realpath(processCwd(processDescription)) !== realpath(currentTarget)) {
      fail(`PM2 app ${name} belongs to a different cwd: ${processCwd(processDescription)}`);
    }
    verifyIfOnline(processDescription, name);
  }
  console.log(`[deploy-verify] PM2 ownership is safe for ${names.join(", ")}`);
}

function verifyAfter(expectedTarget, expectedReleaseId, names) {
  const processes = readStdinJson();
  for (const { name, process: processDescription } of expectedProcesses(processes, names)) {
    if (!processDescription) fail(`PM2 app ${name} is missing`);
    if (processDescription?.pm2_env?.status !== "online") fail(`PM2 app ${name} is not online`);
    verifyLiveProcess(processDescription, name);
    if (realpath(processCwd(processDescription)) !== realpath(expectedTarget)) {
      fail(`PM2 app ${name} is running from ${processCwd(processDescription)}, expected ${expectedTarget}`);
    }
    if (releaseId(processDescription) !== expectedReleaseId) {
      fail(`PM2 app ${name} has release ${releaseId(processDescription) ?? "<missing>"}, expected ${expectedReleaseId}`);
    }
  }
  console.log(`[deploy-verify] PM2 apps are online on release ${expectedReleaseId}`);
}

function verifyStopped(expectedTarget, names) {
  const processes = readStdinJson();
  for (const { name, process: processDescription } of expectedProcesses(processes, names)) {
    if (!processDescription) fail(`PM2 app ${name} is missing after stop`);
    if (processDescription?.pm2_env?.status !== "stopped") {
      fail(`PM2 app ${name} status is ${processDescription?.pm2_env?.status ?? "<missing>"}, expected stopped`);
    }
    if (processDescription?.pid !== 0) fail(`PM2 app ${name} still reports PID ${processDescription?.pid ?? "<missing>"}`);
    if (realpath(processCwd(processDescription)) !== realpath(expectedTarget)) {
      fail(`PM2 app ${name} stopped under ${processCwd(processDescription)}, expected ${expectedTarget}`);
    }
  }
  console.log(`[deploy-verify] PM2 apps are stopped for ${names.join(", ")}`);
}

function healthSummary(expectedReleaseId) {
  const response = readStdinJson();
  const release = typeof response?.releaseId === "string" ? response.releaseId : "<missing>";
  const checks = response?.checks && typeof response.checks === "object"
    ? Object.entries(response.checks)
      .filter(([name, status]) => typeof name === "string" && typeof status === "string")
      .map(([name, status]) => `${name}=${status}`)
      .join(",")
    : "<missing>";
  console.log(`health ok=${response?.ok === true} release=${release} expected=${expectedReleaseId} checks=${checks}`);
}

function verifyHealth(expectedReleaseId) {
  const response = readStdinJson();
  if (response?.ok !== true) fail("health response is not ok");
  if (response?.releaseId !== expectedReleaseId) {
    fail(`health response release ${response?.releaseId ?? "<missing>"}, expected ${expectedReleaseId}`);
  }
  const failedChecks = Object.entries(response?.checks ?? {})
    .filter(([, status]) => status === "failed")
    .map(([name]) => name);
  if (failedChecks.length) fail(`health response contains failed checks: ${failedChecks.join(", ")}`);
  console.log(`[deploy-verify] health belongs to release ${expectedReleaseId}`);
}

function usage() {
  console.error("Usage:");
  console.error("  node scripts/verify-deploy-state.mjs pm2-before <base-dir> <current-target|-> <web-name> <cron-name>");
  console.error("  node scripts/verify-deploy-state.mjs pm2-after <release-dir> <release-id> <web-name> <cron-name>");
  console.error("  node scripts/verify-deploy-state.mjs pm2-stopped <release-dir> <web-name> <cron-name>");
  console.error("  node scripts/verify-deploy-state.mjs health <release-id>");
  console.error("  node scripts/verify-deploy-state.mjs health-summary <release-id>");
  process.exit(2);
}

try {
  const [mode, ...args] = process.argv.slice(2);
  if (mode === "pm2-before" && args.length === 4) verifyBefore(args[0], args[1], args.slice(2));
  else if (mode === "pm2-after" && args.length === 4) verifyAfter(args[0], args[1], args.slice(2));
  else if (mode === "pm2-stopped" && args.length === 3) verifyStopped(args[0], args.slice(1));
  else if (mode === "health" && args.length === 1) verifyHealth(args[0]);
  else if (mode === "health-summary" && args.length === 1) healthSummary(args[0]);
  else usage();
} catch (error) {
  console.error(`[deploy-verify] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
