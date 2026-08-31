import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.E2E_BASE_URL || "http://localhost:8001";
const browserPath = process.env.E2E_BROWSER_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const artifactDir = path.resolve(".cache/test-artifacts/human-factors-regression");
await mkdir(artifactDir, { recursive: true });

const now = new Date().toISOString();
const statValues = {
  damageDealt: 12000,
  damageTaken: 9000,
  gold: 11000,
  participationRate: 0.65,
  damageConversionRate: 1.1,
  damageTakenPerDeath: 3000,
  jungleGold: 1800,
  minionKills: 120,
  kills: 4,
  deaths: 2,
  assists: 8,
  controlScore: 16,
  healing: 600,
  towerDamage: 3200,
};
const roles = ["top", "jungle", "mid", "adc", "support"];
const players = Array.from({ length: 10 }, (_, index) => ({
  id: index + 1,
  side: index < 5 ? "red" : "blue",
  slot: index % 5 + 1,
  memberId: index + 1,
  isGuest: false,
  gameNickname: `测试选手${index + 1}`,
  heroId: index + 1,
  heroName: `测试英雄${index + 1}`,
  roleType: roles[index % 5],
  score: 12 + index / 10,
  updatedAt: now,
  statsUpdatedAt: now,
  stats: { ...statValues, kills: index + 1, updatedAt: now },
}));
const matchFixture = {
  match: {
    id: 1,
    tournamentId: 1,
    tournamentName: "人因验收赛事",
    playedAt: now,
    status: "CONFIRMED",
    winnerSide: "red",
    redTotalKills: 15,
    blueTotalKills: 40,
    consistencyStatus: "PASS",
    consistencyDetails: {},
    updatedAt: now,
    players,
    screenshots: ["DATA", "OUTPUT", "SURVIVAL", "DEVELOPMENT", "KDA", "TEAM"].map((type, index) => ({
      id: index + 1,
      type,
      originalFilename: `${type.toLowerCase()}.png`,
      size: 1024 * 450,
      recognitionStatus: "COMPLETED",
    })),
    recognition: { status: "COMPLETED", normalizedResult: {}, warnings: [], errorCode: null },
    disputes: [],
  },
  access: { canManage: true, isSuperAdmin: true },
  eligibleMembers: players.map((player) => ({ id: player.id, username: `user${player.id}`, gameNickname: player.gameNickname })),
};
const tacticsFixture = {
  room: {
    id: 1,
    side: "red",
    layers: [{
      id: 1,
      name: "开局协同",
      description: "观察第一波兵线与河道视野",
      startTime: 0,
      endTime: 240,
      updatedAt: now,
      routes: [{
        id: 1,
        ownerMemberId: 1,
        colorKey: "crimson",
        geometry: { version: 1, arrow: true, points: [{ x: 0.2, y: 0.78 }, { x: 0.42, y: 0.56 }] },
        revision: 1,
        canEdit: true,
        ownerMember: { username: "user1" },
      }],
      markers: [],
    }],
  },
  access: { userId: 1, canManageLayers: true, canDraw: true, ownColorKey: "crimson", sharedAnnotationsVisible: false },
};
const postSummary = {
  id: 1,
  title: "高地反打复盘",
  content: "先拉开阵型，再利用控制链完成反打。",
  status: "published",
  matchId: 1,
  tournamentId: 1,
  createdAt: now,
  authorId: 1,
  author: { username: "测试管理员", avatar: null },
  likedByMe: false,
  videoUrl: "/api/combat-posts/1/video",
  comments: [{ id: 1, content: "进场时机说明清楚。", createdAt: now, authorId: 1, author: { username: "测试管理员" } }],
  _count: { likes: 3, comments: 1 },
};
const resourceFixture = [{
  key: "public:heroes.catalog",
  name: "英雄目录",
  state: "HOT",
  scope: "public",
  leases: 1,
  loads: 1,
  sharedLoads: 3,
  cacheHits: 9,
  staleHits: 0,
  evictions: 0,
  version: "2026-08-31T00:00:00.000Z",
}];

async function fulfillJson(route, data, status = 200) {
  await route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(data) });
}

