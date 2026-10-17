import { installRuntimeConsole, runtimeLog } from "../src/lib/runtime-logging.mjs";

// Runs in the actual managed PID, before Next/tsx/business imports can fail.
installRuntimeConsole();
runtimeLog("process.boot", { node: process.version, execPath: process.execPath,
  pm2Home: process.env.PM2_HOME || null, memory: process.memoryUsage() });
if (!globalThis.runtimeResourceHooksInstalled) {
  globalThis.runtimeResourceHooksInstalled = true;
  process.once("uncaughtExceptionMonitor", (error, origin) => runtimeLog("process.fatal", { error, origin }, "error"));
  process.once("exit", code => runtimeLog("process.exited", { code, uptimeSeconds: process.uptime(), memory: process.memoryUsage() }, code ? "error" : "info"));
}
