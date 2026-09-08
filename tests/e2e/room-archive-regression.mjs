import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.E2E_BASE_URL || "http://localhost:8001";
const browser = await chromium.launch({ headless: true, executablePath: process.env.E2E_BROWSER_PATH || undefined });
const now = "2026-09-08T08:00:00.000Z";
const roles = ["top", "jungle", "mid", "adc", "support"];
const players = Array.from({ length: 10 }, (_, i) => ({
  id: i + 1, memberId: i + 1, userId: i + 1, side: i < 5 ? "red" : "blue", slot: i % 5 + 1,
  roleType: roles[i % 5], isGuest: false, isTemporary: false, isSpectator: false, tempName: null,
  gameNickname: `选手${i + 1}`, heroId: null, heroName: "测试英雄", score: 10, updatedAt: now,
  user: { id: i + 1, username: `user${i + 1}`, gameNickname: `选手${i + 1}`, gameId: `private-game-${i + 1}`, avatar: null },
  stats: { kills: 2, deaths: 1, assists: 3, updatedAt: now },
}));
const split = { teamRed: players.slice(0, 5), teamBlue: players.slice(5), playerDetails: players.map(p => ({ userId: p.id, username: p.gameNickname })), strengthDiff: 100, preferenceScore: 25 };
try {
  for (const width of [1280, 390]) {
    for (const manager of [false, true, "global"]) {
      const userId = manager ? 1 : 7, ownSide = manager ? "red" : "blue";
      let status = "DRAFT", denyDetail = false, detailRequests = 0;
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce", userAgent: width < 640 ? "Mozilla/5.0 iPhone Mobile" : "Mozilla/5.0 Windows Chrome/140", ignoreHTTPSErrors: new URL(base).hostname === "localhost" });
      await context.addCookies([{ name: "wzyt_session", value: "ui-fixture", url: base }]);
      await context.route("**/api/**", async route => {
        const url = new URL(route.request().url()), path = url.pathname;
        if (path === "/api/auth/me") return route.fulfill({ json: { user: { userId, username: `user${userId}`, role: manager === "global" ? "admin" : "user" } } });
        if (path === "/api/tournaments/101") return route.fulfill({ json: { tournament: { id: 101, name: "分队与档案测试", code: "628319", status: "completed", deadline: now, players, admins: [{ userId: manager === "global" ? 2 : 1, role: "owner", user: players[0].user }], applications: [], isPublic: true, splitResult: split }, splitResult: split, canViewMemberIdentity: Boolean(manager) } });
        if (path === "/api/tournaments/101/matches") return route.fulfill({ json: { matches: [{ id: 201, status, playedAt: now, ownSide, canViewArchive: Boolean(manager) || status === "SUBMITTED", winnerSide: "blue", redTotalKills: 10, blueTotalKills: 20, consistencyStatus: "PASS", _count: { screenshots: 6, players: 10, combatPosts: 0 } }] } });
        if (path === "/api/tournaments/101/matches/201") {
          detailRequests++;
          if (denyDetail) return route.fulfill({ status: 403, json: { error: "比赛结束并正式提交后，仅本队成员可查看档案" } });
          return route.fulfill({ json: { match: { id: 201, tournamentId: 101, tournamentName: "分队与档案测试", status, playedAt: now, winnerSide: "blue", redTotalKills: 10, blueTotalKills: 20, consistencyStatus: "PASS", consistencyDetails: null, evidenceRevision: 1, recordRevision: 1, updatedAt: now, players: manager ? players : players.filter(p => p.side === ownSide), screenshots: [], recognition: null, disputes: [] }, access: { canManage: Boolean(manager), currentUserId: userId, isSuperAdmin: false, ownSide }, eligibleMembers: [] } });
        }
        return route.fulfill({ json: {} });
      });
      const page = await context.newPage();
      const prefix = width < 640 ? "/m" : "";
      await page.goto(`${base}${prefix}/tournaments/101`);
      await page.getByRole("heading", { name: "分队与档案测试" }).waitFor();
      assert.equal(await page.getByText(/账号：|UID：|游戏 ID：/).count(), 0, "room identity details must stay hidden, including managers");
      const own = page.getByRole("region", { name: "我的分队结果" });
      await own.waitFor();
      assert.match(await own.innerText(), new RegExp(ownSide === "blue" ? "蓝队" : "红队"));
      assert.match(await own.innerText(), /我的分路/);
      const full = page.getByRole("heading", { name: "完整分队结果", exact: true });
      assert.ok((await own.boundingBox()).y < (await full.boundingBox()).y, "own team precedes full results");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "room fits viewport");
      if (process.env.E2E_SCREENSHOT_DIR) {
        await mkdir(process.env.E2E_SCREENSHOT_DIR, { recursive: true });
        await page.screenshot({ path: `${process.env.E2E_SCREENSHOT_DIR}/room-${width}-${manager}.png` });
      }
      await page.getByRole("button", { name: "比赛档案", exact: true }).click();
      await page.getByText("BETA 测试", { exact: true }).waitFor();
      if (manager) await page.getByRole("link", { name: "打开档案", exact: true }).waitFor();
      else {
        await page.getByText(/比赛结束.*正式提交.*开放/).waitFor();
        assert.equal(await page.getByRole("link", { name: "打开档案", exact: true }).count(), 0);
      }
      await page.getByRole("button", { name: "本队战术", exact: true }).click();
      const tacticLink = page.getByRole("link", { name: "进入本队战术室", exact: true });
      await tacticLink.waitFor();
      assert.match(await tacticLink.getAttribute("href"), new RegExp(`/tactics/${ownSide}$`));
      assert.equal(await page.locator(`a[href$="/tactics/${ownSide === "red" ? "blue" : "red"}"]`).count(), 0);
      status = "SUBMITTED";
      await page.getByRole("button", { name: "比赛档案", exact: true }).click();
      await page.getByRole("link", { name: "打开档案", exact: true }).click();
      await page.getByRole("heading", { name: "比赛档案", exact: true }).waitFor();
      await page.getByText("BETA 测试", { exact: true }).waitFor();
      if (!manager) {
        assert.equal(await page.getByText("红方阵容", { exact: true }).count(), 0, "no empty opponent team section");
        await page.getByText("蓝方阵容", { exact: true }).waitFor();
        assert.equal(await page.getByText("截图与识别", { exact: true }).count(), 0);
        await page.getByLabel("当前比分，红方 10，蓝方 20").waitFor();
      }
      assert.equal(await page.locator(`a[href$="/tactics/${ownSide === "red" ? "blue" : "red"}"]`).count(), 0, "workspace tactics only own side");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "archive fits viewport");
      if (process.env.E2E_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.E2E_SCREENSHOT_DIR}/archive-${width}-${manager}.png` });
      denyDetail = true;
      await page.reload();
      await page.getByRole("alert").filter({ hasText: /仅本队成员/ }).waitFor();
      const deniedRequests = detailRequests;
      await page.waitForTimeout(500);
      assert.equal(detailRequests, deniedRequests, "denied archives must not repeatedly fetch on toast rerenders");
      await context.close();
      console.log(`PASS ${width}px ${manager === "global" ? "global admin" : manager ? "manager" : "member"}: identity, own-first, archive gate, BETA, own tactics and denied state`);
    }
  }
} finally { await browser.close(); }
