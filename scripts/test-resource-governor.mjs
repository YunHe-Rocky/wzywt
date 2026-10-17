import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile, mkdir, symlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { AdaptiveResourcePolicy, AdmissionBucket, externalRequestCost } from "../src/core/resource-policy.ts";
import { memoryCapacity } from "../src/lib/resource-sample.ts";
import { ResourceGovernor, resourceGovernor } from "../src/lib/resource-governor.ts";
import { acquireResourceLease } from "../src/lib/resource-lease.ts";
import { resourceWorkContext } from "../src/lib/resource-context.ts";
import { runWithTaskWriteFence, assertTaskWriteAllowed } from "../src/lib/task-write-fence.ts";
import { withRequestCapacity } from "../src/lib/request-capacity.ts";
import { redactRuntimeText, runtimeLog } from "../src/lib/runtime-log.ts";
import { streamResponseToFile } from "../src/lib/stream-download.ts";
import { validLocalHeartbeat, watchChild } from "./runtime-liveness.mjs";
import { recoveryDecision, rotateLog } from "./runtime-watchdog.mjs";
import { serviceFiles, resolveService } from "./runtime-service.mjs";
import { ResourceScheduler } from "../src/features/resource-scheduler/server/scheduler.ts";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

process.env.RESOURCE_GOVERNOR_ENABLED = "1";
process.env.RESOURCE_RECYCLE_SECONDS = "0";
process.env.DATABASE_URL = "";
const healthy = { memoryRatio: 0.3, cpuRatio: 0.1, eventLoopLagMs: 1, externalDemand: 0, peerCritical: false, coordinationHealthy: true };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const healthyCapacity = () => ({ total: 4 * 1024 ** 3, available: 3 * 1024 ** 3, used: 1024 ** 3,
  source: "host", hostTotal: 4 * 1024 ** 3, hostAvailable: 3 * 1024 ** 3 });
resourceGovernor.runtime.capacity = healthyCapacity;

test("pressure cuts supply immediately and restores it gradually without oscillation", () => {
  const policy = new AdaptiveResourcePolicy(30_000, 4);
  assert.equal(policy.evaluate(healthy, 0).internalConcurrency, 4);
  const critical = policy.evaluate({ ...healthy, memoryRatio: 0.97 }, 1);
  assert.equal(critical.level, "critical"); assert.equal(critical.internalConcurrency, 0);
  assert.equal(policy.evaluate(healthy, 1_000).level, "critical");
  assert.equal(policy.evaluate(healthy, 31_000).level, "hot");
  assert.equal(policy.evaluate(healthy, 61_000).level, "warm");
  assert.equal(policy.evaluate(healthy, 91_000).level, "normal");
});

test("external demand takes priority while internal work retains progress outside critical memory", () => {
  const busy = new AdaptiveResourcePolicy().evaluate({ ...healthy, externalDemand: 0.9 }, 0);
  assert.equal(busy.reason, "external-priority");
  assert.equal(busy.externalScale, 1, "external traffic gets the spare capacity before background work");
  assert.ok(busy.internalConcurrency > 0 && busy.internalConcurrency < 4);
  assert.equal(new AdaptiveResourcePolicy().evaluate({ ...healthy, coordinationHealthy: false }, 0).level, "warm");
  assert.equal(new AdaptiveResourcePolicy().evaluate({ ...healthy, cpuRatio: 0.99 }, 0).level, "hot");
});

test("admission has bounded bursts, weighted work and no free refill on a pressure change", () => {
  assert.equal(externalRequestCost("/api/combat-posts", "POST", "multipart/form-data; boundary=fixture"), 4);
  assert.equal(externalRequestCost("/api/matches/1/recognitions"), 4);
  assert.equal(externalRequestCost("/api/matches/1/screenshots/OUTPUT"), 4);
  assert.equal(externalRequestCost("/api/heroes"), 1);
  const bucket = new AdmissionBucket();
  assert.equal(bucket.take(0, 2, 4, 4), true);
  assert.equal(bucket.take(0, 2, 4), false);
  assert.equal(bucket.take(250, 1, 1), false);
  assert.equal(bucket.take(1_000, 1, 1), true);
  assert.equal(bucket.take(1_000, 30, 30), false);
});

