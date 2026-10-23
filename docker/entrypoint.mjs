import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { constants } from "node:os";
import { runtimeEnvironment } from "./runtime-env.mjs";
import { resolveDeploymentEntry, resolveOcrEndpoint } from "../src/lib/public-origin.ts";
import { assertContainerStorage } from "../scripts/compose-storage.mjs";
import { runtimeLog, installRuntimeConsole } from "../src/lib/runtime-logging.mjs";
import { watchChild } from "../scripts/runtime-liveness.mjs";
import { runtimeCommand } from "../scripts/runtime-command.mjs";
import { guardNativeImport } from "./native-migration.mjs";

const mode = process.argv[2] || "web";
process.env.APP_ROLE = "supervisor";
installRuntimeConsole();
try {
  const environment = runtimeEnvironment(process.env);
  const command = runtimeCommand(mode, environment);
  const args = [...command.nodeArgs, command.script, ...command.args];
  environment.APP_ROLE = mode === "sync-heroes" ? "job" : mode;
  process.env.APP_ROLE = mode;
  if (mode === "cron") environment.APP_HEARTBEAT_FILE = "/tmp/wzywt-cron-heartbeat";
  if (mode !== "migrate") {
    assertContainerStorage(environment.STORAGE_MODE);
    guardNativeImport();
    if ((environment.SESSION_SECRET || "").length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters");
    resolveDeploymentEntry(environment.PUBLIC_ORIGIN || "", environment.DEPLOY_ENVIRONMENT, environment.SESSION_COOKIE_SECURE);
    if (environment.MATCH_OCR_ENDPOINT) {
      resolveOcrEndpoint(environment.MATCH_OCR_ENDPOINT, environment.DEPLOY_ENVIRONMENT, true, environment.MATCH_OCR_INTERNAL_HOST);
    }
  }
  if (mode === "cron") writeFileSync("/tmp/wzywt-cron-started", String(Date.now()), { mode: 0o600 });
  const child = spawn(process.execPath, ["--import", "./scripts/runtime-preload.mjs", ...args], { stdio: "inherit", env: environment });
  child.once("spawn", () => runtimeLog("supervisor.child_started", { childPid: child.pid }));
  const watcher = (mode === "web" || mode === "cron") ? watchChild(child, {
    role: mode, environment, log: runtimeLog, graceMs: mode === "cron" ? 300_000 : 40_000,
  }) : null;
  process.on("SIGTERM", () => watcher ? watcher.terminate("SIGTERM") : child.kill("SIGTERM"));
  process.on("SIGINT", () => watcher ? watcher.terminate("SIGINT") : child.kill("SIGINT"));
  child.once("error", (error) => {
    watcher?.close();
    runtimeLog("supervisor.child_start_failed", { mode, error }, "error");
    process.exitCode = 1;
  });
  child.once("exit", (code, signal) => {
    watcher?.close();
    runtimeLog("supervisor.child_exited", { role: mode, childPid: child.pid, code, signal, livenessFailed: watcher?.unhealthy() || false }, code || signal ? "error" : "info");
    process.exitCode = watcher?.unhealthy() ? 75 : code ?? (128 + (constants.signals[signal] || 1));
  });
} catch (error) {
  runtimeLog("supervisor.configuration_failed", { mode, error }, "error");
  process.exitCode = 1;
}
