const { isAbsolute, resolve } = require("node:path");
const { existsSync, readFileSync } = require("node:fs");
const { readRedisEnv, readDeployEnv, readOcrEnv, parseSelectedEnv } = require("./scripts/deploy-env.mjs");
const packageJson = require("./package.json");
const os = require("node:os");
const { pathToFileURL } = require("node:url");
const { readResourceSettings, resourceSettingKeys, resourceMemoryBudget } = require("./src/core/resource-settings.ts");
const { runtimeCommand } = require("./scripts/runtime-command.mjs");

function safeProjectName(value) {
  return String(value ?? "")
    .replace(/^@/, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const appDir = process.env.APP_DIR || resolve(__dirname);
const redisEnvFile = resolve(appDir, ".env");
const entryValues = existsSync(redisEnvFile) ? readDeployEnv(redisEnvFile) : new Map();
// Explicit values also clear PM2's cached settings when changing deployment mode.
const entryEnv = {
  TRUST_PROXY: entryValues.get("TRUST_PROXY") ?? process.env.TRUST_PROXY ?? "",
  PUBLIC_ORIGIN: process.env.PUBLIC_ORIGIN ?? entryValues.get("PUBLIC_ORIGIN") ?? "",
  DEPLOY_ENVIRONMENT: process.env.DEPLOY_ENVIRONMENT ?? entryValues.get("DEPLOY_ENVIRONMENT") ?? "production",
  SESSION_COOKIE_SECURE: process.env.SESSION_COOKIE_SECURE ?? entryValues.get("SESSION_COOKIE_SECURE") ?? "",
};
const redisEnv = existsSync(redisEnvFile) ? readRedisEnv(redisEnvFile) : {
  REDIS_URL: process.env.REDIS_URL || "",
  REDIS_REQUIRED: process.env.REDIS_REQUIRED || "0",
};
const ocrEnv = existsSync(redisEnvFile) ? readOcrEnv(redisEnvFile) : {
  MATCH_OCR_ENDPOINT: process.env.MATCH_OCR_ENDPOINT || "",
  MATCH_OCR_TOKEN: process.env.MATCH_OCR_TOKEN || "",
  MATCH_OCR_INTERNAL_HOST: process.env.MATCH_OCR_INTERNAL_HOST || "",
};
const projectName = process.env.DEPLOY_PROJECT_NAME || safeProjectName(packageJson.name);
const webName = process.env.DEPLOY_PM2_WEB_NAME || `${projectName}-web`;
const cronName = process.env.DEPLOY_PM2_CRON_NAME || `${projectName}-cron`;
const webHost = process.env.DEPLOY_WEB_HOST || process.env.HOST || "127.0.0.1";
const webPort = Number.parseInt(process.env.DEPLOY_WEB_PORT || process.env.PORT || "8001", 10);
const governorKeys = resourceSettingKeys;
const governorValues = existsSync(redisEnvFile) ? parseSelectedEnv(readFileSync(redisEnvFile, "utf8"), governorKeys) : new Map();
const governorEnv = Object.fromEntries(governorKeys.map(key => [key, process.env[key] ?? governorValues.get(key) ?? ""]));
readResourceSettings(governorEnv);
const capacity = Math.min(os.totalmem(), process.constrainedMemory?.() || os.totalmem());
function memoryRestart(key, role) {
  const configured = Number(governorEnv[key]);
  if (!Number.isFinite(configured) || configured < 0) throw new Error(`Invalid ${key}`);
  return `${Math.max(1, Math.ceil(resourceMemoryBudget(capacity, role, configured).restartBytes / 1024 / 1024))}M`;
}

if (!isAbsolute(appDir)) {
  throw new Error("APP_DIR must be absolute");
}
for (const [label, value] of [["project", projectName], ["web", webName], ["cron", cronName]]) {
  if (!/^[A-Za-z0-9._-]+$/.test(value)) throw new Error(`${label} name contains unsupported characters`);
}
if (!/^[A-Za-z0-9:._-]+$/.test(webHost)) {
  throw new Error("HOST contains unsupported characters");
}
if (!Number.isInteger(webPort) || webPort < 1 || webPort > 65535) {
  throw new Error("PORT must be between 1 and 65535");
}

const webCommand = runtimeCommand("web", { HOST: webHost, PORT: String(webPort) });
const cronCommand = runtimeCommand("cron");
module.exports = {
  apps: [
    {
      name: webName,
      script: webCommand.script,
      node_args: ["--import", pathToFileURL(resolve(__dirname, "scripts/runtime-preload.mjs")).href],
      args: webCommand.args,
      cwd: appDir,
      env: {
        ...governorEnv,
        APP_ROLE: "web",
        APP_RUNTIME: "native",
        ...redisEnv,
        ...ocrEnv,
        ...entryEnv,
        NODE_ENV: "production",
        APP_RELEASE_ID: process.env.APP_RELEASE_ID || "",
        DEPLOY_PROJECT_NAME: projectName,
        DEPLOY_WEB_HOST: webHost,
        DEPLOY_WEB_PORT: String(webPort),
        HOST: webHost,
        PORT: String(webPort),
      },
      max_memory_restart: memoryRestart("RESOURCE_WEB_MEMORY_MB", "web"),
      exp_backoff_restart_delay: 1000,
      min_uptime: "30s",
      merge_logs: true,
      kill_timeout: 10000,
      listen_timeout: 30000,
    },
    {
      name: cronName,
      // The tsx CLI forks the worker, hiding its RSS from PM2's memory check.
      // Load TypeScript in the managed Node process instead.
      script: cronCommand.script,
      interpreter: "node",
      node_args: ["--import", pathToFileURL(resolve(__dirname, "scripts/runtime-preload.mjs")).href, ...cronCommand.nodeArgs],
      args: cronCommand.args,
      cwd: appDir,
      env: {
        ...governorEnv,
        APP_ROLE: "cron",
        APP_RUNTIME: "native",
        APP_HEARTBEAT_FILE: resolve(appDir, ".runtime-cron-heartbeat"),
        ...redisEnv,
        ...ocrEnv,
        ...entryEnv,
        NODE_ENV: "production",
        APP_RELEASE_ID: process.env.APP_RELEASE_ID || "",
        DEPLOY_PROJECT_NAME: projectName,
        DEPLOY_WEB_PORT: String(webPort),
        PORT: String(webPort),
      },
      max_memory_restart: memoryRestart("RESOURCE_CRON_MEMORY_MB", "cron"),
      exp_backoff_restart_delay: 1000,
      min_uptime: "30s",
      merge_logs: true,
      kill_timeout: 310000,
    },
  ],
};
