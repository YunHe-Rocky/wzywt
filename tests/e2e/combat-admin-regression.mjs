import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
import { compileStyles } from "./yanwu/host.mjs";

// Component-level browser regression: real React components and HTTP, isolated data.
// This harness never connects to the project's database or creates real users/posts.
const output = path.resolve(".cache/test-artifacts/combat-admin");
await mkdir(output, { recursive: true });
const bundled = await build({
  stdin: { contents: `import React from "react"; import { createRoot } from "react-dom/client";
    import { AdminShell } from "@/web/components/admin/AdminShell";
    import { AdminDashboard } from "@/web/components/admin/AdminDashboard";
    import { CombatPostManager } from "@/web/components/admin/CombatPostManager";
    import { CombatWall } from "@/web/CombatWall";
    import { CombatVideoPlayer } from "@/web/components/content/CombatVideoPlayer";
    import { Dock } from "@/web/components/layout/alternate/Dock";
    import { ToastProvider } from "@/web/components/ui/Toast";
    const pathname=location.pathname;
    const content=pathname.includes("admin") ? <AdminShell userId={1} username="测试管理员">{pathname.endsWith("/combat") ? <CombatPostManager/> : <AdminDashboard/>}</AdminShell> : pathname==="/player" ? <CombatVideoPlayer src="/video"/> : <><CombatWall/><Dock/></>;
    createRoot(document.getElementById("root")).render(<React.StrictMode><ToastProvider>{content}</ToastProvider></React.StrictMode>);`, loader: "tsx", resolveDir: process.cwd() },
  bundle: true, write: false, outdir: ".cache/component-bundle", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": JSON.stringify(process.env.E2E_REACT_MODE || "development") },
  plugins: [{ name: "test-navigation-and-session", setup(builder) {
    builder.onResolve({ filter: /^(next\/link|next\/navigation|@\/features\/auth\/client)$/ }, args => ({ path: args.path, namespace: "test" }));
    builder.onLoad({ filter: /.*/, namespace: "test" }, args => ({ loader: "jsx", resolveDir: process.cwd(), contents:
      args.path === "next/link" ? `import React from "react"; export default function Link({prefetch,children,...props}){return <a {...props}>{children}</a>;}` :
      args.path === "next/navigation" ? `export const usePathname=()=>location.pathname;` :
      `const user={userId:1,username:"测试管理员",role:"admin"}; export function useAuth(){return {user:location.search.includes("guest") ? null : user,loaded:true,logout:async()=>{}};}`,
    }));
  } }],
});
const css = await compileStyles(path.resolve("src/app/layout.tsx"), bundled.outputFiles.filter(file => file.path.endsWith(".css")).map(file => file.text).join("\n"));
const title = "第一场团战复盘";
let status = "published"; let deleted = false; let listFailure = false; let overviewFailure = false; let uploaded = false; let moderationFailure = false;
let listRequests = 0; let uploadRequests = 0;
const requests = [];
const post = () => ({ id: 1, title, content: "从站位到进场时机，一起复盘关键团战。", status, size: 5 * 1024 ** 2, createdAt: "2026-09-16T00:00:00Z", author: { username: "测试成员" }, _count: { likes: 3, comments: 2 } });
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost"); requests.push(`${req.method} ${url.pathname}${url.search}`);
  const json = (data, code = 200) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(data)); };
  if (url.pathname === "/bundle.js") { res.writeHead(200, { "Content-Type": "text/javascript" }); return res.end(bundled.outputFiles[0].contents); }
  if (url.pathname === "/style.css") { res.writeHead(200, { "Content-Type": "text/css" }); return res.end(css); }
  if (url.pathname === "/api/admin/stats") return overviewFailure ? json({ error: "概览测试失败" }, 503) : json({ userCount: 20, tournamentCount: 10, activeTournamentCount: 2, heroCount: 130, postCount: 1, hiddenPostCount: 0, videoBytes: 1024, recentPosts: [post()] });
  if (url.pathname === "/api/admin/combat-posts") {
    const matching = !deleted && (!url.searchParams.get("status") || url.searchParams.get("status") === status) && (!url.searchParams.get("q") || title.includes(url.searchParams.get("q")));
    return json({ posts: matching ? [post()] : [], page: 1, totalPages: 1, total: matching ? 1 : 0 });
  }
  if (url.pathname === "/api/combat-posts/1" && req.method === "PATCH") {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    if (moderationFailure) return json({ error: "模拟操作失败，请重试" }, 503);
    const { action } = JSON.parse(Buffer.concat(chunks)); if (action === "DELETE") deleted = true; else status = action === "HIDE" ? "hidden" : "published";
    return json({ ok: true });
  }
  if (url.pathname === "/api/combat-posts/policy") return json({ maxBytes: 512 * 1024 ** 2, maxDurationSeconds: 300, uploadTimeoutMs: 900000 });
  if (url.pathname === "/api/combat-posts") {
    if (req.method === "POST") { uploadRequests++; for await (const _chunk of req) { /* consume multipart without persisting */ } uploaded = true; return json({ post: { id: 2 } }, 201); }
    listRequests++;
    if (listFailure) return json({ error: "网络暂时不可用" }, 503);
    return json({ posts: [post()], totalPages: 2, total: 13, page: Number(url.searchParams.get("page") || 1) });
  }
  if (url.pathname === "/video") {
    const file = path.resolve("tests/fixtures/combat-video.mp4");
    const { size } = await stat(file); const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || "");
    const start = range ? Number(range[1]) : 0; const end = range?.[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
    res.writeHead(range ? 206 : 200, { "Content-Type": "video/mp4", "Accept-Ranges": "bytes", "Content-Length": end - start + 1, ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}) });
    return createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end('<!doctype html><html lang="zh-CN"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script></html>');
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.E2E_BROWSER_PATH || undefined });
  const page = await browser.newPage(); const errors = []; page.on("pageerror", error => errors.push(error.message));
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const prefix = width < 768 ? "/m" : "";
    await page.goto(`${base}${prefix}/admin`); await page.getByRole("heading", { name: "运营工作台" }).waitFor();
    await page.getByText("20", { exact: true }).waitFor();
    if (width < 768) await page.getByRole("button", { name: "管理菜单", exact: true }).click();
    const nav = page.getByRole("navigation", { name: "后台导航" });
    const requiredAdminEntries = [
      ["工作台", "/admin"], ["用户管理", "/admin/users"], ["赛事管理", "/admin/tournaments"],
      ["动态管理", "/admin/combat"], ["公告管理", "/admin/announcements"], ["历史主题", "/admin/history-themes"],
      ["英雄管理", "/admin/heroes"], ["运行监控", "/admin/monitor"], ["系统设置", "/admin/settings"],
    ];
    for (const [label, route] of requiredAdminEntries) {
      assert.equal(await nav.getByRole("link", { name: new RegExp(label) }).getAttribute("href"), `${prefix}${route}`);
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `admin overflow at ${width}`);
    await page.screenshot({ path: path.join(output, `admin-${width}.png`), fullPage: true });
    await nav.getByRole("link", { name: /动态管理/ }).click(); await page.getByRole("heading", { name: title }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `manager overflow at ${width}`);
    await page.screenshot({ path: path.join(output, `manager-${width}.png`), fullPage: true });
  }
  moderationFailure = true;
  await page.getByRole("button", { name: "隐藏动态", exact: true }).click(); await page.getByRole("button", { name: "确认", exact: true }).click();
  await page.getByRole("alertdialog").getByText("模拟操作失败，请重试", { exact: true }).waitFor();
  await page.getByRole("button", { name: "取消", exact: true }).click(); await page.getByRole("heading", { name: title }).waitFor();
  assert.equal(status, "published"); moderationFailure = false;
  await page.getByRole("button", { name: "隐藏动态", exact: true }).click(); await page.getByRole("button", { name: "取消", exact: true }).click(); assert.equal(status, "published");
  await page.getByRole("button", { name: "隐藏动态", exact: true }).click(); await page.getByRole("button", { name: "确认", exact: true }).click();
  await page.getByRole("button", { name: "恢复发布" }).waitFor(); assert.equal(status, "hidden");
  await page.getByRole("button", { name: "恢复发布" }).click(); await page.getByRole("button", { name: "确认", exact: true }).click(); await page.getByRole("button", { name: "隐藏动态", exact: true }).waitFor();
  await page.getByLabel("搜索动态").fill("不存在"); await page.getByRole("button", { name: "搜索", exact: true }).click(); await page.getByText("没有符合条件的动态。").waitFor();
  overviewFailure = true; await page.goto(`${base}/m/admin`); await page.getByRole("alert").waitFor(); overviewFailure = false; await page.getByRole("button", { name: "刷新概览" }).click(); await page.getByText("20", { exact: true }).waitFor();
  const before = listRequests; await page.goto(`${base}/m/combat?guest`); await page.getByRole("link", { name: "登录查看动态" }).waitFor(); assert.equal(listRequests, before, "guest must not request protected feed");
  await page.goto(`${base}/m/combat`); await page.getByRole("heading", { name: title }).waitFor();
  assert.equal(await page.getByRole("navigation", { name: "底部导航" }).getByRole("link", { name: "动态" }).getAttribute("aria-current"), "page");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "feed overflow at 320px");
  await page.screenshot({ path: path.join(output, "combat-320.png"), fullPage: true });
  await page.getByRole("button", { name: "下一页" }).click(); await page.getByText("第 2 / 2 页").waitFor();
  await page.getByRole("button", { name: "发布动态", exact: true }).click();
  await page.getByLabel("标题", { exact: true }).fill("浏览器视频上传测试"); await page.getByLabel("正文", { exact: true }).fill("这是独立浏览器上传测试，不写入真实数据库。");
  await page.getByLabel("复盘视频", { exact: true }).setInputFiles("tests/fixtures/combat-video.mp4");
  await page.getByRole("button", { name: "收起发布", exact: true }).click();
  await page.getByRole("button", { name: "发布动态", exact: true }).click();
  assert.equal(await page.getByLabel("复盘视频", { exact: true }).evaluate(input => input.files.length), 1, "collapsing the composer keeps the actual selected file");
  await page.locator("form").getByRole("button", { name: "发布动态", exact: true }).click();
  await page.getByText("演武动态已发布", { exact: true }).waitFor(); await page.getByText("第 1 / 2 页").waitFor(); assert.ok(uploaded); assert.equal(uploadRequests, 1);
  await page.waitForFunction(() => document.activeElement?.classList.contains("combat-open-publisher"));
  listFailure = true; await page.getByRole("button", { name: "刷新", exact: true }).click(); await page.getByRole("button", { name: "重新加载", exact: true }).waitFor();
  listFailure = false; await page.getByRole("button", { name: "重新加载", exact: true }).click(); await page.getByRole("heading", { name: title }).waitFor();
  await page.goto(`${base}/player`, { waitUntil: "networkidle" });
  assert.equal(await page.locator("video").getAttribute("src"), "/video", "StrictMode remount must preserve the video source");
  await page.waitForFunction(() => document.querySelector("video")?.readyState >= 1);
  await page.locator("video").evaluate(async video => { await video.play(); video.currentTime = 10; });
  await page.waitForFunction(() => document.querySelector("video")?.currentTime >= 10 && !document.querySelector("video")?.paused);
  await page.locator("video").evaluate(video => { video.pause(); video.dispatchEvent(new Event("error")); });
  await page.getByRole("button", { name: "重新加载视频" }).click(); await page.waitForFunction(() => document.querySelector("video")?.currentTime >= 10);
  assert.deepEqual(errors, []); console.log("PASS: desktop/390/320 layout, required admin entries, moderation confirmation, search, error recovery, guest guard, publish from page 2, actual MP4 playback/seek/retry.");
} finally { await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
