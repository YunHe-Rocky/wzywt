import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { auditWidths, assertViewportBounds } from './viewport-bounds.mjs';

const base = process.env.E2E_BASE_URL || "http://localhost:8001";
const browser = await chromium.launch({ headless: true, executablePath: process.env.E2E_BROWSER_PATH || undefined });
const heroes = [
  { heroId: 101, name: "兼路测试", title: "辅助 zlcs", roleType: "support", secondaryRoleTypes: ["top"], imageUrl: "/missing-hero.jpg" },
  { heroId: 102, name: "已有英雄", title: "对抗", roleType: "top", secondaryRoleTypes: [], imageUrl: "/missing-hero.jpg" },
  { heroId: 103, name: "主路测试", title: "对抗", roleType: "top", secondaryRoleTypes: [], imageUrl: "/missing-hero.jpg" },
  { heroId: 104, name: "中路英雄", title: "法师", roleType: "mid", secondaryRoleTypes: [], imageUrl: "/missing-hero.jpg" },
].map(h => ({ ...h, id: h.heroId, meta: { ...h, heroType: 1, heroType2: 0, mingge: null }, tags: [] }));
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="gold"/></svg>';
try {
  for (const width of auditWidths([1280, 390, 320])) {
    const mobile = width <= 640;
    const context = await browser.newContext({ viewport: { width, height: 900 }, userAgent: mobile ? "Mozilla/5.0 iPhone Mobile" : "Mozilla/5.0 Windows Chrome/140", reducedMotion: "reduce", ignoreHTTPSErrors: new URL(base).hostname === "localhost" });
    const prefix = mobile ? "/m" : "";
    let saved = [{ id: 1, heroId: 102, heroName: "已有英雄", powerScore: 5000 }];
    let joined = false;
    let catalogRequests = 0;
    const user = { id: 7, userId: 7, username: "test7", role: "user", avatar: "test7.png" };
    await context.addCookies([{ name: "wzyt_session", value: "ui-fixture", url: base }]);
    await context.addInitScript(({ reject }) => {
      Object.defineProperty(navigator, "clipboard", { value: reject ? { writeText: () => Promise.reject(new Error("denied")) } : undefined });
      const original = document.execCommand.bind(document);
      document.execCommand = (...args) => {
        const value = document.activeElement?.value;
        const ok = original(...args);
        if (args[0] === "copy" && ok) window.__copied = value;
        return ok;
      };
    }, { reject: mobile });
    await context.route("**/heroes/skins/**", route => route.fulfill({ status: 404, body: "missing skin" }));
    await context.route("**/heroes/images/**", route => route.fulfill({ contentType: "image/svg+xml", body: svg }));
    await context.route("**/api/**", async route => {
      const req = route.request(), url = new URL(req.url()), path = url.pathname;
      if (path.startsWith("/api/avatars/")) return route.fulfill({ contentType: "image/svg+xml", body: svg });
      if (path === "/api/auth/me") return route.fulfill({ json: { user } });
      if (path === "/api/users/me/roles") return route.fulfill({ json: { preferences: ["top", "jungle", "mid", "adc", "support"].map((roleType,i) => ({ roleType, preferenceRank: i+1, roleRank: 7, peakRank: 7, peakScore: 1500 })) } });
      if (path === "/api/users/me/heroes") {
        if (req.method() === "DELETE") { saved = saved.filter(h => h.id !== Number(url.searchParams.get("id"))); return route.fulfill({ json: { ok: true } }); }
        if (req.method() === "POST") { const data = { id: 2, ...req.postDataJSON() }; saved.push(data); return route.fulfill({ json: data }); }
        return route.fulfill({ json: { heroPowers: { top: saved } } });
      }
      if (path === "/api/resources/leases") {
        if (req.method() === "POST") {
          catalogRequests++;
          await new Promise(r => setTimeout(r, 250));
          return route.fulfill({ json: { lease: { id: "hero-fixture", userId: 7 }, immediate: { "heroes.list": { data: heroes, version: "1" } } } });
        }
        return route.fulfill({ json: { ok: true } });
      }
      if (path === "/api/tournaments/101/join") { joined = true; return route.fulfill({ json: { ok: true } }); }
      if (path === "/api/tournaments/101") return route.fulfill({ json: {
        tournament: { id: 101, name: "测试房间", code: "628319", deadline: "2099-01-01T00:00:00Z", status: "recruiting", isPublic: true,
          players: joined ? [{ userId: 7, user, isTemporary: false, isSpectator: false, tempName: null }] : [], admins: [], applications: [] },
        splitResult: null, isVisitor: !joined, canViewMemberIdentity: false,
      } });
      return route.fulfill({ json: {} });
    });
    const page = await context.newPage();
    const errors = []; page.on("pageerror", e => errors.push(e.message));
    await page.goto(`${base}${prefix}/tournaments/101`);
    await page.getByTitle("点击复制房间号").click();
    await page.waitForFunction(() => window.__copied === "628319");
    await page.getByRole("button", { name: "确认加入", exact: true }).click();
    const avatar = page.getByRole("img", { name: "test7的头像", exact: true });
    await avatar.waitFor();
    assert.ok(await avatar.evaluate(el => el.complete && el.naturalWidth > 0));
    await assertViewportBounds(page, 'room-joined');
    await page.goto(`${base}${prefix}/me`);
    await page.getByRole("button", { name: "打开英雄列表", exact: true }).waitFor();
    await assertViewportBounds(page, 'profile');
    await page.getByRole("button", { name: "打开英雄列表", exact: true }).click();
    const search = page.getByRole("textbox", { name: "搜索英雄", exact: true });
    if (mobile) assert.equal(await search.evaluate(el => el === document.activeElement), false, "mobile picker must not summon keyboard");
    await page.getByRole("option", { name: /主路测试/ }).waitFor();
    const loadedCatalogRequests = catalogRequests;
    assert.equal(await page.getByRole("option", { name: /已有英雄/ }).count(), 0, "saved hero hidden");
    assert.match(await page.getByRole("listbox", { name: "英雄候选列表" }).getByRole("option").first().innerText(), /主路测试/, "primary lane first");
    const portrait = page.getByRole("option", { name: /主路测试/ }).locator("img");
    await portrait.waitFor();
    await page.waitForFunction(() => Array.from(document.querySelectorAll('[role="option"] img')).some(img => img.complete && img.naturalWidth > 0));
    assert.ok(await portrait.evaluate(el => el.complete && el.naturalWidth > 0), "local catalog portrait fallback visible");
    const bounds = await page.locator("[data-hero-select-dropdown]").boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width, "picker fits viewport");
    if (process.env.E2E_SCREENSHOT_DIR) {
      await mkdir(process.env.E2E_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: `${process.env.E2E_SCREENSHOT_DIR}/hero-picker-${width}.png` });
    }
    await search.click(); assert.equal(await search.evaluate(el => el === document.activeElement), true);
    await search.fill("测试");
    assert.match(await page.getByRole("listbox", { name: "英雄候选列表" }).getByRole("option").first().innerText(), /主路测试/);
    await search.fill("zlcs");
    await page.getByRole("option", { name: /主路测试/ }).waitFor();
    assert.match(await page.getByRole("listbox", { name: "英雄候选列表" }).getByRole("option").first().innerText(), /主路测试/, "pinyin match preserves primary-lane priority");
    await page.getByRole("option", { name: /主路测试/ }).click();
    await page.getByRole("spinbutton", { name: "英雄战力", exact: true }).fill("6000");
    await page.getByRole("button", { name: "添加", exact: true }).click();
    await page.getByRole("button", { name: "删除主路测试", exact: true }).waitFor();
    await page.getByRole("button", { name: "打开英雄列表", exact: true }).click();
    assert.equal(await page.getByRole("option", { name: /主路测试|已有英雄/ }).count(), 0);
    await page.getByRole("button", { name: "关闭英雄列表" }).click();
    await page.getByRole("button", { name: "删除已有英雄" }).click();
    await page.getByRole("button", { name: "删除已有英雄" }).waitFor({ state: "detached" });
    await page.getByRole("button", { name: "打开英雄列表", exact: true }).click();
    await page.getByRole("option", { name: /已有英雄/ }).waitFor();
    await page.getByRole("button", { name: "关闭英雄列表" }).click();
    await page.getByRole("button", { name: /^中路\s/ }).click();
    await page.getByRole("button", { name: "打开英雄列表", exact: true }).click();
    await page.getByRole("option", { name: /中路英雄/ }).waitFor();
    assert.equal(await page.getByRole("option", { name: /兼中路|主路测试/ }).count(), 0);
    assert.equal(catalogRequests, loadedCatalogRequests, "lane switches reuse the loaded catalog");
    assert.deepEqual(errors, [], "no client errors");
    await context.close();
    console.log(`PASS ${mobile ? "mobile" : "desktop"} ${width}px: HTTP copy, member avatar, hero images, ordering, exclusions and focus`);
  }
} finally { await browser.close(); }
