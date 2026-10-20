import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { startYanwuHost } from "./yanwu/host.mjs";

const output = path.resolve("test-results/yanwu-foundation");
await mkdir(output, { recursive: true });
const host = await startYanwuHost({ entry: "tests/e2e/yanwu/foundation-entry.tsx", output });
const browser = await chromium.launch({ headless: true, executablePath: process.env.E2E_BROWSER_PATH || undefined });
const errors = [];
let page;

async function open({ width = 390, height = 844, pathName = "/m", role = "user", reducedMotion = "no-preference", init } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion });
  if (init) await context.addInitScript(init);
  const current = await context.newPage();
  current.on("pageerror", error => errors.push(error.message));
  await current.route("**/*", route => route.request().url().startsWith(host.baseURL) ? route.continue() : route.abort());
  await current.goto(`${host.baseURL}${pathName}${pathName.includes("?") ? "&" : "?"}role=${role}`, { waitUntil: "networkidle" });
  return { context, page: current };
}

try {
  let opened = await open(); page = opened.page;
  await page.getByRole("heading", { name: "纸墨演武" }).waitFor();
  assert.equal(await page.getByRole("navigation", { name: "主导航" }).isVisible(), false);
  const dock = page.getByRole("navigation", { name: "底部导航" });
  const dockTargets = dock.locator(":scope > a, :scope > button");
  assert.equal(await dockTargets.count(), 5, "mobile dock exposes all five frequent destinations, including profile");
  assert.equal(await dock.getByRole("link", { name: "我的", exact: true }).getAttribute("href"), "/m/me", "profile configuration is reachable without the top account menu");
  assert.equal(await dock.getByText("演武", { exact: true }).count(), 1, "mobile tournament destination uses the approved visible label");
  assert.equal(await dock.getByRole("link", { name: "演武", exact: true }).count(), 1, "mobile tournament accessible name contains its visible label");
  assert.equal(await page.locator(".header-brand-link .arena-brand-mark text").textContent(), "武", "header brand uses the local seal rather than the legacy crest");
  await page.getByRole("button", { name: "打开图鉴菜单" }).click();
  assert.equal(await page.locator("#dock-catalog-menu").getByRole("link", { name: "装备", exact: true }).isVisible(), true);
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("button", { name: "打开图鉴菜单" }).evaluate(element => element === document.activeElement), true);
  const mobileGeometry = await dockTargets.evaluateAll(elements => elements.map(element => {
    const box = element.getBoundingClientRect();
    return [box.width, box.height];
  }));
  assert.ok(mobileGeometry.every(([width, height]) => width >= 44 && height >= 44), "dock targets remain at least 44px");
  const metrics = await page.evaluate(() => {
    const parse = (value) => {
      const parts = value.match(/[\d.]+/g)?.map(Number) ?? [];
      return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 1];
    };
    const over = (top, bottom) => {
      const alpha = top[3] + bottom[3] * (1 - top[3]);
      if (!alpha) return [0, 0, 0, 0];
      return [0, 1, 2].map(index => (top[index] * top[3] + bottom[index] * bottom[3] * (1 - top[3])) / alpha).concat(alpha);
    };
    const background = (element) => {
      let result = [0, 0, 0, 0];
      for (let current = element; current; current = current.parentElement) result = over(result, parse(getComputedStyle(current).backgroundColor));
      return result[3] < 1 ? over(result, [255, 255, 255, 1]) : result;
    };
    const luminance = (color) => {
      const channels = color.slice(0, 3).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
      return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
    };
    const inspect = (selector) => {
      const element = document.querySelector(selector);
      const bg = background(element);
      const fg = over(parse(getComputedStyle(element).color), bg);
      const values = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
      return { selector, foreground: getComputedStyle(element).color, background: bg, ratio: (values[0] + .05) / (values[1] + .05) };
    };
    return {
      contrast: ["[data-body-copy]", "[data-contrast-surface] #foundation-copy", "#foundation-input", ".btn-primary"].map(inspect),
      inputSize: getComputedStyle(document.querySelector("input")).fontSize,
      overflow: document.documentElement.scrollWidth - innerWidth,
      bodyOverflow: getComputedStyle(document.body).overflowX,
    };
  });
  for (const measurement of metrics.contrast) assert.ok(measurement.ratio >= 4.5, `${measurement.selector} rendered contrast ${measurement.ratio.toFixed(2)} meets WCAG AA`);
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--on-accent", "rgb(12, 34, 56)");
    document.documentElement.style.setProperty("--brand-accent-hover", "rgb(65, 76, 87)");
    document.documentElement.style.setProperty("--brand-stamp-border", "rgb(98, 87, 76)");
  });
  await page.waitForTimeout(250);
  assert.equal(await page.locator(".btn-primary").evaluate(element => getComputedStyle(element).color), "rgb(12, 34, 56)", "primary control consumes the on-accent token");
  await page.locator(".btn-primary").hover();
  await page.waitForTimeout(250);
  assert.equal(await page.locator(".btn-primary").evaluate(element => getComputedStyle(element).backgroundColor), "rgb(65, 76, 87)", "primary hover consumes the accent-hover token");
  assert.equal(await page.locator(".arena-brand-mark").evaluate(element => getComputedStyle(element).borderColor), "rgb(98, 87, 76)", "brand seal consumes the stamp-border token");
  await page.evaluate(() => {
    for (const name of ["--on-accent", "--brand-accent-hover", "--brand-stamp-border"]) document.documentElement.style.removeProperty(name);
  });
  await page.mouse.move(0, 0);
  await page.waitForTimeout(250);
  assert.equal(metrics.inputSize, "16px");
  assert.ok(metrics.overflow <= 0, "390px document does not overflow");
  assert.notEqual(metrics.bodyOverflow, "hidden", "document overflow is not clipped to hide layout bugs");
  await page.screenshot({ path: path.join(output, "foundation-390.png"), fullPage: true });
  await opened.context.close();

  opened = await open({ width: 1440, height: 900, pathName: "/", role: "admin", reducedMotion: "reduce" }); page = opened.page;
  const mainNav = page.getByRole("navigation", { name: "主导航" });
  assert.ok(await mainNav.isVisible());
  for (const label of ["演武首页", "赛事大厅", "演武动态"]) {
    assert.equal(await mainNav.getByRole("link", { name: label, exact: true }).count(), 1);
  }
  assert.equal(await mainNav.getByRole("link", { name: "我的", exact: true }).count(), 0, "personal navigation belongs only to the account menu");
  await mainNav.getByRole("button", { name: "打开图鉴菜单" }).click();
  assert.ok(await page.locator("#header-catalog-menu").getByRole("link", { name: "英雄", exact: true }).isVisible());
  assert.ok(await page.locator("#header-catalog-menu").getByRole("link", { name: "装备", exact: true }).isVisible());
  await page.keyboard.press("Escape");
  assert.ok(await mainNav.getByRole("button", { name: "打开图鉴菜单" }).evaluate(element => element === document.activeElement));
  await page.getByRole("button", { name: "打开用户菜单" }).click();
  assert.ok(await page.getByText("后台管理", { exact: true }).isVisible());
  await page.screenshot({ path: path.join(output, "foundation-1440.png"), fullPage: true });
  await opened.context.close();

  opened = await open({ width: 320, height: 812, pathName: "/m", role: "guest", reducedMotion: "reduce" }); page = opened.page;
  assert.ok(await page.getByRole("link", { name: "登录", exact: true }).isVisible());
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: path.join(output, "foundation-320.png"), fullPage: true });
  await opened.context.close();

  opened = await open({ pathName: "/m?scenario=intro", reducedMotion: "no-preference" }); page = opened.page;
  const intro = page.getByRole("dialog", { name: "演武堂开场动画" });
  await intro.waitFor();
  await page.evaluate(() => document.documentElement.style.setProperty("--brand-stamp-ink", "rgb(11, 22, 33)"));
  assert.equal(await intro.locator(".arena-intro-mark path").evaluate(element => getComputedStyle(element).stroke), "rgb(11, 22, 33)", "opening seal consumes the stamp-ink token");
  assert.equal(await intro.locator("canvas").count(), 0, "opening uses CSS/SVG rather than Canvas");
  assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden");
  await page.keyboard.press("Escape");
  await intro.waitFor({ state: "detached" });
  assert.equal(await page.evaluate(() => document.body.style.overflow), "");
  assert.equal(await page.evaluate(() => [...document.querySelectorAll("main, header, .dock-shell")].every(element => !element.inert)), true);
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.getByRole("dialog", { name: "演武堂开场动画" }).count(), 0, "automatic opening runs once per tab session");
  const replayButton = page.getByRole("button", { name: "手动重播开场" });
  await page.evaluate(() => {
    document.body.style.overflow = "clip";
    document.querySelector("header").inert = true;
  });
  await replayButton.focus();
  await replayButton.click();
  await page.evaluate(() => window.dispatchEvent(new Event("yanwu:replay-intro")));
  assert.equal(await page.getByRole("dialog", { name: "演武堂开场动画" }).count(), 1, "consecutive replay requests keep one active opening");
  await page.keyboard.press("Tab");
  assert.ok(await page.getByRole("button", { name: "跳过开场动画" }).evaluate(element => element === document.activeElement), "Tab remains trapped on the skip action");
  await page.keyboard.press("Escape");
  assert.equal(await page.evaluate(() => document.body.style.overflow), "clip", "opening restores the exact prior body overflow");
  assert.equal(await page.locator("header").evaluate(element => element.inert), true, "opening restores the exact prior inert state");
  assert.ok(await replayButton.evaluate(element => element === document.activeElement), "manual replay restores focus to its trigger");
  await page.evaluate(() => { document.body.style.overflow = ""; document.querySelector("header").inert = false; });
  await replayButton.click();
  await page.evaluate(() => { history.pushState({}, "", "/login"); window.dispatchEvent(new PopStateEvent("popstate")); });
  await page.getByRole("dialog", { name: "演武堂开场动画" }).waitFor({ state: "detached" });
  assert.equal(await page.evaluate(() => document.body.style.overflow), "", "route unmount releases the scroll lock");
  await opened.context.close();

  for (const capture of [
    { profile: "desktop", width: 1440, height: 900, pathName: "/?scenario=intro-desktop" },
    { profile: "mobile", width: 390, height: 844, pathName: "/m?scenario=intro-mobile" },
  ]) {
    opened = await open({ ...capture, reducedMotion: "no-preference" }); page = opened.page;
    await page.getByRole("dialog", { name: "演武堂开场动画" }).waitFor();
    await page.waitForTimeout(720);
    await page.screenshot({ path: path.join(output, `intro-${capture.profile}.png`) });
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector(".arena-intro-caption")).opacity) >= .99);
    await page.screenshot({ path: path.join(output, `intro-${capture.profile}-title.png`) });
    await opened.context.close();
  }

  opened = await open({ pathName: "/m?scenario=natural", reducedMotion: "no-preference" }); page = opened.page;
  await page.getByRole("dialog", { name: "演武堂开场动画" }).waitFor();
  await page.getByRole("dialog", { name: "演武堂开场动画" }).waitFor({ state: "detached", timeout: 3000 });
  assert.deepEqual(await page.evaluate(() => ({ body: document.body.style.overflow, root: document.documentElement.style.overflow, inert: [...document.querySelectorAll("main, header, .dock-shell")].map(element => element.inert) })), { body: "", root: "", inert: [false, false, false] }, "natural completion releases every opening lock");
  await opened.context.close();

  opened = await open({ pathName: "/m?scenario=visibility", reducedMotion: "no-preference" }); page = opened.page;
  await page.getByRole("dialog", { name: "演武堂开场动画" }).waitFor();
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await page.getByRole("dialog", { name: "演武堂开场动画" }).waitFor({ state: "detached" });
  assert.equal(await page.evaluate(() => document.body.style.overflow), "", "backgrounding releases the opening lock");
  await opened.context.close();

  opened = await open({ width: 1440, height: 900, pathName: "/?scenario=exact-restore", role: "admin", reducedMotion: "reduce" }); page = opened.page;
  const exactFocusTarget = page.getByRole("button", { name: "打开用户菜单" });
  await exactFocusTarget.focus();
  await page.evaluate(() => {
    document.body.style.overflow = "clip";
    document.documentElement.style.overflow = "scroll";
    document.querySelector("main").inert = true;
    document.querySelector("header").inert = false;
    document.querySelector(".dock-shell").inert = true;
    window.dispatchEvent(new Event("yanwu:replay-intro"));
  });
  await page.getByRole("dialog", { name: "演武堂开场动画" }).waitFor();
  await page.keyboard.press("Escape");
  assert.deepEqual(await page.evaluate(() => ({ body: document.body.style.overflow, root: document.documentElement.style.overflow, main: document.querySelector("main").inert, header: document.querySelector("header").inert, dock: document.querySelector(".dock-shell").inert })), { body: "clip", root: "scroll", main: true, header: false, dock: true }, "opening restores exact html/body overflow and each prior inert value");
  assert.ok(await exactFocusTarget.evaluate(element => element === document.activeElement), "exact restoration returns focus");
  await opened.context.close();

  opened = await open({ width: 1440, height: 900, pathName: "/?scenario=standard-route", reducedMotion: "no-preference" }); page = opened.page;
  await page.getByRole("dialog", { name: "演武堂开场动画" }).waitFor();
  await page.evaluate(() => { history.pushState({}, "", "/heroes"); window.dispatchEvent(new PopStateEvent("popstate")); });
  await page.getByRole("dialog", { name: "演武堂开场动画" }).waitFor({ state: "detached", timeout: 1000 });
  assert.deepEqual(await page.evaluate(() => ({ path: location.pathname, body: document.body.style.overflow, root: document.documentElement.style.overflow, mainInert: document.querySelector("main").inert })), { path: "/heroes", body: "", root: "", mainInert: false }, "standard route changes release opening state without replay");
  await page.getByRole("button", { name: "手动重播开场" }).click();
  assert.equal(await page.getByRole("dialog", { name: "演武堂开场动画" }).count(), 1, "manual replay remains available after route change");
  await page.getByRole("button", { name: "跳过开场动画" }).click();
  await opened.context.close();

  opened = await open({ pathName: "/m?scenario=motion-change", reducedMotion: "no-preference" }); page = opened.page;
  await page.getByRole("dialog", { name: "演武堂开场动画" }).waitFor();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("dialog", { name: "演武堂开场动画" }).waitFor({ state: "detached", timeout: 1000 });
  assert.equal(await page.evaluate(() => document.body.style.overflow), "", "enabling reduced motion releases the opening immediately");
  await opened.context.close();

  opened = await open({ pathName: "/m?scenario=reduced", reducedMotion: "reduce" }); page = opened.page;
  assert.equal(await page.getByRole("dialog", { name: "演武堂开场动画" }).count(), 0, "reduced motion skips automatic opening");
  await page.getByRole("button", { name: "手动重播开场" }).click();
  const staticStartedAt = Date.now();
  await page.getByRole("dialog", { name: "演武堂开场动画" }).waitFor();
  assert.equal(await page.getByRole("dialog", { name: "演武堂开场动画" }).getAttribute("data-motion"), "static");
  await page.getByRole("dialog", { name: "演武堂开场动画" }).waitFor({ state: "detached", timeout: 1200 });
  const staticElapsed = Date.now() - staticStartedAt;
  assert.ok(staticElapsed >= 350 && staticElapsed < 900, `reduced-motion manual replay remains a short static mark (${staticElapsed}ms)`);
  await opened.context.close();

  opened = await open({ pathName: "/m?scenario=modal", reducedMotion: "no-preference" }); page = opened.page;
  assert.equal(await page.getByRole("dialog", { name: "演武堂开场动画" }).count(), 0, "opening does not cover an existing modal");
  await page.evaluate(() => window.dispatchEvent(new Event("yanwu:replay-intro")));
  assert.equal(await page.getByRole("dialog", { name: "演武堂开场动画" }).count(), 0, "manual replay does not cover an existing modal");
  await opened.context.close();

  opened = await open({ width: 1440, height: 900, pathName: "/?scenario=resize", role: "admin", reducedMotion: "reduce" }); page = opened.page;
  await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: "打开图鉴菜单" }).click();
  const initialPath = await page.evaluate(() => location.pathname + location.search);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('nav[aria-label="主导航"],nav[aria-label="底部导航"]')].filter(element => { const box = element.getBoundingClientRect(); return box.width > 0 && box.height > 0; }).length), 1, "resize shows one primary navigation at mobile width");
  assert.equal(await page.evaluate(() => location.pathname + location.search), initialPath, "desktop-to-mobile resize preserves route state");
  await page.getByRole("navigation", { name: "底部导航" }).getByRole("button", { name: "打开图鉴菜单" }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('nav[aria-label="主导航"],nav[aria-label="底部导航"]')].filter(element => { const box = element.getBoundingClientRect(); return box.width > 0 && box.height > 0; }).length), 1, "resize returns to one desktop primary navigation");
  assert.equal(await page.evaluate(() => location.pathname + location.search), initialPath, "mobile-to-desktop resize preserves route state");
  await opened.context.close();

  const debugPages = [
    { suffix: "gyro", route: "/debug", heading: "陀螺仪调试面板" },
    { suffix: "login-effect", route: "/debug/login-effect", heading: "#1 演武 · 登录过渡效果预览" },
    { suffix: "orb-colors", route: "/debug/orb-colors", heading: "#2 光球配色预览" },
  ];
  for (const { suffix, heading, pathName, viewport, width, height } of debugPages.flatMap(item => [
    { ...item, pathName: item.route, viewport: "desktop", width: 1440, height: 900 },
    { ...item, pathName: `/m${item.route}`, viewport: "mobile", width: 390, height: 844 },
  ])) {
    opened = await open({ width, height, pathName, reducedMotion: "reduce" }); page = opened.page;
    await page.getByRole("heading", { name: heading, exact: true }).waitFor();
    const file = path.join(output, `debug-${suffix}-${viewport}.png`);
    await page.screenshot({ path: file, fullPage: true });
    await opened.context.close();

    opened = await open({ width: 320, height: 812, pathName, reducedMotion: "reduce" }); page = opened.page;
    await page.getByRole("heading", { name: heading, exact: true }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${pathName} has no page-level horizontal overflow at 320px`);
    await opened.context.close();
  }

  opened = await open({ pathName: "/login", reducedMotion: "no-preference" }); page = opened.page;
  assert.equal(await page.getByRole("dialog", { name: "演武堂开场动画" }).count(), 0, "fullscreen routes skip opening");
  await opened.context.close();

  opened = await open({ pathName: "/m?scenario=storage", reducedMotion: "no-preference", init: () => {
    Object.defineProperty(window, "sessionStorage", { configurable: true, get() { throw new DOMException("blocked", "SecurityError"); } });
  } }); page = opened.page;
  await page.getByRole("dialog", { name: "演武堂开场动画" }).waitFor();
  await page.getByRole("button", { name: "跳过开场动画" }).click();
  await page.getByRole("button", { name: "手动重播开场" }).click();
  await page.getByRole("dialog", { name: "演武堂开场动画" }).waitFor();
  assert.equal(await page.getByRole("dialog", { name: "演武堂开场动画" }).count(), 1, "storage failure keeps one active instance");
  await opened.context.close();

  assert.deepEqual(host.apiRequests, []);
  assert.deepEqual(host.violations, [], "foundation suite declares every API dependency");
  assert.deepEqual(errors, []);
  console.log("PASS: Yanwu shared foundation, navigation, and opening.");
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true }).catch(() => {});
    await writeFile(path.join(output, "failure.html"), await page.content()).catch(() => {});
  }
  throw error;
} finally {
  await browser.close();
  await host.close();
}
