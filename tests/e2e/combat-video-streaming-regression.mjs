import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { cp, readFile, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";

// Runs the actual Next middleware and streaming upload parser, with isolated
// storage and a fixture login. No business database, quota or posts are changed.
const root = process.cwd();
const listener = createServer();
listener.listen(8001, "127.0.0.1");
await once(listener, "listening");
await new Promise(resolve => listener.close(resolve));
await mkdir(path.join(root, ".cache"), { recursive: true });
const fixture = await mkdtemp(path.join(root, ".cache", "video-streaming-"));
await mkdir(path.join(fixture, "src/app/api/combat-posts"), { recursive: true });
await mkdir(path.join(fixture, "src/lib"), { recursive: true });
await mkdir(path.join(fixture, "public"), { recursive: true });
await writeFile(path.join(fixture, "package.json"), JSON.stringify({ private: true }));
await writeFile(path.join(fixture, "tsconfig.json"), JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["./src/*"] }, jsx: "preserve" } }));
await writeFile(path.join(fixture, "src/middleware.ts"), await readFile(path.join(root, "src/middleware.ts")));
// Keep the real Node middleware dependencies, including pressure admission.
// This fixture exercises streaming; pressure behavior has its own regressions.
await cp(path.join(root, "src/lib"), path.join(fixture, "src/lib"), { recursive: true });
await cp(path.join(root, "src/core"), path.join(fixture, "src/core"), { recursive: true });
await writeFile(path.join(fixture, "src/app/layout.tsx"), "export default function Layout({children}) { return <html><body>{children}</body></html>; }");
await writeFile(path.join(fixture, "src/app/page.tsx"), "export default function Page() { return <main>Streaming fixture</main>; }");
const route = await build({
  stdin: { contents: `
    import { readCombatPostUpload } from "@/features/combat-posts/server/upload";
    import { getMediaStorage } from "@/lib/storage";
    import { inspectVideoDuration } from "@/lib/video-duration";
    export const runtime = "nodejs";
    export async function POST(request) {
      if (!request.headers.get("cookie")?.includes("wzyt_session=fixture")) return Response.json({error:"Unauthorized"}, {status:401});
      try {
        // This fixture isolates multipart and the Next middleware size boundary;
        // real decoding/conversion is required by video-compatibility-regression.
        const result = await readCombatPostUpload(request, "fixture", 1, async () => {}, async (_storage, stored) => stored);
        const storage = getMediaStorage();
        try { return Response.json({size: result.video.size, duration: await inspectVideoDuration(storage,result.video.key,result.video.size,result.video.mimeType)}); }
        finally { await storage.delete(result.video.key); }
      } catch(error) { return Response.json({error:error.message}, {status:400}); }
    }`, resolveDir: root, loader: "ts" },
  bundle: true, platform: "node", format: "esm", packages: "external", write: false,
  plugins: [{ name: "no-database", setup(builder) {
    builder.onResolve({ filter: /features\/media\/server\/quota$/ }, () => ({ path: "quota", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "export function attachMediaReservation(){throw new Error('Unexpected database access');} export function reserveMediaUpload(){throw new Error('Unexpected database access');}" }));
  } }],
});
await writeFile(path.join(fixture, "src/app/api/combat-posts/handler.js"), route.outputFiles[0].contents);
await writeFile(path.join(fixture, "src/app/api/combat-posts/route.js"), 'export const runtime = "nodejs"; export { POST } from "./handler";');

