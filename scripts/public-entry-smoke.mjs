import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { parsePublicOrigin, resolveDeploymentEntry } from "../src/lib/public-origin.ts";

const desktop = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0 Safari/537.36";
const mobile = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";

// No credentials, no automatic redirects, and a bounded timeout for every probe.
export async function verifyPublicEntry(origin, expectedRelease) {
  origin = parsePublicOrigin(origin);
  assert.ok(expectedRelease, "Expected release ID is required");
  const request = (path, ua) => fetch(`${origin}${path}`, {
    redirect: "manual", signal: AbortSignal.timeout(10_000),
    headers: { "User-Agent": ua, "Cache-Control": "no-cache" },
  });
  const health = await request("/api/health", desktop);
  assert.equal(health.status, 200, "Public health must be HTTP 200");
  const body = await health.json();
  assert.equal(body.ok, true, "Public health must be ready");
  assert.equal(body.releaseId, expectedRelease, "Public health must match the activated release");
  assert.ok(!Object.values(body.checks || {}).includes("failed"), "Public health has failed checks");
  for (const [path, ua, location] of [
    ["/me?tab=history", desktop, "/login?redirect=%2Fme%3Ftab%3Dhistory"],
    ["/admin", desktop, "/login?redirect=%2Fadmin"],
    ["/?entry=smoke", mobile, "/m?entry=smoke"],
    ["/login?redirect=%2Fm%2Fme", mobile, "/m/login?redirect=%2Fm%2Fme"],
    ["/m/me?tab=history", mobile, "/m/login?redirect=%2Fm%2Fme%3Ftab%3Dhistory"],
    ["/m/heroes?role=mid", desktop, "/heroes?role=mid"],
  ]) {
    const response = await request(path, ua);
    await response.body?.cancel();
    assert.equal(response.status, 307, `Expected temporary redirect for ${path}`);
    assert.equal(response.headers.get("location"), `${origin}${location}`, `Wrong public redirect for ${path}`);
  }
  for (const path of ["/api/health", "/robots.txt"]) {
    const response = await request(path, mobile);
    await response.body?.cancel();
    assert.equal(response.status, 200, `Mobile API/static probe failed: ${path}`);
    assert.equal(response.headers.get("location"), null, `API/static must not redirect: ${path}`);
  }
  return body;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [origin, release] = process.argv.slice(2);
    const approved = resolveDeploymentEntry(origin, process.env.DEPLOY_ENVIRONMENT, process.env.SESSION_COOKIE_SECURE).origin;
    if (release === "--validate-origin") console.log(approved);
    else {
      const health = await verifyPublicEntry(approved, release);
      console.log(`[public-entry] release=${release} origin=${approved} redirects=ok redis=${health.checks?.redis || "not-disclosed"}`);
    }
  } catch (error) {
    console.error(`[public-entry] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
