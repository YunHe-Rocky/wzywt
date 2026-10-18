import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { YANWU_FAMILIES, encodeRelativeFileUrl, validateYanwuManifest } from "./yanwu/manifest.mjs";

const output = path.resolve("test-results/yanwu-full-site");
const suiteRoots = ["yanwu-public", "yanwu-workspaces", "yanwu-admin"];
const runStartedAt = Date.now();
const browserPath = process.env.E2E_BROWSER_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const galleryOnly = process.argv.includes("--gallery-only");

await mkdir(output, { recursive: true });
if (!galleryOnly) {
  for (const file of ["manifest.json", "verification.json", "index.html"]) {
    await unlink(path.join(output, file)).catch(error => { if (error.code !== "ENOENT") throw error; });
  }
  for (const root of suiteRoots) {
    for (const file of ["manifest.json", "verification.json"]) {
      await unlink(path.resolve("test-results", root, file)).catch(error => { if (error.code !== "ENOENT") throw error; });
    }
  }
}

const suites = [
  { name: "host-regression", args: ["--test", "tests/e2e/yanwu-host-regression.mjs"] },
  { name: "foundation", args: ["tests/e2e/yanwu-foundation.mjs"] },
  { name: "public", args: ["tests/e2e/yanwu-public.mjs"] },
  { name: "workspaces", args: ["tests/e2e/yanwu-workspaces.mjs"] },
  { name: "admin", args: ["tests/e2e/yanwu-admin.mjs"] },
  { name: "history-theme", args: ["tests/e2e/history-theme-ui-regression.mjs"] },
  { name: "workspace-contracts", args: ["tests/e2e/yanwu-workspace-contracts.mjs"] },
];

async function runSuite(suite) {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, suite.args, {
      stdio: "inherit",
      env: { ...process.env, E2E_BROWSER_PATH: browserPath, E2E_BROWSER: "chromium" },
    });
    child.once("error", reject);
    child.once("exit", resolve);
  });
  assert.equal(code, 0, `${suite.name} must exit successfully`);
  return suite.name;
}

if (!galleryOnly) {
  for (let index = 0; index < suites.length; index += 2) {
    await Promise.all(suites.slice(index, index + 2).map(runSuite));
  }
}

const suiteEvidence = await Promise.all(suiteRoots.map(async root => {
  const rootPath = path.resolve("test-results", root);
  const manifestPath = path.join(rootPath, "manifest.json");
  const verificationPath = path.join(rootPath, "verification.json");
  const [manifestInfo, verificationInfo] = await Promise.all([stat(manifestPath), stat(verificationPath)]);
  if (!galleryOnly) {
    assert.ok(manifestInfo.mtimeMs >= runStartedAt - 2000, `${root} manifest is not fresh`);
    assert.ok(verificationInfo.mtimeMs >= runStartedAt - 2000, `${root} verification is not fresh`);
  }
  const [records, verification] = await Promise.all([
    readFile(manifestPath, "utf8").then(JSON.parse),
    readFile(verificationPath, "utf8").then(JSON.parse),
  ]);
  assert.equal(verification.passed, true, `${root} verification must pass`);
  return { root, records, verification };
}));

const records = suiteEvidence.flatMap(suite => suite.records);
const validated = await validateYanwuManifest(records);
const supplemental = records.filter(record => record.state !== "baseline");

for (const [profile, width, height] of [["desktop", 1440, 900], ["mobile", 390, 844]]) {
  for (const phase of ["ink", "title"]) {
    const file = path.resolve("test-results/yanwu-foundation", `intro-${profile}${phase === "title" ? "-title" : ""}.png`);
    const info = await stat(file);
    assert.ok(info.size > 0, `Missing ${profile} intro ${phase} capture`);
    supplemental.push({ family: "intro", route: profile === "desktop" ? "/" : "/m", component: "ArenaIntro", viewport: { width, height }, profile, role: "guest", fixture: "foundation-intro-v1", state: `intro-${phase}`, source: "isolated-component-fixture", file });
  }
}

for (const page of ["gyro", "login-effect", "orb-colors"]) {
  for (const [profile, width, height] of [["desktop", 1440, 900], ["mobile", 390, 844]]) {
    const file = path.resolve("test-results/yanwu-foundation", `debug-${page}-${profile}.png`);
    const info = await stat(file);
    assert.ok(info.size > 0, `Missing ${page} ${profile} debug capture`);
    supplemental.push({ family: "debug", route: `${profile === "mobile" ? "/m" : ""}/debug${page === "gyro" ? "" : `/${page}`}`, component: page === "gyro" ? "GyroTest" : page === "login-effect" ? "LoginEffectDemo" : "OrbColorDemo", viewport: { width, height }, profile, role: "admin", fixture: `debug-${page}-v1`, state: "debug-supplemental", source: "isolated-component-fixture", file });
  }
}

