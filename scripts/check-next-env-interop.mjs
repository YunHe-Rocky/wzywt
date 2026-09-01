import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const productionLoaders = [
  "scripts/db-backup.mjs",
  "scripts/sync-heroes.ts",
  "src/features/cron/load-env.ts",
];

assert.equal(typeof nextEnv, "object", "@next/env default export must be an object");
assert.equal(typeof nextEnv.loadEnvConfig, "function", "@next/env must expose loadEnvConfig");

for (const relativePath of productionLoaders) {
  const content = readFileSync(resolve(repoRoot, relativePath), "utf8");
  assert.doesNotMatch(
    content,
    /import\s*\{[^}]*\bloadEnvConfig\b[^}]*\}\s*from\s*["']@next\/env["']/,
    `${relativePath} must not use a named ESM import from CommonJS @next/env`,
  );
}
