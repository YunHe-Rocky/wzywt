import { existsSync, readFileSync, writeFileSync, mkdirSync, realpathSync, statSync } from "node:fs";
import { resolve, dirname, isAbsolute, relative, delimiter } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { readDeployEnv } from "./deploy-env.mjs";

const managed = "# Managed by wzywt runtime-service v1";
function quote(value) {
  if (/[\r\n\0$%]/.test(value)) throw new Error("Unsupported systemd path/user characters");
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}
function contained(child, parent) {
  const part = relative(parent, child); return part === "" || (!part.startsWith("..") && !isAbsolute(part));
}
export function serviceFiles(config) {
  const { name, user, current, pm2Home, pm2, node, configuration } = config;
  for (const id of [name, user]) if (!/^[a-zA-Z0-9_.-]+$/.test(id)) throw new Error("Invalid service name/user");
  for (const path of [current, pm2Home, pm2, node, configuration]) if (!isAbsolute(path) || path === "/") throw new Error("Service paths must be absolute non-root paths");
  const environment = `Environment=${quote(`PM2_HOME=${pm2Home}`)}\nEnvironment=${quote(`PATH=${dirname(node)}:${dirname(pm2)}:/usr/local/bin:/usr/bin:/bin`)}`;
  return {
    [`${name}.service`]: `${managed}\n[Unit]\nDescription=Website PM2 recovery (${name})\nWants=network-online.target\nAfter=network-online.target\nStartLimitIntervalSec=300\nStartLimitBurst=5\n\n[Service]\nType=forking\nUser=${user}\nWorkingDirectory=${quote(current)}\n${environment}\nPIDFile=${quote(resolve(pm2Home, "pm2.pid"))}\nExecStart=${quote(pm2)} resurrect\nExecReload=${quote(pm2)} reload ${quote(config.webName)} ${quote(config.cronName)}\nExecStop=${quote(pm2)} kill\nRestart=always\nRestartSec=10\nTimeoutStartSec=90\nTimeoutStopSec=320\nKillMode=process\nUMask=0077\n\n[Install]\nWantedBy=multi-user.target\n`,
    [`${name}-watchdog.service`]: `${managed}\n[Unit]\nDescription=Website liveness and log retention (${name})\nAfter=${name}.service\nRequisite=${name}.service\n\n[Service]\nType=oneshot\nUser=${user}\nWorkingDirectory=${quote(current)}\n${environment}\nExecStart=${quote(node)} ${quote(resolve(current, "scripts/runtime-watchdog.mjs"))} ${quote(configuration)}\nTimeoutStartSec=50\nUMask=0077\n`,
    [`${name}-watchdog.timer`]: `${managed}\n[Unit]\nDescription=Check website process liveness every 30 seconds\n\n[Timer]\nOnBootSec=150\nOnUnitActiveSec=30\nUnit=${name}-watchdog.service\n\n[Install]\nWantedBy=timers.target\n`,
  };
}

