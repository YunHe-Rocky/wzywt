import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { request } from "playwright";
import { launchBrowser, selectedProfiles } from "./browser-profiles.mjs";

const baseUrl = process.env.E2E_BASE_URL || "https://localhost:8443";
const password = "Ci-browser-2026!";
let username;
const prisma = new PrismaClient();

function assertSafeTestDatabase() {
  if (process.env.E2E_ALLOW_TEST_DATABASE !== "1") {
    throw new Error("Refusing browser fixture mutation without E2E_ALLOW_TEST_DATABASE=1");
  }
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is required");
  const url = new URL(raw);
  const database = url.pathname.replace(/^\//, "").split("?")[0].toLowerCase();
  const localHost = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (!localHost || (!database.endsWith("_ci") && !database.endsWith("_test"))) {
    throw new Error(`Refusing browser fixture mutation against ${url.hostname}/${database || "<empty>"}`);
  }
}

async function login(page, prefix) {
  await page.goto(`${baseUrl}${prefix}/login?redirect=${encodeURIComponent(`${prefix}/me?tab=history#recent`)}`, { waitUntil: "networkidle" });
  await page.locator("#username").fill(username);
  await page.locator("#password").fill(password);
  const loginResponse = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/auth/login");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  const setCookie = await (await loginResponse).headerValue("set-cookie");
  // WebKit on Windows reports None even for addCookies({sameSite: "Lax"}).
  // Assert our real response's contract, plus actual persistence below.
  assert.match(setCookie || "", /;\s*SameSite=Lax(?:;|$)/i);
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 15_000 });
  await page.getByRole("button", { name: "打开用户菜单" }).waitFor();
  await page.waitForLoadState("networkidle");
  assert.equal(new URL(page.url()).origin, baseUrl);
  assert.equal(new URL(page.url()).pathname, `${prefix}/me`);
  assert.equal(new URL(page.url()).searchParams.get("tab"), "history");
  assert.equal(new URL(page.url()).hash, "#recent");
  const cookie = (await page.context().cookies()).find((item) => item.name === "wzyt_session");
  assert.ok(cookie?.httpOnly, "real session must be stored as HttpOnly");
  assert.equal(cookie.secure, process.env.DEPLOY_ENVIRONMENT !== "local", "session Secure must match the tested deployment mode");
  await page.reload({ waitUntil: "networkidle" });
  assert.equal((await (await page.context().request.get(`${baseUrl}/api/auth/me`)).json()).user?.username, username,
    "session must survive a page refresh");
}

async function assertPrivateDenied(client, leaseId) {
  const data = await client.get(`${baseUrl}/api/resources/data`, { params: { leaseId, resource: "tournaments.lobby" } });
  const renew = await client.patch(`${baseUrl}/api/resources/leases`, { data: { leaseId } });
  for (const result of [data, renew]) {
    assert.ok([401, 403, 410].includes(result.status()), `revoked private lease must be denied, got ${result.status()}`);
  }
}

async function acquirePrivate(client) {
  const response = await client.post(`${baseUrl}/api/resources/leases`, { data: { page: "tournaments" } });
  assert.equal(response.status(), 200);
  return (await response.json()).lease.id;
}

