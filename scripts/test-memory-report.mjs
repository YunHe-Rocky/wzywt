import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, symlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { collectMemoryReport, formatMemoryReport, parseArguments, parseMeminfo, readLogTail } from "./memory-report.mjs";

test("CLI executes through a current directory symlink", t => {
  const f = fixture(t);
  const current = join(f.root, "current");
  try { symlinkSync(import.meta.dirname, current, process.platform === "win32" ? "junction" : "dir"); }
  catch (error) { if (["EPERM", "EACCES"].includes(error.code)) { t.skip("symlink permission unavailable"); return; } throw error; }
  for (const flags of [[], ["--preserve-symlinks-main"]]) {
    const result = spawnSync(process.execPath, [...flags, join(current, "memory-report.mjs"), "--pm2-home", f.root], { encoding: "utf8", windowsHide: true, timeout: 10000 });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Memory report \(read only/);
    assert.match(result.stdout, /NO VALID SAMPLES/);
  }
});

const MiB = 1024 * 1024;
const now = Date.parse("2026-11-05T00:00:00.000Z");
const bootA = "11111111-1111-4111-8111-111111111111";
const bootB = "22222222-2222-4222-8222-222222222222";
const sample = (offset, rss, more = {}) => ({ timestamp: new Date(now + offset).toISOString(), role: "web", pid: 100, bootId: bootA,
  event: "resource.sample", memory: { rss: rss * MiB, heapUsed: 50 * MiB, external: 10 * MiB, arrayBuffers: 5 * MiB }, ...more });
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "wzywt-memory-report-"));
  const logs = join(root, "logs"); mkdirSync(logs);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, logs, path: join(logs, "wangzhe-yanwutang-web-out.log"), options: parseArguments(["--pm2-home", root, "--minutes", "120"]) };
}
const collect = options => collectMemoryReport(options, { now, readMeminfo: () => "" });
const write = (path, rows) => writeFileSync(path, rows.map(row => JSON.stringify(row)).join("\n") + "\n");

test("restarts and reused PIDs have separate trends; rotations are deduplicated", t => {
  const f = fixture(t);
  const rows = [sample(-300000, 200), sample(-200000, 300, { event: "task.completed" }), sample(-100000, 80, { bootId: bootB }), sample(0, 90, { bootId: bootB })];
  write(f.path, rows); write(`${f.path}.1`, rows.slice(0, 2));
  const before = readFileSync(f.path);
  const report = collect(f.options);
  assert.equal(report.sampleCount, 4); assert.equal(report.groups.length, 2);
  assert.equal(report.groups[0].first.rss, 80 * MiB); assert.equal(report.groups[0].last.rss, 90 * MiB);
  assert.equal(report.groups[1].first.rss, 200 * MiB); assert.equal(report.groups[1].last.rss, 300 * MiB);
  assert.equal(report.groups[1].taskCompletedCount, 1);
  assert.deepEqual(readFileSync(f.path), before);
});

test("report copies only validated numbers and identities, not secrets or malformed records", t => {
  const f = fixture(t);
  const secret = "mysql://admin:PRIVATE_SECRET@database/prod";
  const valid = sample(0, 200, { message: secret, releaseId: secret, task: secret, password: secret });
  write(f.path, [valid, sample(0, 200, { bootId: secret }), sample(0, 200, { pid: secret }), sample(0, 200, { memory: { rss: secret } })]);
  writeFileSync(`${f.path}.1`, `not json ${secret}\n{"message":"${secret}"}\n`);
  const report = collect(f.options);
  assert.equal(report.sampleCount, 1);
  assert.ok(!JSON.stringify(report).includes(secret));
  assert.ok(!formatMemoryReport(report).includes(secret));
  assert.match(formatMemoryReport(report), /INSUFFICIENT HISTORY/);
});

test("window includes exact start and now, excludes earlier/future and mismatched roles", t => {
  const f = fixture(t);
  const start = -120 * 60000;
  write(f.path, [sample(start - 1, 900), sample(start, 100), sample(0, 200), sample(1, 999), sample(0, 400, { role: "cron" })]);
  const report = collect(f.options);
  assert.equal(report.sampleCount, 2); assert.equal(report.groups[0].min.rss, 100 * MiB); assert.equal(report.groups[0].max.rss, 200 * MiB);
});

test("large log tails are bounded and discard partial first records", t => {
  const f = fixture(t);
  writeFileSync(f.path, "x".repeat(3 * MiB) + "\n" + JSON.stringify(sample(0, 123)) + "\n");
  const tail = readLogTail(f.path);
  assert.equal(tail.bytesRead, 2 * MiB); assert.equal(tail.truncated, true); assert.ok(tail.text.startsWith("{"));
  const report = collect(f.options);
  assert.equal(report.files.truncated, 1); assert.equal(report.sampleCount, 1);
  assert.match(formatMemoryReport(report), /older history may be missing/);
});

test("sample storage and task completion output are capped", t => {
  const f = fixture(t);
  write(f.path, Array.from({ length: 7000 }, (_, index) => sample(-index, 100, { event: "task.completed" })));
  const report = collect(f.options);
  assert.equal(report.sampleCount, 6000); assert.equal(report.samplesCapped, true);
  assert.equal(report.groups[0].latestTaskCompletions.length, 3);
  assert.equal(report.groups[0].to, now);
});

test("idle baselines require explicit zero jobs, queue and requests", t => {
  const f = fixture(t);
  const idle = { activeJobs: 0, queuedJobs: 0, activeRequests: 0 };
  write(f.path, [sample(-300000, 200, idle), sample(-200000, 600, { ...idle, activeJobs: 1 }), sample(-100000, 400), sample(0, 210, idle)]);
  const group = collect(f.options).groups[0];
  assert.equal(group.max.rss, 600 * MiB); assert.equal(group.idle.count, 2);
  assert.equal(group.idle.first.rss, 200 * MiB); assert.equal(group.idle.last.rss, 210 * MiB);
  assert.equal(group.idle.maxRss, 210 * MiB);
});

test("MemAvailable defines used memory; free alone cannot establish pressure", () => {
  const report = parseMeminfo("MemTotal:       7864320 kB\nMemFree: 182272 kB\nMemAvailable: 5840896 kB\nBuffers: 0 kB\nCached: 5906432 kB\nSReclaimable: 76800 kB\n");
  assert.equal(report.total / MiB, 7680); assert.equal(report.available / MiB, 5704); assert.equal(report.used / MiB, 1976);
  assert.equal(report.bufferCache / MiB, 5843);
  const missing = parseMeminfo("MemTotal: 7864320 kB\nMemFree: 182272 kB\n");
  assert.equal(missing.available, null); assert.equal(missing.used, null); assert.equal(missing.bufferCache, null);
  assert.equal(parseMeminfo(""), null);
});

test("CLI requires explicit home and rejects invalid windows or path-shaped app names", t => {
  const f = fixture(t);
  assert.throws(() => parseArguments([]), /explicit absolute/);
  for (const minutes of ["0", "1.5", "-1", "10081", "NaN"]) assert.throws(() => parseArguments(["--pm2-home", f.root, "--minutes", minutes]), /integer/);
  assert.throws(() => parseArguments(["--pm2-home", f.root, "--web-name", "../other"]), /safe PM2/);
  assert.match(formatMemoryReport(collect(f.options)), /NO VALID SAMPLES/);
});
