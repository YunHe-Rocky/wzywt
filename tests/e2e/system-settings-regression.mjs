import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
import { compileStyles } from "./yanwu/host.mjs";

const output=path.resolve(".cache/test-artifacts/system-settings");await mkdir(output,{recursive:true});
const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {SystemSettings} from '@/web/components/admin/SystemSettings';import {AdminShell} from '@/web/components/admin/AdminShell';createRoot(document.getElementById('root')).render(<React.StrictMode><AdminShell userId={1} username="测试管理员"><SystemSettings/></AdminShell></React.StrictMode>);`,loader:"tsx",resolveDir:process.cwd()},bundle:true,write:false,outdir:output,jsx:"automatic",format:"iife",define:{"process.env.NODE_ENV":'"development"'},plugins:[{name:"fixture-navigation",setup(builder){
  builder.onResolve({filter:/^(next\/link|next\/navigation|@\/features\/auth\/client)$/},args=>({path:args.path,namespace:"fixture"}));
  builder.onLoad({filter:/.*/,namespace:"fixture"},args=>({loader:"jsx",resolveDir:process.cwd(),contents:args.path==="next/link"?`import React from 'react';export default function Link({prefetch,children,...props}){return <a {...props}>{children}</a>;}`:args.path==="next/navigation"?`export const usePathname=()=>location.pathname;`:`export function useAuth(){return {logout:async()=>{}};}`}));
}}]});
const css=await compileStyles(path.resolve("src/app/layout.tsx"),bundle.outputFiles.filter(file=>file.path.endsWith(".css")).map(file=>file.text).join("\n"));
const defaults={hero_list_page:"https://pvp.qq.com/web201605/herolist.shtml",hero_list_json:"https://pvp.qq.com/web201605/js/herolist.json",hero_detail_base:"https://pvp.qq.com/web201605/herodetail",hero_img_base:"https://game.gtimg.cn/images/yxzj/img201606/heroimg/{id}/{id}.jpg",skin_img_base:"https://game.gtimg.cn/images/yxzj/img201606/skin/hero-info/{id}/{id}-bigskin-{idx}.jpg"};
let saved,progress,loadFailure,saveFailure,syncFailure,jobNumber=0;const calls=[],syncConfigs=[],results=[];
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,"http://localhost");
  const json=(data,status=200)=>{res.writeHead(status,{"content-type":"application/json"});res.end(JSON.stringify(data));};
  if(url.pathname==="/app.js"){res.writeHead(200,{"content-type":"text/javascript"});res.end(bundle.outputFiles.find(file=>file.path.endsWith(".js")).contents);return;}
  if(url.pathname==="/style.css"){res.writeHead(200,{"content-type":"text/css"});res.end(css);return;}
  if(url.pathname==="/api/admin/settings"){
    if(req.method==="PUT"){
      const chunks=[];for await(const chunk of req)chunks.push(chunk);calls.push("save");
      if(saveFailure)return json({error:"测试：配置保存失败"},503);
      saved=JSON.parse(Buffer.concat(chunks));return json({ok:true,settings:saved});
    }
    return loadFailure?json({error:"测试：无法加载配置"},503):json({settings:saved});
  }
  if(url.pathname==="/api/admin/sync-status")return json({progress});
  if(url.pathname==="/api/heroes"&&req.method==="POST"){
    calls.push("sync");if(syncFailure)return json({error:"测试：同步启动失败"},503);
    syncConfigs.push(structuredClone(saved));const jobId=`job-${++jobNumber}`;
    progress={jobId,phase:"queued",current:0,total:0,message:"同步任务已进入队列",updatedAt:new Date().toISOString()};
    return json({ok:true,jobId,message:progress.message},202);
  }
  res.writeHead(200,{"content-type":"text/html; charset=utf-8"});res.end('<!doctype html><html lang="zh-CN"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/app.js"></script></html>');
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const browser=await chromium.launch({headless:true,executablePath:process.env.E2E_BROWSER_PATH||undefined});
try{
  for(const width of [1280,390,320]){
    saved={...defaults};progress=null;loadFailure=false;saveFailure=false;syncFailure=false;calls.length=0;syncConfigs.length=0;
    const prefix=width<600?"/m":"",base=`http://127.0.0.1:${server.address().port}`,url=`${base}${prefix}/admin/settings`;
    const page=await browser.newPage({viewport:{width,height:1000}});page.setDefaultTimeout(12000);const errors=[];page.on("pageerror",error=>errors.push(error.message));
    const finish=async()=>{progress={...progress,phase:"done",current:1,total:1,message:"同步完成：1 新增，2 更新，3 张图片刷新"};await page.getByText(progress.message,{exact:true}).waitFor();};
    await page.goto(url);await page.getByRole("button",{name:"同步英雄资料",exact:true}).waitFor();
    assert.equal(await page.locator("details").getAttribute("open"),null);
    await page.getByRole("button",{name:"重新读取进度",exact:true}).click();
    await page.waitForFunction(()=>[...document.querySelectorAll("button")].some(button=>button.textContent==="重新读取进度"&&!button.disabled));
    await page.screenshot({path:path.join(output,`settings-${width}.png`),fullPage:true});
    await page.getByRole("button",{name:"同步英雄资料",exact:true}).click();await page.getByText("已排队",{exact:true}).waitFor();
    assert.deepEqual(calls,["sync"],"default use requires no configuration write");
    progress={...progress,phase:"running",current:1,total:2,message:"正在读取英雄资料"};await page.getByText("正在读取英雄资料",{exact:true}).waitFor();
    await finish();assert.equal(await page.getByRole("link",{name:"查看更新后的英雄资料"}).getAttribute("href"),`${prefix}/heroes`);
    await page.locator("summary").click();const avatar=page.getByLabel("英雄头像地址",{exact:true});
    const custom="https://game.gtimg.cn/custom/{id}/{id}.jpg";await avatar.fill(custom);
    const before=calls.length;await page.getByRole("button",{name:"保存并同步英雄",exact:true}).click();await page.getByText("已排队",{exact:true}).waitFor();
    assert.deepEqual(calls.slice(before),["save","sync"]);assert.equal(syncConfigs.at(-1).hero_img_base,custom);
    await finish();await page.reload();await page.getByRole("button",{name:"同步英雄资料",exact:true}).waitFor();
    assert.equal(await avatar.inputValue(),custom,"saved configuration survives re-entry");await page.locator("summary").click();
    await avatar.fill("https://evil.invalid/{id}.jpg");const invalidBefore=calls.length;
    await page.getByRole("button",{name:"保存配置",exact:true}).click();await page.getByRole("alert").filter({hasText:"官方域名"}).waitFor();
    assert.equal(calls.length,invalidBefore);assert.equal(await avatar.getAttribute("aria-invalid"),"true");
    await page.locator(".settings-source-field").filter({has:avatar}).getByRole("button",{name:"使用此项默认值"}).click();
    saveFailure=true;const failedBefore=calls.length;await page.getByRole("button",{name:"保存并同步英雄",exact:true}).click();
    await page.getByRole("alert").filter({hasText:"配置保存失败"}).waitFor();assert.deepEqual(calls.slice(failedBefore),["save"],"failed save must not enqueue a sync");
    saveFailure=false;await page.getByRole("button",{name:"保存配置",exact:true}).click();await page.getByText("配置已保存。下次同步会使用这些地址，现有英雄资料不会立即改变。",{exact:true}).waitFor();
    syncFailure=true;await page.getByRole("button",{name:"同步英雄资料",exact:true}).click();await page.getByRole("alert").filter({hasText:"同步启动失败"}).waitFor();
    syncFailure=false;await page.getByRole("button",{name:"同步英雄资料",exact:true}).click();await page.getByText("已排队",{exact:true}).waitFor();
    await page.reload();await page.getByText("已排队",{exact:true}).waitFor();assert.equal(await page.getByRole("button",{name:"同步任务进行中…"}).isDisabled(),true);
    await finish();await page.locator("summary").click();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}px must not overflow`);
    await page.screenshot({path:path.join(output,`settings-advanced-${width}.png`),fullPage:true});
    loadFailure=true;await page.reload();await page.getByRole("alert").filter({hasText:"无法加载配置"}).waitFor();
    assert.equal(await page.getByRole("button",{name:"保存配置",exact:true}).count(),0);
    loadFailure=false;await page.getByRole("button",{name:"重新加载配置"}).click();await page.getByRole("button",{name:"同步英雄资料",exact:true}).waitFor();
    assert.deepEqual(errors,[]);results.push({width,checks:"defaults; save then sync; persistence; invalid source; save/queue failure; progress after reload; recovery; no overflow"});await page.close();
  }
  console.log(JSON.stringify(results,null,2));console.log("PASS system settings: desktop/mobile configuration, persistence, queue and recovery");
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await writeFile(path.join(output,"results.json"),JSON.stringify(results,null,2));}
