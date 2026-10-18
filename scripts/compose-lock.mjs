import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export function acquireComposeLock(daemon, project, action, base = join(tmpdir(), "wzywt-compose-locks")) {
  if (!daemon || !project) throw new Error("Docker daemon and Compose project identity are required for locking");
  const identity = createHash("sha256").update(JSON.stringify([daemon, project])).digest("hex");
  const directory = join(base, identity);
  mkdirSync(base, { recursive: true });
  try { mkdirSync(directory); }
  catch (error) { if (error.code === "EEXIST") throw new Error(`Another operation holds ${directory}; inspect owner.json and verify the process before manual removal`); throw error; }
  try { writeFileSync(join(directory, "owner.json"), JSON.stringify({ pid: process.pid, project, action, startedAt: new Date().toISOString() }), { flag: "wx", mode: 0o600 }); }
  catch (error) { rmdirSync(directory); throw error; }
  return () => { unlinkSync(join(directory, "owner.json")); rmdirSync(directory); };
}