test("nested cgroup limits and reclaimable cache are reflected in available capacity", () => {
  const files = {
    "/proc/meminfo": "MemAvailable: 99999999 kB\n",
    "/proc/self/cgroup": "0::/team/app\n",
    "/sys/fs/cgroup/memory.max": "max", "/sys/fs/cgroup/memory.current": "1",
    "/sys/fs/cgroup/team/memory.max": String(512 * 1024 ** 2),
    "/sys/fs/cgroup/team/memory.current": String(400 * 1024 ** 2),
    "/sys/fs/cgroup/team/memory.stat": `inactive_file ${100 * 1024 ** 2}\n`,
    "/sys/fs/cgroup/team/app/memory.max": String(1024 ** 3),
    "/sys/fs/cgroup/team/app/memory.current": String(100 * 1024 ** 2),
  };
  const capacity = memoryCapacity(path => { if (!(path in files)) throw Error("missing"); return files[path]; });
  assert.equal(capacity.total, 512 * 1024 ** 2);
  assert.equal(capacity.available, 212 * 1024 ** 2);
  assert.equal(capacity.source, "cgroup-v2");
});

test("internal jobs coalesce, queue in order and release their references after success/failure", async () => {
  const governor = new ResourceGovernor({ capacity: healthyCapacity });
  let releaseFirst;
  const events = [];
  const first = governor.run("sync:daily", async () => { events.push(1); await new Promise(resolve => { releaseFirst = resolve; }); return 7; });
  assert.equal(governor.run("sync:initial", async () => 99), first);
  const second = governor.run("other", async () => { events.push(2); throw Error("expected failure"); });
  const failed = assert.rejects(second, /expected failure/);
  await sleep(20);
  assert.deepEqual(events, [1]); assert.equal(governor.snapshot().activeJobs, 1);
  releaseFirst(); assert.equal(await first, 7); await failed;
  assert.deepEqual(events, [1, 2]);
  assert.equal(governor.snapshot().activeJobs, 0); assert.equal(governor.snapshot().queuedJobs, 0);
  governor.stop();
});

test("shutdown cancels pending jobs without pretending an active job has finished", async () => {
  const governor = new ResourceGovernor({ capacity: healthyCapacity });
  let release;
  const first = governor.run("active", async () => { await new Promise(resolve => { release = resolve; }); });
  const second = governor.run("pending", async () => assert.fail("queued work started during shutdown"));
  const firstRejected = assert.rejects(first, /PROCESS_SHUTDOWN/);
  const secondRejected = assert.rejects(second, /PROCESS_SHUTDOWN/);
  await sleep(15); governor.stop();
  assert.equal(governor.snapshot().activeJobs, 1);
  release(); await Promise.all([firstRejected, secondRejected]);
  assert.equal(governor.snapshot().queuedJobs, 0);
});

test("shared heavy-job lease excludes a second process and fences expiry before its timer runs", async () => {
  let row = null;
  const table = {
    async findUnique() { return row ? { value: row } : null; },
    async create({ data }) { if (row) throw Object.assign(Error("collision"), { code: "P2002" }); row = data.value; },
    async updateMany({ where, data }) { if (row !== where.value) return { count: 0 }; row = data.value; return { count: 1 }; },
    async deleteMany({ where }) { if (row === where.value) row = null; },
  };
  const root = new AbortController();
  const lease = await acquireResourceLease(table, root.signal);
  assert.ok(lease); assert.equal(await acquireResourceLease(table, root.signal), null);
  const originalNow = Date.now;
  const started = originalNow();
  try {
    Date.now = () => started + 31_000;
    await resourceWorkContext.run({ id: "test", name: "sync", signal: lease.signal, assertLease: () => lease.assert() }, async () => {
      await runWithTaskWriteFence({ name: "hero-pipeline", token: "test", expiresAt: started + 100_000, signal: root.signal }, async () => {
        assert.throws(() => assertTaskWriteAllowed(), /RESOURCE_LEASE_EXPIRED/);
      });
    });
  } finally { Date.now = originalNow; await lease.release(); }
  assert.equal(row, null);
});

test("streaming responses hold their admission slot until cancellation", async () => {
  process.env.RESOURCE_EXTERNAL_CONCURRENCY = "1";
  const guarded = withRequestCapacity(async () => new Response(new ReadableStream({ start() {} })));
  const first = await guarded();
  assert.equal((await guarded()).status, 503);
  await first.body.cancel();
  const third = await guarded(); assert.equal(third.status, 200); await third.body.cancel();
  assert.equal(resourceGovernor.snapshot().activeRequests, 0);
  delete process.env.RESOURCE_EXTERNAL_CONCURRENCY;
});

test("handler exceptions and stream failures release external capacity", async () => {
  const bad = withRequestCapacity(async () => { throw Error("handler failure"); });
  await assert.rejects(bad(), /handler failure/);
  const stream = withRequestCapacity(async () => new Response(new ReadableStream({ pull(controller) { controller.error(Error("stream failure")); } })));
  await assert.rejects((await stream()).arrayBuffer(), /stream failure/);
  assert.equal(resourceGovernor.snapshot().activeRequests, 0);
});

