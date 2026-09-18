import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import { chromium, webkit } from "playwright";

// Real UI/CSS in a database-free component host. Only Next routing and the
// session provider are substituted; this does not test server authorization.
const browserName = process.env.E2E_BROWSER === "webkit" ? "webkit" : "chromium";
const output = path.resolve("test-results/history-theme-ui", browserName);
await mkdir(output, { recursive: true });
const bundled = await build({
  stdin: {
    contents: `import React from "react"; import { createRoot } from "react-dom/client";
      import { AdminShell } from "@/web/components/admin/AdminShell";
      import { HistoryThemeStudio } from "@/web/components/history-theme/HistoryThemeStudio";
      import { ActiveThemeCard } from "@/web/components/history-theme/ActiveThemeCard";
      import { HistoryThemeDetail } from "@/web/components/history-theme/HistoryThemeDetail";
      import { HomePage } from "@/web/components/home/HomePage";
      import { ToastProvider } from "@/web/components/ui/Toast";
      const query = new URLSearchParams(location.search);
      const state = query.get("state");
      const now = Date.now();
      const theme = {slug:"test/preview",title:"历史主题测试卡片",summary:"仅用于隔离测试。",category:"ANCIENT_BATTLE",tone:"CULTURAL",natureLabel:"演武堂历史策划",startsAt:new Date(now - 1000).toISOString(),endsAt:new Date(now + 60000).toISOString()};
      if(state==="expired") theme.endsAt=new Date(now-1).toISOString();
      if(state==="future") theme.startsAt=new Date(now+30000).toISOString();
      if(state==="invalid") theme.endsAt="not-a-date";
      if(state==="expires") theme.endsAt=new Date(now+1500).toISOString();
      if(state==="long") theme.endsAt=new Date(now+40*24*60*60*1000).toISOString();
      if(state==="solemn") theme.tone="SOLEMN";
      const kinds=["LEAD_QUOTE","CLASSICAL_TEXT","MODERN_TRANSLATION","FACT_SUMMARY","TIMELINE","BATTLE_FLOW","MAP","FIGURE_PROFILE","CUSTOMS","SOURCE_NOTE","QUIZ","EDITOR_NOTE"];
      const detail={...theme, category:query.get("category")||"ANCIENT_BATTLE", dateLabel:"年代待核验",dateNote:"约年，存在争议；非历史周年。", reviewedAt:null,reconstructionNote:"界面示意，不是历史影像。",blocks:kinds.map((kind,index)=>({id:String(index),kind,title:"验收内容块 "+kind,body:'<script>globalThis.historyInjected=true</script>\\n\\n![禁止加载的图片](https://unreviewed.invalid/image.png)\\n\\n[危险链接](javascript:alert(1))\\n\\n- 节点一\\n- 节点二'})),sources:[{id:"safe",title:"验收来源",url:"https://example.org/archive",publisher:"示例机构（未核验）",sourceType:"ARCHIVE",accessedAt:"2026-09-19",claimIds:["test-claim"]},{id:"unsafe",title:"不安全来源",url:"javascript:alert(1)",publisher:"未核验",sourceType:"MEDIA_REPORT",accessedAt:"",claimIds:[]}]};
      const card = <main><h1>卡片边界验收</h1><ActiveThemeCard theme={state==="empty" ? null : theme} loading={state==="loading"} error={state==="error"} hrefPrefix={query.has("mobile") ? "/m" : ""}/><button>原首页主要操作</button></main>;
      const isHome = location.pathname === "/" || location.pathname === "/m";
      createRoot(document.getElementById("root")).render(<React.StrictMode>{location.pathname==="/card" ? card : location.pathname==="/detail" ? <HistoryThemeDetail theme={detail} homeHref="/m"/> : isHome ? <ToastProvider><HomePage/></ToastProvider> : <AdminShell username="界面验收管理员"><HistoryThemeStudio/></AdminShell>}</React.StrictMode>);`,
    loader: "tsx", resolveDir: process.cwd(),
  },
  bundle: true, write: false, format: "iife", jsx: "automatic",
  define: { "process.env.NODE_ENV": JSON.stringify("development") },
  plugins: [{ name: "isolated-navigation-session", setup(builder) {
    builder.onResolve({ filter: /^(next\/link|next\/navigation|@\/features\/auth\/client|@\/features\/resource-scheduler\/client)$/ }, args => ({ path: args.path, namespace: "test" }));
    builder.onLoad({ filter: /.*/, namespace: "test" }, args => ({ loader: "jsx", resolveDir: process.cwd(), contents:
      args.path === "next/link" ? `import React from "react"; export default function Link({prefetch,children,...props}){return <a {...props}>{children}</a>;}` :
      args.path === "next/navigation" ? `export const usePathname=()=>location.pathname;` :
      args.path === "@/features/resource-scheduler/client" ? `const loadResource=async(name)=>{(globalThis.__resourceRequests??=[]).push(name);return [];}; export function usePageResources(){return {immediate:{},loading:false,error:null,leaseId:"isolated",loadResource,retry:()=>{}};}` :
      `export function useAuth(){return {user:{userId:1,username:"界面验收管理员",role:"admin"},loaded:true,logout:async()=>{}};}`,
    }));
  } }],
});
let styles = (await readFile("src/app/globals.css", "utf8")).replace(/^@import[^\n]*\n/gm, "");
for (const file of ["arena.css", "arena-motion.css", "arena-glass.css", "admin.css", "history-theme.css"]) styles += await readFile(`src/web/styles/${file}`, "utf8");
const css = (await postcss([tailwindcss]).process(styles, { from: path.resolve("src/app/globals.css") })).css;
const apiRequests = [];
const html = '<!doctype html><html lang="zh-CN" data-theme="yanwu"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script></html>';
const heroArt = await readFile("public/art/arena.webp");
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname.startsWith("/api/")) { apiRequests.push(`${req.method} ${url.pathname}`); res.writeHead(503); return res.end("UI-only boundary violation"); }
  if (url.pathname === "/bundle.js") { res.writeHead(200, { "Content-Type": "text/javascript" }); return res.end(bundled.outputFiles[0].contents); }
  if (url.pathname === "/style.css") { res.writeHead(200, { "Content-Type": "text/css" }); return res.end(css); }
  if (url.pathname === "/art/arena.webp") { res.writeHead(200, { "Content-Type": "image/webp" }); return res.end(heroArt); }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
