import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { PrismaClient } from "@prisma/client";

const root = process.cwd();
const local = process.argv.includes("--local");
const origin = local ? "http://127.0.0.1:8001" : "https://localhost:8443";
const database = new URL(process.env.DATABASE_URL || "mysql://invalid/");
if (process.env.E2E_ALLOW_TEST_DATABASE !== "1"
  || !["localhost", "127.0.0.1", "[::1]"].includes(database.hostname)
  || !/_(ci|test)$/.test(database.pathname)) throw new Error("Proxy regression requires an explicitly approved loopback _ci/_test database");
if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET is required for the test server");

// Fail before starting anything if another task owns either port.
for (const port of local ? [8001] : [8001, 8443]) {
  const socket = createServer();
  socket.listen(port, "127.0.0.1");
  await once(socket, "listening");
  await new Promise((done) => socket.close(done));
}
const directory = await mkdtemp(join(tmpdir(), "wzywt-proxy-test-"));
const nginx = process.env.NGINX_BIN || "nginx";
const openssl = process.env.OPENSSL_BIN || "openssl";
const config = join(directory, "nginx.conf");
const cert = join(directory, "cert.pem");
const key = join(directory, "key.pem");
const quote = (path) => `"${path.replaceAll("\\", "/")}"`;
const children = [];
const logs = [];
const prisma = new PrismaClient();
let previousNews;
let newsPrepared = false;

function run(command, args, options = {}) {
  return new Promise((done, reject) => {
    const child = spawn(command, args, { cwd: root, windowsHide: true, stdio: "inherit", ...options });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? done() : reject(new Error(`${command} exited ${code}`)));
  });
}

function background(command, args, label, env) {
  const log = createWriteStream(join(directory, `${label}.log`));
  logs.push(log);
  const child = spawn(command, args, { cwd: root, windowsHide: true, env, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  child.on("error", (error) => { child.startError = error; });
  children.push(child);
}

async function ready() {
  return new Promise((done) => {
    // Only this dedicated loopback self-signed readiness probe skips TLS trust.
    const req = (local ? httpRequest : httpsRequest)(`${origin}/api/health`, { rejectUnauthorized: false, timeout: 1500 }, (res) => {
      res.resume(); res.once("end", () => done(res.statusCode === 200));
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => done(false));
    req.end();
  });
}

try {
  for (const name of ["media", "avatars", "logs", "temp"]) await mkdir(join(directory, name));
  if (!local) {
    await run(openssl, ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-keyout", key, "-out", cert,
      "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1"], { stdio: "ignore" });
    await writeFile(config, `
worker_processes 1;
pid ${quote(join(directory, "nginx.pid"))};
error_log ${quote(join(directory, "nginx-error.log"))};
events { worker_connections 128; }
http {
  access_log off;
  client_body_temp_path ${quote(join(directory, "body"))};
  proxy_temp_path ${quote(join(directory, "proxy"))};
  server {
    listen 127.0.0.1:8443 ssl;
    server_name localhost;
    ssl_certificate ${quote(cert)};
    ssl_certificate_key ${quote(key)};
    location / {
      proxy_pass http://127.0.0.1:8001;
      proxy_http_version 1.1;
      proxy_set_header Host localhost:8001;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $remote_addr;
      proxy_set_header X-Forwarded-Host $http_host;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_set_header Connection "";
      proxy_redirect off;
      proxy_buffering off;
    }
  }
}
`);
  }
  // Isolate auth checks from news-provider availability, then restore the cache.
  previousNews = await prisma.kvCache.findUnique({ where: { key: "official_news" } });
  const value = JSON.stringify({ timestamp: Date.now(), items: [] });
  await prisma.kvCache.upsert({ where: { key: "official_news" }, create: { key: "official_news", value }, update: { value } });
  newsPrepared = true;
  const env = { ...process.env, NODE_ENV: "production", PUBLIC_ORIGIN: origin, E2E_BASE_URL: origin,
    DEPLOY_ENVIRONMENT: local ? "local" : "production",
    APP_RELEASE_ID: "", REDIS_URL: "", REDIS_REQUIRED: "0", SESSION_COOKIE_SECURE: "",
    MEDIA_STORAGE_DIR: join(directory, "media"), AVATAR_DIR: join(directory, "avatars"),
    ...(!local ? { NODE_EXTRA_CA_CERTS: cert } : {}) };
  background(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "8001"], "next", env);
  if (!local) {
    await run(nginx, ["-p", `${directory.replaceAll("\\", "/")}/`, "-c", config, "-t"]);
    background(nginx, ["-p", `${directory.replaceAll("\\", "/")}/`, "-c", config, "-g", "daemon off;"], "nginx", env);
  }
  let healthy = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    for (const child of children) {
      if (child.startError) throw child.startError;
      if (child.exitCode !== null) throw new Error(`Test server exited ${child.exitCode}`);
    }
    if (await ready()) { healthy = true; break; }
    await new Promise((done) => setTimeout(done, 500));
  }
  if (!healthy) throw new Error("Test entry readiness timed out");
  await run(process.execPath, ["scripts/public-entry-smoke.mjs", origin, "development"], { env });
  await run(process.execPath, ["tests/e2e/ci-auth-resource-regression.mjs"], { env });
  await run(process.execPath, ["tests/e2e/login-transition-regression.mjs"], { env });
  await run(process.execPath, ["tests/e2e/room-profile-regression.mjs"], { env });
  await run(process.execPath, ["tests/e2e/room-archive-regression.mjs"], { env });
  await run(process.execPath, ["tests/e2e/tactic-layer-regression.mjs"], { env });
} catch (error) {
  for (const name of ["next.log", "nginx.log", "nginx-error.log"]) {
    console.error((await readFile(join(directory, name), "utf8").catch(() => "")).slice(-8000));
  }
  throw error;
} finally {
  if (!local) spawnSync(nginx, ["-p", `${directory.replaceAll("\\", "/")}/`, "-c", config, "-s", "quit"], { windowsHide: true, stdio: "ignore" });
  for (const child of children) {
    if (child.exitCode === null) {
      const exited = once(child, "exit").catch(() => undefined);
      child.kill();
      await Promise.race([exited, new Promise((done) => setTimeout(done, 3000))]);
      if (child.exitCode === null) child.kill("SIGKILL");
    }
  }
  for (const log of logs) log.end();
  try {
    if (newsPrepared) {
      if (previousNews) await prisma.kvCache.update({ where: { key: "official_news" }, data: { value: previousNews.value } });
      else await prisma.kvCache.deleteMany({ where: { key: "official_news" } });
    }
  } finally {
    await prisma.$disconnect();
    // Only the mkdtemp-owned test directory is removed.
    await rm(directory, { recursive: true, force: true, maxRetries: 3 });
  }
}