assertSafeTestDatabase();
assert.equal(new URL(baseUrl).protocol, process.env.DEPLOY_ENVIRONMENT === "local" ? "http:" : "https:");
try {
for (const profile of selectedProfiles()) {
username = `ci_e2e_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
await prisma.user.create({
  data: {
    username,
    passwordHash: await bcrypt.hash(password, 10),
    securityQuestion: "CI browser fixture",
    securityAnswerHash: await bcrypt.hash("fixture-answer", 10),
  },
});

let browser;
const browserErrors = [];
try {
  browser = await launchBrowser(profile);
  const context = await browser.newContext({ ...profile.options, locale: "zh-CN", reducedMotion: "reduce", ignoreHTTPSErrors: true });
  const page = await context.newPage();
  page.on("pageerror", (error) => browserErrors.push(error.message));

  const publicLeaseResponse = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/resources/leases");
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator("h1").waitFor();
  await page.getByRole("link", { name: "登录" }).waitFor();
  await assert.doesNotReject(async () => {
    await page.getByRole("heading", { name: "演武公告", exact: true }).waitFor();
  });
  const publicLease = (await (await publicLeaseResponse).json()).lease;
  assert.equal(publicLease.page, "home");
  assert.equal(publicLease.userId, null, "anonymous homepage must receive a public resource lease");

  await login(page, profile.prefix);
  await page.goto(`${baseUrl}${profile.prefix}/tournaments`, { waitUntil: "networkidle" });
  await page.waitForURL((url) => url.pathname === `${profile.prefix}/tournaments`);
  await page.getByRole("heading", { name: "赛事大厅" }).waitFor();

  const privateLeaseResponse = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/resources/leases");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "赛事大厅" }).waitFor();
  await page.waitForFunction(() => !document.body.textContent?.includes("页面资源加载失败"));
  const expiredLease = (await (await privateLeaseResponse).json()).lease?.id;
  assert.ok(expiredLease, "authenticated tournament page must receive a private lease");
  const releaseStatus = await page.evaluate(async (leaseId) => {
    const response = await fetch("/api/resources/leases", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leaseId }),
    });
    return response.status;
  }, expiredLease);
  assert.equal(releaseStatus, 200);
  const reacquireResponse = page.waitForResponse((response) => (
    response.request().method() === "POST"
      && new URL(response.url()).pathname === "/api/resources/leases"
  ));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  const recoveredLeaseResponse = await reacquireResponse;
  const recoveredLeaseBody = await recoveredLeaseResponse.json();
  assert.equal(recoveredLeaseResponse.status(), 200);
  assert.equal(recoveredLeaseBody.lease?.page, "tournaments");
  assert.notEqual(recoveredLeaseBody.lease?.id, expiredLease);
  await page.waitForFunction(() => !document.body.textContent?.includes("正在重新连接"));
  await page.waitForLoadState("networkidle");
  const logoutLease = recoveredLeaseBody.lease.id;

  await page.getByRole("button", { name: "打开用户菜单" }).click();
  await page.getByRole("button", { name: "退出登录" }).click();
  await page.waitForURL((url) => url.pathname === `${profile.prefix}/login`);
  await page.waitForLoadState("networkidle");
  const afterLogout = await context.request.get(`${baseUrl}/api/auth/me`);
  assert.equal((await afterLogout.json()).user, null, "logout must invalidate the browser session");
  await assertPrivateDenied(context.request, logoutLease);
  const protectedPage = await context.request.get(`${baseUrl}${profile.prefix}/me?tab=history`, { maxRedirects: 0 });
  assert.equal(protectedPage.status(), 307);
  assert.equal(new URL(protectedPage.headers().location).origin, baseUrl);

  await login(page, profile.prefix);
  const afterRelogin = await context.request.get(`${baseUrl}/api/auth/me`);
  assert.equal((await afterRelogin.json()).user?.username, username, "re-login must establish a fresh session");
  const revokedLease = await acquirePrivate(context.request);
  assert.equal((await context.request.get(`${baseUrl}/api/resources/data`, { params: { leaseId: revokedLease, resource: "tournaments.lobby" } })).status(), 200);
  await prisma.user.update({ where: { username }, data: { sessionVersion: { increment: 1 } } });
  assert.equal((await (await context.request.get(`${baseUrl}/api/auth/me`)).json()).user, null, "old sessionVersion must fail closed");
  await assertPrivateDenied(context.request, revokedLease);

  // Real login response with its cookie deliberately lost in transit. All auth
  // handlers and the follow-up /me request remain real, in separate cookie jars.
  const missing = await browser.newContext({ ...profile.options, reducedMotion: "reduce", ignoreHTTPSErrors: true });
  const transport = await request.newContext({ ignoreHTTPSErrors: true });
  try {
    const missingPage = await missing.newPage();
    await missingPage.route("**/api/auth/login", async (route) => {
      const response = await transport.post(route.request().url(), { data: route.request().postData(), headers: { "Content-Type": "application/json" } });
      assert.equal(response.status(), 200);
      const headers = { ...response.headers() };
      delete headers["set-cookie"];
      delete headers["content-encoding"];
      delete headers["content-length"];
      await route.fulfill({ status: response.status(), headers, body: await response.body() });
    });
    await missingPage.goto(`${baseUrl}${profile.prefix}/login`);
    await missingPage.locator("#username").fill(username);
    await missingPage.locator("#password").fill(password);
    await missingPage.getByRole("button", { name: "登录", exact: true }).click();
    await missingPage.getByText("账号密码已验证，但登录状态未能保存。", { exact: false }).waitFor();
    assert.equal(new URL(missingPage.url()).pathname, `${profile.prefix}/login`);
    assert.ok(!(await missing.cookies()).some((cookie) => cookie.name === "wzyt_session"));
  } finally { await missing.close(); await transport.dispose(); }
  assert.deepEqual(browserErrors, []);
  await context.close();
} finally {
  await browser?.close();
  await prisma.user.deleteMany({ where: { username } });
  await prisma.authRateLimit.deleteMany({ where: { scope: "login_account", keyHash: createHash("sha256").update(`login_account:${username}`).digest("hex") } });
}
console.log(`${profile.name}: HTTPS proxy, public home, query return, Secure Cookie, refresh, lease recovery, logout, re-login, revoked version and lost cookie passed.`);
}
} finally { await prisma.$disconnect(); }
