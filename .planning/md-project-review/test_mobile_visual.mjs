import { chromium } from "playwright";
import { fileURLToPath } from "node:url";

const screenshot = fileURLToPath(new URL("./mobile-background.png", import.meta.url));
const largeAvatar = fileURLToPath(new URL("../../public/heroes/skins/534/2.jpg", import.meta.url));
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
});
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

await page.goto("http://127.0.0.1:8010/", { waitUntil: "domcontentloaded" });
await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {
  // 首页存在持续请求时，以核心布局完成渲染作为稳定点。
});
await page.locator(".bg-orbs-container").waitFor();
await page.waitForTimeout(350);

const readOrbX = () => page.locator(".bg-orbs-container").evaluate(
  (element) => getComputedStyle(element).getPropertyValue("--orb-mx").trim(),
);
const initial = await readOrbX();

await page.evaluate(() => {
  const touch = new Touch({
    identifier: 1,
    target: document.body,
    clientX: 20,
    clientY: 760,
    pageX: 20,
    pageY: 760,
    radiusX: 2,
    radiusY: 2,
    force: 0.5,
  });
  document.dispatchEvent(new TouchEvent("touchmove", {
    touches: [touch],
    targetTouches: [touch],
    changedTouches: [touch],
    bubbles: true,
  }));
});
await page.waitForTimeout(250);
const afterTouch = await readOrbX();
if (initial !== afterTouch) {
  throw new Error(`touchmove changed orb input: ${initial} -> ${afterTouch}`);
}

await page.evaluate(() => {
  const event = new Event("deviceorientation");
  Object.defineProperties(event, {
    alpha: { value: 10 },
    beta: { value: 25 },
    gamma: { value: 30 },
  });
  window.dispatchEvent(event);
});
await page.waitForTimeout(500);
const afterGyro = await readOrbX();
const shadowX = await page.evaluate(
  () => getComputedStyle(document.documentElement).getPropertyValue("--glass-shadow-x").trim(),
);
const orbFilter = await page.locator(".bg-orb--1").evaluate(
  (element) => getComputedStyle(element).filter,
);

if (afterGyro === initial) {
  throw new Error(`deviceorientation did not move the background (${initial}); console=${consoleErrors.join(" | ")}`);
}
if (!shadowX || shadowX === "0px") throw new Error("deviceorientation did not update the glass shadow");
if (orbFilter !== "blur(48px)") {
  throw new Error(`mobile orb filter should stay stable, got ${orbFilter}`);
}

await page.screenshot({ path: screenshot, fullPage: true });
const loginResponse = await context.request.post("http://127.0.0.1:8010/api/auth/login", {
  data: { username: "admin", password: "admin12345678" },
});
if (!loginResponse.ok()) throw new Error(`test login failed: ${loginResponse.status()}`);

let avatarUpload = null;
await page.route("**/api/me/avatar", async (route) => {
  const body = route.request().postDataBuffer();
  const multipart = body?.toString("latin1") ?? "";
  avatarUpload = {
    bytes: body?.byteLength ?? 0,
    jpeg: multipart.includes("Content-Type: image/jpeg"),
    filename: multipart.includes('filename="avatar.jpg"'),
  };
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ avatar: "mobile-test.jpg" }),
  });
});
await page.goto("http://127.0.0.1:8010/me", { waitUntil: "domcontentloaded" });
const avatarInput = page.locator('input[type="file"][accept="image/*"]');
await avatarInput.waitFor({ state: "attached" });
await Promise.all([
  page.waitForResponse("**/api/me/avatar"),
  avatarInput.setInputFiles(largeAvatar),
]);
if (
  !avatarUpload
  || avatarUpload.bytes > 2 * 1024 * 1024
  || !avatarUpload.jpeg
  || !avatarUpload.filename
) {
  throw new Error(`mobile avatar was not normalized: ${JSON.stringify(avatarUpload)}`);
}

console.log(JSON.stringify({
  touchStable: true,
  initialOrbX: initial,
  gyroOrbX: afterGyro,
  glassShadowX: shadowX,
  mobileOrbFilter: orbFilter,
  avatarUpload,
  consoleErrors,
  screenshot,
}, null, 2));
await browser.close();
