import assert from "node:assert/strict";
import { chromium } from "playwright";
import { auditWidths, assertViewportBounds } from './viewport-bounds.mjs';

// Only HTTP is faked: the actual page, SVG, controls and React state run in Chromium.
// All /api requests are intercepted; this test never contacts a database.
const base = process.env.E2E_BASE_URL || "http://localhost:8001";
const api = "/api/tournaments/71/matches/81/tactics/red";
const stamp = "2026-09-08T00:00:00.000Z";
const blank = (id, name) => ({ id, name, description: null, startTime: null, endTime: null, updatedAt: stamp, routes: [], markers: [] });

async function fixture(browser, width, { denied = false, saved = false, empty = false, readonly = false, mapMissing = false, member = false, side = "red" } = {}) {
  const api = `/api/tournaments/71/matches/81/tactics/${side}`;
  const context = await browser.newContext({
    ignoreHTTPSErrors: new URL(base).hostname === "localhost",
    viewport: { width, height: 1000 }, reducedMotion: "reduce",
    ...(width < 600 ? { isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36" } : {}),
  });
  const state = { layers: empty ? [] : [blank(11, "开局"), blank(12, "转线"), blank(13, "团战")], denied, reads: 0, writes: [], unexpected: [], errors: [] };
  if (saved) state.layers[0].routes.push({ id: 101, ownerMemberId: 9, colorKey: "crimson", geometry: { version: 1, points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }], arrow: true }, revision: 1, canEdit: true, ownerMember: { id: 9, username: "tester" } });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  page.on("pageerror", (error) => state.errors.push(error.message));
  if (mapMissing) await page.route("**/images/tactic-map-source.jpg", (route) =>
    route.fulfill({ status: 404, contentType: "text/plain", body: "Missing map fixture" }));
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const reply = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    if (path === "/api/auth/me") return reply({ user: { userId: 9, username: "tester", role: "user" } });
    if (path.startsWith("/api/announcements")) return reply({ announcements: [], latestVersion: null });
    if (path === api && method === "GET") {
      state.reads++;
      if (state.denied) return reply({ error: "仅可访问自己所属队伍的战术室" }, 403);
      return reply({ room: { id: 1, matchId: 81, side, layers: state.layers }, access: { userId: 9, canManageLayers: !member && !empty && !readonly, canDraw: !readonly, ownColorKey: "crimson", sharedAnnotationsVisible: readonly } });
    }
    if (path.startsWith(api)) {
      const input = route.request().postDataJSON();
      state.writes.push({ path, method, input });
      if (path === api && method === "POST") {
        if (input.action === "initialize") {
          if (readonly) return reply({ error: "只读战术室不能初始化" }, 403);
          const layer = state.layers[0] || blank(99, "本队战术");
          if (!state.layers.length) state.layers.push(layer);
          return reply({ layer });
        }
        const layer = { ...blank(99, input.name), ...input };
        state.layers.push(layer);
        return reply({ layer }, 201);
      }
      const match = path.match(/\/layers\/(\d+)(\/route|\/markers)?$/);
      const layer = match && state.layers.find((item) => item.id === Number(match[1]));
      if (layer && method === "DELETE") { state.layers = state.layers.filter((item) => item !== layer); return reply({ ok: true }); }
      if (layer && method === "PATCH") { Object.assign(layer, input); return reply({ ok: true }); }
      if (layer && method === "PUT" && match[2] === "/route") {
        layer.routes = [{ id: 101, ownerMemberId: 9, colorKey: "crimson", geometry: input.geometry, revision: (layer.routes[0]?.revision || 0) + 1, canEdit: true, ownerMember: { id: 9, username: "tester" } }];
        return reply({ route: layer.routes[0] });
      }
    }
    state.unexpected.push(`${method} ${path}`);
    return reply({ error: "Unmocked request" }, 500);
  });
  await page.goto(`${base}${width < 600 ? "/m" : ""}/tournaments/71/matches/81/tactics/${side}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  if (!denied) {
    await page.getByRole("heading", { name: `${side === "red" ? "红" : "蓝"}方战术推演`, exact: true }).waitFor();
    if (!empty) await page.locator(".tactic-board").waitFor();
    if (!empty && !mapMissing) await assertRealMap(page);
    assert.equal(await page.getByRole("link", { name: "赛事房间", exact: true }).getAttribute("href"), `${width < 600 ? "/m" : ""}/tournaments/71`);
    await page.getByText("图层与精确编辑", { exact: true }).click();
    await assertViewportBounds(page, 'tactics-expanded');
  }
  return { context, page, state };
}

const draft = (page) => page.locator('.tactic-board polyline[stroke-dasharray]');
async function assertRealMap(page) {
  const href = await page.locator('.tactic-board image').getAttribute('href');
  const dimensions = await page.evaluate(async (src) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    return [image.naturalWidth, image.naturalHeight];
  }, href);
  assert.deepEqual(dimensions, [2816, 1280], 'the packaged canyon map must load, not a placeholder');
  assert.equal(await page.locator('#tactic-map-status').count(), 0);
}
async function addPoint(page, x, y) {
  await page.getByLabel("X（0–1）").fill(String(x));
  await page.getByLabel("Y（0–1）").fill(String(y));
  await page.getByRole("button", { name: "按坐标添加", exact: true }).click();
}
async function select(page, name) { await page.locator(".tactic-layer-list button").filter({ hasText: name }).click(); }
async function selected(page, name) {
  await page.waitForFunction((expected) => document.querySelector('.tactic-layer-list button[aria-current="true"] strong')?.textContent === expected, name, { timeout: 2500 });
}

const scenarios = [
  ["mobile layout boundaries and landscape confirmation", {}, async ({ page }) => {
    if (page.viewportSize().width <= 520) {
      const board = await page.locator('.tactic-board').boundingBox();
      const caption = await page.locator('.tactic-board-caption').boundingBox();
      assert.ok(caption.y >= board.y + board.height - 1, 'mobile caption must not cover the canyon drawing surface');
    }
    await page.setViewportSize({ width: 844, height: 320 });
    const landscapeBoard = await page.locator('.tactic-board').boundingBox();
    assert.ok(Math.abs(landscapeBoard.height / landscapeBoard.width - 870 / 1500) < 0.01, 'landscape keeps the map aspect ratio instead of squeezing it into a short strip');
    await page.getByRole('button', { name: '删除图层', exact: true }).click();
    await page.getByRole('alertdialog').waitFor();
    await assertViewportBounds(page, 'tactics-landscape-dialog');
    await page.getByRole('button', { name: '取消', exact: true }).click();
  }],
  ...["red", "blue"].map(side => [`${side} ordinary teammate creates own-team layers without manager rights`, { member: true, side }, async ({ page, state }) => {
    assert.equal(await page.getByRole("button", { name: "删除图层", exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "保存时间", exact: true }).count(), 0);
    await page.getByPlaceholder("新图层名称").fill("本队进攻");
    await page.getByRole("button", { name: "新建图层", exact: true }).click();
    await selected(page, "本队进攻");
    await assertRealMap(page);
    await addPoint(page, 0.2, 0.3);
    await addPoint(page, 0.7, 0.8);
    await page.getByRole("button", { name: "保存路线", exact: true }).click();
    await page.getByText("路线已保存", { exact: true }).waitFor();
    assert.equal(state.writes.find(write => write.method === "PUT").path, `/api/tournaments/71/matches/81/tactics/${side}/layers/99/route`);
  }]),
  ["missing map renders an honest coordinate grid that still accepts routes", { mapMissing: true }, async ({ page }) => {
    await page.getByText("地图底图缺失，当前仅显示坐标网格，不代表真实峡谷地形", { exact: true }).waitFor();
    assert.equal(await page.locator('.tactic-board rect[fill="url(#tactic-coordinate-grid)"]').count(), 1);
    const board = page.locator(".tactic-board");
    await board.scrollIntoViewIfNeeded();
    const bounds = await board.boundingBox();
    await page.mouse.move(bounds.x + bounds.width * 0.2, bounds.y + bounds.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * 0.7, bounds.y + bounds.height * 0.8, { steps: 5 });
    await page.mouse.up();
    assert.equal(await draft(page).count(), 1);
    assert.equal(await page.getByRole("button", { name: "保存路线", exact: true }).isEnabled(), true);
  }],
  ["available map loads without the missing-map fallback", { mapMissing: false }, async ({ page }) => {
    await page.waitForTimeout(200);
    assert.equal(await page.getByText("地图底图缺失，当前仅显示坐标网格，不代表真实峡谷地形", { exact: true }).count(), 0);
    assert.equal(await page.locator('.tactic-board rect[fill="url(#tactic-coordinate-grid)"]').count(), 0);
  }],
  ["ordinary teammate initializes an empty room then draws and saves", { empty: true }, async ({ page, state }) => {
    assert.equal(await page.getByRole("button", { name: "新建图层", exact: true }).count(), 1);
    await page.getByRole("button", { name: "初始化本队图层", exact: true }).click();
    await page.locator(".tactic-board").waitFor();
    await selected(page, "本队战术");
    assert.equal(await page.getByRole("button", { name: "初始化本队图层", exact: true }).count(), 0);
    assert.deepEqual(state.writes[0], { path: api, method: "POST", input: { action: "initialize" } });
    await addPoint(page, 0.2, 0.3);
    await addPoint(page, 0.7, 0.8);
    await page.getByRole("button", { name: "保存路线", exact: true }).click();
    await page.getByText("路线已保存", { exact: true }).waitFor();
    assert.equal(state.writes.find((write) => write.method === "PUT").path, `${api}/layers/99/route`);
  }],
  ["read-only empty room cannot initialize or draw", { empty: true, readonly: true }, async ({ page }) => {
    assert.equal(await page.getByRole("button", { name: "新建图层", exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "初始化本队图层", exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "保存路线", exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole("button", { name: "按坐标添加", exact: true }).isDisabled(), true);
  }],
  ["blank layer switch clears another layer's draft and undo history", {}, async ({ page }) => {
    await addPoint(page, 0.1, 0.2);
    await addPoint(page, 0.3, 0.4);
    assert.equal(await draft(page).count(), 1);
    await select(page, "转线");
    assert.equal(await draft(page).count(), 0, "unsaved route leaked into a different blank layer");
    assert.equal(await page.getByRole("button", { name: "撤销", exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole("button", { name: "保存路线", exact: true }).isDisabled(), true);
  }],
  ["creating a layer selects it and saving targets that layer", {}, async ({ page, state }) => {
    await page.getByPlaceholder("新图层名称").fill("新建阶段");
    await page.getByRole("button", { name: "新建图层", exact: true }).click();
    await page.locator(".tactic-layer-list button").filter({ hasText: "新建阶段" }).waitFor();
    await selected(page, "新建阶段");
    await assertRealMap(page);
    assert.equal(await page.getByRole("button", { name: "手动阶段", exact: true }).getAttribute("aria-pressed"), "false");
    await addPoint(page, 0.25, 0.25);
    await addPoint(page, 0.75, 0.75);
    await page.getByRole("button", { name: "保存路线", exact: true }).click();
    await page.getByText("路线已保存", { exact: true }).waitFor();
    const routeWrite = state.writes.find((write) => write.method === "PUT");
    assert.equal(routeWrite.path, `${api}/layers/99/route`);
    assert.deepEqual(routeWrite.input.geometry.points, [{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.75 }]);
    await select(page, "转线");
    await select(page, "新建阶段");
    await assertRealMap(page);
    assert.equal(await draft(page).getAttribute("points"), "375,217.5 1125,652.5");
    await page.getByRole("button", { name: "删除图层", exact: true }).click();
    await page.getByRole("button", { name: "永久删除图层", exact: true }).click();
    await page.locator(".tactic-layer-list button").filter({ hasText: "新建阶段" }).waitFor({ state: "detached" });
    assert.equal(await draft(page).count(), 0);
  }],
  ["saving layer metadata retains unsaved route edits", { saved: true }, async ({ page }) => {
    await select(page, "开局");
    await addPoint(page, 0.3, 0.4);
    const before = await draft(page).getAttribute("points");
    await page.getByRole("button", { name: "保存时间", exact: true }).click();
    await page.getByText("图层时间已保存", { exact: true }).waitFor();
    await page.waitForTimeout(350);
    assert.equal(await draft(page).getAttribute("points"), before, "metadata refresh discarded unsaved geometry");
    assert.equal(await page.getByRole("button", { name: "撤销", exact: true }).isDisabled(), false);
  }],
  ["refresh preserves selected layer when an earlier layer disappears", {}, async ({ page, state }) => {
    await select(page, "转线");
    state.layers = state.layers.filter((layer) => layer.id !== 11);
    await page.getByRole("button", { name: "保存时间", exact: true }).click();
    await page.getByText("图层时间已保存", { exact: true }).waitFor();
    await selected(page, "转线");
  }],
  ["denied access ends loading without repeated requests", { denied: true }, async ({ page, state }) => {
    await page.getByText("仅可访问自己所属队伍的战术室", { exact: true }).first().waitFor();
    await page.waitForTimeout(400);
    assert.equal(await page.getByText("正在验证战术室权限…", { exact: true }).count(), 0, "denied response leaves endless loading state");
    assert.ok(state.reads <= 2, `denied room retried ${state.reads} times without user action`);
    state.denied = false;
    await page.getByRole("button", { name: "重试", exact: true }).click();
    await page.locator(".tactic-board").waitFor();
  }],
];

const browser = await chromium.launch({ headless: true, executablePath: process.env.E2E_BROWSER_PATH || undefined });
const failures = [];
try {
  for (const width of auditWidths([1440, 390, 320])) for (const [name, options, test] of scenarios.filter(([name]) => !process.env.E2E_SCENARIO || name.includes(process.env.E2E_SCENARIO))) {
    let current;
    try {
      current = await fixture(browser, width, options);
      await test(current);
      assert.deepEqual(current.state.unexpected, []);
      assert.deepEqual(current.state.errors, []);
      console.log(`PASS ${width}px ${name}`);
    } catch (error) {
      failures.push(`${width}px ${name}: ${error.message}`);
      console.error(`FAIL ${failures.at(-1)}`);
    } finally { await current?.context.close(); }
  }
} finally { await browser.close(); }
assert.deepEqual(failures, [], "tactic layer browser regressions failed");