async function installFixtures(page) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    if (pathname === "/api/auth/me") return fulfillJson(route, { user: { userId: 1, username: "测试管理员", role: "admin", avatar: null, securityQuestion: "测试问题" } });
    if (pathname === "/api/announcements") return fulfillJson(route, { announcements: [], latestVersion: "V2.2" });
    if (pathname === "/api/resources/leases") {
      if (request.method() === "POST") return fulfillJson(route, { lease: { id: "audit-lease" }, immediate: {} });
      return fulfillJson(route, { ok: true });
    }
    if (pathname === "/api/resources/data") return fulfillJson(route, { data: null });
    if (pathname === "/api/admin/resources") return fulfillJson(route, { resources: resourceFixture });
    if (pathname === "/api/heroes/watch" && request.method() === "GET") {
      return route.fulfill({ status: 200, contentType: "text/event-stream", body: `data: ${JSON.stringify({ type: "connected" })}\n\n` });
    }
    if (pathname === "/api/heroes/watch" && request.method() === "POST") return fulfillJson(route, { queued: true }, 202);
    if (pathname === "/api/tournaments/1/matches/1") return fulfillJson(route, matchFixture);
    if (pathname === "/api/tournaments/1/matches/1/tactics/red") return fulfillJson(route, tacticsFixture);
    if (pathname === "/api/combat-posts" && request.method() === "GET") return fulfillJson(route, { posts: [postSummary], totalPages: 1 });
    if (pathname === "/api/combat-posts/1") return fulfillJson(route, { post: postSummary, access: { canModerate: true } });
    if (pathname === "/api/combat-posts/1/video") return route.fulfill({ status: 206, contentType: "video/mp4", body: Buffer.alloc(16) });
    return fulfillJson(route, {});
  });
}

async function waitReady(page) {
  await page.waitForLoadState("domcontentloaded");
  try {
    await page.waitForLoadState("networkidle", { timeout: 5_000 });
  } catch {
    await page.waitForTimeout(600);
  }
}

async function inspectPage(page, label) {
  const report = await page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && Number.parseFloat(style.opacity) > 0.01 && !element.closest('[aria-hidden="true"]') && rect.width > 0 && rect.height > 0;
    };
    const selector = 'a[href],button,input:not([type="hidden"]),select,textarea,summary,[role="tab"],[tabindex]:not([tabindex="-1"])';
    const controls = [...document.querySelectorAll(selector)].filter(visible);
    const nameOf = (element) => {
      const labelledBy = element.getAttribute("aria-labelledby");
      const labelledText = labelledBy ? labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent || "").join(" ") : "";
      const labels = "labels" in element && element.labels ? [...element.labels].map((label) => label.textContent || "").join(" ") : "";
      return (element.getAttribute("aria-label") || labelledText || labels || element.getAttribute("alt") || element.getAttribute("title") || element.textContent || element.getAttribute("placeholder") || "").replace(/\s+/g, " ").trim();
    };
    const describe = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        tag: element.tagName.toLowerCase(),
        type: element.getAttribute("type"),
        name: nameOf(element).slice(0, 80),
        className: typeof element.className === "string" ? element.className.slice(0, 120) : "",
        width: Math.round(rect.width * 10) / 10,
        height: Math.round(rect.height * 10) / 10,
      };
    };
    const undersized = controls.filter((element) => {
      if (element.matches('input[type="file"]')) return false;
      const rect = element.getBoundingClientRect();
      return rect.width < 44 || rect.height < 44;
    }).map(describe);
    const unnamed = controls.filter((element) => !nameOf(element)).map(describe);
    const unlabeledFields = controls.filter((element) => element.matches("input,select,textarea") && !element.matches('input[type="hidden"]') && !("labels" in element && element.labels?.length) && !element.hasAttribute("aria-label") && !element.hasAttribute("aria-labelledby")).map(describe);
    const focusWithoutIndicator = controls.filter((element) => {
      if (element.disabled || element.getAttribute("aria-hidden") === "true") return false;
      const before = getComputedStyle(element);
      const beforeSnapshot = { borderColor: before.borderColor, backgroundColor: before.backgroundColor, boxShadow: before.boxShadow };
      element.focus();
      if (document.activeElement !== element) return false;
      const after = getComputedStyle(element);
      const hasOutline = after.outlineStyle !== "none" && Number.parseFloat(after.outlineWidth) > 0;
      const changedSurface = after.boxShadow !== beforeSnapshot.boxShadow || after.borderColor !== beforeSnapshot.borderColor || after.backgroundColor !== beforeSnapshot.backgroundColor;
      return !hasOutline && !changedSurface;
    }).map(describe);
    const overflow = [...document.querySelectorAll("body *")].filter(visible).map((element) => ({ element, rect: element.getBoundingClientRect() })).filter(({ rect }) => rect.left < -1 || rect.right > innerWidth + 1).slice(0, 30).map(({ element, rect }) => ({ tag: element.tagName.toLowerCase(), className: typeof element.className === "string" ? element.className.slice(0, 120) : "", left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) }));
    const tinyText = [...document.querySelectorAll("body *")].filter((element) => visible(element) && element.children.length === 0 && (element.textContent || "").trim()).map((element) => ({ element, size: Number.parseFloat(getComputedStyle(element).fontSize) })).filter(({ size }) => size < 12).slice(0, 40).map(({ element, size }) => ({ tag: element.tagName.toLowerCase(), text: (element.textContent || "").trim().slice(0, 60), size, className: typeof element.className === "string" ? element.className.slice(0, 100) : "" }));
    const motion = [...document.querySelectorAll("body *")].filter(visible).map((element) => ({ element, style: getComputedStyle(element) })).filter(({ style }) => {
      const durations = `${style.animationDuration},${style.transitionDuration}`.split(",").map((value) => value.trim()).filter(Boolean).map((value) => value.endsWith("ms") ? Number.parseFloat(value) / 1000 : Number.parseFloat(value));
      return durations.some((duration) => Number.isFinite(duration) && duration > 0.01);
    }).slice(0, 30).map(({ element, style }) => ({ tag: element.tagName.toLowerCase(), className: typeof element.className === "string" ? element.className.slice(0, 100) : "", animationDuration: style.animationDuration, transitionDuration: style.transitionDuration }));
    return {
      viewport: { width: innerWidth, height: innerHeight },
      document: { scrollWidth: document.documentElement.scrollWidth, bodyScrollWidth: document.body.scrollWidth },
      controls: controls.length,
      undersized,
      unnamed,
      unlabeledFields,
      focusWithoutIndicator,
      overflow,
      tinyText,
      residualMotion: motion,
    };
  });
  report.label = label;
  return report;
}

