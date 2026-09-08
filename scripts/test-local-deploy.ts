import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolveSessionCookieSecure } from "../src/lib/session-config";

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
