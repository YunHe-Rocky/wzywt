import assert from "node:assert/strict";
import path from "node:path";
import { chromium } from "playwright";

const BASE_URL = "http://127.0.0.1:8001";
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const SCREENSHOT_PATH = path.resolve(".planning/time-wheel-mobile.png");

const hero = {
  id: 167,
  heroId: 167,
  name: "孙悟空",
  title: "齐天大圣",
  roleType: "jungle",
  heroType: 4,
  heroType2: 0,
  imageUrl: "https://example.com/remote-hero.jpg",
  skinsJson: JSON.stringify([{
    name: "齐天大圣",
    index: 1,
    imageUrls: ["https://example.com/remote-skin.jpg"],
  }]),
  mingge: false,
  minggeName: null,
  minggeRelatedId: null,
};

const browser = await chromium.launch({
  headless: true,
  executablePath: CHROME_PATH,
});

async function mockCommon(page, user) {
  await page.route("**/api/auth/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ user }),
  }));
  await page.route("**/api/announcements**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ announcements: [] }),
  }));
}

try {
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    let loggedIn = false;
    await page.route("**/api/auth/me", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: loggedIn
          ? { userId: 1, username: "admin", role: "admin" }
          : null,
      }),
    }));
    await page.route("**/api/auth/login", (route) => {
      loggedIn = true;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: 1, username: "admin", role: "admin" }),
      });
    });
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
    await page.locator("#username").fill("admin");
    await page.locator('input[name="password"]').fill("12345678901");
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await page.waitForURL(/\/\?_from=login$/, { timeout: 4_000 });
    assert.equal(new URL(page.url()).pathname, "/");
    await context.close();
  }

  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const imageRequests = [];
    page.on("request", (request) => {
      if (request.resourceType() === "image" && request.url().includes("167")) {
        imageRequests.push(request.url());
      }
    });
    await mockCommon(page, null);
    await page.route(/\/api\/heroes(?:\?.*)?$/, (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([hero]),
    }));
    await page.goto(`${BASE_URL}/heroes`, { waitUntil: "domcontentloaded" });
    await page.getByText("孙悟空", { exact: true }).waitFor();
    await page.locator('img[alt="孙悟空"]').waitFor();
    assert.ok(imageRequests.length > 0, "Hero image request missing");
    assert.equal(new URL(imageRequests[0]).pathname, "/heroes/skins/167/1.jpg");
    await context.close();
  }

  {
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
      locale: "zh-CN",
    });
    const page = await context.newPage();
    await mockCommon(page, { userId: 2, username: "tester", role: "user" });
    await page.route("**/api/tournaments", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ tournaments: [], publicTournaments: [] }),
    }));
    await page.goto(`${BASE_URL}/tournaments`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "截止时间", exact: true }).click();

    const dialog = page.getByRole("dialog", { name: "设置报名截止时间" });
    const hourWheel = dialog.getByRole("listbox", { name: "小时" });
    const minuteWheel = dialog.getByRole("listbox", { name: "分钟" });
    await hourWheel.waitFor();
    assert.equal(await dialog.locator(".time-wheel-option[data-selected]").count(), 2);
    assert.equal(await dialog.locator(".time-wheel-option[data-selected] i").count(), 2);

    const beforeMinute = Number(await minuteWheel.getAttribute("aria-activedescendant")
      .then((id) => id?.split("-").at(-1)));
    await minuteWheel.focus();
    await minuteWheel.press("ArrowDown");
    const afterMinute = Number(await minuteWheel.getAttribute("aria-activedescendant")
      .then((id) => id?.split("-").at(-1)));
    assert.equal(afterMinute, beforeMinute + 5);

    const box = await dialog.boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 375, "Time dialog overflows mobile viewport");
    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });

    await page.getByRole("button", { name: "关闭日期时间选择器" }).click();
    await page.getByRole("button", { name: "打开图鉴菜单" }).click();
    const heroLink = page.getByRole("link", { name: "英雄" });
    await heroLink.click({ noWaitAfter: true });
    await page.locator('[aria-busy="true"]').waitFor({ timeout: 1_000 });
    await page.waitForURL("**/heroes", { timeout: 5_000 });
    await context.close();
  }

  console.log(`Optimization regression passed; screenshot=${SCREENSHOT_PATH}`);
} finally {
  await browser.close();
}