test("HEAD requests cancel the GET body and release their slot", async () => {
  let cancelled = false;
  const handler = withRequestCapacity(async (_request) => new Response(new ReadableStream({ cancel() { cancelled = true; } })));
  const response = await handler(new Request("http://localhost/stream", { method: "HEAD" }));
  assert.equal(response.body, null); assert.equal(cancelled, true);
  assert.equal(resourceGovernor.snapshot().activeRequests, 0);
});

test("pressure eviction keeps active leases and serializes disposal against new acquisition", async () => {
  const scheduler = new ResourceScheduler({ autoSweep: false });
  let loads = 0, disposals = 0, releaseDisposal;
  scheduler.registerResource({ name: "test", scope: "public", maxAgeMs: 60_000, idleTtlMs: 60_000,
    async loader() { return { data: ++loads, version: String(loads) }; },
    async dispose() { disposals++; await new Promise(resolve => { releaseDisposal = resolve; }); },
  });
  scheduler.registerPage({ name: "test", requiresAuth: false, resources: [{ name: "test", mode: "immediate" }] });
  const lease = await scheduler.acquirePage("test", null);
  await scheduler.sweep(true); assert.equal(disposals, 0);
  scheduler.releaseLease(lease.lease.id, { userId: null });
  const reclaim = scheduler.sweep(true);
  const next = scheduler.acquirePage("test", null);
  await sleep(1); assert.equal(disposals, 1); assert.equal(loads, 1);
  releaseDisposal(); await reclaim; const replacement = await next;
  assert.equal(loads, 2); assert.equal(replacement.immediate.test.data, 2);
});

test("downloads enforce streaming byte limits and cancel the reader on write failure", async () => {
  const directory = await mkdtemp(join(tmpdir(), "wzywt-stream-"));
  try {
    const destination = join(directory, "image.tmp");
    const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2])); controller.enqueue(new Uint8Array([3, 4])); controller.close(); } }));
    await streamResponseToFile(response, destination, 4, 4);
    assert.deepEqual([...await readFile(destination)], [1, 2, 3, 4]);
    await assert.rejects(streamResponseToFile(new Response(new Uint8Array(5)), join(directory, "large"), 4), /DOWNLOAD_TOO_LARGE/);
    let cancelled = false;
    const bad = new Response(new ReadableStream({ cancel() { cancelled = true; } }));
    await assert.rejects(streamResponseToFile(bad, join(directory, "missing", "image"), 4));
    assert.equal(cancelled, true);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("structured errors redact credentials, bearer tokens, nested secrets and URL queries", () => {
  const text = redactRuntimeText('mysql://user:password@localhost/db token=abcdef Bearer abcdef "password": "hunter2" https://example.com/path?token=private');
  for (const value of ["hunter2", "abcdef", "private", "user:password"]) assert.ok(!text.includes(value), text);
  const original = console.error;
  let entry;
  console.error = value => { entry = JSON.parse(value); };
  try { runtimeLog("test.error", { error: new Error("password=hidden"), nested: { sessionSecret: "hidden" } }, "error"); }
  finally { console.error = original; }
  assert.ok(entry.timestamp && entry.pid && entry.bootId); assert.ok(entry.error.stack.length);
  assert.ok(!JSON.stringify(entry).includes("hidden"));
});

test("local heartbeat rejects an old PID, old release and future timestamps", () => {
  const options = { pid: 123, releaseId: "r1", startedAt: 100, now: 1_000 };
  const value = overrides => JSON.stringify({ version: 1, pid: 123, releaseId: "r1", timestamp: 900, ...overrides });
  assert.equal(validLocalHeartbeat(value({}), options), true);
  for (const change of [{ pid: 1 }, { releaseId: "r0" }, { timestamp: 99 }, { timestamp: 1_001 }]) assert.equal(validLocalHeartbeat(value(change), options), false);
});

