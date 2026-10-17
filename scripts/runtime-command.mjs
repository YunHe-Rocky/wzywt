/** PM2 and Docker call these entries directly; cron stays in the managed PID. */
export function runtimeCommand(mode, environment = {}) {
  const commands = {
    web: { script: "node_modules/next/dist/bin/next", nodeArgs: [], args: ["start", "--hostname", environment.HOST || "127.0.0.1", "--port", environment.PORT || "8001"] },
    cron: { script: "scripts/cron.ts", nodeArgs: ["--import", "tsx"], args: [] },
    migrate: { script: "node_modules/prisma/build/index.js", nodeArgs: [], args: ["migrate", "deploy"] },
    "sync-heroes": { script: "scripts/compose-sync-heroes.ts", nodeArgs: ["--import", "tsx"], args: [] },
  };
  const command = Object.hasOwn(commands, mode) ? commands[mode] : null;
  if (!command) throw new Error("Expected web, cron, migrate or sync-heroes");
  return command;
}
