import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { middleware } from "../src/middleware";

const desktop = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36";
const mobile = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
function response(path: string, ua: string) {
  const previous = process.env.PUBLIC_ORIGIN;
  process.env.PUBLIC_ORIGIN = "https://arena.example";
  try {
    return middleware(new NextRequest(`https://arena.example${path}`, { headers: { "user-agent": ua } }));
  } finally {
    if (previous === undefined) delete process.env.PUBLIC_ORIGIN;
    else process.env.PUBLIC_ORIGIN = previous;
  }
}

function proxiedResponse(path: string, ua: string) {
  return middleware(new NextRequest(`https://localhost:8001${path}`, {
    headers: {
      "host": "ywt.yunhe.ink",
      "user-agent": ua,
      "x-forwarded-proto": "https",
    },
  }));
}

// Public redirects must use deployment configuration, never the internal URL or
// client-controlled Host / forwarding headers. Reverting the auth branch to
// new URL(loginPath, req.url) must fail these assertions.
const previousOrigin = process.env.PUBLIC_ORIGIN;
process.env.PUBLIC_ORIGIN = "https://ywt.yunhe.ink";
try {
  assert.equal(proxiedResponse("/me?tab=history", desktop).headers.get("location"),
    "https://ywt.yunhe.ink/login?redirect=%2Fme%3Ftab%3Dhistory");
  assert.equal(proxiedResponse("/admin?section=users", desktop).headers.get("location"),
    "https://ywt.yunhe.ink/login?redirect=%2Fadmin%3Fsection%3Dusers");
  assert.equal(proxiedResponse("/m/me?tab=history", mobile).headers.get("location"),
    "https://ywt.yunhe.ink/m/login?redirect=%2Fm%2Fme%3Ftab%3Dhistory");
  assert.equal(proxiedResponse("/?entry=home", mobile).headers.get("location"), "https://ywt.yunhe.ink/m?entry=home");
  assert.equal(proxiedResponse("/login", mobile).headers.get("location"), "https://ywt.yunhe.ink/m/login");
  assert.equal(proxiedResponse("/m/heroes?role=mid", desktop).headers.get("location"), "https://ywt.yunhe.ink/heroes?role=mid");
  for (const headers of [
    { host: "evil.example", "x-forwarded-host": "evil.example", "x-forwarded-proto": "http" },
    { host: "user@evil.example", "x-forwarded-host": "evil.example", "x-forwarded-proto": "https,http" },
  ] satisfies Record<string, string>[]) {
    const result = middleware(new NextRequest("https://localhost:8001/me", { headers: { ...headers, "user-agent": desktop } }));
    assert.equal(result.headers.get("location"), "https://ywt.yunhe.ink/login?redirect=%2Fme");
  }
  process.env.PUBLIC_ORIGIN = "https://arena.example:8443";
  assert.equal(proxiedResponse("/me", desktop).headers.get("location"), "https://arena.example:8443/login?redirect=%2Fme");
  for (const origin of ["https://good.example@evil.example", "https://good.example/path", "javascript:alert(1)", "https://good.example?bad=1"]) {
    process.env.PUBLIC_ORIGIN = origin;
    assert.equal(proxiedResponse("/me", desktop).status, 503, `reject malformed PUBLIC_ORIGIN: ${origin}`);
  }
  const previousMode = process.env.NODE_ENV;
  try {
    Reflect.set(process.env, "NODE_ENV", "production");
    delete process.env.PUBLIC_ORIGIN;
    assert.equal(proxiedResponse("/me", desktop).status, 503, "production fails closed without PUBLIC_ORIGIN");
    process.env.PUBLIC_ORIGIN = "http://arena.example";
    assert.equal(proxiedResponse("/me", desktop).status, 503, "production requires HTTPS");
    Reflect.set(process.env, "NODE_ENV", "development");
    delete process.env.PUBLIC_ORIGIN;
    assert.equal(proxiedResponse("/me", desktop).headers.get("location"), "https://localhost:8001/login?redirect=%2Fme", "development ignores spoofable forwarding headers");
  } finally {
    if (previousMode === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else Reflect.set(process.env, "NODE_ENV", previousMode);
  }
} finally {
  if (previousOrigin === undefined) delete process.env.PUBLIC_ORIGIN;
  else process.env.PUBLIC_ORIGIN = previousOrigin;
}

assert.equal(response("/heroes?role=mid", mobile).headers.get("location"), "https://arena.example/m/heroes?role=mid");
assert.equal(response("/m/heroes?role=mid", desktop).headers.get("location"), "https://arena.example/heroes?role=mid");
assert.equal(response("/m", desktop).headers.get("location"), "https://arena.example/");
assert.equal(response("/monitor", desktop).headers.get("location"), null);
assert.equal(response("/m/heroes", mobile).headers.get("location"), null);
assert.equal(response("/art/arena.webp", mobile).headers.get("location"), null);
assert.equal(response("/api/heroes", mobile).headers.get("location"), null);
console.log("Device routing tests passed: bidirectional redirects, query preservation, exact /m prefix and static assets.");
