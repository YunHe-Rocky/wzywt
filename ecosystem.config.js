module.exports = {
  apps: [
    {
      name: "yanwutang-web",
      script: "node_modules/.bin/next",
      args: "start -p 8081",
      cwd: "/opt/yanwutang",
      env: { NODE_ENV: "production" },
    },
    {
      name: "yanwutang-cron",
      script: "node_modules/.bin/tsx",
      args: "scripts/cron.ts",
      cwd: "/opt/yanwutang",
      env: { NODE_ENV: "production" },
    },
  ],
};
