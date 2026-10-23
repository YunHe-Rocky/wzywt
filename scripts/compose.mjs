import { acquireComposeLock } from "./compose-lock.mjs";
import { sourceIdentity } from "./source-identity.mjs";
import { fileSha256 } from "./backup-integrity.mjs";
import { parseSelectedEnv } from "./deploy-env.mjs";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync,
  statSync, writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { verifyPublicEntry } from "./public-entry-smoke.mjs";
import { resolveDeploymentEntry, resolveOcrEndpoint } from "../src/lib/public-origin.ts";
import { assertRcloneMount, prepareStorage, resolveStorage, validateStorageModel } from "./compose-storage.mjs";
import { resolveServices } from "./compose-services.mjs";
import { databaseUrl } from "../docker/runtime-env.mjs";
import { readResourceSettings } from "../src/core/resource-settings.ts";
import { capacityPlan, assertLiveLimits } from "./compose-capacity.mjs";
import { composeRuntime, serializeRuntime, parseComposeModel } from "./compose-runtime.mjs";
import { composeEnvironment, initializeComposeEnv, readSharedComposeEnv } from "./compose-env.mjs";
import { exportNative } from "./native-migration-export.mjs";
import { verifyNativeBackup } from "./native-migration-bundle.mjs";
import { importNativeBackup } from "./compose-native-import.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const actions = new Set(["init", "check", "build", "export-native", "import-native", "up", "update", "status", "logs", "down", "backup", "sync-heroes"]);
const services = new Set(["mysql", "mysql-client", "redis", "web", "cron", "ocr", "migrate", "storage-init"]);
const help = `Usage: node scripts/compose.mjs <command> [options]

  init          Generate .env.docker; reuse shared .env secrets or generate missing ones.
  check         Validate Docker, Compose, credentials and service configuration.
  build         Validate and build images without starting or stopping services.
  export-native Export a stopped native installation to a verified migration backup.
  import-native Import that backup into empty Docker storage; keep Web/Cron stopped.
  up / update   Build, pause writers, back up SQL/media/crawler files, migrate and start.
  status        Show service status.
  logs [name]   Follow the last 100 log lines (Ctrl+C to exit).
  down          Stop the stack; preserve all volumes and backups.
  backup        Pause writers, back up SQL/media/crawler files, then resume containers.
  sync-heroes   Run the independent hero synchronization job.

Options: --env-file PATH, --backup-dir PATH, --ocr
export-native: --source-root PATH, --source-env PATH, --source-media PATH,
               --source-avatars PATH, --backup-dir PATH, --writers-stopped
import-native: --from-backup PATH (verified export-native backup only)
Defaults: .env.docker; COMPOSE_BACKUP_DIR or the storage-mode backup directory;
Shared application settings inherit the optional project-root .env (not .env.local).
Priority: process environment > selected Docker env file > shared .env > defaults.
An explicit empty Docker value clears inheritance. Native DB/Redis connections and host paths are not inherited.
MYSQL_MODE=container|external, OCR_MODE=off|container|external select services.
STORAGE_MODE=rclone selects compose.oss.yaml automatically. Legacy --ocr works.
Node >=24, Docker Engine and Compose >=2.20 are required. Host npm dependencies,
Git, MySQL and Redis are unnecessary when using container services.
Failed migration/activation leaves writers stopped for recovery; no schema rollback
or volume deletion is attempted. Backups contain private data: retain them safely.
`;