const finalManifest = {
  generatedAt: new Date().toISOString(),
  source: "isolated-component-fixture",
  families: YANWU_FAMILIES,
  baselineCount: validated.baselines.length,
  records,
  supplemental,
};
const verification = {
  passed: true,
  generatedAt: finalManifest.generatedAt,
  browser: "local Microsoft Edge / Chromium",
  checks: [
    "26 explicit route/component families and exactly 52 baseline records",
    "fresh successful public, workspace, and admin child manifests",
    "foundation lifecycle, responsive navigation, debug pages, host 4/4, history UI and retained workspace contracts",
    "all referenced baseline, full-page, intro, and debug image files exist and are non-empty",
  ],
  limitations: [
    "Isolated component fixtures; not real Next server, database, production authorization, or hydration E2E",
    "Actual Next runtime smoke NOT RUN",
    "Microsoft Edge only; no Safari/WebKit or native browser zoom claim",
  ],
  suites: suiteEvidence.map(({ root, verification: suite }) => ({ root, passed: suite.passed, checks: suite.checks, limitations: suite.limitations })),
};

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function imageLink(file, label) {
  const href = encodeRelativeFileUrl(path.relative(output, file));
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
}

function imageSrc(file) {
  return escapeHtml(encodeRelativeFileUrl(path.relative(output, file)));
}

const cards = YANWU_FAMILIES.map(family => {
  const desktop = validated.baselines.find(record => record.family === family.id && record.profile === "desktop");
  const mobile = validated.baselines.find(record => record.family === family.id && record.profile === "mobile");
  return `<article><h2>${family.id} ${escapeHtml(family.label)}</h2><p><code>${escapeHtml(family.route)}</code> · ${escapeHtml(family.component)}</p><div class="shots"><figure>${imageLink(desktop.file, "桌面 1440×900")}<img src="${imageSrc(desktop.file)}" alt="${escapeHtml(family.label)}桌面基线"></figure><figure>${imageLink(mobile.file, "手机 390×844 首屏")}<img src="${imageSrc(mobile.file)}" alt="${escapeHtml(family.label)}手机基线">${mobile.fullPageFile ? `<figcaption>${imageLink(mobile.fullPageFile, "手机长图")}</figcaption>` : ""}</figure></div><small>fixture: ${escapeHtml(desktop.fixture)} · source: isolated-component-fixture</small></article>`;
}).join("\n");

const extras = supplemental.map(record => `<li>${escapeHtml(record.state)} · ${escapeHtml(record.route)} · ${escapeHtml(record.component)} · ${record.viewport.width}×${record.viewport.height} · ${imageLink(record.file, path.basename(record.file))}</li>`).join("\n");
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>王者演武堂全站验收图集</title><style>body{margin:0;background:#f5f2ea;color:#252b28;font:15px/1.6 system-ui,sans-serif}header,main{max-width:1280px;margin:auto;padding:24px}header{border-bottom:1px solid #dcdccf}h1,h2{font-family:serif}a{color:#873027;overflow-wrap:anywhere}li,small{overflow-wrap:anywhere}article{margin:24px 0;padding:20px;background:#fffdf8;border:1px solid #dcdccf;border-radius:12px}.shots{display:grid;grid-template-columns:2fr 1fr;gap:18px}figure{margin:0}img{display:block;width:100%;height:auto;margin-top:8px;border:1px solid #dcdccf;border-radius:8px}code{overflow-wrap:anywhere}@media(max-width:700px){.shots{grid-template-columns:1fr}header,main{padding:16px}}</style></head><body><header><h1>王者演武堂全站验收图集</h1><p>26 个真实组件族，52 张桌面/手机基线。全部来自隔离组件 fixture；不是数据库或真实 Next 服务 E2E。</p><p><a href="preview.html">此前即时预览</a> · <a href="manifest.json">正式清单</a> · <a href="verification.json">验证摘要</a></p></header><main>${cards}<section><h2>补充状态</h2><ul>${extras}</ul></section></main></body></html>`;

if (galleryOnly) {
  await writeFile(path.join(output, "index.html"), html);
} else {
  await Promise.all([
    writeFile(path.join(output, "manifest.json"), `${JSON.stringify(finalManifest, null, 2)}\n`),
    writeFile(path.join(output, "verification.json"), `${JSON.stringify(verification, null, 2)}\n`),
    writeFile(path.join(output, "index.html"), html),
  ]);
}

console.log(`PASS: Yanwu ${galleryOnly ? "gallery render" : "full-site evidence"}; ${validated.families} families, ${validated.baselines.length} baseline records.`);
