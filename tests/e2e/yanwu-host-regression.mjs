import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
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