export function parseArguments(args) {
  const options = { action: args[0] || "help", envFile: ".env.docker", backupDir: undefined, ocr: false };
  if (["help", "--help", "-h"].includes(options.action)) return { ...options, action: "help" };
  if (!actions.has(options.action)) throw new Error(`Unknown command: ${options.action}`);
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (options.action === "export-native" && ["--env-file", "--ocr"].includes(arg)) {
      throw new Error("export-native reads the native --source-env, not Docker --env-file or --ocr settings");
    }
    if (arg === "--writers-stopped" && options.action === "export-native") options.writersStopped = true;
    else if (["--source-root", "--source-env", "--source-media", "--source-avatars"].includes(arg) && options.action === "export-native") {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a path`);
      const key = { "--source-root": "sourceRoot", "--source-env": "sourceEnv", "--source-media": "sourceMedia", "--source-avatars": "sourceAvatars" }[arg];
      options[key] = value;
    } else if (arg === "--from-backup" && options.action === "import-native") {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a path`);
      options.fromBackup = value;
    } else if (arg === "--ocr") options.ocr = true;
    else if (arg === "--env-file" || arg === "--backup-dir") {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a path`);
      options[arg === "--env-file" ? "envFile" : "backupDir"] = value;
    } else if (options.action === "logs" && services.has(arg) && !options.service) options.service = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.action === "import-native" && !options.fromBackup) throw new Error("import-native requires --from-backup PATH");
  if (options.action === "export-native" && (!options.backupDir || !options.writersStopped)) {
    throw new Error("export-native requires --backup-dir PATH and --writers-stopped after stopping the native Web/Cron writers");
  }
  return options;
}

export function runDocker(args, options = {}) {
  let outputFd;
  try {
    if (options.outputFile) outputFd = openSync(options.outputFile, "wx", 0o600);
    const child = spawnSync("docker", args, {
      cwd: options.cwd,
      env: options.environment,
      shell: false,
      windowsHide: true,
      encoding: "utf8",
      input: options.input,
      maxBuffer: 8 * 1024 * 1024,
      stdio: [options.input === undefined ? "ignore" : "pipe",
        outputFd !== undefined ? outputFd : options.capture ? "pipe" : "inherit",
        options.capture && outputFd === undefined ? "pipe" : "inherit"],
    });
    if (child.error) {
      if (child.error.code === "ENOENT") throw new Error("Docker was not found. Install/start Docker Desktop (Linux containers) or Docker Engine with Compose.");
      throw child.error;
    }
    if (child.status !== 0) {
      // Compose config can contain secrets; never print captured output in errors.
      throw new Error(`Docker command failed (exit ${child.status ?? child.signal}): docker ${args.join(" ")}`);
    }
    return child.stdout || "";
  } finally {
    if (outputFd !== undefined) closeSync(outputFd);
  }
}

function requireSecret(value, name, minLength) {
  if (typeof value !== "string" || value.length < minLength || /__GENERATE_|change[-_]?me|example|password123/i.test(value)) {
    throw new Error(`${name} must be a private value of at least ${minLength} characters; run init to generate credentials.`);
  }
}

export function validateModel(model, ocr, mysqlMode = "container") {
  const web = model.services?.web?.environment || {};
  readResourceSettings(web);
  const mysql = mysqlMode === "container" ? model.services?.mysql?.environment || {} : web;
  if (mysqlMode === "container") {
    requireSecret(mysql.MYSQL_PASSWORD, "MYSQL_PASSWORD", 16);
    requireSecret(mysql.MYSQL_ROOT_PASSWORD, "MYSQL_ROOT_PASSWORD", 16);
  } else if (!mysql.MYSQL_PASSWORD) throw new Error("External MySQL requires the existing MYSQL_PASSWORD.");
  if (mysqlMode === "external") databaseUrl(web);
  requireSecret(web.SESSION_SECRET, "SESSION_SECRET", 32);
  if (mysqlMode === "container" && !/^[a-zA-Z0-9_]+$/.test(mysql.MYSQL_DATABASE || "")) throw new Error("MYSQL_DATABASE must contain only letters, digits and underscores.");
  if (!mysql.MYSQL_USER || mysql.MYSQL_USER === "root") throw new Error("MYSQL_USER must be a dedicated non-root application account.");
  resolveDeploymentEntry(web.PUBLIC_ORIGIN || "", web.DEPLOY_ENVIRONMENT, web.SESSION_COOKIE_SECURE);
  if (web.MATCH_OCR_ENDPOINT) {
    resolveOcrEndpoint(web.MATCH_OCR_ENDPOINT, web.DEPLOY_ENVIRONMENT, true, web.MATCH_OCR_INTERNAL_HOST);
    if (web.MATCH_OCR_TOKEN && !/^[\x21-\x7e]+$/.test(web.MATCH_OCR_TOKEN)) {
      throw new Error("MATCH_OCR_TOKEN must be ASCII without whitespace.");
    }
  }
  if (ocr && !web.MATCH_OCR_ENDPOINT) throw new Error("OCR requires MATCH_OCR_ENDPOINT=http://ocr:8010/recognize; use init --ocr for a new installation.");
  if (ocr) {
    requireSecret(web.MATCH_OCR_TOKEN, "MATCH_OCR_TOKEN", 32);
    if (web.MATCH_OCR_ENDPOINT !== "http://ocr:8010/recognize" || web.MATCH_OCR_INTERNAL_HOST !== "ocr") {
      throw new Error("--ocr requires MATCH_OCR_ENDPOINT=http://ocr:8010/recognize and MATCH_OCR_INTERNAL_HOST=ocr.");
    }
    if (model.services?.ocr?.environment?.OCR_TOKEN !== web.MATCH_OCR_TOKEN) {
      throw new Error("The web and OCR containers must use the same OCR token.");
    }
  }
}

function parseContainerStates(output) {
  const content = output.trim();
  if (!content) return [];
  let rows;
  try {
    // Compose releases emit either a JSON array or one JSON object per line.
    const parsed = JSON.parse(content);
    rows = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    try { rows = content.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)); }
    catch { throw new Error("Could not parse Compose container states; backup was not started."); }
  }
  if (rows.some((row) => !row || typeof row.Service !== "string" || typeof row.State !== "string")) {
    throw new Error("Compose returned incomplete container states; backup was not started.");
  }
  return rows;
}

export function createManager({ root = repoRoot, run = runDocker, log = console.log, verifyEntry = verifyPublicEntry,
  environment: processEnvironment = process.env, checkMount = assertRcloneMount, prepare = prepareStorage } = {}) {
  const docker = (args, options = {}) => run(args, { cwd: root, ...options });
  return async function manage(options) {
    if (options.action === "help") { log(help); return; }
    if (options.action === "export-native") {
      await exportNative({ root, ...options }, { log });
      return;
    }
    const nativeDirectory = options.action === "import-native" ? resolve(root, options.fromBackup) : undefined;
    const nativeBundle = nativeDirectory ? await verifyNativeBackup(nativeDirectory) : undefined;
    const envFile = resolve(root, options.envFile);
    if (options.action === "init") {
      if (existsSync(envFile)) throw new Error(`${envFile} already exists; credentials were preserved.`);
      const template = readFileSync(resolve(root, ".env.docker.example"), "utf8");
      const content = initializeComposeEnv(template, readSharedComposeEnv(root), { ocr: options.ocr });
      try { writeFileSync(envFile, content, { flag: "wx", mode: 0o600 }); }
      catch (error) {
        if (error.code === "EEXIST") throw new Error(`${envFile} already exists; credentials were preserved.`);
        throw error;
      }
      log(`[compose] Created ${envFile}. Shared settings inherit ${resolve(root, ".env")} when present. Set PUBLIC_ORIGIN to the PC's LAN address for phone access.`);
      return;
    }
    if (!existsSync(envFile)) throw new Error(`${envFile} is missing; run: node scripts/compose.mjs init`);
    const content = readFileSync(envFile, "utf8");
    const maintenance = ["down", "status", "logs"].includes(options.action);
    const environment = maintenance ? processEnvironment : composeEnvironment(root, content, processEnvironment);
    const storage = resolveStorage(content, root, { environment, backupDir: options.backupDir });
    // Inspect/stop the existing project even while connection settings are being
    // corrected; these commands never start services or use their endpoints.
    const selected = maintenance ? resolveServices("", { environment: {} })
      : resolveServices(content, { environment, ocr: options.ocr });
    const withOcr = selected.ocr === "container";
    const deployingAction = ["up", "update", "build", "import-native"].includes(options.action);
    const identity = deployingAction ? sourceIdentity(root) : undefined;
    const releaseEnvironment = identity ? { ...environment, APP_RELEASE_ID: `${Date.now()}-${identity.sourceSha256.slice(0, 12)}-${randomUUID().slice(0, 8)}` } : environment;
    const runtimeInput = maintenance ? undefined : serializeRuntime(composeRuntime(content, { environment: releaseEnvironment, selected, storage }));
    const composeArgs = ["compose", "--project-directory", root, "--env-file", envFile, "-f", resolve(root, "compose.yaml")];
    if (storage.mode === "rclone") composeArgs.push("-f", resolve(root, "compose.oss.yaml"));
    if (runtimeInput !== undefined) composeArgs.push("-f", "-");
    // Maintenance commands also see/stop optional containers started earlier.
    if (selected.mysql === "container" || maintenance) composeArgs.push("--profile", "mysql");
    if (withOcr || maintenance) composeArgs.push("--profile", "ocr");
    const compose = (args, execution = {}) => docker([...composeArgs, ...args], {
      input: runtimeInput,
      environment: { ...process.env, ...releaseEnvironment, ...storage.environment, ...selected.environment, WZYWT_COMPOSE_MANAGED: "1" }, ...execution,
    });
    const version = docker(["compose", "version", "--short"], { capture: true }).trim().match(/^v?(\d+)\.(\d+)/);
    if (!version || Number(version[1]) < 2 || (Number(version[1]) === 2 && Number(version[2]) < 20)) {
      throw new Error("Docker Compose >=2.20 is required for health-gated startup.");
    }
    docker(["info", "--format", "{{.ServerVersion}}"], { capture: true });
    // status/logs/down remain usable even if edited credentials need correction.
    compose(["config", "--quiet"], { capture: true });
    if (options.action === "status") { compose(["ps", "--all"]); return; }
    if (options.action === "logs") { compose(["logs", "--follow", "--tail", "100", ...(options.service ? [options.service] : [])]); return; }

    // down/status/logs remain available when the mount is unavailable.
    if (options.action !== "down") {
      checkMount(storage);
      if (storage.mode === "rclone") {
        const host = docker(["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"], { capture: true }).trim();
        if (!(environment.DOCKER_HOST || host).startsWith("unix://")) {
          throw new Error("rclone storage requires the local Docker Engine on the mounted Linux server.");
        }
      }
    }

    let releaseLock;
    try {
      if (options.action !== "check") {
        const daemon = docker(["info", "--format", "{{.ID}}"], { capture: true }).trim();
        const values = parseSelectedEnv(content, ["COMPOSE_PROJECT_NAME"]);
        const project = environment.COMPOSE_PROJECT_NAME || values.get("COMPOSE_PROJECT_NAME") || "wzywt";
        releaseLock = acquireComposeLock(daemon, project, options.action);
      }
      if (options.action === "down") { compose(["down"]); return; }
      // Include one-shot tools in the model without enabling them for startup.
      const model = parseComposeModel(compose(["--profile", "tools", "config", "--format", "json"], { capture: true }));
      validateModel(model, withOcr, selected.mysql);
      validateStorageModel(model, storage);
      const verifyDataServices = (containers = parseContainerStates(compose(["ps", "--all", "--format", "json"], { capture: true }))) => {
        for (const name of ["redis", ...(selected.mysql === "container" ? ["mysql"] : [])]) {
          const container = containers.find(row => row.Service === name && row.State === "running");
          if (!container?.ID) throw new Error(`Cannot verify the running ${name} container limits; no application data was written.`);
          const actual = JSON.parse(docker(["inspect", container.ID, "--format", "{{json .HostConfig}}"], { capture: true }));
          assertLiveLimits(name, model.services[name], actual);
        }
      };
      if (["check", "build", "import-native", "up", "update", "sync-heroes"].includes(options.action)) {
        const daemonBytes = Number(docker(["info", "--format", "{{.MemTotal}}"], { capture: true }).trim());
        const plan = capacityPlan(model, selected, daemonBytes, { action: options.action, content, environment });
        log(`[compose] Memory budget: ${Math.ceil(plan.plannedBytes / 1_048_576)} MiB / ${Math.floor(plan.daemonBytes / 1_048_576)} MiB (including reserve and one-shot work).`);
      }
      log(`[compose] Services: MySQL=${selected.mysql}, OCR=${selected.ocr}.`);
      if (options.action === "check") { log("[compose] Docker, Compose and configuration checks passed."); return; }
      if (options.action === "build") {
        compose(["build", "web", "cron", "migrate", "storage-init", ...(withOcr ? ["ocr"] : [])]);
        log("[compose] Images built; no services were started or stopped.");
        return;
      }
      if (options.action === "import-native") {
        const host = docker(["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"], { capture: true }).trim();
        if (!/^(unix:\/\/|npipe:\/\/)/.test(environment.DOCKER_HOST || host)) {
          throw new Error("import-native requires the local Docker Engine where the backup directory is accessible.");
        }
        importNativeBackup({ root, directory: nativeDirectory, bundle: nativeBundle, model, selected, storage,
          compose, checkMount, prepare, verifyDataServices, log });
        return;
      }
      if (options.action === "sync-heroes") {
        prepare(storage);
        compose(["run", "--rm", "--no-deps", "storage-init"]);
        compose(["run", "--rm", "--no-deps", "-T", "--entrypoint", "node", "cron", "docker/native-migration.mjs", "guard"]);
        compose(["run", "--rm", "--no-deps", "cron", "sync-heroes"]);
        return;
      }
      const deploying = options.action === "up" || options.action === "update";
      let candidateImages = [];
      if (deploying) {
        compose(["build", "web", "cron", "migrate", "storage-init", ...(withOcr ? ["ocr"] : [])]);
        candidateImages = [...new Set(["web", "cron", "migrate"].map(name => model.services[name]?.image).filter(Boolean))]
          .map(image => ({ reference: image, id: docker(["image", "inspect", image, "--format", "{{.Id}}"], { capture: true }).trim() }));
        prepare(storage);
        // Datastore upgrades are a separate maintenance operation after backup.
        compose(["up", "-d", "--no-recreate", "--wait", "--wait-timeout", "180", ...(selected.mysql === "container" ? ["mysql"] : []), "redis"]);
        compose(["run", "--rm", "--no-deps", "storage-init"]);
        compose(["run", "--rm", "--no-deps", "-T", "--entrypoint", "node", "cron", "docker/native-migration.mjs", "guard"]);
      }
      const containers = parseContainerStates(compose(["ps", "--all", "--format", "json"], { capture: true }));
      if (deploying) verifyDataServices(containers);
      if (selected.mysql === "container" && !containers.some(({ Service, State }) => Service === "mysql" && State === "running")) {
        throw new Error("MySQL is not running; start the stack before requesting a backup.");
      }
      // Prove external connectivity from the container network before stopping
      // writers. No host tools/root credentials or server lifecycle operations.
      if (selected.mysql === "external") {
        compose(["run", "--rm", "--no-deps", "-T", "mysql-client",
          'exec mysql --protocol=TCP --connect-timeout=5 -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" "$MYSQL_DATABASE" -Nse "SELECT 1"']);
      }
      if (deploying && selected.ocr === "external") {
        compose(["run", "--rm", "--no-deps", "-T", "--entrypoint", "node", "web", "docker/probe-ocr.mjs"]);
      }
      const previousImages = containers.filter(row => row.ID).map(row => ({ id: row.ID, service: row.Service,
        imageId: docker(["inspect", row.ID, "--format", "{{.Image}}"], { capture: true }).trim() }));
      const writerServices = ["web", "cron"].filter((service) => containers.some(({ Service }) => Service === service));
      const writers = writerServices.filter((service) => containers.some(({ Service, State }) => Service === service && ["running", "restarting"].includes(State)));
      let stopped = false;
      let migrationStarted = false;
      let backupDir;
      try {
        checkMount(storage);
        if (writerServices.length) {
          stopped = true;
          // Stop existing services even in a restart transition; they must not
          // restart during backup/migration. Preserve graceful task draining.
          compose(["stop", ...writerServices]);
        }
        checkMount(storage);
        backupDir = resolve(storage.backupPath, `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`);
        mkdirSync(backupDir, { recursive: true, mode: 0o700 });
        const save = (name, args) => {
          checkMount(storage);
          const partial = resolve(backupDir, `${name}.partial`);
          compose(args, { outputFile: partial });
          if (statSync(partial).size === 0) throw new Error(`Backup ${name} is empty; migration was not started.`);
          renameSync(partial, resolve(backupDir, name));
        };
        save("database.sql", selected.mysql === "container"
          ? ["exec", "-T", "mysql", "sh", "-ec", 'export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"; exec mysqldump -uroot --single-transaction --quick --skip-lock-tables --set-gtid-purged=OFF --no-tablespaces --routines --triggers --events --databases "$MYSQL_DATABASE"']
          : ["run", "--rm", "--no-deps", "-T", "mysql-client", 'exec mysqldump --protocol=TCP --connect-timeout=5 -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" --single-transaction --quick --skip-lock-tables --set-gtid-purged=OFF --no-tablespaces --routines --triggers --events --databases "$MYSQL_DATABASE"']);
        save("media.tar.gz", ["run", "--rm", "--no-deps", "-T", "--entrypoint", "tar", "web", "-C", "/app/data/media", "-czf", "-", "."]);
        save("hero-assets.tar.gz", ["run", "--rm", "--no-deps", "-T", "--entrypoint", "tar", "web", "-C", "/app/public/heroes", "-czf", "-", "images", "skins"]);
        checkMount(storage);
        writeFileSync(resolve(backupDir, "manifest.json"), JSON.stringify({
          complete: true, createdAt: new Date().toISOString(), project: model.name,
          files: ["database.sql", "media.tar.gz", "hero-assets.tar.gz"],
          sha256: Object.fromEntries(["database.sql", "media.tar.gz", "hero-assets.tar.gz"].map(name => [name, fileSha256(resolve(backupDir, name))])),
          candidateSource: identity,
          candidateReleaseId: model.services.web.environment.APP_RELEASE_ID,
          previousContainers: previousImages,
          candidateImages,
          restoreVerified: false,
          storageMode: storage.mode,
          mysqlMode: selected.mysql,
          remoteUploadVerified: false,
          note: "SQL, uploads/avatars and crawler hero/skin files. Complete means written to the filesystem; rclone remote upload is not verified. Keep the matching Docker env file and project-root .env (if used) separately.",
        }, null, 2), { flag: "wx", mode: 0o600 });
        log(`[compose] Backup completed: ${backupDir}`);
        if (storage.mode === "rclone") log("[compose] Backup is written to the mounted filesystem; verify rclone upload completion separately.");
        if (deploying) {
          migrationStarted = true;
          compose(["run", "--rm", "--no-deps", "migrate"]);
          compose(["run", "--rm", "--no-deps", "-T", "--entrypoint", "node", "cron", "docker/native-migration.mjs", "audit", "-"],
            { outputFile: resolve(backupDir, "media-verification.json") });
          compose(["up", "-d", "--no-deps", "--wait", "--wait-timeout", withOcr ? "600" : "180", "web", "cron", ...(withOcr ? ["ocr"] : [])]);
          const webEnvironment = model.services.web.environment;
          await verifyEntry(webEnvironment.PUBLIC_ORIGIN, webEnvironment.APP_RELEASE_ID || "local");
          stopped = false;
          log("[compose] Deployment completed; health and desktop/mobile entry checks passed.");
        }
      } catch (error) {
        if (migrationStarted) {
          // Capture bounded health/state before stopping the failed application.
          const diagnostic = resolve(backupDir || storage.backupPath, "readiness-diagnostics.json");
          try {
            const raw = compose(["exec", "-T", "web", "node", "docker/healthcheck.mjs", "web"], { capture: true });
            writeFileSync(diagnostic, raw, { mode: 0o600 });
          } catch { /* Docker health history still contains the sanitized output. */ }
          // A failed migration can be partial. Keep all writers quiet for recovery.
          try { compose(["stop", "web", "cron"]); } catch { /* Preserve the original deployment error. */ }
          throw new Error(`${error.message}\nDeployment stopped after migration began. Inspect logs and Prisma migration state before recovery. Backup: ${backupDir}`);
        }
        throw error;
      } finally {
        // Compose 2.20 supports wait on up, but older start has no wait flags.
        // Never recreate old containers against the newly built image on recovery.
        if (stopped && !migrationStarted && writers.length) compose(["up", "-d", "--no-deps", "--no-recreate", "--no-build", "--pull", "never", "--wait", "--wait-timeout", "180", ...writers]);
      }
    } finally {
      releaseLock?.();
    }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (Number(process.versions.node.split(".")[0]) < 24) throw new Error("Node.js >=24 is required.");
    await createManager()(parseArguments(process.argv.slice(2)));
  } catch (error) {
    console.error(`[compose] ${error.message}`);
    process.exitCode = 1;
  }
}
