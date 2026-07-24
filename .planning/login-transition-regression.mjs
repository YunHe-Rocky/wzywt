import { chromium } from "playwright";
import assert from "node:assert/strict";

const BASE_URL = "http://127.0.0.1:8001";
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function verifyTransition(browser, reducedMotion) {
  const context = await browser.newContext({ reducedMotion });
  const page = await context.newPage();
  page.setDefaultTimeout(5_000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.route("**/api/auth/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ user: null }),
  }));
  await page.route("**/api/auth/login", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ id: 9, username: "tester", role: "user" }),
  }));

  console.log(`Opening login (${reducedMotion})`);
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: 10_000 });
  await page.locator("#username").waitFor();
  console.log(`Submitting login (${reducedMotion})`);
  await page.locator("#username").fill("tester");
  await page.locator('input[name="password"]').fill("12345678901");

  const startedAt = Date.now();
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForURL(/\/\?_from=login$/, { timeout: 3_000 });
  const elapsed = Date.now() - startedAt;

  if (reducedMotion === "reduce") {
    assert.ok(elapsed < 700, `reduced-motion navigation took ${elapsed}ms`);
  } else {
    assert.ok(elapsed >= 900 && elapsed < 2_000, `animation navigation took ${elapsed}ms`);
  }
  assert.deepEqual(errors, []);
  await context.close();
  return elapsed;
}

const browser = await chromium.launch({
  headless: true,
  executablePath: CHROME_PATH,
});

try {
  const normal = await verifyTransition(browser, "no-preference");
  const reduced = await verifyTransition(browser, "reduce");
  console.log(`Login transition passed: normal=${normal}ms reduced=${reduced}ms`);
} finally {
  await browser.close();
}
