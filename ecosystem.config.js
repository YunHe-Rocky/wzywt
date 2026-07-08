module.exports = {
  apps: [
    {
      name: "yanwutang-web",
      script: "node_modules/.bin/next",
      args: "start -p 8081",
      cwd: "/opt/yanwutang",
      env: { NODE_ENV: "production" },
      node_args: "--max-old-space-size=256",
      max_memory_restart: "350M",
      kill_timeout: 10000,
      listen_timeout: 30000,
    },
    {
      name: "yanwutang-cron",
      script: "node_modules/.bin/tsx",
      args: "scripts/cron.ts",
      cwd: "/opt/yanwutang",
      env: { NODE_ENV: "production" },
      node_args: "--max-old-space-size=128",
      max_memory_restart: "200M",
    },
  ],
};
