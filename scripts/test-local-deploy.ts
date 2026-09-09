import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolveSessionCookieSecure } from "../src/lib/session-config";
import { getRecognitionProviderUrl } from "../src/features/matches/server/recognition-provider";
import { ServiceError } from "../src/lib/service-error";

const local = { NODE_ENV: "production", DEPLOY_ENVIRONMENT: "local", PUBLIC_ORIGIN: "http://192.168.1.73:8001" };
assert.equal(resolveSessionCookieSecure(local), false, "local HTTP login cookie must be usable over HTTP");
assert.equal(resolveSessionCookieSecure({ ...local, PUBLIC_ORIGIN: "https://arena.example" }), true);
assert.throws(() => resolveSessionCookieSecure({ ...local, SESSION_COOKIE_SECURE: "1" }), /SESSION_COOKIE_SECURE/);

for (const origin of ["http://localhost:8001", "http://127.0.0.1:8001", "http://192.168.1.73:8001", "http://10.0.0.2:8001", "http://172.16.0.2:8001", "http://172.31.255.254:8001", "http://[::1]:8001", "http://[fd00::1]:8001"]) {
  const result = spawnSync(process.execPath, ["scripts/public-entry-smoke.mjs", origin, "--validate-origin"], {
    encoding: "utf8", windowsHide: true, env: { ...process.env, DEPLOY_ENVIRONMENT: "local", SESSION_COOKIE_SECURE: "" },
  });
  assert.equal(result.status, 0, `${origin}: ${result.stderr}`);
  assert.equal(result.stdout.trim(), origin);
}
for (const [mode, origin] of [["production", local.PUBLIC_ORIGIN], ["", local.PUBLIC_ORIGIN], ["locla", local.PUBLIC_ORIGIN], ["local", "http://example.com"], ["local", "http://192.168.1.73.evil.example"], ["local", "http://172.32.0.1"], ["local", "http://0.0.0.0"], ["local", "http://8.8.8.8"], ["local", "http://[2001:4860:4860::8888]"], ["local", "http://192.168.1.73/path"]]) {
  const result = spawnSync(process.execPath, ["scripts/public-entry-smoke.mjs", origin, "--validate-origin"], {
    encoding: "utf8", windowsHide: true, env: { ...process.env, DEPLOY_ENVIRONMENT: mode },
  });
  assert.notEqual(result.status, 0, `${mode} must reject ${origin}`);
}
console.log("Local deployment origin policy and HTTP session cookies passed.");

// Catch NODE_ENV-only validation breaking OCR in a production-built local VM.
const savedOcrEnvironment = new Map(["NODE_ENV", "DEPLOY_ENVIRONMENT", "MATCH_OCR_ENDPOINT"]
  .map((key) => [key, process.env[key]]));
function expectOcrRejected(endpoint: string) {
  process.env.MATCH_OCR_ENDPOINT = endpoint;
  assert.throws(() => getRecognitionProviderUrl(), (error: unknown) =>
    error instanceof ServiceError && error.code === "SERVICE_UNAVAILABLE", endpoint);
}
try {
  Reflect.set(process.env, "NODE_ENV", "production");
  process.env.DEPLOY_ENVIRONMENT = "local";
  for (const host of ["localhost", "127.0.0.1", "127.0.0.2", "192.168.1.73", "10.0.0.2", "172.16.0.1", "172.31.255.254", "[::1]", "[fd00::1]", "[fc00::1]"]) {
    const endpoint = `http://${host}:8010/recognize`;
    process.env.MATCH_OCR_ENDPOINT = endpoint;
    assert.equal(getRecognitionProviderUrl().href, endpoint);
  }
  for (const host of ["example.com", "localhost.evil.example", "192.168.1.73.evil.example", "172.15.255.255", "172.32.0.1", "0.0.0.0", "8.8.8.8", "[2001:4860:4860::8888]"]) {
    expectOcrRejected(`http://${host}:8010/recognize`);
  }
  for (const mode of ["production", "", undefined]) {
    if (mode === undefined) delete process.env.DEPLOY_ENVIRONMENT;
    else process.env.DEPLOY_ENVIRONMENT = mode;
    expectOcrRejected("http://127.0.0.1:8010/recognize");
    expectOcrRejected("http://ocr.example.com/recognize");
  }
  for (const mode of ["production", "local"]) {
    process.env.DEPLOY_ENVIRONMENT = mode;
    process.env.MATCH_OCR_ENDPOINT = "https://ocr.example.com/recognize";
    assert.equal(getRecognitionProviderUrl().href, "https://ocr.example.com/recognize");
    expectOcrRejected("ftp://127.0.0.1/recognize");
    expectOcrRejected("not a URL");
    expectOcrRejected("");
  }
  process.env.DEPLOY_ENVIRONMENT = "locla";
  expectOcrRejected("http://127.0.0.1:8010/recognize");
  expectOcrRejected("https://ocr.example.com/recognize");
  delete process.env.DEPLOY_ENVIRONMENT;
  Reflect.set(process.env, "NODE_ENV", "test");
  process.env.MATCH_OCR_ENDPOINT = "http://ocr.test/recognize";
  assert.equal(getRecognitionProviderUrl().href, "http://ocr.test/recognize");
} finally {
  for (const [key, value] of savedOcrEnvironment) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
console.log("OCR local HTTP and production HTTPS endpoint policy passed.");
