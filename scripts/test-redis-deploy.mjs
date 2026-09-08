import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { probeRedis, updateRedisPassword } from "./redis-doctor.mjs";
import { readRedisEnv } from "./deploy-env.mjs";

const repo = resolve(import.meta.dirname, "..");

function pm2RedisEnv(content, entryOverrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), "wzywt-redis-env-"));
  try {
    writeFileSync(join(dir, ".env"), content);
    const result = spawnSync(process.execPath, ["-e", "console.log(JSON.stringify(require('./ecosystem.config.js').apps.map(app => app.env)))"], {
      cwd: repo,
      encoding: "utf8",
      windowsHide: true,
      env: { ...process.env, PUBLIC_ORIGIN: undefined, DEPLOY_ENVIRONMENT: undefined, SESSION_COOKIE_SECURE: undefined,
        ...entryOverrides, APP_DIR: dir, REDIS_URL: "redis://:stale@127.0.0.1:6379/0", REDIS_REQUIRED: "1" },
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("PM2 loads local entry settings and explicitly resets them when returning to production", () => {
  for (const env of pm2RedisEnv("DEPLOY_ENVIRONMENT=local\nPUBLIC_ORIGIN=http://192.168.1.73:8001\n")) {
    assert.equal(env.NODE_ENV, "production");
    assert.equal(env.DEPLOY_ENVIRONMENT, "local");
    assert.equal(env.PUBLIC_ORIGIN, "http://192.168.1.73:8001");
    assert.equal(env.SESSION_COOKIE_SECURE, "");
  }
  for (const env of pm2RedisEnv("PUBLIC_ORIGIN=https://arena.example\n")) {
    assert.equal(env.DEPLOY_ENVIRONMENT, "production");
    assert.equal(env.PUBLIC_ORIGIN, "https://arena.example");
    assert.equal(env.SESSION_COOKIE_SECURE, "");
  }
  for (const env of pm2RedisEnv("PUBLIC_ORIGIN=https://arena.example\n", { DEPLOY_ENVIRONMENT: "local", PUBLIC_ORIGIN: "http://10.0.0.2:8001" })) {
    assert.equal(env.PUBLIC_ORIGIN, "http://10.0.0.2:8001", "preflight shell overrides must reach PM2 unchanged");
    assert.equal(env.DEPLOY_ENVIRONMENT, "local");
  }
});

test("web and cron replace stale inherited Redis credentials with the release .env", () => {
  const envs = pm2RedisEnv('REDIS_URL="redis://:new%24pass%23word@127.0.0.1:6379/0"\nREDIS_REQUIRED=1\n');
  for (const env of envs) {
    assert.equal(env.REDIS_URL, "redis://:new%24pass%23word@127.0.0.1:6379/0");
    assert.equal(env.REDIS_REQUIRED, "1");
  }
});

test("removing Redis from the release .env clears PM2's previously cached settings", () => {
  for (const env of pm2RedisEnv("# Redis disabled\n")) {
    assert.equal(env.REDIS_URL, "");
    assert.equal(env.REDIS_REQUIRED, "0");
  }
});

// Real ioredis talks RESP over TCP; the fixture only replaces the external server.
async function redisServer(t, { password = "test$#%:@/\\pass", denyPing = false, silent = false } = {}) {
  const sockets = new Set();
  const commands = [];
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    let buffer = Buffer.alloc(0);
    let authenticated = false;
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length) {
        const firstEnd = buffer.indexOf("\r\n");
        if (firstEnd < 0) return;
        const count = Number(buffer.toString("utf8", 1, firstEnd));
        let offset = firstEnd + 2;
        const args = [];
        for (let i = 0; i < count; i++) {
          const end = buffer.indexOf("\r\n", offset);
          if (end < 0) return;
          const length = Number(buffer.toString("utf8", offset + 1, end));
          if (buffer.length < end + 2 + length + 2) return;
          args.push(buffer.toString("utf8", end + 2, end + 2 + length));
          offset = end + 2 + length + 2;
        }
        buffer = buffer.subarray(offset);
        const command = args[0].toUpperCase();
        commands.push(command);
        if (silent) continue;
        if (command === "AUTH") {
          authenticated = args.at(-1) === password && (args.length === 2 || args[1] === "default");
          socket.write(authenticated ? "+OK\r\n" : `-WRONGPASS rejected secret=${args.at(-1)}\r\n`);
        } else if (!authenticated) socket.write("-NOAUTH Authentication required\r\n");
        else if (command === "INFO") {
          const info = "redis_version:7.0.0\r\nloading:0\r\nrole:master\r\n";
          socket.write(`$${Buffer.byteLength(info)}\r\n${info}\r\n`);
        } else if (command === "PING" && denyPing) socket.write("-NOPERM user cannot run PING\r\n");
        else socket.write(command === "PING" ? "+PONG\r\n" : "+OK\r\n");
      }
    });
  });
  await new Promise((accept, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", accept); });
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise((accept) => server.close(accept));
  });
  const port = server.address().port;
  return { password, commands, url: `redis://:${encodeURIComponent(password)}@127.0.0.1:${port}/0` };
}