export function resolveService(source = process.cwd(), environment = process.env, envFile = resolve(source, ".env")) {
  const values = existsSync(envFile) ? readDeployEnv(envFile) : new Map();
  const get = key => environment[key] || values.get(key) || "";
  const packageName = String(JSON.parse(readFileSync(resolve(source, "package.json"), "utf8")).name)
    .replace(/^@/, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  const name = get("DEPLOY_PROJECT_NAME") || packageName;
  const base = get("DEPLOY_BASE_DIR") || (source.endsWith("/source") ? dirname(source) : `${source}-runtime`);
  const current = resolve(base, "current");
  const target = realpathSync(current);
  if (!contained(target, resolve(base, "releases"))) throw new Error("current must point inside this project's releases directory");
  if (!existsSync(resolve(current, "scripts/runtime-watchdog.mjs"))) throw new Error("Deploy the current recovery-capable release before installing its service");
  const legacy = `${source}-pm2`;
  const pm2Home = get("DEPLOY_PM2_HOME") || environment.PM2_HOME || (existsSync(resolve(legacy, "dump.pm2")) ? legacy : resolve(homedir(), ".pm2"));
  const pm2 = get("DEPLOY_PM2_BIN") || execFileSync("which", ["pm2"], { encoding: "utf8" }).trim();
  const user = get("DEPLOY_RUN_USER") || execFileSync("id", ["-un", String(statSync(target).uid)], { encoding: "utf8" }).trim();
  const config = { version: 1, name: `wzywt-${name}`, user, current, pm2Home: resolve(pm2Home), pm2: realpathSync(pm2),
    node: realpathSync(get("DEPLOY_NODE_BIN") || process.execPath), configuration: resolve(base, "shared/runtime-service.json"),
    webName: get("DEPLOY_PM2_WEB_NAME") || `${name}-web`, cronName: get("DEPLOY_PM2_CRON_NAME") || `${name}-cron`,
    port: Number(get("DEPLOY_WEB_PORT") || get("PORT") || 8001),
    heartbeatFile: resolve(current, ".runtime-cron-heartbeat"), stateFile: resolve(base, "shared/runtime-watchdog-state.json") };
  const dump = JSON.parse(readFileSync(resolve(config.pm2Home, "dump.pm2"), "utf8"));
  if (!Array.isArray(dump) || dump.length !== 2) throw new Error("Use a dedicated PM2 home with exactly the project's saved Web/Cron processes");
  for (const expected of [config.webName, config.cronName]) {
    const app = dump.find(app => (app.pm2_env || app).name === expected);
    if (!app || realpathSync((app.pm2_env || app).pm_cwd) !== target) throw new Error(`Saved PM2 ownership mismatch: ${expected}`);
  }
  serviceFiles(config);
  return config;
}

export function main(args = process.argv.slice(2)) {
  const usage = "Usage: node scripts/runtime-service.mjs [--plan|--install] [--env-file PATH]";
  let mode = "", envFile;
  for (let index = 0; index < args.length; index++) {
    if (["--plan", "--install"].includes(args[index]) && !mode) mode = args[index];
    else if (args[index] === "--env-file" && !envFile && args[index + 1] && !args[index + 1].startsWith("--")) {
      envFile = resolve(args[++index]);
      if (!existsSync(envFile)) throw new Error("Selected environment file does not exist");
    } else throw new Error(usage);
  }
  const config = resolveService(process.cwd(), process.env, envFile);
  const files = serviceFiles(config);
  const output = resolve(".cache/runtime-service");
  mkdirSync(output, { recursive: true, mode: 0o700 });
  for (const [name, text] of Object.entries(files)) writeFileSync(resolve(output, name), text, { mode: 0o600 });
  writeFileSync(resolve(output, "runtime-service.json"), JSON.stringify(config, null, 2), { mode: 0o600 });
  console.log(`Review service plan: ${output}; user=${config.user}; PM2_HOME=${config.pm2Home}`);
  if (mode !== "--install") return;
  if (process.platform !== "linux" || process.getuid?.() !== 0) throw new Error("Installing systemd units requires Linux root; --plan is read-only outside .cache");
  for (const name of Object.keys(files)) {
    const path = `/etc/systemd/system/${name}`;
    if (existsSync(path) && !readFileSync(path, "utf8").startsWith(managed)) throw new Error(`Refusing to replace an unmanaged unit: ${path}`);
  }
  const env = { ...process.env, PM2_HOME: config.pm2Home, PATH: `${dirname(config.node)}${delimiter}${process.env.PATH || ""}` };
  const live = JSON.parse(execFileSync(config.pm2, ["jlist"], { env, encoding: "utf8", timeout: 15_000 }));
  for (const name of [config.webName, config.cronName]) {
    const app = live.find(app => app.name === name);
    if (!app || app.pm2_env?.status !== "online" || realpathSync(app.pm2_env.pm_cwd) !== realpathSync(config.current)) {
      throw new Error(`Deploy and verify ${name} before enabling reboot recovery`);
    }
  }
  writeFileSync(config.configuration, JSON.stringify(config, null, 2), { mode: 0o600 });
  // The selected service user must be able to read its non-secret configuration.
  execFileSync("chown", [config.user, config.configuration]);
  for (const [name, text] of Object.entries(files)) writeFileSync(`/etc/systemd/system/${name}`, text, { mode: 0o644 });
  execFileSync("systemctl", ["daemon-reload"], { stdio: "inherit" });
  execFileSync("systemctl", ["enable", "--now", `${config.name}.service`, `${config.name}-watchdog.timer`], { stdio: "inherit" });
  console.log(`Recovery enabled: ${config.name}.service and ${config.name}-watchdog.timer`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error(`[runtime-service] ${error.message}`); process.exitCode = 1; }
}
