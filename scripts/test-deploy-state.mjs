import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const verifier = resolve(import.meta.dirname, "verify-deploy-state.mjs");
const names = ["wangzhe-yanwutang-web", "wangzhe-yanwutang-cron"];

function fixture(t) {
  const base = mkdtempSync(join(tmpdir(), "wzywt-deploy-state-"));
  const release = join(base, "releases", "old-release");
  mkdirSync(release, { recursive: true });
  const pidFile = join(base, "web.pid");
  writeFileSync(pidFile, `${process.pid}\n`);
  t.after(() => rmSync(base, { recursive: true, force: true }));
  return {
    base,
    release,
    app(name = names[0], status = "stopped", overrides = {}) {
      return {
        name,
        pid: status === "online" ? process.pid : 0,
        pm2_env: { status, pm_cwd: release, pm_pid_path: pidFile },
        ...overrides,
      };
    },
  };
}

function run(mode, args, input) {
  const result = spawnSync(process.execPath, [verifier, mode, ...args], {
    input: input === undefined ? undefined : JSON.stringify(input),
    encoding: "utf8",
    windowsHide: true,
    timeout: 10_000,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, result.stderr);
  return result;
}

function plan(f, processes) {
  return run("pm2-stop-plan", [f.base, f.release, ...names], processes);
}

function quiescent(f, processes) {
  return run("pm2-quiescent", [f.base, f.release, ...names], processes);
}

test("an old current release with no registered PM2 apps produces an empty stop plan", (t) => {
  const f = fixture(t);
  const result = plan(f, []);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
});

for (const [status, resume] of [
  ["stopped", false],
  ["errored", false],
  ["launching", true],
  ["waiting restart", true],
  ["online", true],
]) {
  test(`one registered ${status} app is stopped${resume ? " and resumed on rollback" : " without rollback restart"}`, (t) => {
    const f = fixture(t);
    const result = plan(f, [f.app(names[0], status)]);
    assert.equal(result.status, 0, result.stderr);
    const expected = [`stop ${names[0]}`];
    if (resume) expected.push(`resume ${names[0]}`);
    assert.deepEqual(result.stdout.trim().split(/\r?\n/), expected);
    assert.ok(!result.stdout.includes(names[1]), "missing cron must not be stopped or resumed");
  });
}

test("stop plans preserve ownership checks and reject a same-name app from another cwd", (t) => {
  const f = fixture(t);
  const app = f.app();
  app.pm2_env.pm_cwd = join(f.base, "another-project");
  const result = plan(f, [app]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /belongs to a different cwd/);
  assert.equal(result.stdout, "", "a rejected plan must not emit partial stop instructions");
});

test("duplicate expected PM2 names are rejected before emitting a stop plan", (t) => {
  const f = fixture(t);
  const result = plan(f, [f.app(), f.app()]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ambiguous \(2 entries\)/);
  assert.equal(result.stdout, "");
});

test("unexpected apps under the release path prevent stopping and backing up this project", (t) => {
  const f = fixture(t);
  const result = plan(f, [f.app("unrecognized-writer")]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unexpected PM2 apps own the project path: unrecognized-writer/);
});

test("a registered app without a current release is rejected", (t) => {
  const f = fixture(t);
  const result = run("pm2-stop-plan", [f.base, "-", ...names], [f.app()]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /current release link is missing/);
});

test("quiescence allows absent apps and stopped apps with zero PID", (t) => {
  const f = fixture(t);
  for (const processes of [[], [f.app()], names.map((name) => f.app(name))]) {
    const result = quiescent(f, processes);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /project writers are absent or stopped/);
  }
});

test("quiescence rejects an online app with a valid live PID", (t) => {
  const f = fixture(t);
  const result = quiescent(f, [f.app(names[0], "online")]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /is not quiescent: status=online pid=/);
});

test("quiescence rejects a stopped app that still reports a nonzero PID", (t) => {
  const f = fixture(t);
  const result = quiescent(f, [f.app(names[0], "stopped", { pid: process.pid })]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /is not quiescent: status=stopped pid=/);
});

for (const status of ["launching", "waiting restart", "errored"]) {
  test(`quiescence rejects ${status} even with a zero PID`, (t) => {
    const f = fixture(t);
    const result = quiescent(f, [f.app(names[0], status)]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /is not quiescent/);
  });
}

test("port-free rejects a real TCP listener with a PM2_HOME hint, then accepts the released port", async (t) => {
  const server = createServer();
  t.after(async () => {
    if (server.listening) {
      await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
    }
  });
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, resolveListen);
  });
  const port = String(server.address().port);
  const occupied = run("port-free", ["127.0.0.1", port]);
  assert.equal(occupied.status, 1);
  assert.match(occupied.stderr, /EADDRINUSE/);
  assert.match(occupied.stderr, /PM2_HOME before backup or migration/);

  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  const released = run("port-free", ["127.0.0.1", port]);
  assert.equal(released.status, 0, released.stderr);
  assert.match(released.stdout, /is available/);
});
