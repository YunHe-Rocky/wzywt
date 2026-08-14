import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";

const prisma = new PrismaClient();
const baseUrl = "http://localhost:8001";
const browserPath = process.env.E2E_BROWSER_PATH;
if (!browserPath) throw new Error("E2E_BROWSER_PATH is required");
const artifactDir = path.resolve(".cache/test-artifacts/next-stage");
await mkdir(artifactDir, { recursive: true });
const prefix = `next_e2e_${Date.now()}`;
const password = "NextStage-E2E-Password-2026";
const passwordHash = await bcrypt.hash(password, 4);
const users = [];
let tournamentId = null;
let postId = null;
let browser;
const consoleErrors = [];

async function cleanStaleFixtures() {
  const staleUsers = await prisma.user.findMany({ where: { username: { startsWith: "next_e2e_" } }, select: { id: true } });
  const userIds = staleUsers.map(({ id }) => id);
  if (userIds.length) {
    await prisma.combatPostComment.deleteMany({ where: { authorId: { in: userIds } } });
    await prisma.combatPost.deleteMany({ where: { authorId: { in: userIds } } });
  }
  const stale = await prisma.tournament.findMany({ where: { name: { startsWith: "next_e2e_" } }, select: { id: true } });
  const tournamentIds = stale.map(({ id }) => id);
  if (tournamentIds.length) {
    await prisma.combatPost.deleteMany({ where: { tournamentId: { in: tournamentIds } } });
    await prisma.adminOperation.deleteMany({ where: { tournamentId: { in: tournamentIds } } });
    await prisma.internalMatch.deleteMany({ where: { tournamentId: { in: tournamentIds } } });
    await prisma.tournament.deleteMany({ where: { id: { in: tournamentIds } } });
  }
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function login(page, username) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitReady(page);
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForURL("**/?_from=login", { timeout: 20_000 });
}

async function waitReady(page) {
  await page.waitForLoadState("domcontentloaded");
  try {
    await page.waitForLoadState("networkidle", { timeout: 5_000 });
  } catch {
    await page.waitForTimeout(500);
  }
}

async function expectNoHorizontalOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert.ok(dimensions.scrollWidth <= dimensions.width + 1, `${label} horizontal overflow: ${JSON.stringify(dimensions)}`);
}

