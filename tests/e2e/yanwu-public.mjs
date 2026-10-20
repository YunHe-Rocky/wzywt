import assert from "node:assert/strict";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { startYanwuHost } from "./yanwu/host.mjs";
import { hero, formHero, equipmentDetail, entries, markdown, user, fixtureImage } from "./yanwu/public-fixtures.ts";
const output = path.resolve("test-results/yanwu-public");
await mkdir(output, { recursive: true });
await Promise.all(["manifest.json", "verification.json"].map(f => rm(path.join(output, f), { force: true })));
const mutations = []; let session = null; let profileReadFailed = false;
const host = await startYanwuHost({ entry: "tests/e2e/yanwu/public-entry.tsx", aliases: {
  "next/navigation": "tests/e2e/yanwu/public-navigation.tsx",
  "@/features/auth/client/api": "src/features/auth/client/api.ts",
  "@/features/auth/client": "tests/e2e/yanwu/public-auth.tsx",
  "@/features/resource-scheduler/client": "tests/e2e/yanwu/public-resources.tsx",
}, apiHandlers: async ({ request, url }) => {
  const method = request.method; const pathname = url.pathname;
  const scenario = new URL(request.headers.referer || host.baseURL).searchParams.get("case");
  const fail = scenario === "error";
  if (method === "GET" && pathname === "/api/auth/me") return { body: { user: session } };
  if (method === "POST" && ["/api/auth/login", "/api/auth/register", "/api/auth/reset-password"].includes(pathname)) {
    let raw = ""; for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw); mutations.push({ pathname, body });
    if (fail) return { status: 400, body: { error: "测试：操作失败，请重试" } };
    if (pathname.endsWith("reset-password")) return { body: body.answer ? { resetToken: "fictional-reset-token" } : {} };
    if (scenario !== "missing-session") session = { ...user, username: body.username };
    return { body: { username: body.username } };
  }
  if (method === "GET" && pathname === "/api/auth/security-question" && url.searchParams.has("username")) return { body: { question: "你的出生城市是？" } };
  if (method === "GET" && pathname === "/api/heroes/watch") return { contentType: "text/event-stream", body: "event: connected\ndata: {}\n\n" };
  if (method === "GET" && ["/api/heroes/105", "/api/heroes/205"].includes(pathname)) return { body: scenario === "empty" ? { error: "不可用" } : pathname.endsWith("205") ? formHero : { ...hero, ...(scenario === "long" ? { name: "很长的英雄名称ABCDEFGHIJKLMNOPQRSTUVWXYZ", title: "一段很长的称号说明，需要自然换行并保留可读性" } : {}), ...(scenario === "no-skins" ? { skinsJson: "[]", skills: [], mingge: false, meta: {} } : {}) } };
  if (method === "GET" && pathname === "/api/equipment/1136") return { body: scenario === "empty" ? { error: "不可用" } : { ...equipmentDetail, ...(scenario === "no-stats" ? { atk: 0, passiveJson: null } : {}), ...(scenario === "long" ? { name: "超长装备名称ABCDEFGHIJKLMNOPQRSTUVWXYZ" } : {}) } };
  if (method === "GET" && pathname === "/api/changelog") return { status: fail ? 503 : 200, body: fail ? { error: "不可用" } : url.searchParams.has("slug") ? { content: scenario === "empty" ? "" : scenario === "no-toc" ? "# 简短公告\n\n本期没有更多章节。" : scenario === "missing-image" ? markdown : (scenario === "long" ? markdown.replace("# 演武新章 · 相聚山河之间", "# 超长更新标题ABCDEFGHIJKLMNOPQRSTUVWXYZ山河之间反复阅读的长标题") : markdown).replace(/\n\n!\[.*$/, "") } : { entries: scenario === "empty" ? [] : entries } };
  if (method === "GET" && pathname === "/api/users/me/roles") {
    if (scenario === "profile-load-error" && !profileReadFailed) { profileReadFailed = true; return { status: 503, body: { error: "测试：配置读取失败" } }; }
    return { body: { preferences: scenario === "empty" ? [] : ["top", "jungle", "mid", "adc", "support"].map((roleType, index) => ({ roleType, preferenceRank: index + 1, roleRank: 0, peakRank: 0, peakScore: 0 })) } };
  }
  if (method === "GET" && pathname === "/api/users/me/heroes") return { body: { heroPowers: scenario === "empty" ? {} : { top: [{ id: 1, heroId: 105, heroName: "廉颇", powerScore: 5600 }] } } };
  if (["PUT", "PATCH", "POST"].includes(method) && ["/api/users/me/roles", "/api/me/profile", "/api/me/avatar"].includes(pathname)) {
    let raw = ""; for await (const chunk of request) raw += chunk;
    mutations.push({ pathname, body: pathname.endsWith("avatar") ? raw : JSON.parse(raw) });
    if (scenario === "save-during-edit" && pathname.endsWith("roles")) await new Promise(resolve => setTimeout(resolve, 400));
    return fail ? { status: 503, body: { error: "测试：保存失败" } } : { body: pathname.endsWith("profile") ? JSON.parse(raw) : {} };
  }
  return null;
} });
const browser = await chromium.launch({ headless: true, executablePath: process.env.E2E_BROWSER_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" });
const errors = [], external = [], manifest = [], contrast = [], textScaleObservations = [];
const pairs = [ ["01", "/", "HomePage", "guest"], ["02", "/login", "AuthForm", "guest"], ["03", "/register", "AuthForm", "guest"], ["04", "/me", "MePage", "user"], ["05", "/heroes", "HeroGrid", "guest"], ["06", "/heroes/105", "HeroDetailView", "guest"], ["07", "/equipment", "EquipmentPage", "guest"], ["08", "/equipment/1136", "EquipmentDetailPage", "guest"], ["13", "/changelog", "ChangelogPage", "guest"], ["14", "/changelog/版本更新", "ChangelogDetailPage", "guest"] ];
async function open(route = "/m", width = 390, height = 844, role = "guest", scenario = "default") {
  session = null;
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce", userAgent: width <= 900 ? "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1" : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36" });
  await context.addInitScript(() => sessionStorage.setItem("yanwu:intro-seen:v1", "1"));
  const page = await context.newPage(); page.setDefaultTimeout(10000); page.setDefaultNavigationTimeout(20000); page.on("pageerror", e => { errors.push(e.message); console.error('APP ERROR', e.message); });
  await page.route("**/*", r => {
    const url = new URL(r.request().url());
    // Serve the host's exact document through Playwright to avoid local antivirus HTTP injection.
    // All compiled product JS/CSS and declared API requests still use the real component host.
    if (url.origin === host.baseURL && r.request().resourceType() === "document") return r.fulfill({ contentType: "text/html; charset=utf-8", body: host.html });
    if (url.origin === host.baseURL && /^\/(heroes\/(images|skins)\/|equipment\/images\/)/.test(url.pathname)) return scenario === "missing-image" ? r.fulfill({ status: 404, body: "declared missing image" }) : r.fulfill({ contentType: "image/svg+xml", body: fixtureImage(url.pathname.includes("equipment")) });
    if (url.origin === host.baseURL) return r.continue();
    if (url.hostname === "game.gtimg.cn") return r.abort(); // declared image fallback fixture
    external.push(url.href); return r.abort();
  });
  await page.goto(`${host.baseURL}${route}?role=${role}&case=${scenario}`, { waitUntil: "networkidle" });
  return { context, page };
}
async function noOverflow(page, label) { const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth ? [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 12).map(e => `${e.tagName}.${e.className}: ${e.getBoundingClientRect().right}`) : []); assert.deepEqual(overflow, [], `no page overflow: ${label}`); }
async function checkContrast(page, selector) {
  const measurements = await page.locator(selector).evaluateAll(elements => {
    const parse = v => { const a = v.match(/[\d.]+/g)?.map(Number) || []; return [a[0] || 0, a[1] || 0, a[2] || 0, a[3] ?? 1]; };
    const blend = (a, b) => { const alpha = a[3] + b[3] * (1 - a[3]); return alpha ? [0, 1, 2].map(i => (a[i] * a[3] + b[i] * b[3] * (1 - a[3])) / alpha).concat(alpha) : [0, 0, 0, 0]; };
    const lum = a => a.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    return elements.filter(e => e.getBoundingClientRect().width).map(e => { let bg = [0, 0, 0, 0]; for (let n = e; n; n = n.parentElement) bg = blend(bg, parse(getComputedStyle(n).backgroundColor)); bg = blend(bg, [255, 255, 255, 1]); const fg = blend(parse(getComputedStyle(e).color), bg); const levels = [lum(fg), lum(bg)].sort((a, b) => b - a); return { text: e.textContent, foreground: getComputedStyle(e).color, background: bg, ratio: (levels[0] + .05) / (levels[1] + .05) }; });
  });
  assert.ok(measurements.length, `contrast selector exists: ${selector}`); for (const m of measurements) assert.ok(m.ratio >= 4.5, `${selector} ${m.text}: ${m.ratio.toFixed(2)}`); contrast.push({ selector, measurements });
}
async function supplement(page, family, route, component, role, state) {
  await noOverflow(page, `${family}-${state}`); const file = path.join(output, `${family}-${state}.png`); await page.screenshot({ path: file, fullPage: true });
  manifest.push({ family, route, component, viewport: page.viewportSize(), profile: "mobile", role, fixture: `${family}-${state}-v1`, state, source: "isolated-component-fixture", file });
}
try {
  let { context, page } = await open();
  const heading = await page.locator("h1").boundingBox(); const action = await page.getByRole("link", { name: "进入赛事大厅", exact: true }).boundingBox();
  assert.ok(action.y > heading.y && action.y + action.height < 650, "mobile home CTA remains in first viewport after editorial heading");
  assert.equal(await page.locator(".arena-hero-art").getAttribute("src"), "/art/yanwu-ink.webp", "approved local ink landscape is the home illustration");
  assert.ok((await page.locator(".arena-hero-art").boundingBox()).y > heading.y, "mobile heading precedes landscape composition");
  await noOverflow(page, "mobile home"); await context.close();
  ({ context, page } = await open("/m/login")); const forgotTrigger = page.getByRole("button", { name: "忘记密码？" }); await forgotTrigger.click(); await page.locator("#forgot-username").focus(); await page.keyboard.press("Escape"); assert.ok(await forgotTrigger.evaluate(e => e === document.activeElement), "closing password recovery restores its trigger focus"); await context.close();
  // Real layout regressions: a card action must not cover its labels, and password text
  // must reserve the actual toggle width even when utility CSS precedes page CSS.
  const layoutFailures = [];
  ({ context, page } = await open("/m/heroes", 320, 812));
  const formToggle = page.getByRole("button", { name: "切换廉颇命格形态", exact: true });
  const toggleRect = await formToggle.boundingBox();
  assert.ok(toggleRect.width >= 44 && toggleRect.height >= 44, "hero form action keeps a 44px target");
  const cardLabels = await formToggle.locator("..").locator(".hero-card-copy span").evaluateAll(nodes => nodes.map(e => ({ text: e.textContent, rect: e.getBoundingClientRect().toJSON() })));
  for (const { text, rect } of cardLabels) if (Math.min(rect.right, toggleRect.x + toggleRect.width) > Math.max(rect.left, toggleRect.x) && Math.min(rect.bottom, toggleRect.y + toggleRect.height) > Math.max(rect.top, toggleRect.y)) layoutFailures.push(`320px hero form action overlaps ${text}`);
  await supplement(page, "05", "/m/heroes", "HeroGrid", "guest", "320-form-action"); await context.close();
  for (const mode of ["login", "register", "reset"]) {
    const route = mode === "register" ? "/m/register" : "/m/login";
    ({ context, page } = await open(route, 320, 812));
    if (mode === "reset") { await page.getByRole("button", { name: "忘记密码？" }).click(); await page.locator("#forgot-username").fill("云中客"); await page.getByRole("button", { name: "下一步" }).click(); await page.locator("#forgot-answer").fill("青山"); await page.getByRole("button", { name: "继续设置新密码" }).click(); }
    const ids = mode === "reset" ? ["forgot-new-password", "forgot-confirm-password"] : mode === "register" ? ["new-password", "confirm-password"] : ["password"];
    const longPassword = "fictional-long-password-0123456789".repeat(4);
    for (const id of ids) {
      const input = page.locator(`#${id}`); await input.fill(longPassword);
      const button = input.locator("..").locator("button");
      if (await input.getAttribute("type") === "password") await button.click();
      assert.equal(await input.getAttribute("type"), "text", `${mode}/${id} shows long password`);
      await input.focus(); await input.press("End");
      const geometry = await input.evaluate(e => { const r = e.getBoundingClientRect(), b = e.parentElement.querySelector("button").getBoundingClientRect(), css = getComputedStyle(e); return { contentRight: r.right - parseFloat(css.borderRightWidth) - parseFloat(css.paddingRight), buttonLeft: b.left, buttonWidth: b.width, buttonHeight: b.height, selection: e.selectionStart, valueLength: e.value.length, scrollLeft: e.scrollLeft }; });
      assert.equal(geometry.selection, longPassword.length, `${mode}/${id} caret can reach the end`);
      assert.ok(geometry.scrollLeft > 0, `${mode}/${id} long value scrolls within the field`);
      assert.ok(geometry.buttonWidth >= 44 && geometry.buttonHeight >= 44, `${mode}/${id} toggle target`);
      if (geometry.contentRight > geometry.buttonLeft - 8) layoutFailures.push(`${mode}/${id} text reaches ${geometry.contentRight}, toggle starts ${geometry.buttonLeft}; needs 8px gap`);
      await button.click(); assert.equal(await input.getAttribute("type"), "password", `${mode}/${id} hides long password`); assert.equal(await input.inputValue(), longPassword);
    }
    await supplement(page, mode === "register" ? "03" : "02", route, "AuthForm", "guest", `${mode}-long-password`); await context.close();
  }
  assert.deepEqual(layoutFailures, [], "card labels and long password text must not be covered by actions");
  for (const [family, route, component, role] of pairs.filter(p => !process.env.YANWU_FAMILY || p[0] === process.env.YANWU_FAMILY)) {
    for (const [profile, width, height] of [["desktop", 1440, 900], ["mobile", 390, 844]]) {
      const logical = profile === "mobile" ? `/m${route === "/" ? "" : route}` : route;
      ({ context, page } = await open(logical, width, height, role));
      await page.locator("h1").first().waitFor(); await noOverflow(page, `${family}-${profile}`);
      if (family === "05") await checkContrast(page, ".hero-card-copy span");
      if (family === "06") { await checkContrast(page, ".hero-stat-values > span"); assert.ok(await page.locator(".hero-portrait-frame img").evaluate(e => e.complete && e.naturalWidth > 0)); }
      if (family === "07") await checkContrast(page, ".yanwu-equipment-price, .yanwu-equipment-stats");
      if (family === "08") await checkContrast(page, ".yanwu-stat-list span");
      if (family === "14") { await checkContrast(page, ".markdown-content code"); assert.equal(await page.locator(".markdown-content ul").evaluate(e => getComputedStyle(e).listStyleType), "disc"); assert.ok(await page.locator(".markdown-content td").first().evaluate(e => parseFloat(getComputedStyle(e).paddingLeft) >= 12)); }
      const file = path.join(output, `${family}-${profile}.png`); await page.screenshot({ path: file, fullPage: profile === "desktop" });
      let fullPageFile;
      if (profile === "mobile" && await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)) { fullPageFile = path.join(output, `${family}-mobile-full.png`); await page.screenshot({ path: fullPageFile, fullPage: true }); }
      manifest.push({ family, route: logical, component, viewport: { width, height }, profile, role, fixture: `${family}-image-present-v1`, state: "baseline", source: "isolated-component-fixture", media: "Local illustrative SVG test media, not official hero/equipment artwork", file, fullPageFile });
      await context.close();
    }
    for (const [width, height] of [[320, 812], [375, 812], [768, 1024], [812, 375], [1024, 768]]) {
      ({ context, page } = await open(route, width, height, role)); await noOverflow(page, `${family}-${width}`);
      if (family === "04") {
        const targets = await page.locator(".yanwu-role-move").evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { width: r.width, height: r.height }; }));
        assert.ok(targets.length > 0 && targets.every(target => target.width >= 44 && target.height >= 44), `profile order controls remain reachable at ${width}px, including tablets`);
      }
      await context.close();
    }
    console.log(`Checked family ${family}: desktop/mobile baselines and seven widths`);
  }
  ({ context, page } = await open("/m/heroes"));
  await page.getByLabel("搜索英雄名称").fill("不存在的测试名称"); assert.ok(await page.getByText("没有找到匹配的英雄", { exact: false }).isVisible()); await context.close();
  ({ context, page } = await open("/m/equipment")); await page.getByLabel("搜索装备名称").fill("不存在"); assert.ok(await page.getByText("未找到匹配", { exact: false }).isVisible()); await context.close();
  // A computer keeps filters beside results; a phone starts with search and reveals
  // filters on demand. Exercise the same controls and state across a viewport change.
  ({ context, page } = await open("/m/heroes"));
  assert.equal(await page.locator(".catalog-filter-disclosure").evaluate(element => element.open), false);
  await page.locator(".catalog-filter-disclosure > summary").click();
  await page.getByRole("button", { name: "中路", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "中路", exact: true }).getAttribute("aria-pressed"), "true");
  await page.getByRole("button", { name: "查看小乔详情", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "查看廉颇详情", exact: true }).count(), 0);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForFunction(() => { const controls = document.querySelector(".catalog-control-panel").getBoundingClientRect(), results = document.querySelector(".catalog-results").getBoundingClientRect(); return controls.right < results.left; });
  await page.getByRole("button", { name: "清除搜索和筛选", exact: true }).click();
  await page.getByRole("button", { name: "查看廉颇详情", exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "查看廉颇详情", exact: true }).click();
  await page.waitForURL(url => url.pathname === "/m/heroes/105");
  await context.close();
  ({ context, page } = await open("/m/equipment"));
  await page.getByLabel("搜索装备名称").fill("破军");
  await page.getByRole("button", { name: "清除搜索和筛选", exact: true }).click();
  await page.getByRole("link", { name: "铁剑", exact: true }).waitFor();
  assert.equal(await page.locator(".equipment-effects").evaluate(element => element.open), false);
  await page.locator(".equipment-effects > summary").click();
  await page.locator(".equipment-effects .yanwu-equipment-passive").filter({ hasText: "目标生命值低于一半时，造成额外伤害。" }).waitFor();
  await context.close();
  ({ context, page } = await open("/m", 390, 844, "guest", "error")); await page.getByRole("button", { name: "重新加载" }).first().click(); await page.getByText("今晚不加班", { exact: true }).waitFor(); await context.close();
  ({ context, page } = await open("/m/login")); await page.getByLabel("召唤师名称", { exact: true }).fill("云中客"); await page.getByLabel("密码", { exact: true }).fill("fictional-password"); await page.getByRole("button", { name: "显示密码", exact: true }).click(); assert.equal(await page.locator("#password").getAttribute("type"), "text"); await page.getByRole("button", { name: "登录", exact: true }).click(); await page.waitForURL(url => !url.pathname.endsWith("login")); assert.equal(mutations.at(-1).pathname, "/api/auth/login"); await context.close();
  ({ context, page } = await open("/m/login", 390, 844, "guest", "missing-session")); await page.locator("#username").fill("云中客"); await page.locator("#password").fill("fictional-password"); await page.getByRole("button", { name: "登录", exact: true }).click(); await page.getByText(/登录状态未能保存/).waitFor(); assert.ok(page.url().includes("login")); await context.close();
  ({ context, page } = await open("/me", 390, 844, "user", "error")); assert.equal(await page.getByRole("button", { name: "保存配置" }).isDisabled(), true); await page.getByLabel("当前段位", { exact: true }).selectOption("1"); await page.getByRole("button", { name: "保存配置" }).click(); await page.getByText("保存失败", { exact: true }).waitFor(); assert.equal(mutations.at(-1).pathname, "/api/users/me/roles"); assert.equal(await page.getByRole("button", { name: "保存配置" }).isEnabled(), true, "failed save keeps the modified form recoverable"); await context.close();
  ({ context, page } = await open("/m/me", 390, 844, "user", "profile-load-error"));
  await page.getByRole("heading", { name: "分队配置暂时无法读取", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "保存配置", exact: true }).count(), 0, "failed reads never expose a default configuration as saved");
  await page.getByRole("button", { name: "重新读取配置", exact: true }).click();
  await page.getByLabel("当前段位", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "保存配置", exact: true }).isDisabled(), true);
  await context.close();
  ({ context, page } = await open("/m/me", 390, 844, "user", "empty"));
  await page.getByText("尚未保存分队配置", { exact: true }).waitFor();
  await page.getByRole("button", { name: "保存配置", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".profile-save-bar button")?.disabled);
  assert.equal(mutations.at(-1).body.preferences.length, 5, "an empty account can explicitly save its five default lanes");
  await context.close();
  ({ context, page } = await open("/m/me", 390, 844, "user", "save-during-edit"));
  await page.getByLabel("当前段位", { exact: true }).selectOption("7");
  await page.getByRole("button", { name: "保存配置", exact: true }).click();
  await page.getByLabel("当前段位", { exact: true }).selectOption("9");
  await page.getByText("已保存", { exact: true }).waitFor();
  assert.equal(mutations.at(-1).body.preferences[0].role_rank, 7, "the response confirms the submitted values");
  assert.equal(await page.getByLabel("当前段位", { exact: true }).inputValue(), "9");
  assert.equal(await page.getByRole("button", { name: "保存配置", exact: true }).isEnabled(), true, "editing during a save leaves the later change unsaved");
  await context.close();
  const before = host.apiRequests.length; ({ context, page } = await open("/me", 390, 844, "guest")); assert.ok(page.url().includes("login")); assert.ok(!host.apiRequests.slice(before).some(p => p.includes("/api/users/me") || p.includes("/api/me/"))); await context.close();

  // Concrete state fixtures are supplementary, never substitutes for normal baselines.
  for (const [family, route, component, role] of pairs.filter(p => ["01", "04", "05", "06", "07", "08", "13", "14"].includes(p[0]))) {
    const states = family === "04" ? ["empty", "long"] : ["06", "08"].includes(family) ? ["empty", "missing-image", "long", family === "06" ? "no-skins" : "no-stats"] : family === "14" ? ["empty", "long", "missing-image", "no-toc"] : ["empty", "error", ...(["01", "05", "07"].includes(family) ? ["loading"] : [])];
    for (const state of states) { ({ context, page } = await open(`/m${route === "/" ? "" : route}`, 320, 812, role, state));
      if (family === "06" && state === "missing-image") await page.getByText("经典", { exact: true }).waitFor();
      if (family === "14" && state === "no-toc") assert.equal(await page.getByRole("navigation", { name: "文章目录" }).count(), 0);
      await supplement(page, family, `/m${route === "/" ? "" : route}`, component, role, state); await context.close(); }
  }
  for (const route of ["/loading", "/unavailable"]) { ({ context, page } = await open(route)); await supplement(page, route === "/loading" ? "loading" : "404", route, route === "/loading" ? "Loading" : "NotFound", "guest", "supplementary"); await context.close(); }

  ({ context, page } = await open("/m", 390, 844, "guest", "news-error")); await page.getByRole("button", { name: "重新加载" }).click(); await page.getByRole("link", { name: /峡谷新资讯/ }).waitFor();
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async text => { window.__copied = text; } } }));
  await page.getByRole("button", { name: "复制房间号 260919" }).click(); assert.equal(await page.evaluate(() => window.__copied), "260919");
  await page.getByRole("button", { name: /演武新章/ }).click(); assert.equal(await page.getByRole("button", { name: /演武新章/ }).getAttribute("aria-expanded"), "true");
  await page.getByRole("button", { name: "打开图鉴菜单" }).click(); await page.getByRole("link", { name: "装备", exact: true }).waitFor(); await page.keyboard.press("Escape"); await context.close();

  ({ context, page } = await open("/m/heroes/105", 320, 812)); await page.getByRole("button", { name: /命格 ·/ }).click(); await page.getByRole("heading", { name: "山河守望", exact: true }).waitFor(); await noOverflow(page, "mingge"); await page.getByRole("button", { name: /本命 ·/ }).click(); await page.getByRole("button", { name: "地狱岩魂", exact: true }).click(); assert.equal(await page.evaluate(() => localStorage.getItem("hero_skin_105")), "2"); await context.close();

  ({ context, page } = await open("/m/register")); await page.locator("#username").fill("新来客"); await page.locator("#security-question").selectOption("__custom__"); await page.getByLabel("自定义问题").fill("最喜欢的山？"); await page.getByLabel("安全答案", { exact: true }).fill("青山"); await page.getByLabel("密码", { exact: true }).fill("fictional-password"); await page.getByLabel("确认密码", { exact: true }).fill("fictional-password"); await page.getByRole("button", { name: "注册", exact: true }).click(); await page.waitForURL(url => !url.pathname.endsWith("register")); assert.equal(mutations.at(-1).body.customQuestion, "最喜欢的山？"); await context.close();

  ({ context, page } = await open("/m/login")); await page.getByRole("button", { name: "忘记密码？" }).click(); await page.getByLabel("召唤师名称", { exact: true }).last().fill("云中客"); await page.getByRole("button", { name: "下一步" }).click(); await page.getByLabel("安全答案", { exact: true }).fill("青山"); await page.getByRole("button", { name: "继续设置新密码" }).click(); await page.getByLabel("新密码", { exact: true }).fill("new-fictional-password"); await page.getByLabel("确认新密码", { exact: true }).fill("new-fictional-password"); await supplement(page, "02", "/m/login", "AuthForm", "guest", "reset-dialog"); await page.getByRole("button", { name: "确认重置" }).click(); await page.getByRole("dialog", { name: "找回密码" }).waitFor({ state: "detached" }); assert.deepEqual(mutations.at(-1).body, { resetToken: "fictional-reset-token", newPassword: "new-fictional-password", confirmPassword: "new-fictional-password" }); await context.close();

  for (const route of ["/login", "/register"]) { ({ context, page } = await open(route, 390, 844, "guest", "error")); await page.locator("#username").fill("新来客"); if (route === "/register") { await page.locator("#security-question").selectOption("你的出生城市是？"); await page.locator("#security-answer-reg").fill("青山"); await page.locator("#confirm-password").fill("fictional-password"); } await page.getByLabel("密码", { exact: true }).fill("fictional-password"); await page.getByRole("button", { name: route === "/login" ? "登录" : "注册", exact: true }).click(); await page.getByText("测试：操作失败，请重试", { exact: true }).waitFor(); await supplement(page, route === "/login" ? "02" : "03", route, "AuthForm", "guest", "submit-error"); await context.close(); }

  ({ context, page } = await open("/m/me", 320, 812, "user")); await page.getByLabel("游戏昵称").fill("新昵称"); await page.getByLabel("游戏 ID").fill("new-game-id"); await page.getByRole("button", { name: "保存游戏资料" }).click(); await page.getByText("游戏资料已保存", { exact: true }).waitFor(); assert.deepEqual(mutations.at(-1).body, { gameNickname: "新昵称", gameId: "new-game-id" }); assert.equal(await page.getByRole("button", { name: "保存游戏资料" }).isDisabled(), true); await page.getByRole("button", { name: "下移对抗路" }).click(); await page.getByRole("button", { name: "保存配置" }).scrollIntoViewIfNeeded();
  const profileSaveGeometry = await page.getByRole("button", { name: "保存配置" }).evaluate(element => { const rect = element.getBoundingClientRect(); const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2); const dock = document.querySelector(".yanwu-dock")?.getBoundingClientRect(); return { width: rect.width, height: rect.height, exposed: hit === element || element.contains(hit), bottom: rect.bottom, dockTop: dock?.top ?? innerHeight }; });
  assert.ok(profileSaveGeometry.width >= 44 && profileSaveGeometry.height >= 44 && profileSaveGeometry.exposed && profileSaveGeometry.bottom <= profileSaveGeometry.dockTop, `profile save remains exposed above mobile navigation: ${JSON.stringify(profileSaveGeometry)}`);
  await page.getByRole("button", { name: "保存配置" }).click(); await page.getByText("已保存", { exact: true }).waitFor(); assert.equal(mutations.at(-1).body.preferences[1].role_type, "top"); assert.equal(await page.getByRole("button", { name: "保存配置" }).isDisabled(), true); await context.close();

  ({ context, page } = await open("/m/me", 390, 844, "user", "error")); const png = await page.evaluate(() => { const c = document.createElement("canvas"); c.width = c.height = 16; const ctx = c.getContext("2d"); ctx.fillStyle = "#426855"; ctx.fillRect(0, 0, 16, 16); return c.toDataURL("image/png").split(",")[1]; }); await page.locator('input[type="file"]').setInputFiles({ name: "fictional-avatar.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") }); await page.getByText("测试：保存失败", { exact: true }).waitFor(); assert.equal(mutations.at(-1).pathname, "/api/me/avatar"); await supplement(page, "04", "/m/me", "MePage", "user", "avatar-upload-error"); await context.close();
  for (const route of ["/m", "/m/heroes/105", "/m/changelog/版本更新", "/m/me"]) { ({ context, page } = await open(route, 768, 1024, route.endsWith("me") ? "user" : "guest", "long")); await page.evaluate(() => { document.body.style.zoom = "2"; }); await noOverflow(page, `200% CSS scale at 768px ${route}`); await supplement(page, "zoom", route, "ActualPublicComponent", route.endsWith("me") ? "user" : "guest", `200-percent-${encodeURIComponent(route)}`); await context.close(); }
  ({ context, page } = await open("/m", 390, 844));
  await page.evaluate(() => { const nodes = [...document.querySelectorAll('h1,h2,h3,p,span,strong,small,a,button,input,label,select')].map(e => [e, parseFloat(getComputedStyle(e).fontSize)]); for (const [element, size] of nodes) element.style.fontSize = `${size * 2}px`; });
  const textScale = await page.evaluate(() => ({ viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth, overflow: [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 15).map(e => `${e.tagName}.${e.className}`) }));
  assert.ok(textScale.scrollWidth <= textScale.viewport && textScale.overflow.length === 0, `390px text enlargement remains contained: ${JSON.stringify(textScale)}`);
  textScaleObservations.push({ route: "/m", method: "390px text enlargement: initial computed font sizes multiplied by 2 for headings/body/controls; no CSS/browser zoom", ...textScale });
  const textScaleFile = path.join(output, "01-text-200-observed.png"); await page.screenshot({ path: textScaleFile, fullPage: true }); manifest.push({ family: "01", route: "/m", component: "HomePage", viewport: { width: 390, height: 844 }, profile: "mobile", role: "guest", fixture: "home-text-200-v1", state: textScale.scrollWidth > 390 ? "text-200-known-overflow" : "text-200", source: "isolated-component-fixture", file: textScaleFile }); await context.close();
  assert.deepEqual(host.violations, []); assert.deepEqual(errors, []); assert.deepEqual(external, []);
  if (process.env.YANWU_FAMILY) { console.log("Focused development checks passed; no success manifest written."); } else {
  assert.equal(manifest.filter(r => r.state === "baseline").length, 20);
  await writeFile(path.join(output, "manifest.json"), JSON.stringify(manifest, null, 2));
  await writeFile(path.join(output, "verification.json"), JSON.stringify({ passed: true, browser: "local Microsoft Edge / Chromium", contrast, textScaleObservations, checks: ["20 baseline page/profile records", "seven viewport widths per family", "home CTA ordering", "search, collapsed phone filters, desktop side panel and retained mobile routes", "retry", "password visibility", "real auth/register/reset HTTP and session rejection", "profile HTTP save success/failure, load recovery, first-save, concurrent editing and role reordering", "320px profile save target exposed above mobile navigation", "visitor protected requests", "empty/error/loading/long/missing-image/no-toc/no-skins/no-stats", "CSS scale 200% at 768px (not browser chrome zoom)", "390px computed text enlargement to 200% without page overflow", "computed contrast", "zero violations/errors/external requests"], limitations: ["isolated component fixtures; no database/server E2E", "resource hook boundary fixtures", "normal images are local illustrative SVG test media; missing-image cases deliberately fail all image candidates", "only local Chromium available", "computed text enlargement and CSS scale are simulations; no native browser zoom or phone acceptance claim"] }, null, 2));
  await writeFile(path.join(output, "index.html"), '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>演武公共页验收</title><style>body{font:16px system-ui;background:#f5f2ea;color:#252b28;margin:32px}section{margin:32px 0}img{max-width:100%;border:1px solid #dcdccf}a{color:#426855}</style><h1>公共页真实组件夹具验收</h1><p>图鉴为明确标记的本地示意测试媒体，不是官方角色/装备原画。手机 viewport 图反映固定导航位置；full-page 长图中的 Dock 位置属于浏览器合成。</p>' + manifest.map(r => `<section><h2>${r.family} · ${r.profile} · ${r.state}</h2><p>${r.route} · ${r.component} · ${r.role} · ${r.fixture} · ${r.viewport.width}×${r.viewport.height}</p><a href="${path.basename(r.file)}"><img loading="lazy" src="${path.basename(r.file)}" style="max-height:900px" alt="${r.family} ${r.state}"></a>${r.fullPageFile ? `<p><a href="${path.basename(r.fullPageFile)}">手机完整长图（合成）</a></p>` : ''}</section>`).join('') + '</html>');
  console.log("PASS: Yanwu public pages; 20 baseline records and seven widths.");
  }
} finally { await browser.close(); await host.close(); }
