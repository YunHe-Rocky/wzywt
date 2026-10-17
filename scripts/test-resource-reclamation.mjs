import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";
import { tmpdir } from "node:os";
import { ResourceGovernor } from "../src/lib/resource-governor.ts";
import { withRequestCapacity } from "../src/lib/request-capacity.ts";
import { ResourceScheduler } from "../src/features/resource-scheduler/server/scheduler.ts";
import { resourceMemoryBudget, readResourceSettings } from "../src/core/resource-settings.ts";
import { TeamBalancingPool } from "../src/features/tournaments/server/team-balancing-pool.ts";

process.env.DATABASE_URL = "";
process.env.RESOURCE_GOVERNOR_ENABLED = "1";
process.env.RESOURCE_RECYCLE_SECONDS = "0";
const MiB = 1_048_576;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const healthyCapacity = () => ({ total: 4_096 * MiB, used: 1_024 * MiB, available: 3_072 * MiB,
  hostTotal: 4_096 * MiB, hostAvailable: 3_072 * MiB, source: "host" });
function fixture({ recycle = false } = {}) {
  let now = 1_000_000, rss = 32 * MiB, signals = 0;
  process.env.RESOURCE_WEB_MEMORY_MB = "128";
  process.env.RESOURCE_RECYCLE_SECONDS = recycle ? "180" : "0";
  const governor = new ResourceGovernor({ capacity: healthyCapacity, now: () => now,
    memory: () => ({ rss, heapTotal: rss, heapUsed: rss / 2, external: 0, arrayBuffers: 0 }),
    terminate: () => { signals++; } });
  governor.start("web");
  return { governor, advance(ms, high = false) { now += ms; if (high) rss = 128 * MiB; governor.refresh(); }, signals: () => signals };
}

test("failed first loads and untouched deferred user entries leave no retained entries after lease release", async () => {
  const scheduler = new ResourceScheduler({ autoSweep: false, maxActiveLeases: 2 });
  scheduler.registerResource({ name: "private", scope: "user", maxAgeMs: 1_000, idleTtlMs: 60_000,
    async loader() { throw Error("fixture load failed"); } });
  scheduler.registerPage({ name: "failed", requiresAuth: true, resources: [{ name: "private", mode: "immediate" }] });
  scheduler.registerPage({ name: "deferred", requiresAuth: true, resources: [{ name: "private", mode: "deferred" }] });
  for (let user = 1; user <= 1_000; user++) await assert.rejects(scheduler.acquirePage("failed", user), /fixture load failed/);
  const lease = await scheduler.acquirePage("deferred", 1_001);
  scheduler.releaseLease(lease.lease.id, { userId: 1_001 });
  await scheduler.sweep(true);
  assert.equal(scheduler.snapshots().leases.length, 0);
  assert.equal(scheduler.entries.size, 0);
  assert.equal(scheduler.snapshots().resources[0].loadErrors, 1_000);
  scheduler.close();
});

test("a failed disposer keeps its own value but does not block other idle resources or new leases", async () => {
  const scheduler = new ResourceScheduler({ autoSweep: false });
  for (const name of ["broken", "good"]) {
    scheduler.registerResource({ name, scope: "public", maxAgeMs: 1_000, idleTtlMs: 0,
      async loader() { return { data: name, version: "1" }; },
      dispose() { if (name === "broken") throw Error("disposal failed"); } });
    scheduler.registerPage({ name, requiresAuth: false, resources: [{ name, mode: "immediate" }] });
    const lease = await scheduler.acquirePage(name, null); scheduler.releaseLease(lease.lease.id, null);
  }
  const result = await scheduler.sweep(true);
  assert.equal(result.failedDisposals, 1); assert.equal(result.evicted, 1);
  const lease = await scheduler.acquirePage("good", null);
  assert.equal(lease.immediate.good.data, "good"); scheduler.close();
});

