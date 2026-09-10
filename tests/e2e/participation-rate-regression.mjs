import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.E2E_BASE_URL || "http://localhost:8001";
const browserPath = process.env.E2E_BROWSER_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const now = new Date().toISOString();
const confirmationPayloads = [];
const correctionPayloads = [];

const baseStats = {
  damageDealt: 12_000,
  damageTaken: 9_000,
  gold: 11_000,
  participationRate: 0.65,
  damageConversionRate: 1.1,
  damageTakenPerDeath: 3_000,
  jungleGold: 1_800,
  minionKills: 120,
  kills: 4,
  deaths: 2,
  assists: 8,
  controlScore: 16,
  healing: 600,
  towerDamage: 3_200,
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
  stats: { ...baseStats, kills: index + 1, updatedAt: now },
}));
const staleRecognitionPlayers = players.map((player) => ({
  side: player.side,
  slot: player.slot,
  nickname: player.gameNickname,
  heroId: player.heroId,
  heroName: player.heroName,
  score: { value: player.score, sources: [], conflict: false },
  stats: Object.fromEntries(Object.keys(baseStats).map((field) => [field, {
    value: field === "participationRate" ? 0.55 : player.stats[field],
    sources: [],
    conflict: false,
  }])),
  warnings: [],
}));
let matchStatus = "CONFIRMED";
let matchFetchCount = 0;

function matchFixture() {
  return {
    match: {
      id: 1,
      tournamentId: 1,
      tournamentName: "参团率回归赛事",
      playedAt: now,
      status: matchStatus,
      winnerSide: "red",
      redTotalKills: 15,
      blueTotalKills: 40,
      consistencyStatus: "PASS",
      consistencyDetails: {},
      evidenceRevision: 1,
      recordRevision: 1,
      updatedAt: now,
      players,
      screenshots: [],
      recognition: {
        status: "COMPLETED",
        normalizedResult: { version: 2, players: staleRecognitionPlayers },
        warnings: [],
        errorCode: null,
      },
      disputes: [],
    },
    access: { canManage: true, isSuperAdmin: true, currentUserId: 1 },
    eligibleMembers: players.map((player) => ({
      id: player.id,
      username: `user${player.id}`,
      gameNickname: player.gameNickname,
    })),
  };
}

async function fulfillJson(route, data, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(data),
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

const browser = await chromium.launch({ executablePath: browserPath, headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/auth/me") {
      return fulfillJson(route, { user: { userId: 1, username: "测试管理员", role: "admin", avatar: null, securityQuestion: "测试问题" } });
    }
    if (pathname === "/api/announcements") return fulfillJson(route, { announcements: [], latestVersion: "V2.2" });
    if (pathname === "/api/resources/leases") {
      return fulfillJson(route, request.method() === "POST" ? { lease: { id: "participation-rate-lease" }, immediate: {} } : { ok: true });
    }
    if (pathname === "/api/resources/data") return fulfillJson(route, { data: null });
    if (pathname === "/api/heroes/watch" && request.method() === "GET") {
      return route.fulfill({ status: 200, contentType: "text/event-stream", body: `data: ${JSON.stringify({ type: "connected" })}\n\n` });
    }
    if (pathname === "/api/heroes/watch" && request.method() === "POST") return fulfillJson(route, { queued: true }, 202);
    if (pathname === "/api/tournaments/1/matches/1/confirmation" && request.method() === "PUT") {
      confirmationPayloads.push(request.postDataJSON());
      return fulfillJson(route, { ok: true, status: "CONFIRMED" });
    }
    if (pathname === "/api/admin/matches/1/corrections" && request.method() === "PATCH") {
      correctionPayloads.push(request.postDataJSON());
      return fulfillJson(route, { ok: true });
    }
    if (pathname === "/api/tournaments/1/matches/1") {
      matchFetchCount += 1;
      return fulfillJson(route, matchFixture());
    }
    return fulfillJson(route, {});
  });

  await page.goto(`${baseUrl}/tournaments/1/matches/1`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitReady(page);

  const participationRateInput = page.getByLabel("红方 1参团率（%）");
  assert.equal(await participationRateInput.inputValue(), "65", "database 0.65 must display as 65%, even when stale OCR says 55%");
  const matchFetchesBeforeEdit = matchFetchCount;
  await participationRateInput.click();
  await participationRateInput.press("Control+A");
  await participationRateInput.pressSequentially("63");
  assert.equal(await participationRateInput.inputValue(), "63", "the percentage input must reflect the edit immediately");
  await page.waitForTimeout(700);
  assert.equal(matchFetchCount, matchFetchesBeforeEdit, "editing the percentage must not trigger a server reload");
  assert.equal(await participationRateInput.inputValue(), "63", "the edited percentage must remain visible after the draft-save cycle");
  const confirmationResponse = page.waitForResponse((response) => response.url().endsWith("/confirmation") && response.request().method() === "PUT");
  await page.getByRole("button", { name: "保存复核结果" }).click();
  assert.equal((await confirmationResponse).status(), 200);
  assert.equal(confirmationPayloads.at(-1)?.players?.[0]?.stats?.participationRate, 0.63, "63% must submit as canonical 0.63");

  matchStatus = "SUBMITTED";
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitReady(page);
  assert.equal((await page.locator('td[data-label="参团率（%）"]').first().innerText()).trim(), "65%", "submitted records must render the percent sign");

  const correctionSection = page.locator("section.match-sheet").filter({ hasText: "超管纠错" });
  await correctionSection.locator("select").nth(0).selectOption("1");
  await correctionSection.locator("select").nth(1).selectOption("participationRate");
  await correctionSection.getByLabel("新值（%）").fill("63");
  await correctionSection.getByPlaceholder("至少 5 字").fill("修正参团率百分比");
  const correctionResponse = page.waitForResponse((response) => response.url().endsWith("/corrections") && response.request().method() === "PATCH");
  await page.getByRole("button", { name: "保存审计纠错" }).click();
  assert.equal((await correctionResponse).status(), 200);
  assert.equal(correctionPayloads.at(-1)?.value, 0.63, "admin correction must convert 63% to canonical 0.63");

  await context.close();
} finally {
  await browser.close();
}

console.log("Participation-rate browser regression passed.");
