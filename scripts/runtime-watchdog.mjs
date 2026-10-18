import { copyFileSync, existsSync, lstatSync, readFileSync, realpathSync, renameSync, statSync, truncateSync, writeFileSync, chmodSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, delimiter } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { probeLiveness } from "./runtime-liveness.mjs";
import { runtimeLog } from "../src/lib/runtime-logging.mjs";
const execute = promisify(execFile);

export function recoveryDecision(previous, healthy, now) {
  const restarts = (previous?.restarts || []).filter(at => Number.isSafeInteger(at) && now - at >= 0 && now - at < 600_000);
  const failures = healthy ? 0 : Math.min(100, (previous?.failures || 0) + 1);
  return { failures, restarts, restart: failures >= 3 && restarts.length < 3 && (!restarts.length || now - restarts.at(-1) >= 120_000) };
}

export function rotateLog(path, root, maximum = 10 * 1024 * 1024) {
  const location = relative(realpathSync(root), realpathSync(path));
  if (location.startsWith("..") || isAbsolute(location) || lstatSync(path).isSymbolicLink()) throw new Error("Log path escapes dedicated PM2 home");
  if (!statSync(path).isFile() || statSync(path).size < maximum) return false;
  for (let index = 2; index >= 1; index--) if (existsSync(`${path}.${index}`)) renameSync(`${path}.${index}`, `${path}.${index + 1}`);
  // copytruncate keeps PM2's open descriptor valid; retain the previous 3 files.
  copyFileSync(path, `${path}.1`); chmodSync(`${path}.1`, 0o600); truncateSync(path, 0);
  return true;
}

export async function checkRuntime(config) {
  const env = { ...process.env, PM2_HOME: config.pm2Home, PATH: `${dirname(config.node)}${delimiter}${process.env.PATH || ""}` };
  const { stdout } = await execute(config.pm2, ["jlist"], { env, timeout: 15_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
  const apps = JSON.parse(stdout);
  let state = {};
  try { state = JSON.parse(readFileSync(config.stateFile, "utf8")); } catch { /* First check. */ }
  for (const [role, name] of [["web", config.webName], ["cron", config.cronName]]) {
    const app = apps.find(app => app.name === name);
    if (!app || realpathSync(app.pm2_env.pm_cwd) !== realpathSync(config.current)) {
      runtimeLog("watchdog.ownership_mismatch", { role, app: name }, "error"); continue;
    }
    if (app.pm2_env.status === "stopped") { state[name] = {}; continue; } // intentional maintenance
    if (Date.now() - app.pm2_env.pm_uptime < 120_000 && app.pm2_env.status === "online") continue;
    const healthy = app.pm2_env.status === "online" && await probeLiveness({ role, pid: app.pid,
      releaseId: app.pm2_env.APP_RELEASE_ID || app.pm2_env.env?.APP_RELEASE_ID || "development",
      startedAt: app.pm2_env.pm_uptime, heartbeatFile: config.heartbeatFile, port: config.port, host: config.host });
    const decision = recoveryDecision(state[name], healthy, Date.now());
    if (!healthy) runtimeLog("watchdog.liveness_failed", { role, app: name, ...decision }, "warn");
    if (decision.restart) {
      decision.restarts.push(Date.now()); decision.failures = 0;
      state[name] = decision;
      // Persist the retry budget before mutation; a failed CLI call still
      // consumes an attempt and cannot create an unbounded restart loop.
      writeFileSync(config.stateFile, JSON.stringify(state), { mode: 0o600 });
      runtimeLog("watchdog.restart_requested", { role, app: name, pm2Home: config.pm2Home }, "warn");
      await execute(config.pm2, ["restart", name], { env, timeout: 20_000, windowsHide: true });
    }
    state[name] = decision;
    for (const file of [app.pm2_env.pm_out_log_path, app.pm2_env.pm_err_log_path]) {
      try { if (file && existsSync(file) && rotateLog(file, config.pm2Home)) runtimeLog("watchdog.log_rotated", { role, file }); }
      catch (error) { runtimeLog("watchdog.log_rotation_failed", { role, error }, "warn"); }
    }
  }
  const daemonLog = resolve(config.pm2Home, "pm2.log");
  if (existsSync(daemonLog)) rotateLog(daemonLog, config.pm2Home);
  writeFileSync(config.stateFile, JSON.stringify(state), { mode: 0o600 });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.env.APP_ROLE = "watchdog";
  try {
    const config = JSON.parse(readFileSync(process.argv[2], "utf8"));
    await checkRuntime(config);
  } catch (error) { runtimeLog("watchdog.failed", { error }, "error"); process.exitCode = 1; }
}
