import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { pathToFileURL } from "node:url";
import { readRedisEnv } from "./deploy-env.mjs";
import { redisConnectionOptions } from "../src/lib/redis-options.ts";

const hints = {
  WRONGPASS: "Redis rejected credentials. Run --set-password --username default with the raw password that worked in redis-cli.",
  NOAUTH: "REDIS_URL has no accepted credentials. Use --set-password to configure them.",
  NOPERM: "Redis ACL denied an application command (such as SELECT or PING). Check that user's permissions.",
  ECONNREFUSED: "Redis is not listening at the configured host/port.",
  ENOTFOUND: "Redis hostname could not be resolved.",
  ETIMEDOUT: "Redis connection or ready check timed out.",
  REDIS_URL_INVALID: "REDIS_URL must be a redis:// or rediss:// URL with an integer database and encoded credentials.",
  REDIS_URL_MISSING: "REDIS_REQUIRED=1 but REDIS_URL is empty in the selected env file.",
  MISSING_DEPENDENCIES: "Source checkouts have no node_modules. Pass --dependencies /absolute/path/to/an/installed/release.",
  ENV_CHANGED: "The env file changed during the password check; no update was saved. Run again.",
  TTY_REQUIRED: "--set-password needs an interactive terminal for hidden password input.",
  PASSWORD_EMPTY: "The password was empty; no update was saved.",
  CANCELLED: "Cancelled; no update was saved.",
};

function codedError(code) {
  return Object.assign(new Error(code), { code });
}

export function redisFailureCode(error) {
  const message = String(error?.message || "");
  for (const code of Object.keys(hints)) {
    if (error?.code === code || message.startsWith(code)) return code;
  }
  if (/timed? ?out/i.test(message)) return "ETIMEDOUT";
  // Never echo raw errors: some clients include command arguments or input URLs.
  return "REDIS_CHECK_FAILED";
}

function parseRedisUrl(value) {
  try {
    const url = new URL(value);
    if (!["redis:", "rediss:"].includes(url.protocol) || !url.hostname || url.hash || !/^\/(?:\d+)?$/.test(url.pathname || "/")) {
      throw new Error();
    }
    return url;
  } catch {
    throw codedError("REDIS_URL_INVALID");
  }
}

export async function probeRedis(redisUrl, dependenciesDir, timeoutMs = 7000) {
  if (!redisUrl) throw codedError("REDIS_URL_MISSING");
  parseRedisUrl(redisUrl);
  let Redis;
  try {
    Redis = createRequire(resolve(dependenciesDir, "package.json"))("ioredis");
  } catch {
    throw codedError("MISSING_DEPENDENCIES");
  }
  let client;
  let timer;
  let connectionError;
  try {
    client = new Redis(redisUrl, redisConnectionOptions());
    client.on("error", (error) => { connectionError = error; });
    await Promise.race([
      client.ping().then((reply) => { if (reply !== "PONG") throw codedError("REDIS_CHECK_FAILED"); }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(codedError("ETIMEDOUT")), timeoutMs); }),
    ]);
  } catch (error) {
    throw codedError(redisFailureCode(connectionError || error));
  } finally {
    clearTimeout(timer);
    client?.disconnect();
  }
}

function hiddenPassword() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw codedError("TTY_REQUIRED");
  process.stdout.write("Redis password (hidden; enter the RAW password): ");
  const sink = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const input = createInterface({ input: process.stdin, output: sink, terminal: true, historySize: 0 });
  return new Promise((accept, reject) => {
    input.once("line", (value) => { accept(value); input.close(); });
    input.once("SIGINT", () => { reject(codedError("CANCELLED")); input.close(); });
    input.once("close", () => { process.stdout.write("\n"); reject(codedError("CANCELLED")); });
  });
}

export async function updateRedisPassword(envFile, password, username, dependenciesDir) {
  if (!password) throw codedError("PASSWORD_EMPTY");
  const target = realpathSync(envFile); // Preserve the release's .env symlink.
  const original = readFileSync(target, "utf8");
  const env = readRedisEnv(target);
  const url = parseRedisUrl(env.REDIS_URL || "redis://127.0.0.1:6379/0");
  if (username !== undefined) url.username = encodeURIComponent(username);
  url.password = encodeURIComponent(password);
  const newUrl = url.href;
  await probeRedis(newUrl, dependenciesDir); // A bad password must never replace a working configuration.
  if (readFileSync(target, "utf8") !== original) throw codedError("ENV_CHANGED");
  const newline = original.includes("\r\n") ? "\r\n" : "\n";
  const line = `REDIS_URL="${newUrl}"`;
  const assignment = /^[ \t]*(?:export[ \t]+)?REDIS_URL[ \t]*=.*$/m;
  const updated = assignment.test(original)
    ? original.replace(assignment, () => line)
    : `${original}${original.endsWith("\n") ? "" : newline}${line}${newline}`;
  const temporary = resolve(dirname(target), `.redis-env-${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, updated, { mode: 0o600, flag: "wx" });
    renameSync(temporary, target);
  } finally {
    try { unlinkSync(temporary); } catch { /* Already renamed or never created. */ }
  }
}

async function main() {
  let envFile = resolve(".env");
  let dependenciesDir = resolve(import.meta.dirname, "..");
  let setPassword = false;
  let username;
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === "--set-password") setPassword = true;
    else if (["--env-file", "--dependencies", "--username"].includes(arg) && process.argv[i + 1]) {
      const value = process.argv[++i];
      if (arg === "--env-file") envFile = resolve(value);
      if (arg === "--dependencies") dependenciesDir = resolve(value);
      if (arg === "--username") username = value;
    } else throw codedError("INVALID_ARGUMENT");
  }
  if (setPassword) {
    await updateRedisPassword(envFile, await hiddenPassword(), username, dependenciesDir);
    console.log("[redis-check] PONG; updated REDIS_URL in the selected .env (password hidden). Redeploy to load it into PM2.");
    return;
  }
  const env = readRedisEnv(envFile);
  if (!env.REDIS_URL && env.REDIS_REQUIRED !== "1") {
    console.log("[redis-check] skipped: Redis is not configured or required");
    return;
  }
  try {
    await probeRedis(env.REDIS_URL, dependenciesDir);
    console.log("[redis-check] PONG (application credentials and ready check passed)");
  } catch (error) {
    if (env.REDIS_REQUIRED === "1") throw error;
    const code = redisFailureCode(error);
    console.warn(`[redis-check] degraded: ${code}. ${hints[code] || "Redis check failed."}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    const code = redisFailureCode(error);
    console.error(`[redis-check] ${code}. ${hints[code] || "Check the selected .env file and Redis client configuration."}`);
    process.exitCode = 1;
  });
}
