import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

if (!existsSync(".next/BUILD_ID")) throw new Error("Run npm run build before test:governor:http");
const socket = createServer();
await new Promise(resolve => socket.listen(0, "127.0.0.1", resolve));
const port = socket.address().port;
await new Promise(resolve => socket.close(resolve));
const origin = `http://127.0.0.1:${port}`;
mkdirSync(".cache/resource-validation", { recursive: true });
const fixtureDirectory = mkdtempSync(resolve(".cache/resource-validation/http-fixture-"));
const fixtureState = resolve(fixtureDirectory, "state.json"), fixturePreload = resolve(fixtureDirectory, "preload.mjs");
writeFileSync(fixtureState, JSON.stringify({ rss: 0 }));
// Control only sampled capacity/RSS; keep actual Next routing, streams, clocks,
// supervision and signals. No production environment switch bypasses sampling.
writeFileSync(fixturePreload, `import fs from 'node:fs'; import os from 'node:os'; import { syncBuiltinESMExports } from 'node:module';
const originalRead = fs.readFileSync, originalMemory = process.memoryUsage;
const state = () => { try { return JSON.parse(originalRead(${JSON.stringify(fixtureState)}, 'utf8')); } catch { return { rss: 0 }; } };
os.freemem = () => Math.floor(os.totalmem() * .75);
fs.readFileSync = function(path, ...args) { return String(path) === '/proc/meminfo' ? 'MemAvailable: ' + Math.floor(os.totalmem() * .75 / 1024) + ' kB\\n' : originalRead.call(this, path, ...args); };
process.memoryUsage = Object.assign(() => { const value = originalMemory(); return { ...value, rss: state().rss || value.rss }; }, { rss: () => state().rss || originalMemory.rss() });
syncBuiltinESMExports();\n`);
const child = spawn(process.execPath, ["--import", pathToFileURL(fixturePreload).href, "--import", "./scripts/runtime-preload.mjs", "node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)], {
  env: { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", APP_ROLE: "web", APP_RELEASE_ID: "governor-http-fixture",
    DEPLOY_ENVIRONMENT: "local", PUBLIC_ORIGIN: origin, SESSION_COOKIE_SECURE: "0",
    SESSION_SECRET: "fixture-only-secret-never-use-at-runtime-123456789",
    DATABASE_URL: "mysql://fixture:fixture@127.0.0.1:1/fixture?connect_timeout=1&pool_timeout=1",
    REDIS_URL: "", REDIS_REQUIRED: "0", MATCH_OCR_ENDPOINT: "", MATCH_OCR_TOKEN: "",
    RESOURCE_GOVERNOR_ENABLED: "1", RESOURCE_EXTERNAL_RPS: "2", RESOURCE_EXTERNAL_BURST: "3",
    RESOURCE_EXTERNAL_CONCURRENCY: "2", RESOURCE_WEB_MEMORY_MB: "1024", RESOURCE_RECYCLE_SECONDS: "2",
    RESOURCE_SUBSCRIPTION_CONCURRENCY: "1", RESOURCE_SUBSCRIPTION_MAX_SECONDS: "10", RESOURCE_DRAIN_SECONDS: "2" },
  windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
const capture = data => { output = (output + String(data)).slice(-128_000); };
child.stdout.on("data", capture); child.stderr.on("data", capture);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error("Fixture server exited before liveness became ready");
    try { ready = (await fetch(`${origin}/api/health?mode=live`)).ok; } catch { /* Startup. */ }
    if (ready) break;
    await sleep(250);
  }
  assert.ok(ready, "built Next server never became live");
  const responses = await Promise.all(Array.from({ length: 10 }, () => fetch(`${origin}/login`, { redirect: "manual" })));
  assert.ok(responses.some(response => response.status === 200), "ordinary traffic must receive finite service");
  assert.ok(responses.some(response => response.status === 503), "burst traffic bypassed Node middleware admission");
  for (const response of responses) {
    if (response.status === 503) {
      assert.ok(Number(response.headers.get("retry-after")) > 0);
      assert.ok(response.headers.get("x-request-id"));
      assert.equal((await response.json()).code, "RESOURCE_BUSY");
    } else await response.arrayBuffer();
  }
  const live = await fetch(`${origin}/api/health?mode=live`);
  assert.equal(live.status, 200, "liveness must remain available after ordinary capacity is exhausted");
  assert.equal((await live.json()).releaseId, "governor-http-fixture");
  await sleep(1_200);
  const mobile = await fetch(`${origin}/login?redirect=%2Fme`, { headers: { "User-Agent": "iPhone Mobile" }, redirect: "manual" });
  assert.equal(mobile.status, 307); assert.equal(new URL(mobile.headers.get("location"), origin).href, `${origin}/m/login?redirect=%2Fme`);
  await mobile.arrayBuffer();
  await sleep(1_200);
  const desktop = await fetch(`${origin}/m/login?redirect=%2Fme`, { redirect: "manual" });
  assert.equal(desktop.status, 307); assert.equal(new URL(desktop.headers.get("location"), origin).href, `${origin}/login?redirect=%2Fme`);
  await desktop.arrayBuffer();
  await sleep(1_700);
  const failure = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
  const error = await failure.json();
  assert.equal(failure.status, 400);
  assert.equal(error.code, "VALIDATION_ERROR");
  assert.equal(failure.headers.get("x-request-id"), error.requestId, "API failures must retain the admission request ID");
  const subscription = await fetch(`${origin}/api/heroes/watch`, { signal: AbortSignal.timeout(15_000) });
  assert.equal(subscription.status, 200);
  const excess = await fetch(`${origin}/api/heroes/watch`);
  assert.equal(excess.status, 503); await excess.arrayBuffer();
  await sleep(1_200);
  const ordinary = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
  assert.equal(ordinary.status, 400, "an open subscription must not consume the ordinary API slot"); await ordinary.arrayBuffer();
  const reader = subscription.body.getReader();
  while (!(await reader.read()).done) { /* max-age must end the actual HTTP stream */ }
  reader.releaseLock();
  assert.ok(output.includes('"reason":"max-age"'), "subscription lifetime was not enforced");
  const reconnected = await fetch(`${origin}/api/heroes/watch`);
  assert.equal(reconnected.status, 200); await reconnected.body.cancel();
  writeFileSync(fixtureState, JSON.stringify({ rss: 1536 * 1_048_576 }));
  for (let attempt = 0; attempt < 80 && !output.includes('"event":"process.recycle_requested"'); attempt++) await sleep(250);
  assert.ok(output.includes('"event":"process.drain_started"'), "sustained pressure did not start draining");
  assert.ok(output.includes('"event":"process.recycle_requested"'), "drained service did not request a supervised recycle");
  assert.ok(output.includes('"event":"process.boot"'), "startup must be logged before the application imports");
  console.log(JSON.stringify({ result: "PASS", controlledResourceSamples: true, checks: ["preloaded-boot-log", "real-node-middleware", "bounded-burst", "retry-after-request-id", "reserved-liveness", "local-http", "desktop-mobile-query-redirects", "error-request-correlation", "subscription-isolated-capacity", "subscription-max-age-reconnect", "pressure-drain-recycle"] }));
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGTERM");
    await Promise.race([new Promise(resolve => child.once("exit", resolve)), sleep(3_000)]);
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }
  mkdirSync(".cache/resource-validation", { recursive: true });
  writeFileSync(resolve(".cache/resource-validation/http-server.log"), output);
}