test("Cron local liveness can advance while its database readiness write is blocked", async () => {
  const directory = await mkdtemp(join(tmpdir(), "wzywt-heartbeat-"));
  const previous = process.env.APP_HEARTBEAT_FILE;
  process.env.APP_HEARTBEAT_FILE = join(directory, "heartbeat");
  let resolveDatabase;
  const databaseWrite = new Promise(resolve => { resolveDatabase = resolve; });
  const fixtureModule = { exports: {} };
  const nativeRequire = createRequire(import.meta.url);
  const compiled = ts.transpileModule(readFileSync(resolve("src/features/cron/heartbeat.ts"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", compiled)(name => name === "@/lib/db"
    ? { prisma: { kvCache: { upsert: () => databaseWrite } } }
    : name === "@/lib/runtime-log" ? { runtimeBootId: "fixture", runtimeLog() {} } : nativeRequire(name), fixtureModule, fixtureModule.exports);
  try {
    const pending = fixtureModule.exports.recordCronHeartbeat();
    const initial = JSON.parse(await readFile(process.env.APP_HEARTBEAT_FILE, "utf8"));
    await sleep(5);
    fixtureModule.exports.recordLocalCronHeartbeat();
    const latest = JSON.parse(await readFile(process.env.APP_HEARTBEAT_FILE, "utf8"));
    assert.ok(latest.timestamp > initial.timestamp); assert.equal(latest.pid, process.pid);
    resolveDatabase(); await pending;
  } finally {
    if (previous === undefined) delete process.env.APP_HEARTBEAT_FILE; else process.env.APP_HEARTBEAT_FILE = previous;
    await rm(directory, { recursive: true, force: true });
  }
});

test("container watchdog waits for repeated liveness failure then enforces a finite shutdown", async () => {
  const signals = [];
  const events = [];
  const watcher = watchChild({ pid: 123, kill: signal => signals.push(signal) }, {
    role: "web", environment: {}, log: event => events.push(event), startupGraceMs: 0,
    intervalMs: 5, graceMs: 15, failures: 3, probe: async () => false,
  });
  await sleep(75); watcher.close();
  assert.deepEqual(signals, ["SIGTERM", "SIGKILL"]);
  assert.equal(events.filter(event => event === "supervisor.liveness_failed").length, 3);
  assert.equal(watcher.unhealthy(), true);
});

test("native watchdog restart budget has thresholds and cooldown", () => {
  assert.equal(recoveryDecision({ failures: 1 }, false, 100_000).restart, false);
  assert.equal(recoveryDecision({ failures: 2 }, false, 100_000).restart, true);
  assert.equal(recoveryDecision({ failures: 2, restarts: [99_000] }, false, 100_000).restart, false);
  assert.equal(recoveryDecision({ failures: 2, restarts: [1, 2, 3] }, false, 200_000).restart, false);
  assert.equal(recoveryDecision({ failures: 10 }, true, 100_000).failures, 0);
});

test("native log rotation retains evidence and refuses a path outside the PM2 home", async () => {
  const directory = await mkdtemp(join(tmpdir(), "wzywt-rotate-"));
  try {
    const log = join(directory, "pm2.log"); await writeFile(log, "original evidence");
    assert.equal(rotateLog(log, directory, 4), true);
    assert.equal(await readFile(log, "utf8"), ""); assert.equal(await readFile(`${log}.1`, "utf8"), "original evidence");
    assert.throws(() => rotateLog(resolve("package.json"), directory, 1), /escapes/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("systemd plan pins the dedicated PM2 home, toolchain, watchdog and selected app names", () => {
  const files = serviceFiles({ name: "wzywt-test", user: "deploy", current: "/srv/site/current", pm2Home: "/srv/site/pm2",
    pm2: "/opt/node/bin/pm2", node: "/opt/node/bin/node", configuration: "/srv/site/shared/service.json", webName: "site-web", cronName: "site-cron" });
  const unit = files["wzywt-test.service"];
  assert.ok(unit.includes("PM2_HOME=/srv/site/pm2")); assert.ok(unit.includes("resurrect"));
  assert.ok(unit.includes('reload "site-web" "site-cron"')); assert.ok(unit.includes("Restart="));
  assert.ok(files["wzywt-test-watchdog.timer"].includes("OnUnitActiveSec=30"));
  assert.throws(() => serviceFiles({ name: "bad\nunit", user: "deploy" }), /Invalid service/);
});

test("service planning honors a custom env file and refuses another project's saved processes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "wzywt-service-plan-"));
  try {
    const source = join(directory, "source"), base = join(directory, "runtime"), home = join(directory, "pm2");
    const target = join(base, "releases", "r1"), current = join(base, "current");
    await mkdir(source, { recursive: true }); await mkdir(join(target, "scripts"), { recursive: true }); await mkdir(home);
    await writeFile(join(source, "package.json"), JSON.stringify({ name: "site" }));
    await writeFile(join(target, "scripts/runtime-watchdog.mjs"), "// fixture\n");
    await symlink(target, current, "junction");
    const saved = ["site-web", "site-cron"].map(name => ({ name, pm_cwd: current }));
    await writeFile(join(home, "dump.pm2"), JSON.stringify(saved));
    const envFile = join(directory, "custom.env");
    await writeFile(envFile, `DEPLOY_BASE_DIR=${base}\nDEPLOY_PM2_HOME=${home}\nDEPLOY_RUN_USER=deploy\n`);
    const environment = { DEPLOY_PM2_BIN: process.execPath, DEPLOY_NODE_BIN: process.execPath };
    const config = resolveService(source, environment, envFile);
    assert.equal(config.pm2Home, home); assert.equal(config.current, current); assert.equal(config.user, "deploy");
    await writeFile(join(home, "dump.pm2"), JSON.stringify([...saved, { name: "other-project", pm_cwd: target }]));
    assert.throws(() => resolveService(source, environment, envFile), /dedicated PM2 home/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
