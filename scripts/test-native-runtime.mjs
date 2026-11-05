import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, test } from "node:test";
import { prepareNativeRuntime } from "./prepare-native-runtime.mjs";

const roots = [];
test("runtime preparation CLI does not silently skip when invoked through current", t => {
  const root = mkdtempSync(join(tmpdir(), "wzywt-native-runtime-")); roots.push(root);
  const current = join(root, "current");
  try { symlinkSync(import.meta.dirname, current, process.platform === "win32" ? "junction" : "dir"); }
  catch (error) { if (["EPERM", "EACCES"].includes(error.code)) { t.skip("symlink permission unavailable"); return; } throw error; }
  for (const flags of [[], ["--preserve-symlinks-main"]]) {
    const result = spawnSync(process.execPath, [...flags, join(current, "prepare-native-runtime.mjs")], { encoding: "utf8", windowsHide: true, timeout: 10000 });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Runtime preparation requires absolute/);
  }
});
afterEach(() => {
  for (const root of roots.splice(0)) {
    assert.equal(dirname(root), tmpdir());
    assert.match(root.split(/[\\/]/).at(-1), /^wzywt-native-runtime-/);
    rmSync(root, { recursive: true, force: true });
  }
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "wzywt-native-runtime-")); roots.push(root);
  const releasesRoot = join(root, "releases"), release = join(releasesRoot, "candidate"), currentRelease = join(releasesRoot, "current");
  mkdirSync(currentRelease, { recursive: true });
  writeFileSync(join(currentRelease, "marker"), "running version");
  const put = (file, content = "generated content") => { const path = join(release, file); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); };
  const dependencies = Object.fromEntries(["next", "tsx", "prisma", "@prisma/client", "sharp", "@next/env"].map(name => [name, "1.0.0"]));
  put("package.json", JSON.stringify({ dependencies, devDependencies: { "dev-only": "1.0.0" } }));
  for (const name of [...Object.keys(dependencies), "dev-only"]) {
    put(`node_modules/${name}/package.json`, JSON.stringify({ name, main: "index.js" }));
    put(`node_modules/${name}/index.js`, "module.exports = {};");
  }
  for (const entry of ["next/dist/bin/next.js", "prisma/build/index.js", "tsx/cjs/api.js"]) put(`node_modules/${entry}`, "module.exports = {};");
  for (const file of [".next/BUILD_ID", ".next/server/page.js", ".next/static/asset.js", "prisma/schema.prisma", "prisma/migrations/test/migration.sql", "scripts/cron.ts", "scripts/runtime-preload.mjs", "src/features/cron/load-env.ts", "tsconfig.json",
    ".runtime-workers/workers/team-balancing-worker.js", ".runtime-workers/core/team-balancing/search.js", ".runtime-workers/core/team-balancing/metrics.js", ".runtime-workers/core/team-balancing/types.js", ".runtime-workers/core/game/constants.js",
    ".next/cache/webpack/build.bin", ".next/cache/swc/build.bin", ".next/cache/images/keep", ".next/cache/fetch-cache/keep", "public/heroes/keep", ".env"]) put(file);
  put(".next/required-server-files.json", JSON.stringify({ files: [".next/BUILD_ID", ".next/server/page.js"] }));
  return { release, releasesRoot, currentRelease, npm: process.execPath, put };
}

test("new candidate retains runtime data and production dependencies while pruning development files and build caches", () => {
  const config = fixture(), calls = [];
  const result = prepareNativeRuntime(config, { log() {}, execute(command, args, options) {
    calls.push(args);
    assert.equal(options.cwd, config.release);
    assert.equal(options.env.NODE_ENV, "production");
    if (args[0] === "prune") rmSync(join(config.release, "node_modules/dev-only"), { recursive: true });
  } });
  assert.deepEqual(calls[0], ["prune", "--omit=dev", "--include=optional", "--ignore-scripts", "--no-audit", "--no-fund"]);
  assert.deepEqual(calls[1], ["node_modules/prisma/build/index.js", "generate"]);
  assert.deepEqual(calls[2].slice(0, 4), ["--import", "tsx", "--input-type=commonjs", "-e"]);
  assert.ok(result.beforeBytes > result.afterBytes);
  for (const path of [".next/cache/webpack", ".next/cache/swc", "node_modules/dev-only"]) assert.equal(existsSync(join(config.release, path)), false);
  for (const path of [".next/cache/images/keep", ".next/cache/fetch-cache/keep", "public/heroes/keep", ".env", ".next/server/page.js", ".runtime-workers/workers/team-balancing-worker.js", "node_modules/tsx/index.js", "prisma/schema.prisma"]) assert.ok(existsSync(join(config.release, path)), path);
  assert.equal(readFileSync(join(config.currentRelease, "marker"), "utf8"), "running version");
});

test("incomplete build fails before pruning any dependencies", () => {
  const config = fixture();
  rmSync(join(config.release, ".runtime-workers/core/team-balancing/search.js"));
  assert.throws(() => prepareNativeRuntime(config, { execute() { assert.fail("prune must not run"); } }), /ENOENT/);
  assert.ok(existsSync(join(config.release, "node_modules/dev-only")));
});

for (const stage of ["prune", "generate", "probe"]) {
  test(`${stage} failure prevents marking runtime preparation successful`, () => {
    const config = fixture();
    assert.throws(() => prepareNativeRuntime(config, { log() { assert.fail("success must not be reported"); }, execute(command, args) {
      if ((stage === "prune" && args[0] === "prune") || (stage === "generate" && args[1] === "generate") || (stage === "probe" && args[0] === "--import")) throw new Error(`failed ${stage}`);
    } }), new RegExp(`failed ${stage}`));
    assert.ok(existsSync(join(config.release, ".next/cache/webpack/build.bin")));
    assert.equal(readFileSync(join(config.currentRelease, "marker"), "utf8"), "running version");
  });
}

test("a mistakenly removed production dependency aborts preparation", () => {
  const config = fixture();
  assert.throws(() => prepareNativeRuntime(config, { execute(command, args) {
    if (args[0] === "prune") rmSync(join(config.release, "node_modules/sharp"), { recursive: true });
  } }), /sharp/);
  assert.ok(existsSync(join(config.release, ".next/cache/swc/build.bin")));
});

test("active and previously deployed releases cannot be pruned", () => {
  const config = fixture(), options = { execute() { assert.fail("must not execute npm"); } };
  assert.throws(() => prepareNativeRuntime({ ...config, currentRelease: config.release }, options), /active release/);
  config.put(".deploy-success.json", "{}");
  assert.throws(() => prepareNativeRuntime(config, options), /previously activated/);
});

test("cache symlinks cannot redirect pruning to persistent data", t => {
  const config = fixture();
  const cache = join(config.release, ".next/cache/webpack");
  rmSync(cache, { recursive: true });
  try { symlinkSync(config.currentRelease, cache, process.platform === "win32" ? "junction" : "dir"); }
  catch (error) { if (["EPERM", "EACCES"].includes(error.code)) { t.skip("symlink permission unavailable"); return; } throw error; }
  assert.throws(() => prepareNativeRuntime(config, { execute() { assert.fail("must reject before pruning"); } }), /symlink|escaped/);
  assert.equal(readFileSync(join(config.currentRelease, "marker"), "utf8"), "running version");
});

test("runtime manifests cannot refer outside the candidate", () => {
  const config = fixture();
  config.put(".next/required-server-files.json", JSON.stringify({ files: ["../current/marker"] }));
  assert.throws(() => prepareNativeRuntime(config, { execute() { assert.fail("must reject before pruning"); } }), /escaped/);
});
