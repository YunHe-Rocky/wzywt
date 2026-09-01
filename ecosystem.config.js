const { isAbsolute, resolve } = require("node:path");
const packageJson = require("./package.json");

function safeProjectName(value) {
  return String(value ?? "")
    .replace(/^@/, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const appDir = process.env.APP_DIR || resolve(__dirname);
const projectName = process.env.DEPLOY_PROJECT_NAME || safeProjectName(packageJson.name);
const webName = process.env.DEPLOY_PM2_WEB_NAME || `${projectName}-web`;
const cronName = process.env.DEPLOY_PM2_CRON_NAME || `${projectName}-cron`;
const webHost = process.env.DEPLOY_WEB_HOST || process.env.HOST || "127.0.0.1";
const webPort = Number.parseInt(process.env.DEPLOY_WEB_PORT || process.env.PORT || "8001", 10);

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

module.exports = {
  apps: [
    {
      name: webName,
      script: "node_modules/.bin/next",
      args: `start -H ${webHost} -p ${webPort}`,
      cwd: appDir,
      env: {
        NODE_ENV: "production",
        APP_RELEASE_ID: process.env.APP_RELEASE_ID || "",
        DEPLOY_PROJECT_NAME: projectName,
        DEPLOY_WEB_HOST: webHost,
        DEPLOY_WEB_PORT: String(webPort),
        HOST: webHost,
        PORT: String(webPort),
      },
      max_memory_restart: "500M",
      kill_timeout: 10000,
      listen_timeout: 30000,
    },
    {
      name: cronName,
      script: "node_modules/.bin/tsx",
      args: "scripts/cron.ts",
      cwd: appDir,
      env: {
        NODE_ENV: "production",
        APP_RELEASE_ID: process.env.APP_RELEASE_ID || "",
        DEPLOY_PROJECT_NAME: projectName,
        DEPLOY_WEB_PORT: String(webPort),
        PORT: String(webPort),
      },
      max_memory_restart: "300M",
      kill_timeout: 310000,
    },
  ],
};
