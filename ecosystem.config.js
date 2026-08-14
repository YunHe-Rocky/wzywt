const appDir = process.env.APP_DIR || "/opt/yanwutang/current";

module.exports = {
  apps: [
    {
      name: "yanwutang-web",
      script: "node_modules/.bin/next",
      args: "start -p 8081",
      cwd: appDir,
      env: { NODE_ENV: "production", APP_RELEASE_ID: process.env.APP_RELEASE_ID || "" },
      max_memory_restart: "500M",
      kill_timeout: 10000,
      listen_timeout: 30000,
    },
    {
      name: "yanwutang-cron",
      script: "node_modules/.bin/tsx",
      args: "scripts/cron.ts",
      cwd: appDir,
      env: { NODE_ENV: "production", APP_RELEASE_ID: process.env.APP_RELEASE_ID || "" },
      max_memory_restart: "300M",
      kill_timeout: 310000,
    },
  ],
};
