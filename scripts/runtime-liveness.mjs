import { readFileSync } from "node:fs";
import { localHealthUrl } from "./local-health-url.mjs";

export function validLocalHeartbeat(value, { pid, releaseId, startedAt, now = Date.now(), maxAgeMs = 90_000 }) {
  try {
    const heartbeat = JSON.parse(value);
    return heartbeat.version === 1 && heartbeat.pid === pid && heartbeat.releaseId === releaseId
      && Number.isSafeInteger(heartbeat.timestamp) && heartbeat.timestamp >= startedAt
      && heartbeat.timestamp <= now && now - heartbeat.timestamp <= maxAgeMs;
  } catch { return false; }
}

export async function probeLiveness({ role, pid, releaseId, startedAt, heartbeatFile, port = 8001, host = "127.0.0.1" }) {
  if (role === "cron") {
    try { return validLocalHeartbeat(readFileSync(heartbeatFile, "utf8"), { pid, releaseId, startedAt }); }
    catch { return false; }
  }
  try {
    const response = await fetch(localHealthUrl(host, port), { signal: AbortSignal.timeout(3_000), redirect: "error" });
    const data = await response.json();
    return response.ok && data.ok === true && data.mode === "liveness" && data.releaseId === releaseId;
  } catch { return false; }
}

export function watchChild(child, { role, environment, log, graceMs, intervalMs = 15_000, startupGraceMs = 120_000, failures = 3, probe = probeLiveness }) {
  const startedAt = Date.now();
  let failed = 0, busy = false, stopping = false, unhealthy = false;
  let killTimer;
  const terminate = (signal = "SIGTERM", reason = "shutdown") => {
    if (stopping) return;
    stopping = true;
    log("supervisor.stopping", { role, childPid: child.pid, signal, reason });
    child.kill(signal);
    killTimer = setTimeout(() => {
      log("supervisor.force_kill", { role, childPid: child.pid, reason }, "error");
      child.kill("SIGKILL");
    }, graceMs);
    killTimer.unref();
  };
  const interval = setInterval(async () => {
    if (busy || stopping || Date.now() - startedAt < startupGraceMs) return;
    busy = true;
    try {
      const live = await probe({ role, pid: child.pid, releaseId: environment.APP_RELEASE_ID || "development",
        startedAt, heartbeatFile: environment.APP_HEARTBEAT_FILE, port: Number(environment.PORT || 8001), host: environment.HOST || "127.0.0.1" });
      if (live) {
        if (failed) log("supervisor.liveness_restored", { role, childPid: child.pid });
        failed = 0;
      } else {
        failed++;
        log("supervisor.liveness_failed", { role, childPid: child.pid, consecutiveFailures: failed }, "warn");
        if (failed >= failures) { unhealthy = true; terminate("SIGTERM", "liveness-failed"); }
      }
    } catch (error) { log("supervisor.probe_failed", { role, error }, "warn"); }
    finally { busy = false; }
  }, intervalMs);
  interval.unref();
  return { terminate, close() { clearInterval(interval); if (killTimer) clearTimeout(killTimer); }, unhealthy: () => unhealthy };
}
