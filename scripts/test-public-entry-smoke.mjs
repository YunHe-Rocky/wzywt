import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { verifyPublicEntry } from "./public-entry-smoke.mjs";
import { parsePublicOrigin } from "../src/lib/public-origin.ts";

for (const value of ["", "https://good.example@evil.example", "https://good.example/path", "http://good.example", "https://good.example?x=1"]) {
  assert.throws(() => parsePublicOrigin(value, true));
}
assert.equal(parsePublicOrigin("https://arena.example:8443/", true), "https://arena.example:8443");

let origin;
let fault = "";
const expected = new Map([
  ["/me?tab=history", "/login?redirect=%2Fme%3Ftab%3Dhistory"],
  ["/admin", "/login?redirect=%2Fadmin"],
  ["/?entry=smoke", "/m?entry=smoke"],
  ["/login?redirect=%2Fm%2Fme", "/m/login?redirect=%2Fm%2Fme"],
  ["/m/me?tab=history", "/m/login?redirect=%2Fm%2Fme%3Ftab%3Dhistory"],
  ["/m/heroes?role=mid", "/heroes?role=mid"],
]);
const server = createServer((req, res) => {
  if (req.url === "/api/health") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: fault !== "not-ready", releaseId: fault === "stale-release" ? "old" : "test-release", checks: { redis: "degraded" } }));
  } else if (req.url === "/robots.txt") {
    if (fault === "static-redirect") res.writeHead(307, { Location: `${origin}/m/robots.txt` });
    res.end("User-agent: *");
  } else if (expected.has(req.url)) {
    let location = origin + expected.get(req.url);
    if (fault === "internal-origin") location = "https://localhost:8001/login";
    if (fault === "lost-query" && req.url === "/me?tab=history") location = `${origin}/login?redirect=%2Fme`;
    res.writeHead(307, { Location: location });
    res.end();
  } else { res.writeHead(404); res.end(); }
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
origin = `http://127.0.0.1:${server.address().port}`;
try {
  const health = await verifyPublicEntry(origin, "test-release");
  assert.equal(health.checks.redis, "degraded", "optional Redis degradation remains visible");
  for (fault of ["not-ready", "stale-release", "internal-origin", "lost-query", "static-redirect"]) {
    await assert.rejects(() => verifyPublicEntry(origin, "test-release"), undefined, `smoke must reject ${fault}`);
  }
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
console.log("Public-entry smoke rejects stale releases, failed readiness, internal redirects, lost queries and static redirects.");
