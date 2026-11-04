import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { readFile, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import { once } from "node:events";
import { build } from "esbuild";
import { chromium, webkit, devices } from "playwright";

// Real decoding + upload parser + actual React player over HTTP Range. Storage
// is isolated; database quota/session behavior belongs to integration tests.
process.env.RESOURCE_GOVERNOR_ENABLED = "0";
process.env.DATABASE_URL ||= "mysql://video_fixture:fixture@127.0.0.1:1/video_fixture";
const { LocalMediaStorage } = await import("../../src/lib/storage/local.ts");
const { setMediaStorageForTests } = await import("../../src/lib/storage/index.ts");
const { readCombatPostUpload } = await import("../../src/features/combat-posts/server/upload.ts");
const { normalizeCombatVideo } = await import("../../src/lib/video-normalization.ts");
const { inspectVideoDuration } = await import("../../src/lib/video-duration.ts");
const { parseByteRange } = await import("../../src/features/combat-posts/model.ts");
const ffmpeg = process.env.FFMPEG_BIN || "ffmpeg";
await mkdir(".cache", { recursive: true });
const root = await mkdtemp(path.resolve(".cache/video-compatibility-"));
const storage = new LocalMediaStorage(path.join(root, "media"));
setMediaStorageForTests(storage);
const videos = new Map();
const results = [];
const diagnostics = [];
const diagnosticDirectory = path.resolve(".cache/ci-diagnostics/video-compatibility");
await mkdir(diagnosticDirectory, { recursive: true });
const run = args => {
  const result = spawnSync(ffmpeg, ["-nostdin", "-hide_banner", "-loglevel", "error", ...args], { windowsHide: true, timeout: 60000 });
  assert.equal(result.status, 0, result.error?.message || result.stderr?.toString());
};
let server;
try {
  const samples = [
    { file: "high444.mp4", mime: "video/mp4", encoder: ["-c:v", "libx264", "-pix_fmt", "yuv444p"] },
    { file: "phone.mov", mime: "video/quicktime", encoder: ["-c:v", "libx265", "-pix_fmt", "yuv420p10le", "-x265-params", "pools=1:frame-threads=1:log-level=error"] },
    { file: "capture.webm", mime: "video/webm", encoder: ["-c:v", "libvpx-vp9", "-pix_fmt", "yuv420p"] },
    { file: "recorder.webm", mime: "video/webm", omitDuration: true, encoder: ["-c:v", "libvpx-vp9", "-pix_fmt", "yuv420p"] },
    { file: "five-minutes.mp4", mime: "video/mp4", duration: 300, encoder: ["-c:v", "libx264", "-pix_fmt", "yuv420p"] },
  ];
  for (const [index, sample] of samples.entries()) {
    const filename = path.join(root, sample.file);
    run(["-f", "lavfi", "-i", "testsrc2=size=160x96:rate=10", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100", "-t", String(sample.duration || 2.4), "-threads", "1", ...sample.encoder, "-c:a", sample.mime === "video/webm" ? "libopus" : "aac", "-y", filename]);
    const source = await readFile(filename);
    if(sample.omitDuration){const at=source.indexOf(Buffer.from([0x44,0x89,0x88]));assert.ok(at>0&&at<1024);source[at+1]=0x8a;}
    let attached;
    const upload = async (mime = sample.mime) => {
      const form = new FormData(); form.set("video", new File([source], sample.file, { type: mime }));
      return readCombatPostUpload(new Request("http://localhost/api/combat-posts", { method: "POST", body: form }), "fixture", 1,
        async (_id, _userId, key, size) => { attached = { key, size }; },
        (media, stored, type, policy, _id, _userId, signal) => normalizeCombatVideo(media, stored.key, type, { ...policy, signal })
          .then(async output => { await media.delete(stored.key); return output; }));
    };
    const result = await upload();
    assert.equal(result.video.mimeType, "video/mp4");
    assert.deepEqual(attached, {key:result.video.key,size:result.video.size});
    if(sample.duration)assert.ok(await inspectVideoDuration(storage,result.video.key,result.video.size,"video/mp4")>=299.9,"conversion must retain the complete five-minute movie");
    const body = await readFile(path.join(root,"media",result.video.key));
    assert.ok(body.indexOf("moov") < body.indexOf("mdat"), "metadata must precede movie data for progressive playback");
    const avcC = body.indexOf("avcC"); assert.ok(avcC > 0);
    assert.equal(body[avcC + 5], 77, "H.264 Main profile");
    assert.equal(body[avcC + 7], 31, "H.264 level 3.1");
    run(["-xerror", "-i", path.join(root,"media",result.video.key), "-f", "null", "-"]);
    videos.set(String(index + 1), {body});
    // Native pickers sometimes omit MIME; trust validated content, not a file suffix.
    if (sample.mime === "video/mp4") await upload("application/octet-stream");
    results.push({sample:sample.file,sourceBytes:source.length,playbackBytes:body.length});
  }
  const form = new FormData();
  function box(type, content) {const b=Buffer.alloc(8);b.writeUInt32BE(content.length+8);b.write(type,4);return Buffer.concat([b,content]);}
  const mvhd = Buffer.alloc(100);mvhd.writeUInt32BE(1000,12);mvhd.writeUInt32BE(2000,16);
  const fake = Buffer.concat([box("ftyp",Buffer.from("isom0000")),box("moov",box("mvhd",mvhd)),box("mdat",Buffer.alloc(20))]);
  form.set("video", new File([fake],"unplayable.mp4",{type:"video/mp4"}));
  await assert.rejects(()=>readCombatPostUpload(new Request("http://localhost/api/combat-posts",{method:"POST",body:form}),"fixture",1,async()=>assert.fail("must not attach an undecodable movie")),/解码/);

  const bundle = await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import '@/web/styles/arena.css';import {CombatVideoPlayer} from '@/web/components/content/CombatVideoPlayer';const id=new URLSearchParams(location.search).get('id')||'1';const root=createRoot(document.getElementById('root'));window.setPlayerSource=src=>root.render(<React.StrictMode>{src&&<CombatVideoPlayer src={src}/>}</React.StrictMode>);window.setPlayerSource('/api/combat-posts/'+id+'/video');`,loader:"tsx",resolveDir:process.cwd()},bundle:true,write:false,outdir:root,format:"iife",jsx:"automatic",define:{"process.env.NODE_ENV":'"development"'}});
  const js=bundle.outputFiles.find(f=>f.path.endsWith(".js")).contents;
  const css=bundle.outputFiles.find(f=>f.path.endsWith(".css")).contents;
  server=createServer((req,res)=>{
    const pathname=new URL(req.url,"http://localhost").pathname;
    if(pathname==="/app.js"){res.writeHead(200,{"content-type":"text/javascript"});res.end(js);return;}
    if(pathname==="/app.css"){res.writeHead(200,{"content-type":"text/css"});res.end(css);return;}
    const match=/^\/api\/combat-posts\/(\d+)\/video$/.exec(pathname);
    if(match){
      const id=match[1];
      if(id==="401"||id==="404"){res.writeHead(Number(id),{"content-type":"application/json"});res.end('{"error":"fixture"}');return;}
      if(req.method==="HEAD"){res.writeHead(200,{"content-type":"video/mp4"});res.end();return;}
      if(id==="99"&&req.headers.range!=="bytes=0-1"){res.writeHead(200,{"content-type":"video/mp4","content-length":"200000"});res.flushHeaders();return;}
      const movie=videos.get(id)||videos.get("1"),range=parseByteRange(req.headers.range||null,movie.body.length);
      if(range.kind==="invalid"){res.writeHead(416,{"content-range":`bytes */${movie.body.length}`});res.end();return;}
      const part=range.kind==="partial"?range.range:{start:0,end:movie.body.length-1};
      res.writeHead(range.kind==="partial"?206:200,{"content-type":"video/mp4","accept-ranges":"bytes","content-length":String(part.end-part.start+1),...(range.kind==="partial"?{"content-range":`bytes ${part.start}-${part.end}/${movie.body.length}`}:{})});
      res.end(movie.body.subarray(part.start,part.end+1));return;
    }
    res.writeHead(200,{"content-type":"text/html; charset=utf-8"});res.end('<!doctype html><html lang="zh-CN"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><style>:root{--workspace-media:#16191e;--workspace-media-text:#fff;--radius-sm:8px;--brand-accent:#d8ac53;--border:#666}body{margin:16px;font-family:sans-serif}</style><div id="root"></div><script src="/app.js"></script></html>');
  });
  server.listen(0,"127.0.0.1");await once(server,"listening");
  const base=`http://127.0.0.1:${server.address().port}`;
  for(const [engine,options] of [[chromium,{executablePath:process.env.E2E_BROWSER_PATH||undefined}],[webkit,{}]]){
    const browser=await engine.launch({headless:true,...options});
    try{
      const context=await browser.newContext(engine===webkit?devices["iPhone 13"]:devices["Pixel 7"]);
      await context.addInitScript(() => {
        window.videoDiagnostics = [];
        for (const type of ["pagehide", "pageshow"]) window.addEventListener(type, event => {
          console.debug("video-fixture-lifecycle:" + JSON.stringify({type,persisted:event.persisted,url:location.href}));
        });
        const originalFetch = window.fetch;
        window.fetch = function(input, options) {
          if (options?.method === "HEAD") {
            const diagnostic = { url: String(input), aborted: false };
            window.videoDiagnostics.push(diagnostic);
            options.signal?.addEventListener("abort", () => { diagnostic.aborted = true; }, { once: true });
          }
          return originalFetch.call(this, input, options);
        };
      });
      context.setDefaultTimeout(15000);
      const page=await context.newPage();
      const record=(event,detail)=>diagnostics.push({browser:engine.name(),event,time:Date.now(),...detail});
      page.on("console",message=>{
        if(message.text().startsWith("video-fixture-lifecycle:"))record("lifecycle",JSON.parse(message.text().slice("video-fixture-lifecycle:".length)));
      });
      const errors=[];page.on("pageerror",error=>{errors.push(error.stack || error.message);record("pageerror",{message:error.stack || error.message});});
      page.on("framenavigated",frame=>{if(frame===page.mainFrame())record("navigation",{url:frame.url()});});
      // All traffic here uses synthetic loopback fixtures, with no sessions or
      // business data. Preserve enough evidence to distinguish a refused fetch,
      // an HTTP status and a navigation cancellation in Linux CI.
      page.on("request",request=>{
        if(!new URL(request.url()).pathname.match(/^\/api\/combat-posts\/\d+\/video$/))return;
        record("request",{url:request.url(),method:request.method(),origin:request.headers().origin,referer:request.headers().referer});
      });
      page.on("requestfailed",request=>record("requestfailed",{url:request.url(),method:request.method(),failure:request.failure()?.errorText}));
      page.on("response",response=>{
        if(new URL(response.url()).pathname.match(/^\/api\/combat-posts\/\d+\/video$/))record("response",{url:response.url(),method:response.request().method(),status:response.status()});
      });
      for(const id of videos.keys()){
        console.log(`Checking ${engine.name()} sample ${id}: audible tap and seeking`);
        await page.goto(`${base}/?id=${id}`);
        await page.locator("video").evaluate(v=>{const play=v.play;v.play=function(){window.playActivated=navigator.userActivation.isActive;return play.call(this);};});
        await page.getByRole("button",{name:"点击播放视频"}).click();
        await page.waitForFunction(()=>document.querySelector("video").currentTime>0.1);
        assert.equal(await page.evaluate(()=>window.playActivated),true,"first play must retain the tap gesture, with audio enabled");
        assert.equal(await page.locator("video").evaluate(v=>v.muted),false);
        await page.locator("video").evaluate(v=>{v.currentTime=1;});
        await page.waitForFunction(()=>document.querySelector("video").currentTime>1.1);
      }
      // Retry must retain the element and call play within the click gesture.
      await page.locator("video").evaluate(v=>{window.retryNode=v;const play=v.play;v.play=function(){window.retryActivated=navigator.userActivation.isActive;return play.call(this);};v.pause();v.dispatchEvent(new Event("error"));});
      await page.getByRole("button",{name:"重新加载视频"}).click();
      assert.equal(await page.locator("video").evaluate(v=>v===window.retryNode&&window.retryActivated),true);
      for(const status of [401,404]){await page.goto(`${base}/?id=${status}`);await page.getByRole("alert").filter({hasText:status===401?"登录已失效":"视频文件不存在"}).waitFor();}
      // Mobile metadata preload may suspend indefinitely before the first tap.
      // It must remain a playable idle state, rather than report a false stall.
      await page.goto(`${base}/?id=99`);
      await page.getByRole("button",{name:"点击播放视频"}).waitFor();
      // Use real time: WebKit's native media controls also use page timers.
      await page.waitForTimeout(21000);
      assert.equal(await page.getByRole("status").count(),0);
      assert.equal(await page.getByRole("alert").count(),0);
      await page.getByRole("button",{name:"点击播放视频"}).click();
      await page.getByRole("status").waitFor();
      await page.waitForTimeout(15000);
      await page.locator("video").evaluate(v=>v.dispatchEvent(new Event("waiting")));
      await page.waitForTimeout(6000);
      await page.getByRole("alert").filter({hasText:"视频加载时间较长"}).waitFor();
      await page.locator("video").evaluate(v=>v.dispatchEvent(new Event("stalled")));
      assert.equal(await page.getByRole("status").count(),0,"later stall events must not hide recovery");
      await page.screenshot({path:path.join(root,`${engine.name()}-mobile-stall.png`)});
      // Rejected play promises are visible even when no media error event fires.
      for(const name of ["NotAllowedError","NotSupportedError","AbortError"]){
        await page.goto(`${base}/?id=1`);
        await page.getByRole("button",{name:"点击播放视频"}).waitFor();
        await page.locator("video").evaluate((v,name)=>{v.play=()=>Promise.reject(new DOMException("fixture",name));},name);
        await page.getByRole("button",{name:"点击播放视频"}).click();
        await page.getByRole("alert").waitFor();
        assert.equal(await page.getByRole("status").count(),0);
        await page.getByRole("button",{name:"重新加载视频"}).waitFor();
      }
      // Full navigation can discard the document without unmounting React.
      // Late play rejections and media events must not fetch from that page.
      await page.goto(`${base}/?id=1`);
      await page.getByRole("button",{name:"点击播放视频"}).waitFor();
      const beforeLifecycleTask=await page.evaluate(()=>window.videoDiagnostics.length);
      await page.locator("video").evaluate(v=>{
        v.dispatchEvent(new Event("error"));
        window.dispatchEvent(new PageTransitionEvent("pagehide",{persisted:true}));
      });
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate(()=>window.videoDiagnostics.length),beforeLifecycleTask,"a media error before pagehide must not start diagnostics in the departing task");
      await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent("pageshow",{persisted:true})));
      await page.getByRole("button",{name:"点击播放视频"}).waitFor();
      await page.locator("video").evaluate(v=>{v.play=()=>new Promise((_,reject)=>{window.rejectDepartingPlay=reject;});});
      await page.getByRole("button",{name:"点击播放视频"}).click();
      const beforeDeparture=await page.evaluate(()=>window.videoDiagnostics.length);
      await page.evaluate(()=>{
        window.dispatchEvent(new PageTransitionEvent("pagehide",{persisted:true}));
        window.rejectDepartingPlay(new DOMException("document is leaving","AbortError"));
        document.querySelector("video").dispatchEvent(new Event("error"));
      });
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate(()=>window.videoDiagnostics.length),beforeDeparture,"departing playback must not start diagnostics");
      assert.equal(await page.getByRole("alert").count(),0,"cancelled playback must not become a failure after pagehide");
      // Returning from the back/forward cache must reactivate the same player.
      await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent("pageshow",{persisted:true})));
      await page.getByRole("button",{name:"点击播放视频"}).waitFor();
      await page.locator("video").evaluate(v=>{v.play=()=>Promise.reject(new DOMException("fixture","NotSupportedError"));});
      await page.getByRole("button",{name:"点击播放视频"}).click();
      await page.getByRole("alert").waitFor();
      assert.ok(await page.evaluate(()=>window.videoDiagnostics.length)>beforeDeparture,"restored player must diagnose active failures");
      // Suspend while a real HEAD is pending. Abort the request and invalidate
      // its result; no stale status may overwrite the restored player.
      let releaseProbe;
      const probeGate=new Promise(resolve=>{releaseProbe=resolve;});
      await page.route("**/api/combat-posts/1/video",async route=>{
        if(route.request().method()!=="HEAD")return route.continue();
        await probeGate;
        await route.fulfill({status:404,body:""});
      });
      const pendingProbe=page.waitForRequest(r=>r.method()==="HEAD");
      await page.getByRole("button",{name:"重新加载视频"}).click();
      await pendingProbe;
      await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent("pagehide",{persisted:true})));
      assert.equal(await page.evaluate(()=>window.videoDiagnostics.at(-1).aborted),true,"pagehide must abort a pending diagnostic");
      releaseProbe();
      await page.unrouteAll({behavior:"wait"});
      await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent("pageshow",{persisted:true})));
      await page.getByRole("button",{name:"点击播放视频"}).waitFor();
      await page.waitForTimeout(300);
      assert.equal(await page.getByRole("alert").count(),0,"an obsolete diagnostic must not update the restored player");
      // Source replacement/unmount must also invalidate a pending play promise.
      for(const nextSource of ["/api/combat-posts/2/video",null]){
        await page.goto(`${base}/?id=1`);
        await page.getByRole("button",{name:"点击播放视频"}).waitFor();
        await page.locator("video").evaluate(v=>{v.play=()=>new Promise((_,reject)=>{window.rejectOldPlay=reject;});});
        await page.getByRole("button",{name:"点击播放视频"}).click();
        const beforeReplacement=await page.evaluate(()=>window.videoDiagnostics.length);
        await page.evaluate(src=>window.setPlayerSource(src),nextSource);
        if(nextSource)await page.getByRole("button",{name:"点击播放视频"}).waitFor();
        else await page.locator("video").waitFor({state:"detached"});
        await page.evaluate(()=>window.rejectOldPlay(new DOMException("old source","AbortError")));
        await page.waitForTimeout(300);
        assert.equal(await page.evaluate(()=>window.videoDiagnostics.length),beforeReplacement,"obsolete play promises must not diagnose a replaced/unmounted source");
        assert.equal(await page.getByRole("alert").count(),0);
      }
      // The explicit tap target and recovery actions must fit a narrow phone.
      await page.setViewportSize({width:320,height:700});await page.goto(`${base}/?id=1`);
      const target=page.getByRole("button",{name:"点击播放视频"});await target.waitFor();
      const bounds=await target.boundingBox();assert.ok(bounds.height>=44&&bounds.x>=0&&bounds.x+bounds.width<=320);
      await page.screenshot({path:path.join(root,`${engine.name()}-mobile-idle.png`)});
      await target.click();await page.waitForFunction(()=>document.querySelector("video").currentTime>0.1);
      assert.deepEqual(errors,[],"player must not leave uncaught playback errors");
      await context.close();
      results.push({browser:engine.name(),checks:"all 5 samples: unmuted tap+seek; retry activation; 401/404; idle preload; repeated stall timeout; rejected play promises; pagehide/pageshow; pending HEAD cancellation; source replacement/unmount; 320px layout"});
    }finally{await browser.close();}
  }
  console.log(JSON.stringify(results,null,2));
  console.log("PASS actual phone-format conversion, full decode, progressive MP4, playback/seek/retry and stalled/error responses");
} finally {
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  setMediaStorageForTests(undefined);
  await writeFile(path.join(root,"results.json"),JSON.stringify(results,null,2));
  await writeFile(path.join(diagnosticDirectory,`${path.basename(root)}.json`),JSON.stringify({results,diagnostics},null,2));
  console.log(`Isolated video artifacts: ${root}`);
}
