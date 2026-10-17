import assert from "node:assert/strict";
import { chromium } from "playwright";
import { assertViewportBounds } from "./viewport-bounds.mjs";

const base = process.env.E2E_BASE_URL || "http://localhost:8001";
const browser = await chromium.launch({ headless: true, executablePath: process.env.E2E_BROWSER_PATH || undefined });
try {
  for (const width of [1280, 320]) {
    const mobile = width === 320;
    const prefix = mobile ? "/m" : "";
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      userAgent: mobile ? "Mozilla/5.0 iPhone Mobile" : "Mozilla/5.0 Windows Chrome/140",
      reducedMotion: "reduce",
    });
    const user = { userId: 7, username: "boundary-fixture", role: "user" };
    let failure = "missing";
    let authenticated = true;
    let splitRoom = false;
    const members = Array.from({ length: 10 }, (_, index) => ({
      userId: 7 + index,
      user: { id: 7 + index, username: `选手${index + 1}` },
      isTemporary: false, isSpectator: false, tempName: null,
    }));
    const roles = ["top", "jungle", "mid", "adc", "support"];
    // APIs are completely mocked; this test never reads or mutates a database.
    await context.addCookies([{ name: "wzyt_session", value: "ui-fixture", url: base }]);
    await context.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/auth/me") return route.fulfill({ json: { user: authenticated ? user : null } });
      if (path === "/api/tournaments/101/split") return route.fulfill({ json: {
        teamRed: members.slice(0, 5).map((member, index) => ({ userId: member.userId, roleType: roles[index] })),
        teamBlue: members.slice(5).map((member, index) => ({ userId: member.userId, roleType: roles[index] })),
        playerDetails: members.map((member) => ({ userId: member.userId, username: member.user.username })),
        strengthDiff: 0, preferenceScore: 50, isBeforeDeadline: true,
      } });
      if (path === "/api/tournaments/101") {
        if (failure === "missing") return route.fulfill({ status: 404, json: { error: "赛事不存在" } });
        if (failure === "forbidden") return route.fulfill({ status: 403, json: { error: "你不在该赛事中" } });
        if (failure === "offline") return route.abort("failed");
        return route.fulfill({ json: {
          tournament: { id: 101, name: "恢复后的战场", code: "628319", deadline: "2099-01-01T00:00:00Z", status: splitRoom ? "locked" : "recruiting", isPublic: true, players: splitRoom ? members : [], admins: splitRoom ? [{ userId: 7, role: "owner", user: members[0].user }] : [], applications: [] },
          splitResult: null,
        } });
      }
      return route.fulfill({ json: {} });
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}${prefix}/tournaments/101?tab=players`);
    await page.getByRole("alert").getByText("赛事不存在", { exact: true }).waitFor();
    assert.equal(await page.getByRole("link", { name: "返回战场列表" }).getAttribute("href"), `${prefix}/tournaments`);
    await assertViewportBounds(page, "tournament-missing");

    failure = "forbidden";
    await page.getByRole("button", { name: "重试", exact: true }).click();
    await page.getByRole("alert").getByText("你不在该赛事中", { exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, `${prefix}/tournaments/101`, "403 must display permission failure without redirecting a signed-in user to login");
    failure = "offline";
    await page.getByRole("button", { name: "重试", exact: true }).click();
    await page.getByRole("alert").getByText("网络连接失败，请稍后重试", { exact: true }).waitFor();
    await assertViewportBounds(page, "tournament-offline");

    failure = "none";
    await page.getByRole("button", { name: "重试", exact: true }).click();
    await page.getByRole("heading", { name: "恢复后的战场", exact: true }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "暂时无法进入战场", exact: true }).count(), 0, "successful retry must replace the error state");

    splitRoom = true;
    await page.reload();
    await page.getByRole("button", { name: "分队 (10/10)", exact: true }).click();
    await page.getByText("已分队", { exact: true }).first().waitFor();
    assert.equal(await page.getByText("满员已截止", { exact: true }).count(), 0, "successful split must update the room status immediately without refreshing");

    authenticated = false;
    await page.goto(`${base}${prefix}/tournaments/101?tab=players`);
    await page.waitForURL((url) => url.pathname === `${prefix}/login`);
    assert.equal(new URL(page.url()).searchParams.get("redirect"), `${prefix}/tournaments/101?tab=players`);
    assert.deepEqual(errors, [], `no uncaught browser errors at ${width}px`);
    await context.close();
    console.log(`Tournament failure, retry and login boundary regression passed at ${width}px.`);
  }
} finally {
  await browser.close();
}