const browser = await chromium.launch({ headless: true, executablePath: browserPath });
const consoleErrors = [];
const reports = [];
try {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: "zh-CN", reducedMotion: "reduce" });
  const page = await context.newPage();
  page.on("console", (message) => { if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) consoleErrors.push(`${page.url()}: ${message.text()}`); });
  page.on("pageerror", (error) => consoleErrors.push(`${page.url()}: ${error.message}`));
  await installFixtures(page);

  const pages = [
    ["mobile-match", "/m/tournaments/1/matches/1"],
    ["mobile-tactic", "/m/tournaments/1/matches/1/tactics/red"],
    ["mobile-combat", "/m/combat"],
    ["mobile-combat-detail", "/m/combat/1"],
    ["mobile-monitor", "/monitor"],
  ];
  for (const [label, pathname] of pages) {
    await page.goto(`${baseUrl}${pathname}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await waitReady(page);
    reports.push(await inspectPage(page, label));
    await page.screenshot({ path: path.join(artifactDir, `${label}.png`), fullPage: true });
  }

  await page.goto(`${baseUrl}/m/tournaments/1/matches/1`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitReady(page);
  const firstTab = page.getByRole("tab").first();
  await firstTab.focus();
  await page.keyboard.press("ArrowRight");
  const tabKeyboardMoved = await page.getByRole("tab").nth(1).evaluate((element) => element === document.activeElement);
  reports.push({ label: "keyboard-match-tabs", tabKeyboardMoved });

  const submitTrigger = page.getByRole("button", { name: "正式提交并锁定" });
  await submitTrigger.click();
  const confirmDialog = page.getByRole("alertdialog", { name: "正式提交并锁定比赛档案？" });
  await confirmDialog.waitFor();
  const cancelConfirmation = confirmDialog.getByRole("button", { name: "取消" });
  const cancelHandle = await cancelConfirmation.elementHandle();
  let initialFocusOnCancel = false;
  if (cancelHandle) {
    try {
      await page.waitForFunction((element) => element === document.activeElement, cancelHandle, { timeout: 1_000 });
      initialFocusOnCancel = true;
    } catch {
      initialFocusOnCancel = false;
    }
  }
  await page.keyboard.press("Escape");
  await confirmDialog.waitFor({ state: "hidden" });
  const submitHandle = await submitTrigger.elementHandle();
  let confirmationFocusReturned = false;
  if (submitHandle) {
    try {
      await page.waitForFunction((element) => element === document.activeElement, submitHandle, { timeout: 1_000 });
      confirmationFocusReturned = true;
    } catch {
      confirmationFocusReturned = false;
    }
  }
  reports.push({ label: "keyboard-confirm-dialog", initialFocusOnCancel, closedOnEscape: true, focusReturned: confirmationFocusReturned });

  const menuButton = page.locator('button[aria-label$="用户菜单"]').first();
  if (await menuButton.count()) {
    await menuButton.click();
    await page.keyboard.press("Escape");
    reports.push({ label: "keyboard-header-menu", present: true, closedOnEscape: await menuButton.getAttribute("aria-expanded") === "false" });
  } else {
    reports.push({
      label: "keyboard-header-menu",
      present: false,
      buttons: (await page.getByRole("button").allTextContents()).map((text) => text.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 30),
    });
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  for (const [label, pathname] of [["desktop-match", "/tournaments/1/matches/1"], ["desktop-tactic", "/tournaments/1/matches/1/tactics/red"], ["desktop-monitor", "/monitor"]]) {
    await page.goto(`${baseUrl}${pathname}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await waitReady(page);
    reports.push(await inspectPage(page, label));
    await page.screenshot({ path: path.join(artifactDir, `${label}.png`), fullPage: true });
  }
  await context.close();
} finally {
  await browser.close();
}