test("encoded password-only URLs authenticate and pass the application's ready check", async (t) => {
  const redis = await redisServer(t);
  await probeRedis(redis.url, repo);
  assert.ok(redis.commands.includes("AUTH"));
  assert.ok(redis.commands.includes("INFO"));
  assert.ok(redis.commands.includes("PING"));
});

test("wrong credentials report WRONGPASS without echoing the rejected secret", async (t) => {
  const redis = await redisServer(t);
  const url = new URL(redis.url);
  url.password = "bad-secret";
  await assert.rejects(probeRedis(url.href, repo), { code: "WRONGPASS", message: "WRONGPASS" });
});

test("ACL denial of PING is distinguished from authentication failure", async (t) => {
  const redis = await redisServer(t, { denyPing: true });
  await assert.rejects(probeRedis(redis.url, repo), { code: "NOPERM" });
});

test("unresponsive Redis is bounded and disconnected", async (t) => {
  const redis = await redisServer(t, { silent: true });
  await assert.rejects(probeRedis(redis.url, repo, 100), { code: "ETIMEDOUT" });
});

test("password repair verifies the raw password, preserves other env settings and rejects a bad replacement", async (t) => {
  const redis = await redisServer(t);
  const dir = mkdtempSync(join(tmpdir(), "wzywt-redis-repair-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, ".env");
  const url = new URL(redis.url);
  url.password = "wrong";
  const otherSettings = "# project config\r\nSESSION_SECRET=fixture-only\r\nREDIS_REQUIRED=1\r\n";
  writeFileSync(file, `${otherSettings}REDIS_URL="${url.href}"\r\n`);
  await updateRedisPassword(file, redis.password, "default", repo);
  const updated = readFileSync(file, "utf8");
  assert.ok(updated.startsWith(otherSettings));
  const configured = new URL(readRedisEnv(file).REDIS_URL);
  assert.equal(decodeURIComponent(configured.password), redis.password);
  assert.equal(configured.username, "default");
  assert.equal(readRedisEnv(file).REDIS_REQUIRED, "1");
  if (process.platform !== "win32") assert.equal(statSync(file).mode & 0o777, 0o600);
  await assert.rejects(updateRedisPassword(file, "bad-replacement", "default", repo), { code: "WRONGPASS" });
  assert.equal(readFileSync(file, "utf8"), updated);
});

async function runDoctor(content) {
  const dir = mkdtempSync(join(tmpdir(), "wzywt-redis-probe-"));
  try {
    const file = join(dir, ".env");
    writeFileSync(file, content);
    return await new Promise((accept, reject) => {
      const child = spawn(process.execPath, ["scripts/redis-doctor.mjs", "--env-file", file], {
        cwd: repo, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, REDIS_URL: "redis://:stale@127.0.0.1:1/0" },
      });
      let output = "";
      child.stdout.on("data", (chunk) => { output += chunk; });
      child.stderr.on("data", (chunk) => { output += chunk; });
      child.once("error", reject);
      child.once("exit", (status) => accept({ status, output }));
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("required Redis fails preflight with a safe error; optional Redis reports degraded", async (t) => {
  const redis = await redisServer(t);
  const url = new URL(redis.url);
  url.password = "bad-secret";
  for (const [required, status] of [["1", 1], ["0", 0]]) {
    const result = await runDoctor(`REDIS_URL="${url.href}"\nREDIS_REQUIRED=${required}\n`);
    assert.equal(result.status, status, result.output);
    assert.match(result.output, /WRONGPASS/);
    assert.ok(!result.output.includes("bad-secret"));
    assert.ok(!result.output.includes(url.href));
  }
});

test("doctor uses the selected env file even when the shell has a stale Redis URL", async (t) => {
  const redis = await redisServer(t);
  const result = await runDoctor(`REDIS_URL="${redis.url}"\nREDIS_REQUIRED=1\n`);
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /PONG/);
  assert.ok(!result.output.includes(redis.password));
});

test("required missing URL fails, while unconfigured optional Redis skips", async () => {
  const required = await runDoctor("REDIS_REQUIRED=1\n");
  assert.equal(required.status, 1);
  assert.match(required.output, /REDIS_URL_MISSING/);
  const optional = await runDoctor("# no Redis\n");
  assert.equal(optional.status, 0, optional.output);
  assert.match(optional.output, /skipped/);
});
