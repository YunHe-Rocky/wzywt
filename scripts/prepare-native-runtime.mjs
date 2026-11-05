import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const buildCaches = [".next/cache/webpack", ".next/cache/swc"];
const runtimeFiles = [
  ".next/BUILD_ID", ".next/required-server-files.json", "prisma/schema.prisma",
  "scripts/cron.ts", "scripts/runtime-preload.mjs", "src/features/cron/load-env.ts", "tsconfig.json",
  ".runtime-workers/workers/team-balancing-worker.js", ".runtime-workers/core/team-balancing/search.js",
  ".runtime-workers/core/team-balancing/metrics.js", ".runtime-workers/core/team-balancing/types.js",
  ".runtime-workers/core/game/constants.js",
];

function inside(root, path) {
  const location = relative(root, path);
  return location !== ".." && !location.startsWith(`..${sep}`) && !isAbsolute(location);
}

function ownedPath(root, path) {
  if (!inside(root, path) || lstatSync(path).isSymbolicLink() || realpathSync(path) !== resolve(path)) {
    throw new Error(`Runtime preparation refuses a symlink or escaped path: ${path}`);
  }
  return path;
}

function treeBytes(path) {
  const info = lstatSync(path);
  if (info.isSymbolicLink()) return 0;
  return info.isDirectory() ? readdirSync(path).reduce((sum, name) => sum + treeBytes(resolve(path, name)), 0) : info.size;
}

export function verifyRuntimeFiles(release) {
  const required = JSON.parse(readFileSync(ownedPath(release, resolve(release, ".next/required-server-files.json")), "utf8"));
  if (!Array.isArray(required.files) || !required.files.length) throw new Error("Next runtime file manifest is empty");
  for (const name of [...runtimeFiles, ...required.files]) {
    if (typeof name !== "string" || isAbsolute(name)) throw new Error("Invalid runtime file manifest path");
    const path = ownedPath(release, resolve(release, name));
    if (!lstatSync(path).isFile() || !lstatSync(path).size) throw new Error(`Runtime file is missing or empty: ${name}`);
  }
  for (const name of [".next/server", ".next/static", "node_modules", "prisma/migrations"]) {
    if (!lstatSync(ownedPath(release, resolve(release, name))).isDirectory()) throw new Error(`Runtime directory is missing: ${name}`);
  }
}

export function verifyRuntimeDependencies(release) {
  const manifest = JSON.parse(readFileSync(resolve(release, "package.json"), "utf8"));
  const dependencies = manifest.dependencies || {};
  for (const name of ["next", "tsx", "prisma", "@prisma/client", "sharp", "@next/env"]) {
    if (!dependencies[name]) throw new Error(`Runtime dependency must be in dependencies: ${name}`);
  }
  const require = createRequire(resolve(release, "package.json"));
  const modules = resolve(release, "node_modules");
  for (const name of Object.keys(dependencies)) {
    if (!inside(modules, realpathSync(require.resolve(name)))) throw new Error(`Runtime dependency resolved outside this release: ${name}`);
  }
  for (const entry of ["next/dist/bin/next", "prisma/build/index.js", "tsx/cjs/api"]) {
    if (!inside(modules, realpathSync(require.resolve(entry)))) throw new Error(`Runtime entry resolved outside this release: ${entry}`);
  }
}

/** Called only for the newly built candidate, before deploy.sh stops writers. */
export function prepareNativeRuntime({ release, releasesRoot, currentRelease, npm }, { execute = execFileSync, log = console.log } = {}) {
  if (![release, releasesRoot, npm].every(value => typeof value === "string" && isAbsolute(value))) throw new Error("Runtime preparation requires absolute release, releases and npm paths");
  release = resolve(release); releasesRoot = resolve(releasesRoot);
  if (dirname(release) !== releasesRoot || realpathSync(releasesRoot) !== releasesRoot) throw new Error("Runtime candidate must be a direct child of the releases directory");
  ownedPath(releasesRoot, release);
  if (currentRelease && currentRelease !== "-" && realpathSync(currentRelease) === release) throw new Error("Cannot prepare the active release");
  if ([".deploy-success.json", ".deploy-failed.json", ".deploy-migrate.log"].some(name => existsSync(resolve(release, name)))) throw new Error("Cannot prepare a previously activated or migrated release");
  verifyRuntimeFiles(release);
  // Resolve every target before mutation. Neither a cache nor a parent directory
  // may redirect deletion into another release or persistent storage.
  const caches = buildCaches.map(name => resolve(release, name)).filter(existsSync);
  for (const path of caches) {
    ownedPath(release, path);
    if (!lstatSync(path).isDirectory()) throw new Error(`Build cache is not a directory: ${path}`);
  }
  const modules = resolve(release, "node_modules");
  const beforeBytes = treeBytes(modules) + caches.reduce((sum, path) => sum + treeBytes(path), 0);
  const options = { cwd: release, env: { ...process.env, NODE_ENV: "production" }, stdio: "inherit", windowsHide: true };
  execute(npm, ["prune", "--omit=dev", "--include=optional", "--ignore-scripts", "--no-audit", "--no-fund"], options);
  verifyRuntimeDependencies(release);
  // npm's dependency reconciliation can remove generated Prisma files. Rebuild
  // only this client's generated code, without running arbitrary install hooks.
  execute(process.execPath, ["node_modules/prisma/build/index.js", "generate"], options);
  execute(process.execPath, ["--import", "tsx", "--input-type=commonjs", "-e", `
    const client = require('@prisma/client');
    if (!client.Prisma?.prismaVersion?.client || typeof client.PrismaClient !== 'function') throw new Error('Prisma client is not generated');
    if (!require('sharp').versions.vips) throw new Error('Sharp native runtime is unavailable');
    require('next/server');
    require('./src/features/cron/load-env.ts');
  `], options);
  for (const path of caches) {
    ownedPath(release, path);
    rmSync(path, { recursive: true });
  }
  verifyRuntimeFiles(release);
  const afterBytes = treeBytes(modules);
  log(`[native-runtime] production dependencies and runtime files verified; reclaimed ${Math.max(0, beforeBytes - afterBytes)} bytes from candidate dependencies/build caches`);
  return { beforeBytes, afterBytes };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [release, releasesRoot, currentRelease, npm] = process.argv.slice(2);
  try { prepareNativeRuntime({ release, releasesRoot, currentRelease, npm }); }
  catch (error) { console.error(`[native-runtime] ${error.message}`); process.exitCode = 1; }
}
