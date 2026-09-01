import { spawnSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

function executable(path) {
  try {
    accessSync(path, constants.X_OK);
    return path;
  } catch {
    return null;
  }
}

function windowsBashCandidates() {
  const candidates = [];
  const where = spawnSync("where.exe", ["git"], { encoding: "utf8", shell: false, windowsHide: true });
  if (where.status === 0) {
    for (const gitPath of where.stdout.split(/\r?\n/).filter(Boolean)) {
      candidates.push(resolve(dirname(gitPath), "..", "bin", "bash.exe"));
    }
  }
  if (process.env.ProgramFiles) candidates.push(resolve(process.env.ProgramFiles, "Git", "bin", "bash.exe"));
  if (process.env.LOCALAPPDATA) candidates.push(resolve(process.env.LOCALAPPDATA, "Programs", "Git", "bin", "bash.exe"));
  return candidates;
}

function resolveBash() {
  if (process.env.BASH_BIN) {
    const explicit = executable(process.env.BASH_BIN);
    if (!explicit) throw new Error(`BASH_BIN is not executable: ${process.env.BASH_BIN}`);
    return explicit;
  }
  if (process.platform !== "win32") return "bash";
  for (const candidate of windowsBashCandidates()) {
    const resolved = executable(candidate);
    if (resolved) return resolved;
  }
  throw new Error("Git Bash was not found; install Git for Windows or set BASH_BIN to bash.exe");
}

try {
  const interop = spawnSync(process.execPath, ["scripts/check-next-env-interop.mjs"], {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
    shell: false,
    windowsHide: true,
  });
  if (interop.error) throw interop.error;
  if (interop.signal) throw new Error(`next-env interop check ended by ${interop.signal}`);
  if (interop.status !== 0) process.exit(interop.status ?? 1);

  const bash = resolveBash();
  const execution = spawnSync(bash, ["scripts/test-deploy.sh"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      BASH_BIN: process.env.BASH_BIN || bash,
      ...(process.platform === "win32" && !process.env.MSYS ? { MSYS: "winsymlinks:nativestrict" } : {}),
    },
    stdio: "inherit",
    shell: false,
    windowsHide: true,
  });
  if (execution.error) throw execution.error;
  if (execution.signal) throw new Error(`deploy tests ended by ${execution.signal}`);
  process.exit(execution.status ?? 1);
} catch (error) {
  console.error(`[test-deploy] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
