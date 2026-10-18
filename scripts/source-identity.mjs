import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export function sourceIdentity(root) {
  const hash = createHash("sha256");
  const scan = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (["__pycache__", ".venv", ".venv-ocr", "node_modules", "models", ".cache"].includes(entry.name) || entry.isSymbolicLink()) continue;
      const file = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        if (["public/heroes/images", "public/heroes/skins"].includes(relative(root, file).replaceAll("\\", "/"))) continue;
        scan(file);
      }
      else if (entry.isFile()) { const data = readFileSync(file); hash.update(`${relative(root, file).replaceAll("\\", "/")}\0${data.length}\0`); hash.update(data); }
    }
  };
  for (const name of ["src", "prisma", "docker", "scripts", "services", "public", "data/announcements"]) if (existsSync(resolve(root, name))) scan(resolve(root, name));
  for (const name of ["data/changelog.json", "package.json", "package-lock.json", "Dockerfile", "compose.yaml", "compose.oss.yaml", "next.config.js", "tsconfig.json", "tsconfig.workers.json"]) {
    if (existsSync(resolve(root, name))) { hash.update(name + "\0"); hash.update(readFileSync(resolve(root, name))); }
  }
  const commit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", windowsHide: true });
  return { sourceSha256: hash.digest("hex"), gitSha: commit.status === 0 ? commit.stdout.trim() : null,
    lockSha256: existsSync(resolve(root, "package-lock.json")) ? createHash("sha256").update(readFileSync(resolve(root, "package-lock.json"))).digest("hex") : null };
}