test("subscription saturation leaves ordinary API capacity available", async () => {
  const { governor } = fixture();
  const watch = withRequestCapacity(async () => new Response(new ReadableStream({ start() {} })), governor);
  const ordinary = withRequestCapacity(async () => Response.json({ ok: true }), governor);
  const streams = [];
  try {
    for (let index = 0; index < 8; index++) streams.push(await watch(new Request("http://localhost/api/heroes/watch")));
    assert.ok(streams.every(response => response.status === 200));
    const full = await watch(new Request("http://localhost/api/heroes/watch"));
    assert.equal(full.status, 503);
    const response = await ordinary(new Request("http://localhost/api/heroes"));
    assert.equal(response.status, 200); await response.arrayBuffer();
    assert.equal(governor.snapshot().ordinaryRequests, 0);
    assert.equal(governor.snapshot().subscriptionRequests, 8);
  } finally { await Promise.all(streams.map(response => response.body.cancel())); governor.stop(); }
  assert.equal(governor.snapshot().activeRequests, 0);
});

test("pressure retires subscriptions and retains slots until underlying cancellation settles", async () => {
  const context = fixture();
  let finishCancellation;
  const watch = withRequestCapacity(async () => new Response(new ReadableStream({
    cancel() { return new Promise(resolve => { finishCancellation = resolve; }); },
  })), context.governor);
  const response = await watch(new Request("http://localhost/api/heroes/watch"));
  context.advance(2_000, true);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(context.governor.snapshot().subscriptionRequests, 1);
  assert.ok(finishCancellation); finishCancellation();
  await response.arrayBuffer(); await sleep(1);
  assert.equal(context.governor.snapshot().subscriptionRequests, 0);
  context.governor.stop();
});

test("sustained pressure drains new work, then recycles once when ordinary requests finish", async () => {
  const context = fixture({ recycle: true });
  const release = context.governor.acquireRequest();
  context.advance(2_000, true); context.advance(181_000);
  assert.equal(context.governor.isDraining(), true); assert.equal(context.signals(), 0);
  assert.equal(context.governor.admit().allowed, false);
  assert.equal(context.governor.acquireRequest(), null);
  await assert.rejects(context.governor.run("new", async () => 1), /PROCESS_DRAINING/);
  release(); context.advance(2_000); context.advance(2_000);
  assert.equal(context.signals(), 1); context.governor.stop();
});

test("drain deadline requests graceful shutdown without falsely releasing a stuck request", () => {
  const context = fixture({ recycle: true });
  const release = context.governor.acquireRequest();
  context.advance(2_000, true); context.advance(181_000); context.advance(31_000);
  assert.equal(context.signals(), 1);
  assert.equal(context.governor.snapshot().ordinaryRequests, 1);
  release(); context.governor.stop();
});

test("reclaim callbacks coalesce, report their result and recover after a callback failure", async () => {
  const { governor } = fixture();
  let release, calls = 0, following = 0;
  governor.onReclaim(async () => { calls++; await new Promise(resolve => { release = resolve; }); return { evicted: 2 }; }, "fixture-cache");
  governor.onReclaim(() => { throw Error("fixture failure"); }, "broken-cache");
  governor.onReclaim(() => { following++; }, "following-cache");
  const first = governor.reclaimIdle(), second = governor.reclaimIdle();
  await Promise.resolve(); assert.equal(calls, 1); release(); await Promise.all([first, second]);
  assert.equal(following, 1); governor.stop();
});

test("native cgroup PM2 restart boundary stays above the shared governor soft budget", () => {
  const nativeRequire = createRequire(resolve("ecosystem.config.js"));
  const result = { exports: {} };
  vm.runInNewContext(readFileSync("ecosystem.config.js", "utf8"), {
    __dirname: resolve("."), module: result, exports: result.exports,
    process: { env: { APP_DIR: resolve(".") }, constrainedMemory: () => 1_024 * MiB },
    require(name) { if (name === "node:os") return { totalmem: () => 4_096 * MiB };
      if (name === "node:fs") return { existsSync: () => false }; return nativeRequire(name); },
  });
  for (const [index, role] of ["web", "cron"].entries()) {
    const budget = resourceMemoryBudget(1_024 * MiB, role);
    const pm2Limit = Number.parseInt(result.exports.apps[index].max_memory_restart) * MiB;
    assert.ok(pm2Limit >= budget.restartBytes && pm2Limit > budget.softBytes);
  }
  assert.equal(resourceMemoryBudget(1_024 * MiB, "web", 0, "docker").softBytes, Math.floor(1_024 * MiB * 0.85));
  assert.equal(resourceMemoryBudget(1_024 * MiB, "web", 2_048).softBytes, Math.floor(1_024 * MiB * 0.85));
  assert.throws(() => readResourceSettings({ SPLIT_WORKER_HEAP_MB: "2" }), /SPLIT_WORKER_HEAP_MB/);
});

