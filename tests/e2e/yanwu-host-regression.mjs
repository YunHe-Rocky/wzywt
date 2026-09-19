import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { startYanwuHost } from "./yanwu/host.mjs";

const fixtureDir = path.resolve("test-results/yanwu-host-regression/fixture");
await mkdir(fixtureDir, { recursive: true });
await writeFile(path.join(fixtureDir, "entry.tsx"), 'import React from "react"; import {createRoot} from "react-dom/client"; createRoot(document.getElementById("root")!).render(<div className="host-derived-style">host</div>);');
await writeFile(path.join(fixtureDir, "layout.mjs"), 'import "./layout-root.css"; export default function Layout({children}) { return children; }');
await writeFile(path.join(fixtureDir, "layout-root.css"), '@import "./layout-nested.css";\n.host-layout-root { color: rgb(1, 2, 3); }');
await writeFile(path.join(fixtureDir, "layout-nested.css"), '.host-derived-style { background: rgb(4, 5, 6); }');

const host = await startYanwuHost({
  entry: path.join(fixtureDir, "entry.tsx"),
  layout: path.join(fixtureDir, "layout.mjs"),
  apiHandlers: async ({ request, url }) => {
    if (request.method === "GET" && url.pathname === "/api/handled" && url.searchParams.get("state") === "ready") {
      return { body: { ok: true } };
    }
    return null;
  },
});

after(async () => {
  await host.close();
  await rm(fixtureDir, { recursive: true, force: true });
});

test("host derives stylesheet order from the selected root layout and expands nested imports", async () => {
  const css = await fetch(`${host.baseURL}/style.css`).then(response => response.text());
  assert.match(css, /\.host-derived-style\s*\{[^}]*background:\s*rgb\(4, 5, 6\)/);
  assert.match(css, /\.host-layout-root\s*\{[^}]*color:\s*rgb\(1, 2, 3\)/);
  assert.ok(css.indexOf(".host-derived-style") < css.indexOf(".host-layout-root"), "nested @import stays before the importing stylesheet rules");
});

test("host distinguishes handled API traffic from undeclared API violations", async () => {
  const handled = await fetch(`${host.baseURL}/api/handled?state=ready`);
  assert.equal(handled.status, 200);
  assert.deepEqual(await handled.json(), { ok: true });
  const undeclared = await fetch(`${host.baseURL}/api/missing?state=unknown`);
  assert.equal(undeclared.status, 503);
  assert.deepEqual(host.apiRequests, [
    "GET /api/handled?state=ready",
    "GET /api/missing?state=unknown",
  ]);
  assert.deepEqual(host.violations, [{
    type: "undeclared-api",
    method: "GET",
    pathname: "/api/missing",
    search: "?state=unknown",
    record: "GET /api/missing?state=unknown",
  }]);
});

test("explicit SSE stays open after its initial frame and releases on client abort and host close", async () => {
  const streamHost = await startYanwuHost({
    entry: path.join(fixtureDir, "entry.tsx"),
    layout: path.join(fixtureDir, "layout.mjs"),
    apiHandlers: async ({ request, url }) => request.method === "GET" && url.pathname === "/api/events"
      ? { contentType: "text/event-stream", body: 'data: {"type":"connected"}\n\n', keepOpen: true }
      : null,
  });
  let closed = false;
  try {
    const abort = new AbortController();
    const response = await fetch(`${streamHost.baseURL}/api/events`, { signal: abort.signal });
    const reader = response.body.getReader();
    assert.match(new TextDecoder().decode((await reader.read()).value), /connected/);
    let ended = false;
    const next = reader.read().then(value => { ended = value.done; return value; });
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(ended, false, "declared SSE must not end after its initial message");
    abort.abort();
    await assert.rejects(next, { name: "AbortError" });
    const second = await fetch(`${streamHost.baseURL}/api/events`);
    const secondReader = second.body.getReader();
    await secondReader.read();
    const stopped = secondReader.read();
    await streamHost.close(); closed = true;
    await assert.rejects(stopped);
    assert.deepEqual(streamHost.violations, []);
  } finally {
    if (!closed) await streamHost.close();
  }
});

test("real Toast renders without a JSX warning and retains its narrow-screen stylesheet", async () => {
  const toastEntry = path.join(fixtureDir, "toast-entry.tsx");
  await writeFile(toastEntry, `
    import React from "react";
    import {createRoot} from "react-dom/client";
    import {ToastProvider, useToast} from "@/web/components/ui/Toast";
    function Trigger() {
      const {success} = useToast();
      return <button onClick={() => success("真实提示测试")}>显示提示</button>;
    }
    createRoot(document.getElementById("root")!).render(<ToastProvider><Trigger /></ToastProvider>);
  `);
  const toastHost = await startYanwuHost({ entry: toastEntry });
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.E2E_BROWSER_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  });
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 812 } });
    const errors = [];
    page.on("console", message => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", request => request.request().resourceType() === "document"
      ? request.fulfill({ contentType: "text/html", body: toastHost.html })
      : request.continue());
    await page.goto(toastHost.baseURL);
    await page.getByRole("button", { name: "显示提示" }).click();
    await page.getByText("真实提示测试", { exact: true }).waitFor();
    const position = await page.locator(".toast-container").evaluate(element => {
      const style = getComputedStyle(element);
      return { left: style.left, right: style.right, alignItems: style.alignItems };
    });
    assert.deepEqual(position, { left: "12px", right: "12px", alignItems: "stretch" });
    assert.deepEqual(errors, [], "real Toast must not emit unsupported styled-jsx attributes");
    assert.deepEqual(toastHost.violations, []);
  } finally {
    await browser.close();
    await toastHost.close();
  }
});
