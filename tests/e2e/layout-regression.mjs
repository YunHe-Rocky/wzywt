import { chromium } from "playwright";
import path from "node:path";

const baseUrl = "http://127.0.0.1:8001";
const username = process.env.E2E_ADMIN_USER;
const password = process.env.E2E_ADMIN_PASSWORD;
const browserPath = process.env.E2E_BROWSER_PATH;

if (!username || !password || !browserPath) {
  throw new Error("Missing E2E runtime configuration");
}

const browser = await chromium.launch({ headless: true, executablePath: browserPath });
const context = await browser.newContext({ locale: "zh-CN" });
const page = await context.newPage();
const consoleErrors = [];

page.on("console", (message) => {
  if (
    message.type() === "error"
    && !message.text().startsWith("Failed to load resource:")
    && !message.text().startsWith("Failed to fetch RSC payload")
  ) {
    consoleErrors.push(message.text());
  }
});
page.on("pageerror", (error) => consoleErrors.push(error.message));
page.on("requestfailed", (request) => {
  const errorText = request.failure()?.errorText || "";
  if (
    request.url().startsWith(baseUrl)
    && !request.url().includes("webpack-hmr")
    && errorText !== "net::ERR_ABORTED"
  ) {
    consoleErrors.push(`Request failed: ${request.url()} ${errorText}`);
  }
});

async function waitReady() {
  await page.waitForLoadState("domcontentloaded");
  try {
    await page.waitForLoadState("networkidle", { timeout: 5_000 });
  } catch {
    await page.waitForTimeout(600);
  }
}

async function goto(route, theme = "1") {
  await page.goto(`${baseUrl}${route}#${theme}`);
  await waitReady();
}

async function assertNoHorizontalOverflow(label) {
  const metrics = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: Math.max(
      document.documentElement.scrollWidth,
      document.body?.scrollWidth || 0,
    ),
  }));
  if (metrics.document > metrics.viewport + 1) {
    throw new Error(`${label} horizontal overflow: ${JSON.stringify(metrics)}`);
  }
}

try {
  await page.setViewportSize({ width: 375, height: 812 });
  await goto("/login");
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForURL("**/admin**", { timeout: 20_000 });

  const mobileRoutes = [
    ["/", "首页"],
    ["/tournaments", "赛事大厅"],
    ["/heroes", "英雄图鉴"],
    ["/equipment", "装备图鉴"],
    ["/changelog", "更新日志"],
    ["/monitor", "监控"],
    ["/admin", "后台"],
  ];

  for (const theme of ["1", "2"]) {
    for (const [route, label] of mobileRoutes) {
      await goto(route, theme);
      await assertNoHorizontalOverflow(`${label} #${theme} 375px`);
    }
  }

  await goto("/tournaments", "1");
  await page.getByRole("button", { name: "截止时间", exact: true }).click();
  const calendar = page.getByRole("dialog", { name: "设置报名截止时间" });
  await calendar.waitFor();
  const calendarBox = await calendar.boundingBox();
  if (!calendarBox || calendarBox.x < 0 || calendarBox.x + calendarBox.width > 375) {
    throw new Error(`Calendar overflows mobile viewport: ${JSON.stringify(calendarBox)}`);
  }
  if (await calendar.locator(".calendar-day").count() < 28) {
    throw new Error("Calendar date grid incomplete");
  }
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.resolve(".planning/layout-calendar-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "关闭日期时间选择器" }).click();

  await goto("/me", "2");
  const heroTrigger = page.getByRole("button", { name: /打开英雄列表/ }).first();
  await heroTrigger.click();
  const listbox = page.getByRole("listbox", { name: "英雄候选列表" });
  await listbox.waitFor();
  const apiResponse = await context.request.get(`${baseUrl}/api/heroes`);
  const allHeroes = await apiResponse.json();
  const optionCount = await listbox.getByRole("option").count();
  if (!Array.isArray(allHeroes) || optionCount !== allHeroes.length) {
    throw new Error(`Hero candidates incomplete: options=${optionCount}, api=${allHeroes?.length}`);
  }
  const heroLayer = page.locator(".hero-select-popover");
  const heroBox = await heroLayer.boundingBox();
  if (
    !heroBox
    || heroBox.x < 0
    || heroBox.x + heroBox.width > 375
    || heroBox.y < 0
    || heroBox.y + heroBox.height > 812
  ) {
    throw new Error(`Hero sheet overflows mobile viewport: ${JSON.stringify(heroBox)}`);
  }
  const lastOption = listbox.getByRole("option").last();
  await lastOption.scrollIntoViewIfNeeded();
  if (!await lastOption.isVisible()) {
    throw new Error("Last hero option cannot be reached");
  }
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.resolve(".planning/layout-hero-select-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "关闭英雄列表" }).click();

  await page.setViewportSize({ width: 812, height: 375 });
  await goto("/tournaments", "1");
  await page.getByRole("button", { name: "截止时间", exact: true }).click();
  const landscapeCalendar = page.getByRole("dialog", { name: "设置报名截止时间" });
  await landscapeCalendar.waitFor();
  const landscapeBox = await landscapeCalendar.boundingBox();
  if (!landscapeBox || landscapeBox.y < 0 || landscapeBox.y + landscapeBox.height > 375) {
    throw new Error(`Calendar overflows landscape viewport: ${JSON.stringify(landscapeBox)}`);
  }
  await assertNoHorizontalOverflow("Calendar 812x375");
  await page.getByRole("button", { name: "关闭日期时间选择器" }).click();

  await page.setViewportSize({ width: 1440, height: 900 });
  for (const route of ["/", "/tournaments", "/me", "/heroes", "/equipment", "/changelog", "/admin"]) {
    await goto(route, "1");
    await assertNoHorizontalOverflow(`${route} 1440px`);
  }
  await goto("/tournaments", "1");
  await page.getByRole("button", { name: "截止时间", exact: true }).click();
  const desktopCalendar = page.getByRole("dialog", { name: "设置报名截止时间" });
  const desktopGridColumns = await desktopCalendar.locator(".calendar-content").evaluate(
    (node) => getComputedStyle(node).gridTemplateColumns,
  );
  if (desktopGridColumns.split(" ").length < 2) {
    throw new Error(`Calendar desktop layout is not two-column: ${desktopGridColumns}`);
  }
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.resolve(".planning/layout-calendar-desktop.png"),
    fullPage: true,
  });
} finally {
  await browser.close();
}

if (consoleErrors.length > 0) {
  throw new Error(`Browser console errors: ${JSON.stringify(consoleErrors)}`);
}

console.log("Responsive layout regression passed");