test("PM2 loads resource and worker overrides from the release env instead of dropping them through the deployment whitelist", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "wzywt-pm2-resource-"));
  const nativeRequire = createRequire(resolve("ecosystem.config.js"));
  try {
    writeFileSync(resolve(directory, ".env"), "RESOURCE_WEB_MEMORY_MB=300\nRESOURCE_SUBSCRIPTION_CONCURRENCY=2\nSPLIT_WORKER_HEAP_MB=96\n");
    const result = { exports: {} };
    vm.runInNewContext(readFileSync("ecosystem.config.js", "utf8"), {
      __dirname: resolve("."), module: result, exports: result.exports,
      process: { env: { APP_DIR: directory }, constrainedMemory: () => 1_024 * MiB },
      require(name) { if (name === "node:os") return { totalmem: () => 4_096 * MiB }; return nativeRequire(name); },
    });
    for (const app of result.exports.apps) {
      assert.equal(app.env.RESOURCE_WEB_MEMORY_MB, "300");
      assert.equal(app.env.RESOURCE_SUBSCRIPTION_CONCURRENCY, "2");
      assert.equal(app.env.SPLIT_WORKER_HEAP_MB, "96");
      assert.equal(app.env.APP_RUNTIME, "native");
    }
    assert.equal(result.exports.apps[0].max_memory_restart, "360M");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("real split workers are created lazily, spared while busy, retired idle and rebuilt on demand", async () => {
  const pool = new TeamBalancingPool();
  try {
    assert.equal(pool.slots.length, 0);
    const pending = pool.run([]);
    assert.equal((await pool.reclaimIdle()).workersRetired, 0);
    assert.equal(await pending, null);
    const retired = await pool.reclaimIdle();
    assert.ok(retired.workersRetired > 0); assert.equal(pool.slots.length, 0);
    assert.equal(pool.terminating.size, 0);
    assert.equal(await pool.run([]), null);
    const slot = pool.slots[0];
    assert.equal(slot.worker.resourceLimits.maxOldGenerationSizeMb, 64);
    slot.idleSince = Date.now() - 61_000;
    assert.equal((await pool.reclaimIdle(false)).workersRetired, 1);
  } finally { await pool.close(); }
});

test("a failed worker termination retains capacity until actual exit instead of creating a second pool", async () => {
  const original = process.env.SPLIT_WORKER_CONCURRENCY;
  process.env.SPLIT_WORKER_CONCURRENCY = "1";
  const pool = new TeamBalancingPool();
  if (original === undefined) delete process.env.SPLIT_WORKER_CONCURRENCY; else process.env.SPLIT_WORKER_CONCURRENCY = original;
  let worker, terminate;
  try {
    assert.equal(await pool.run([]), null);
    worker = pool.slots[0].worker; terminate = worker.terminate.bind(worker);
    worker.terminate = async () => { throw Error("fixture terminate failure"); };
    assert.equal((await pool.reclaimIdle()).workersRetired, 0);
    assert.equal(pool.terminating.size, 1);
    const waiting = pool.run([]);
    assert.equal(pool.slots.length, 0, "failed termination must still consume the only slot");
    worker.terminate = terminate;
    await terminate();
    assert.equal(await waiting, null);
    assert.equal(pool.terminating.size, 0);
  } finally { if (worker && terminate) { worker.terminate = terminate; await terminate(); } await pool.close(); }
});