try {
  await cleanStaleFixtures();
  for (let index = 0; index < 10; index += 1) {
    users.push(await prisma.user.create({
      data: { username: `${prefix}_${index}`, passwordHash, role: index === 0 ? "admin" : "user", gameNickname: index < 5 ? `red-player-${index + 1}` : `blue-player-${index - 4}` },
    }));
  }
  const roles = ["top", "jungle", "mid", "adc", "support"];
  const teamRed = users.slice(0, 5).map((user, index) => ({ userId: user.id, roleType: roles[index], assignedRole: roles[index], preferenceRank: 1 }));
  const teamBlue = users.slice(5).map((user, index) => ({ userId: user.id, roleType: roles[index], assignedRole: roles[index], preferenceRank: 1 }));
  const tournament = await prisma.tournament.create({
    data: {
      name: `${prefix} 完整链路`, code: String(Date.now()).slice(-6), status: "completed", isPublic: false,
      deadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
      splitResult: { version: 2, teamRed, teamBlue, strengthDiff: 0, preferenceScore: 10, playerDetails: users.map((user) => ({ userId: user.id, username: user.username })) },
      players: { create: users.map((user) => ({ userId: user.id })) },
      admins: { create: { userId: users[0].id, role: "owner" } },
    },
  });
  tournamentId = tournament.id;

  browser = await chromium.launch({ headless: true, executablePath: browserPath });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "zh-CN" });
  const page = await context.newPage();
  page.on("console", (message) => { if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await login(page, users[0].username);

  await page.goto(`${baseUrl}/tournaments/${tournament.id}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitReady(page);
  await page.getByRole("button", { name: "比赛档案", exact: true }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(artifactDir, "archive-recon.png"), fullPage: true });
  const archiveHeading = page.getByRole("heading", { name: "永久比赛档案" });
  if (!await archiveHeading.isVisible()) {
    const bodyText = (await page.locator("body").innerText()).slice(0, 4_000);
    throw new Error(`Archive panel missing after tab click; url=${page.url()}; errors=${JSON.stringify(consoleErrors)}; text=${bodyText}`);
  }
  const createResponsePromise = page.waitForResponse((response) => response.url().endsWith(`/api/tournaments/${tournament.id}/matches`) && response.request().method() === "POST");
  await page.getByRole("button", { name: "创建比赛档案" }).click();
  const createResponse = await createResponsePromise;
  assert.equal(createResponse.status(), 201);
  const matchId = (await createResponse.json()).match.id;
  const matchLink = page.getByRole("link", { name: "查看档案" });
  await matchLink.waitFor();
  const matchNavigation = page.waitForURL(`**/tournaments/${tournament.id}/matches/${matchId}`);
  await matchLink.click();
  await matchNavigation;
  await waitReady(page);
  assert.ok(Number.isSafeInteger(matchId) && matchId > 0);

  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  for (let index = 0; index < 6; index += 1) {
    const input = page.locator('.screenshot-slot input[type="file"]').nth(index);
    const uploadResponse = page.waitForResponse((response) => response.url().includes("/screenshots/") && response.request().method() === "POST");
    await input.setInputFiles({ name: `evidence-${index}.png`, mimeType: "image/png", buffer: png });
    const response = await uploadResponse;
    assert.equal(response.status(), 200, `screenshot upload failed: ${await response.text()}`);
  }
  const recognizeResponse = page.waitForResponse((response) => response.url().endsWith("/recognitions") && response.request().method() === "POST", { timeout: 30_000 });
  await page.getByRole("button", { name: "启动 OCR" }).click();
  assert.equal((await recognizeResponse).status(), 503, "production without OCR must fail closed");
  const persistedPlayers = await prisma.matchPlayer.findMany({ where: { matchId }, orderBy: [{ side: "desc" }, { slot: "asc" }] });
  await prisma.$transaction(async (tx) => {
    for (const player of persistedPlayers) {
      const index = (player.side === "red" ? 0 : 5) + player.slot - 1;
      await tx.matchPlayer.update({
        where: { id: player.id },
        data: { gameNickname: `${player.side}-player-${player.slot}`, heroName: `测试英雄${player.slot}`, score: 10 + player.slot - 1 },
      });
      await tx.matchPlayerStat.create({
        data: { matchPlayerId: player.id, damageDealt: 1000 + index, damageTaken: 900 + index, gold: 800 + index, participationRate: 0.5, damageConversionRate: 1.2, damageTakenPerDeath: 400 + index, jungleGold: 100 + index, minionKills: 20 + index, kills: index + 1, deaths: 1, assists: 2, controlScore: 3.5, healing: 100 + index, towerDamage: 200 + index },
      });
    }
    await tx.matchRecognition.create({ data: { matchId, status: "COMPLETED", engine: "e2e-fixture", startedById: users[0].id, normalizedResult: { version: 1, consistencyStatus: "PASS", players: [] }, warnings: [], startedAt: new Date(), finishedAt: new Date() } });
    await tx.matchScreenshot.updateMany({ where: { matchId }, data: { recognitionStatus: "COMPLETED" } });
    await tx.internalMatch.update({ where: { id: matchId }, data: { status: "WAITING_CONFIRMATION", consistencyStatus: "PASS", consistencyDetails: { source: "e2e-fixture-after-fail-closed-check" } } });
  });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitReady(page);
  await page.getByText("PASS", { exact: true }).waitFor();
  const confirmResponse = page.waitForResponse((response) => response.url().endsWith("/confirmation") && response.request().method() === "PUT");
  await page.getByRole("button", { name: "确认全部数据" }).click();
  assert.equal((await confirmResponse).status(), 200);
  await page.getByText("CONFIRMED", { exact: true }).waitFor();
  const submitResponse = page.waitForResponse((response) => response.url().endsWith("/submit") && response.request().method() === "POST");
  await page.getByRole("button", { name: "正式提交并锁定" }).click();
  assert.equal((await submitResponse).status(), 200);
  await page.getByText("SUBMITTED", { exact: true }).waitFor();
  await expectNoHorizontalOverflow(page, "desktop match");

  const screenshotResponse = await context.request.get(`${baseUrl}/api/tournaments/${tournament.id}/matches/${matchId}/screenshots/DATA`);
  assert.equal(screenshotResponse.status(), 200);
  await page.getByRole("link", { name: "进入红方战术室" }).click();
  await waitReady(page);
  await page.getByRole("slider", { name: "比赛时间" }).fill("120");
  await page.locator(".tactic-resource-strip").getByText("第 5 波 2:22", { exact: true }).waitFor();
  await page.getByText("图层与精确编辑", { exact: true }).click();
  await page.getByPlaceholder("新图层名称").fill("开局反野");
  await page.getByLabel("开始").fill("2:00");
  await page.getByLabel("结束").fill("4:00");
  const layerResponse = page.waitForResponse((response) => response.url().endsWith(`/tactics/red`) && response.request().method() === "POST");
  await page.getByRole("button", { name: "新建图层" }).click();
  assert.equal((await layerResponse).status(), 201);
  await page.getByText("2:00 – 4:00", { exact: true }).waitFor();
  const board = page.locator("svg.tactic-board");
  await board.waitFor();
  const box = await board.boundingBox();
  assert.ok(box);
  await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.8);
  await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.55);
  const routeResponse = page.waitForResponse((response) => response.url().endsWith("/route") && response.request().method() === "PUT");
  await page.getByRole("button", { name: "保存路线" }).click();
  assert.equal((await routeResponse).status(), 200);
  await page.screenshot({ path: path.join(artifactDir, "tactic-desktop.png"), fullPage: true });
  await expectNoHorizontalOverflow(page, "desktop tactic");

  await page.goto(`${baseUrl}/combat`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitReady(page);
  await page.locator('input[name="title"]').fill("高地反打复盘");
  await page.locator('textarea[name="content"]').fill("先拉开阵型，再利用控制链完成反打。");
  await page.locator('input[name="tournamentId"]').fill(String(tournament.id));
  await page.locator('input[name="matchId"]').fill(String(matchId));
  const mp4 = Buffer.alloc(12); mp4.write("ftyp", 4, "ascii");
  await page.locator('input[name="video"]').setInputFiles({ name: "review.mp4", mimeType: "video/mp4", buffer: mp4 });
  const publishResponse = page.waitForResponse((response) => response.url().endsWith("/api/combat-posts") && response.request().method() === "POST");
  await page.getByRole("button", { name: "发布动态" }).click();
  const published = await publishResponse;
  assert.equal(published.status(), 201);
  postId = (await published.json()).post.id;
  const detailLink = page.getByRole("link", { name: "查看复盘" }).first();
  await detailLink.waitFor();
  const postNavigation = page.waitForURL(`**/combat/${postId}`);
  await detailLink.click();
  await postNavigation;
  await page.waitForLoadState("domcontentloaded");
  const videoResponse = await context.request.get(`${baseUrl}/api/combat-posts/${postId}/video`, { headers: { Range: "bytes=0-3" } });
  assert.equal(videoResponse.status(), 206);
  assert.match(videoResponse.headers()["content-range"], /^bytes 0-3\/12$/);
  await page.getByRole("button", { name: /^点赞/ }).click();
  await page.locator('.comment-form textarea[name="content"]').fill("这段复盘的进场时机说明很清楚。");
  await page.getByRole("button", { name: "发表评论" }).click();
  await page.getByText("这段复盘的进场时机说明很清楚。").waitFor();

  const anonymous = await browser.newContext();
  const unauthorizedVideo = await anonymous.request.get(`${baseUrl}/api/combat-posts/${postId}/video`);
  assert.equal(unauthorizedVideo.status(), 401);
  await anonymous.close();

  const redContext = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: "zh-CN" });
  const redPage = await redContext.newPage();
  await login(redPage, users[1].username);
  assert.equal((await redContext.request.get(`${baseUrl}/api/tournaments/${tournament.id}/matches/${matchId}/tactics/red`)).status(), 200);
  assert.equal((await redContext.request.get(`${baseUrl}/api/tournaments/${tournament.id}/matches/${matchId}/tactics/blue`)).status(), 403);
  await redPage.goto(`${baseUrl}/m/tournaments/${tournament.id}/matches/${matchId}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitReady(redPage);
  await expectNoHorizontalOverflow(redPage, "mobile match");
  assert.equal(await redPage.locator(".match-result-table").count(), 1, "mobile result must use one semantic table");
  assert.equal(await redPage.locator(".match-result-table tbody").count(), 2, "result table must preserve red and blue groups");
  assert.equal(await redPage.locator(".match-result-table tbody tr:not(.match-result-team-heading)").count(), 10, "result table must contain ten players");
  assert.equal(await redPage.locator(".match-evidence-disclosure").getAttribute("open"), null, "submitted evidence should be collapsed by default");
  await redPage.screenshot({ path: path.join(artifactDir, "match-mobile.png"), fullPage: true });
  await redContext.close();

  assert.deepEqual(consoleErrors, []);
  console.log(`Next-stage browser acceptance passed; tournament=${tournament.id}; match=${matchId}; post=${postId}; artifacts=${artifactDir}`);
} finally {
  if (browser) await browser.close();
  if (users.length) await prisma.combatPostComment.deleteMany({ where: { authorId: { in: users.map(({ id }) => id) } } });
  if (users.length) await prisma.combatPost.deleteMany({ where: { authorId: { in: users.map(({ id }) => id) } } });
  if (tournamentId) await prisma.combatPost.deleteMany({ where: { tournamentId } });
  if (tournamentId) await prisma.adminOperation.deleteMany({ where: { tournamentId } });
  if (tournamentId) await prisma.internalMatch.deleteMany({ where: { tournamentId } });
  if (tournamentId) await prisma.tournament.deleteMany({ where: { id: tournamentId } });
  if (users.length) await prisma.user.deleteMany({ where: { id: { in: users.map(({ id }) => id) } } });
  await prisma.$disconnect();
}
