import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.E2E_BASE_URL || "http://localhost:8001";
const browser = await chromium.launch({ headless: true, executablePath: process.env.E2E_BROWSER_PATH || undefined });
const types = ["DATA", "OUTPUT", "SURVIVAL", "DEVELOPMENT", "KDA", "TEAM"];
const now = "2026-09-10T02:00:00.000Z";
try {
  for (const width of [1280, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce",
      userAgent: width < 640 ? "Mozilla/5.0 iPhone Mobile" : "Mozilla/5.0 Windows Chrome/140" });
    let failure = "OCR_UPGRADE_REQUIRED";
    let started = 0;
    await context.addCookies([{ name: "wzyt_session", value: "ui-fixture", url: base }]);
    await context.route("**/api/**", async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/auth/me") return route.fulfill({ json: { user: { userId: 1, username: "manager", role: "admin" } } });
      if (path === "/api/tournaments/101/matches/201/recognitions") {
        started++;
        return route.fulfill({ json: { recognitionId: 1, status: "QUEUED" } });
      }
      if (path === "/api/tournaments/101/matches/201") return route.fulfill({ json: {
        match: { id: 201, tournamentId: 101, tournamentName: "OCR 反馈回归", playedAt: now, updatedAt: now,
          status: "UPLOADED", winnerSide: null, consistencyStatus: "FAIL", evidenceRevision: 1, recordRevision: 1,
          redTotalKills: null, blueTotalKills: null, players: [], disputes: [],
          screenshots: types.map((type, i) => ({ id: i+1, type, originalFilename: `${type}.jpg`, size: 100000, recognitionStatus: "FAILED" })),
          recognition: { status: "FAILED", errorCode: failure, attemptCount: 1, normalizedResult: null, warnings: null,
            availableAt: now, heartbeatAt: null } },
        access: { canManage: true, isSuperAdmin: true, currentUserId: 1 }, eligibleMembers: [],
      } });
      return route.fulfill({ json: {} });
    });
    const page = await context.newPage();
    const prefix = width < 640 ? "/m" : "";
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${base}${prefix}/tournaments/101/matches/201`);
    await page.getByRole("heading", { name: "比赛档案", exact: true }).waitFor();
    await page.locator("summary").filter({ hasText: "数据依据" }).click();
    await page.getByRole("alert").filter({ hasText: "单图预览版" }).waitFor();
    assert.equal(await page.getByText("OCR_UPGRADE_REQUIRED", { exact: true }).count(), 0);
    assert.equal(await page.getByText("已上传", { exact: true }).count(), 6);
    const start = page.getByRole("button", { name: "开始识别", exact: true });
    assert.ok(await start.isEnabled());
    await start.click();
    await page.getByText(/已进入队列，可离开页面/).waitFor();
    assert.equal(started, 1, "retry keeps original screenshots and starts one task");
    failure = "OCR_INPUT_INVALID";
    await page.reload();
    await page.getByRole("heading", { name: "比赛档案", exact: true }).waitFor();
    await page.locator("summary").filter({ hasText: "数据依据" }).click();
    await page.getByRole("alert").filter({ hasText: "完整横屏双方视图" }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "error text fits viewport");
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS ${width}px OCR failure guidance, retained evidence, retry, no overflow`);
  }
} finally {
  await browser.close();
}