await writeFile(path.join(artifactDir, "report.json"), `${JSON.stringify({ reports, consoleErrors }, null, 2)}\n`, "utf8");
assert.deepEqual(consoleErrors, [], `Browser errors: ${JSON.stringify(consoleErrors)}`);
for (const report of reports.filter((item) => typeof item.controls === "number")) {
  assert.equal(report.document.scrollWidth, report.viewport.width, `${report.label}: document has horizontal overflow`);
  assert.equal(report.document.bodyScrollWidth, report.viewport.width, `${report.label}: body has horizontal overflow`);
  assert.deepEqual(report.undersized, [], `${report.label}: controls smaller than 44px`);
  assert.deepEqual(report.unnamed, [], `${report.label}: unnamed controls`);
  assert.deepEqual(report.unlabeledFields, [], `${report.label}: unlabeled fields`);
  assert.deepEqual(report.focusWithoutIndicator, [], `${report.label}: invisible focus`);
  assert.deepEqual(report.tinyText, [], `${report.label}: visible text smaller than 12px`);
  assert.deepEqual(report.residualMotion, [], `${report.label}: motion remains under reduced-motion`);
}
assert.equal(reports.find((report) => report.label === "keyboard-match-tabs")?.tabKeyboardMoved, true, "Match tabs must support arrow keys");
const confirmationReport = reports.find((report) => report.label === "keyboard-confirm-dialog");
assert.deepEqual(confirmationReport, { label: "keyboard-confirm-dialog", initialFocusOnCancel: true, closedOnEscape: true, focusReturned: true }, "Confirmation dialog focus lifecycle failed");
const menuReport = reports.find((report) => report.label === "keyboard-header-menu");
assert.equal(menuReport?.present, true, "Authenticated user menu missing");
assert.equal(menuReport?.closedOnEscape, true, "Header menu must close on Escape");
console.log(JSON.stringify({ artifactDir, reports: reports.map((report) => ({ label: report.label, controls: report.controls, undersized: report.undersized?.length, unnamed: report.unnamed?.length, unlabeledFields: report.unlabeledFields?.length, focusWithoutIndicator: report.focusWithoutIndicator?.length, documentWidth: report.document?.scrollWidth, viewportWidth: report.viewport?.width, tinyText: report.tinyText?.length, residualMotion: report.residualMotion?.length, tabKeyboardMoved: report.tabKeyboardMoved, initialFocusOnCancel: report.initialFocusOnCancel, focusReturned: report.focusReturned, menuPresent: report.present, closedOnEscape: report.closedOnEscape })), consoleErrors }, null, 2));
