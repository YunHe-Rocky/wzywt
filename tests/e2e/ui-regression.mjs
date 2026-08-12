import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.E2E_BASE_URL || "http://localhost:8001";
const screenshotPath = path.resolve(".cache/test-artifacts/ui-room-preview.png");
const username = process.env.E2E_ADMIN_USER;
const password = process.env.E2E_ADMIN_PASSWORD;
const browserPath = process.env.E2E_BROWSER_PATH;

await mkdir(path.dirname(screenshotPath), { recursive: true });

if (!username || !password || !browserPath) {
  throw new Error("Missing E2E runtime configuration");
}

const browser = await chromium.launch({ headless: true, executablePath: browserPath });
const context = await browser.newContext({
  viewport: { width: 375, height: 812 },
  locale: "zh-CN",
});
const page = await context.newPage();
const consoleErrors = [];
let createdRoomId = null;

page.on("console", (message) => {
  if (
    message.type() === "error"
    && !message.text().startsWith("Failed to load resource:")
  ) {
    consoleErrors.push(message.text());
  }
});
page.on("pageerror", (error) => consoleErrors.push(error.message));
page.on("requestfailed", (request) => {
  const url = request.url();
  const errorText = request.failure()?.errorText || "";
  if (
    url.startsWith(baseUrl)
    && !url.includes("webpack-hmr")
    && errorText !== "net::ERR_ABORTED"
  ) {
    consoleErrors.push(`Request failed: ${url} ${errorText}`);
  }
});

async function waitReady() {
  await page.waitForLoadState("domcontentloaded");
  try {
    await page.waitForLoadState("networkidle", { timeout: 5_000 });
  } catch {
    await page.waitForTimeout(500);
  }
}

try {
  await page.goto(`${baseUrl}/login`);
  await waitReady();
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForURL("**/?_from=login", { timeout: 20_000 });

  await page.goto(`${baseUrl}/admin/announcements`);
  await waitReady();
  await page.getByRole("button", { name: "新建公告" }).click();
  if (await page.locator("textarea").count() !== 1) throw new Error("Markdown editor missing");
  if (!await page.getByLabel("公告 Markdown 预览").isVisible()) throw new Error("Markdown preview missing");

  await page.goto(`${baseUrl}/tournaments`);
  await waitReady();
  await page.getByRole("button", { name: "截止时间", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "设置报名截止时间" });
  await dialog.waitFor();
  if (await dialog.getByRole("listbox").count() !== 2) throw new Error("Time wheels missing");
  const modalZ = Number(await dialog.evaluate((node) => getComputedStyle(node).zIndex));
  const headerZ = Number(await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--layer-sticky")));
  if (!(modalZ > headerZ)) throw new Error(`Invalid modal layer: ${modalZ} <= ${headerZ}`);
  await page.getByRole("button", { name: "关闭日期时间选择器" }).click();

  const createResponse = await context.request.post(`${baseUrl}/api/tournaments`, {
    data: {
      name: "E2E 房间信息预览",
      deadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      isPublic: false,
      announcement: "请提前十分钟上线，确认分路偏好。",
    },
  });
  if (!createResponse.ok()) throw new Error(`Room setup failed: ${await createResponse.text()}`);
  const room = (await createResponse.json()).tournament;
  createdRoomId = room.id;

  await page.goto(`${baseUrl}/tournaments`);
  await waitReady();
  await page.getByPlaceholder("6 位房间号").fill(room.code);
  await page.getByRole("button", { name: "加入", exact: true }).click();
  const preview = page.getByRole("dialog", { name: "E2E 房间信息预览" });
  await preview.waitFor();
  for (const text of ["截止时间", "房间公告", "请提前十分钟上线，确认分路偏好。", "报名情况"]) {
    if (!await preview.getByText(text, { exact: true }).isVisible()) {
      throw new Error(`Room preview missing: ${text}`);
    }
  }
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await page.setViewportSize({ width: 812, height: 375 });
  const previewBox = await preview.boundingBox();
  if (!previewBox || previewBox.y < 0 || previewBox.y + previewBox.height > 375) {
    throw new Error(`Room preview overflows landscape viewport: ${JSON.stringify(previewBox)}`);
  }
} finally {
  if (createdRoomId !== null) {
    await context.request.delete(`${baseUrl}/api/tournaments/${createdRoomId}`);
  }
  await browser.close();
}

if (consoleErrors.length > 0) {
  throw new Error(`Browser console errors: ${JSON.stringify(consoleErrors)}`);
}
console.log(`UI regression passed; screenshot=${screenshotPath}`);
