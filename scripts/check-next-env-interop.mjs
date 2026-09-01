import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const productionLoaders = [
  "scripts/db-backup.mjs",
  "scripts/sync-heroes.ts",
  "src/features/cron/load-env.ts",
];

const nextEnv = createRequire(import.meta.url)("@next/env");
assert.equal(typeof nextEnv.loadEnvConfig, "function", "@next/env must expose loadEnvConfig through require");

for (const relativePath of productionLoaders) {
  const content = readFileSync(resolve(repoRoot, relativePath), "utf8");
  assert.doesNotMatch(
    content,
    /import\s*\{[^}]*\bloadEnvConfig\b[^}]*\}\s*from\s*["']@next\/env["']/,
    `${relativePath} must not use a named ESM import from CommonJS @next/env`,
  );
}

const backupSource = readFileSync(resolve(repoRoot, "scripts/db-backup.mjs"), "utf8");
for (const option of [
  "--single-transaction",
  "--quick",
  "--skip-lock-tables",
  "--set-gtid-purged=OFF",
  "--no-tablespaces",
]) {
  assert.match(backupSource, new RegExp(`^[ \\t]*["']${option}["'],?$`, "m"), `backup must include ${option}`);
}

console.log("[next-env-interop] PASS");
