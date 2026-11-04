import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";

// Actual Next/React player; all API data and media are isolated fixtures.
const base = process.env.E2E_BASE_URL || "http://localhost:8001";
const movie = await readFile(new URL("../fixtures/combat-video.mp4", import.meta.url));
const executablePath = process.env.E2E_BROWSER_PATH || (process.platform === "win32" ? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" : undefined);
for (const engine of executablePath ? [chromium] : [chromium, webkit]) {
  const browser = await engine.launch({ headless: true, ...(engine === chromium && executablePath ? { executablePath } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: "Mozilla/5.0 iPhone Mobile", reducedMotion: "reduce" });
    await context.addCookies([{ name: "wzyt_session", value: "isolated-ui-fixture", url: base }]);
    let probes = 0;
    let disconnected = false;
    await context.route("**/api/**", async route => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      if (pathname === "/api/auth/me") return route.fulfill({ json: { user: { userId: 1, username: "测试玩家", role: "user" } } });
      if (pathname === "/api/combat-posts/1/video") {
        if (request.method() === "HEAD") {
          probes++;
          if (disconnected) return route.abort("failed");
          return route.fulfill({ status: 404, body: "" });
        }
        return route.fulfill({ contentType: "video/mp4", body: movie });
      }
      if (pathname === "/api/combat-posts/1") return route.fulfill({ json: {
        post: { id: 1, title: "视频诊断测试", content: "隔离视频", status: "published", authorId: 1, author: { username: "测试玩家" },
          createdAt: "2026-11-04T00:00:00Z", likedByMe: false, videoUrl: "/api/combat-posts/1/video", comments: [], _count: { likes: 0, comments: 0 } },
        access: { canModerate: false },
      } });
      return route.fulfill({ json: {} });
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${base}/m/combat/1`);
    await page.getByRole("button", { name: "点击播放视频" }).waitFor();
    await page.locator("video").evaluate(video => { video.play = () => Promise.reject(new DOMException("fixture", "NotSupportedError")); });
    await page.getByRole("button", { name: "点击播放视频" }).click();
    await page.getByRole("alert").filter({ hasText: "视频文件不存在" }).waitFor();
    assert.ok(probes > 0, "playback recovery issues an authorized HEAD probe");
    disconnected = true;
    const before = probes;
    await page.getByRole("button", { name: "重新加载视频" }).click();
    await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent.includes("无法解码"));
    await page.waitForTimeout(300);
    assert.ok(probes > before);
    assert.deepEqual(errors, [], "failed/cancelled metadata probes must not leave unhandled playback errors");
    await context.close();
    console.log(`PASS ${engine.name()}: actual phone player, HEAD 404, retry and disconnected diagnostics without page errors`);
  } finally { await browser.close(); }
}
