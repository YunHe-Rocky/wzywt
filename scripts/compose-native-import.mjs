import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { fileSha256 } from "./backup-integrity.mjs";

/** Import only an explicit verified snapshot. Never start application writers. */
export function importNativeBackup({ root, directory, bundle, model, selected, storage,
  compose, checkMount, prepare, verifyDataServices, log = console.log }) {
  const reportDirectory = resolve(root, ".cache/native-migrations", `${Date.now()}-${randomUUID()}`);
  mkdirSync(reportDirectory, { recursive: true, mode: 0o700 });
  const reportPath = resolve(reportDirectory, "report.json");
  const report = {
    version: 1, status: "pending", phase: "preflight", startedAt: new Date().toISOString(),
    project: model.name, mysqlMode: selected.mysql, storageMode: storage.mode,
    backupDirectory: directory, bundleSha256: fileSha256(resolve(directory, "manifest.json")),
    sourceDatabase: bundle.databaseIdentity, runtimeVerified: false, playbackVerified: false,
  };
  const save = () => writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  const step = (phase, fn) => { report.phase = phase; save(); checkMount(storage); return fn(); };
  const mount = ["--volume", `${directory}:/wzywt-import:ro`];
  // The backup remains 0700/0600 on the host. Only this short-lived importer
  // reads it as root; tar and media verification run as uid/gid 1000.
  const importerPermissions = ["--user", "0:0", ...["CHOWN", "DAC_OVERRIDE", "SETUID", "SETGID"].flatMap(cap => ["--cap-add", cap])];
  const helper = (phase, args = [], execution = {}) => compose([
    "run", "--rm", "--no-deps", "-T", ...importerPermissions, ...mount, "--entrypoint", "node", "cron",
    "docker/native-migration.mjs", phase, "/wzywt-import", ...args,
  ], { ...execution });
  save();
  log(`[compose] Native import report: ${reportPath}`);
  try {
    const raw = compose(["ps", "--all", "--format", "json"], { capture: true }).trim();
    let states;
    try { const parsed = raw ? JSON.parse(raw) : []; states = Array.isArray(parsed) ? parsed : [parsed]; }
    catch { states = raw.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); }
    if (states.some(row => !row || typeof row.Service !== "string" || typeof row.State !== "string")) {
      throw new Error("Cannot verify existing container states; native import was not started.");
    }
    if (states.some(row => ["web", "cron"].includes(row.Service) && !["exited", "created", "dead"].includes(row.State))) {
      throw new Error("Stop the target project's Web/Cron before importing; existing writers are never stopped implicitly by import-native.");
    }
    step("build", () => compose(["build", "web", "cron", "migrate", "storage-init", ...(selected.ocr === "container" ? ["ocr"] : [])]));
    step("prepare-storage", () => prepare(storage));
    step("data-services", () => compose(["up", "-d", "--no-recreate", "--wait", "--wait-timeout", "180",
      ...(selected.mysql === "container" ? ["mysql"] : []), "redis"]));
    step("data-service-limits", () => verifyDataServices());
    step("storage-init", () => compose(["run", "--rm", "--no-deps", "storage-init"]));
    step("check-empty-target", () => helper("preflight", [selected.mysql]));
    // Persist the fence in the target volume BEFORE the first database write.
    step("begin", () => helper("begin"));
    if (selected.mysql === "container") {
      step("import-database", () => compose(["run", "--rm", "--no-deps", "-T", "--user", "0:0", "--cap-add", "DAC_OVERRIDE", ...mount, "mysql-client",
        'exec mysql --binary-mode --protocol=TCP --connect-timeout=5 -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" "$MYSQL_DATABASE" < /wzywt-import/database.sql'], { capture: true }));
    }
    step("restore-media", () => helper("restore"));
    step("schema-migration", () => compose(["run", "--rm", "--no-deps", "migrate"]));
    step("verify-media", () => helper("verify", [], { outputFile: resolve(reportDirectory, "media-verification.json") }));
    report.status = "complete";
    report.completedAt = new Date().toISOString();
    report.media = bundle.mediaManifest.counts;
    save();
    log(`[compose] Native snapshot imported and media verified. Web/Cron remain stopped. Report: ${reportPath}`);
    log("[compose] Keep the native writers stopped; run up with the same Docker env file, then verify old-video playback and seeking on desktop and phone.");
    return report;
  } catch (error) {
    report.status = "failed";
    report.failedAt = new Date().toISOString();
    // Command errors can contain user input; report only the known stage.
    report.recovery = "Keep writers stopped. Preserve this report, source backup and target volumes. A pending .native-import.json blocks deployment. Do not delete the marker or overwrite a partially imported database; use a separately configured empty target for a new import, or investigate the retained target.";
    save();
    throw new Error(`Native import failed at ${report.phase}: ${error.message}\nReport: ${reportPath}\nNo application writers were started and no source data was removed.`);
  }
}