function box(type, content) { const header = Buffer.alloc(8); header.writeUInt32BE(content.length + 8); header.write(type, 4); return Buffer.concat([header, content]); }
const samples = [];
for (const seconds of [300, 301]) {
  const filename = path.join(fixture, `sample-${seconds}.mp4`);
  let video;
  if (process.env.FFMPEG_BIN) {
    const encoded = spawnSync(process.env.FFMPEG_BIN, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=2", "-t", String(seconds), "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", filename], { windowsHide: true });
    if (encoded.status !== 0) throw new Error(encoded.stderr?.toString() || encoded.error?.message || "FFmpeg failed");
    video = await readFile(filename);
  } else {
    const header = Buffer.alloc(100); header.writeUInt32BE(1000, 12); header.writeUInt32BE(seconds * 1000, 16);
    video = Buffer.concat([box("ftyp", Buffer.from("isom0000isom")), box("moov", box("mvhd", header)), box("mdat", Buffer.alloc(20))]);
  }
  // A legal free-space box makes the request larger than the 10 MiB middleware
  // limit independently of encoder settings; it does not change playback.
  const padded = Buffer.concat([video, box("free", Buffer.alloc(12 * 1024 ** 2))]);
  await writeFile(filename, padded);
  samples.push({ seconds, filename, size: padded.length, body: padded });
}
const client = await build({ stdin: { contents: `import { readLocalVideoDuration, publishCombatPost } from "@/features/combat-posts/client/api"; window.checkVideo=async()=>{const video=document.querySelector('input').files[0]; return {duration:await readLocalVideoDuration(video),result:await publishCombatPost({title:'五分钟测试',content:'真实容器与完整上传',video})};};`, resolveDir: root, loader: "ts" }, bundle: true, format: "iife", write: false });
await writeFile(path.join(fixture, "public/check.js"), client.outputFiles[0].contents);
await writeFile(path.join(fixture, "public/check.html"), '<!doctype html><meta charset="utf-8"><input type="file"><script src="/check.js"></script>');
const env = { ...process.env, RESOURCE_GOVERNOR_ENABLED: "0", NEXT_TELEMETRY_DISABLED: "1", MEDIA_STORAGE_DIR: path.join(fixture, "media"), COMBAT_VIDEO_MAX_DURATION_SECONDS: "300", COMBAT_VIDEO_MAX_SIZE_MB: "512", COMBAT_VIDEO_UPLOAD_TIMEOUT_SECONDS: "900", PUBLIC_ORIGIN: "http://127.0.0.1:8001", DEPLOY_ENVIRONMENT: "local", SESSION_COOKIE_SECURE: "false" };
delete env.DATABASE_URL;
delete env.NODE_ENV;
const child = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "dev", "-p", "8001", "-H", "127.0.0.1"], { cwd: fixture, env, windowsHide: true, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
let logs = "";
child.stdout.on("data", data => { logs += data; }); child.stderr.on("data", data => { logs += data; });
let browser;
try {
  const base = "http://127.0.0.1:8001";
  let ready = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    if (child.exitCode !== null) throw new Error(logs);
    try { if ((await fetch(base, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch { /* Wait for the fixture only. */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, "Next fixture did not start");
  const unauthorized = await fetch(`${base}/api/combat-posts`, { method: "POST", body: "guest" });
  assert.equal(unauthorized.status, 401);
  for (const sample of samples) {
    const form = new FormData(); form.set("video", new File([sample.body], "sample.mp4", { type: "video/mp4" }));
    const response = await fetch(`${base}/api/combat-posts`, { method: "POST", headers: { cookie: "wzyt_session=fixture" }, body: form });
    const data = await response.json();
    if (sample.seconds === 300) { assert.equal(response.status, 200, JSON.stringify(data)); assert.equal(data.size, sample.size); assert.equal(data.duration, 300); }
    else { assert.equal(response.status, 400); assert.match(data.error, /时长/); }
  }
  if (process.env.FFMPEG_BIN) {
    browser = await chromium.launch({ headless: true, executablePath: process.env.E2E_BROWSER_PATH || undefined });
    const context = await browser.newContext();
    await context.addCookies([{ name: "wzyt_session", value: "fixture", url: base }]);
    const page = await context.newPage();
    await page.goto(`${base}/check.html`);
    await page.locator("input").setInputFiles(samples[0].filename);
    const checked = await page.evaluate(() => window.checkVideo());
    assert.equal(checked.duration, 300); assert.equal(checked.result.ok, true); assert.equal(checked.result.data.size, samples[0].size);
    console.log("PASS real 300s MP4: browser metadata + XHR + Next entry + streaming save, >12 MiB; 301s rejected");
  } else console.log("PASS >12 MiB container: complete Next entry + streaming save, 300/301s boundaries (no playback fixture)");
} finally {
  await browser?.close();
  if (child.exitCode === null && child.pid) {
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    else process.kill(-child.pid, "SIGTERM");
    if (child.exitCode === null) await once(child, "exit");
  }
  await writeFile(path.join(fixture, "next.log"), logs);
  console.log(`Isolated artifacts: ${fixture}`);
}