let page;
const errors = [];
try {
  const engine = browserName === "webkit" ? webkit : chromium;
  browser = await engine.launch({ headless: true, ...(engine === chromium ? { executablePath: process.env.E2E_BROWSER_PATH || undefined } : {}) });
  page = await browser.newPage({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const original = window.setTimeout.bind(window);
    globalThis.__oversizedTimeouts = [];
    window.setTimeout = (handler, delay, ...args) => {
      if (delay > 2_147_483_647 && globalThis.__oversizedTimeouts.length < 10) globalThis.__oversizedTimeouts.push(delay);
      return original(handler, delay, ...args);
    };
  });
  page.setDefaultTimeout(10000);
  page.on("pageerror", error => errors.push(error.message));
  page.on("dialog", dialog => dialog.accept());
  const externalRequests = [];
  await page.route("**/*", route => {
    if (!route.request().url().startsWith(base)) { externalRequests.push(route.request().url()); return route.abort(); }
    // Keep the fixture document exact: host-level HTML filters can inject their
    // own scripts into loopback HTTP. JS/CSS/assets still use the real server;
    // external app requests are still recorded and rejected, with no allowlist.
    if (route.request().isNavigationRequest() && route.request().resourceType() === "document") {
      return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html });
    }
    return route.continue();
  });
  const noOverflow = async label => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), label);

  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const prefix = width < 768 ? "/m" : "";
    await page.goto(`${base}${prefix}/admin/history-themes`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "历史主题工作室", exact: true }).waitFor();
    assert.equal(await page.getByRole("navigation", { name: "后台导航" }).getByRole("link", { name: /历史主题/ }).getAttribute("href"), `${prefix}/admin/history-themes`);
    await page.getByLabel("主题标题", { exact: true }).fill("循着史料，读懂来时的路");
    await page.screenshot({ path: path.join(output, `studio-${width}.png`), fullPage: true });
    await page.getByLabel("主题标题", { exact: true }).fill("长标题验收".repeat(20));
    await noOverflow(`studio overflow at ${width}`);
    await page.getByRole("radio", { name: "主题详情", exact: true }).check();
    await noOverflow(`detail preview overflow at ${width}`);
    await page.screenshot({ path: path.join(output, `detail-${width}.png`), fullPage: true });
    assert.equal(await page.getByLabel("主题标题", { exact: true }).inputValue(), "长标题验收".repeat(20));
  }
  await page.goto(`${base}/m/admin/history-themes`, { waitUntil: "networkidle" });
  assert.equal(await page.getByLabel("史实审核日期", { exact: true }).isEditable(), false, "review date must come from a real review service, not an editable preview field");
  await page.getByLabel("主题标题", { exact: true }).fill("只在当前页面预览");
  const previewCardAction = page.locator("[data-history-theme-card]").getByRole("button");
  await previewCardAction.focus();
  await previewCardAction.press("Enter");
  assert.ok(await page.getByRole("radio", { name: "主题详情", exact: true }).isChecked(), "keyboard activation opens detail preview");
  await page.getByRole("button", { name: "返回编辑", exact: true }).press("Enter");
  assert.ok(await page.getByRole("radio", { name: "首页卡片", exact: true }).isChecked(), "detail back returns without losing edits");
  for (const category of ["TRADITIONAL_FESTIVAL", "ANCIENT_BATTLE", "MODERN_COMMEMORATION", "HISTORICAL_FIGURE"]) {
    console.log(`Checking editor category: ${category}`);
    await page.getByLabel("主题分类", { exact: true }).selectOption(category);
    await page.getByRole("radio", { name: "主题详情", exact: true }).check();
    assert.ok(await page.locator("[data-history-theme-detail]").isVisible());
    await noOverflow(`studio category overflow: ${category}`);
  }
  await page.getByRole("button", { name: "触发规则", exact: true }).click();
  for (const [kind, label] of [["SOLAR_FIXED", "公历月份"], ["LUNAR_FIXED", "闰月策略"], ["SOLAR_TERM", "清明开始偏移（天）"], ["EDITORIAL_WINDOW", "策划开始日期"], ["ONE_OFF", "开始时间"]]) {
    await page.getByLabel("触发类型", { exact: true }).selectOption(kind);
    assert.ok(await page.getByLabel(label, { exact: true }).isVisible(), `${kind} conditional field`);
    await noOverflow(`trigger overflow: ${kind}`);
  }
  await page.getByRole("button", { name: "内容块", exact: true }).click();
  const beforeBlocks = await page.getByLabel("内容块标题", { exact: true }).count();
  await page.getByRole("button", { name: "添加内容块", exact: true }).click();
  const blockCount = beforeBlocks + 1;
  assert.equal(await page.getByLabel("内容块标题", { exact: true }).count(), blockCount);
  await page.getByLabel("内容块标题", { exact: true }).last().fill("新增可排序内容");
  await page.getByLabel("内容块类型", { exact: true }).last().selectOption("QUIZ");
  await page.getByLabel("内容块正文", { exact: true }).last().fill("这是问题与解释，仅做本地预览。");
  if (blockCount > 1) {
    await page.getByRole("button", { name: `上移内容块 ${blockCount}`, exact: true }).click();
    assert.equal(await page.getByLabel("内容块标题", { exact: true }).nth(blockCount - 2).inputValue(), "新增可排序内容");
    await page.getByRole("button", { name: `移除内容块 ${blockCount - 1}`, exact: true }).click();
  } else await page.getByRole("button", { name: "移除内容块 1", exact: true }).click();
  assert.equal(await page.getByLabel("内容块标题", { exact: true }).count(), beforeBlocks);
  await page.getByRole("button", { name: "来源与素材", exact: true }).click();
  await page.getByRole("button", { name: "添加来源", exact: true }).click();
  await page.getByLabel("来源标题", { exact: true }).last().fill("浏览器新增来源");
  await page.getByLabel("来源网址", { exact: true }).last().fill("javascript:alert(1)");
  await page.getByText("仅支持完整的 HTTP(S) 来源网址。", { exact: true }).waitFor();
  assert.equal(await page.locator('a[href^="javascript:"]').count(), 0);
  await page.getByLabel("来源网址", { exact: true }).last().fill("https://example.org/ui-source");
  await page.getByLabel("复原说明", { exact: true }).fill("艺术复原说明，不是真实历史照片。");
  await page.getByRole("button", { name: "排期与审核", exact: true }).click();
  assert.equal(await page.getByText("未计算", { exact: true }).count(), 45, "calendar must expose 45 uncomputed days, not fabricated winners");
  for (const name of ["保存草稿", "提交审核", "审核通过", "发布"]) assert.ok(await page.getByRole("button", { name, exact: true }).isDisabled(), `${name} cannot pretend backend exists`);
  await page.screenshot({ path: path.join(output, "schedule-320.png"), fullPage: true });
  await page.getByRole("button", { name: "基本信息", exact: true }).click();
  assert.equal(await page.getByLabel("主题标题", { exact: true }).inputValue(), "只在当前页面预览", "section/category/preview switching must retain edits");
  assert.ok(await page.evaluate(() => !window.dispatchEvent(new Event("beforeunload", { cancelable: true }))), "unsaved edits must guard leaving the page");
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0, "preview must not persist drafts into browser storage");
  for (const viewport of [{ width: 375, height: 812 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await page.getByRole("radio", { name: "手机", exact: true }).check();
    await noOverflow(`mobile preview ${viewport.width}`);
    await page.evaluate(() => { document.documentElement.style.fontSize = "24px"; });
    await noOverflow(`enlarged text ${viewport.width}`);
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
  }
  await page.setViewportSize({ width: 320, height: 1000 });
  for (const state of ["empty", "error", "expired", "future", "invalid"]) {
    await page.goto(`${base}/card?state=${state}`, { waitUntil: "networkidle" });
    assert.equal(await page.getByText("历史主题测试卡片", { exact: true }).count(), 0, `${state} must hide card`);
    assert.ok(await page.getByRole("button", { name: "原首页主要操作" }).isVisible());
  }
  await page.goto(`${base}/card?state=loading`, { waitUntil: "networkidle" });
  assert.equal(await page.getByRole("status").count(), 1);
  await page.goto(`${base}/card?mobile`, { waitUntil: "networkidle" });
  assert.equal(await page.getByRole("link").getAttribute("href"), "/m/history-themes/test%2Fpreview");
  await page.getByRole("link").focus();
  assert.ok(await page.getByRole("link").evaluate(element => element === document.activeElement));
  await page.goto(`${base}/card?state=expires`);
  await page.getByText("历史主题测试卡片", { exact: true }).waitFor();
  await page.getByText("历史主题测试卡片", { exact: true }).waitFor({ state: "hidden", timeout: 5000 });
  await page.goto(`${base}/card?state=long`, { waitUntil: "networkidle" });
  assert.ok(await page.getByText("历史主题测试卡片", { exact: true }).isVisible());
  assert.deepEqual(await page.evaluate(() => globalThis.__oversizedTimeouts), [], "long card windows must not overflow browser timers into a rapid rerender loop");
  await page.goto(`${base}/card?state=solemn`, { waitUntil: "networkidle" });
  assert.equal(await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === "running").length), 0);
  for (const category of ["TRADITIONAL_FESTIVAL", "ANCIENT_BATTLE", "MODERN_COMMEMORATION", "HISTORICAL_FIGURE"]) {
    await page.goto(`${base}/detail?category=${category}`, { waitUntil: "networkidle" });
    await page.locator("[data-history-theme-detail]").waitFor();
    assert.equal(await page.locator("[data-block-kind]").count(), 12);
    assert.equal(await page.locator("[data-history-theme-detail] img").count(), 0, "Markdown images must not bypass material approval");
    assert.equal(await page.evaluate(() => globalThis.historyInjected), undefined);
    assert.equal(await page.locator('a[href^="javascript:"]').count(), 0);
    const sourceDetails = page.locator("details").filter({ hasText: "验收来源" });
    for (const disclosure of await sourceDetails.all()) {
      if (!(await disclosure.getAttribute("open"))) await disclosure.locator("summary").first().click();
    }
    const source = page.locator("details").filter({ hasText: "验收来源" }).getByRole("link", { name: "打开来源", exact: true });
    assert.ok(await source.isVisible());
    assert.equal(await source.getAttribute("href"), "https://example.org/archive");
    assert.match(await source.getAttribute("rel"), /noopener/);
    assert.match(await source.getAttribute("rel"), /noreferrer/);
    if (category === "MODERN_COMMEMORATION" || category === "HISTORICAL_FIGURE") {
      assert.ok(await page.getByText(/未核验/).count() > 0);
      assert.ok(await page.getByRole("button", { name: "发现问题", exact: true }).isDisabled(), "feedback must not pretend to submit without a service");
    }
    await noOverflow(`category detail overflow: ${category}`);
    await page.screenshot({ path: path.join(output, `${category}-320.png`), fullPage: true });
  }
  for (const prefix of ["", "/m"]) {
    await page.goto(`${base}${prefix || "/"}`, { waitUntil: "networkidle" });
    assert.equal(await page.locator("[data-history-theme-card], [data-history-theme-card-loading]").count(), 0, "empty production slot must not show preview examples or skeleton");
    assert.equal(await page.getByRole("link", { name: "进入赛事大厅" }).getAttribute("href"), `${prefix}/tournaments`);
    assert.ok(await page.evaluate(() => globalThis.__resourceRequests.every(name => name === "home.official-news")), "homepage must not acquire a deferred history resource");
    await noOverflow(`unchanged home overflow: ${prefix}`);
  }
  assert.deepEqual(apiRequests, [], "UI-only studio must not call deferred APIs");
  assert.deepEqual(externalRequests, [], "preview must not load third-party assets");
  assert.deepEqual(errors, [], "UI must have no runtime errors");
  console.log("PASS: history theme UI layouts and card boundary regression.");
} catch (cause) {
  if (page) {
    await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true }).catch(() => {});
    await writeFile(path.join(output, "failure.html"), await page.content()).catch(() => {});
  }
  console.error("Captured page errors:", errors);
  throw cause;
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
