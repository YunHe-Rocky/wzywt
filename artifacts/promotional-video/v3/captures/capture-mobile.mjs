import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const out=path.dirname(fileURLToPath(import.meta.url));
const dir=path.join(out,'D-mobile-home');
await fs.mkdir(path.join(dir,'frames'),{recursive:true});
const ffmpeg=path.resolve(out,'../../.deps/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe');
const browser=await chromium.launch({executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true,args:['--hide-scrollbars']});
try{
  const context=await browser.newContext({viewport:{width:432,height:768},deviceScaleFactor:1.5,isMobile:true,hasTouch:true,locale:'zh-CN',colorScheme:'dark',userAgent:'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'});
  const page=await context.newPage();
  await page.goto('https://ywt.yunhe.ink/m?entry=home',{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForLoadState('networkidle',{timeout:20000}).catch(()=>{});
  await page.waitForFunction(()=>{const i=document.querySelector('.arena-hero-art');return i&&i.complete&&i.naturalWidth>0&&parseFloat(getComputedStyle(i).opacity)>=.99;},null,{timeout:120000});
  await page.waitForTimeout(5000);
  await page.screenshot({path:path.join(dir,'first.png')});
  const cdp=await context.newCDPSession(page),samples=[],writes=[];
  let active=true;
  cdp.on('Page.screencastFrame',e=>{
    void cdp.send('Page.screencastFrameAck',{sessionId:e.sessionId}).catch(()=>{});
    if(!active)return;
    const file=`frames/${String(samples.length).padStart(5,'0')}.jpg`;samples.push({file,stamp:e.metadata.timestamp});
    writes.push(fs.writeFile(path.join(dir,file),Buffer.from(e.data,'base64')));
  });
  await cdp.send('Page.startScreencast',{format:'jpeg',quality:90,maxWidth:1080,maxHeight:1920,everyNthFrame:2});
  const start=Date.now();
  await page.waitForTimeout(2000);
  await page.evaluate(()=>new Promise(resolve=>{
    const start=performance.now(),from=scrollY;
    const target=document.querySelector('.arena-principles').getBoundingClientRect().top+scrollY-210;
    function tick(now){const p=Math.min(1,(now-start)/2700),e=p<.5?2*p*p:1-((-2*p+2)**2)/2;scrollTo(0,from+(target-from)*e);if(p<1)requestAnimationFrame(tick);else resolve();}requestAnimationFrame(tick);
  }));
  await page.waitForTimeout(2300);
  await page.evaluate(()=>new Promise(resolve=>{const start=performance.now(),from=scrollY;function tick(now){const p=Math.min(1,(now-start)/2400),e=p<.5?2*p*p:1-((-2*p+2)**2)/2;scrollTo(0,from*(1-e));if(p<1)requestAnimationFrame(tick);else resolve();}requestAnimationFrame(tick);}));
  await page.waitForTimeout(Math.max(0,12000-(Date.now()-start)));
  const end=Date.now()/1000;active=false;await cdp.send('Page.stopScreencast');await Promise.all(writes);
  await page.screenshot({path:path.join(dir,'last.png')});
  const lines=[];for(let i=0;i<samples.length;i++)lines.push(`file '${samples[i].file}'`,'option framerate 1000',`duration ${Math.max(.001,(samples[i+1]?.stamp??end)-samples[i].stamp).toFixed(6)}`);
  lines.push(`file '${samples.at(-1).file}'`,'option framerate 1000');
  await fs.writeFile(path.join(dir,'timeline.ffconcat'),lines.join('\n'));
  const output=path.join(out,'D-mobile-home.mp4');
  const result=spawnSync(ffmpeg,['-y','-hide_banner','-loglevel','error','-f','concat','-safe','0','-i',path.join(dir,'timeline.ffconcat'),'-vf','scale=1080:1920:in_range=full:out_range=tv,format=yuv420p,fps=30','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-color_range','tv','-movflags','+faststart',output],{encoding:'utf8'});
  if(result.status!==0)throw Error(result.stderr);
  const evidence={output,width:1080,height:1920,sourceFrameCount:samples.length,sourceSeconds:end-samples[0].stamp,url:page.url(),description:'Real mobile public homepage and three-step flow, actual scroll, portrait take. Logical viewport 432x768 at device scale 1.5, scaled to 1080x1920 output.'};
  await fs.writeFile(path.join(dir,'evidence.json'),JSON.stringify(evidence,null,2));console.log('MOBILE_READY '+JSON.stringify(evidence));
}finally{await browser.close();}
