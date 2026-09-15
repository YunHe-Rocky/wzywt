import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const out = path.dirname(fileURLToPath(import.meta.url));
const frames = path.join(out, 'frames');
await fs.mkdir(frames, { recursive: true });
const browser = await chromium.launch({executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true, args:['--hide-scrollbars']});
try {
  const context = await browser.newContext({viewport: {width:1920,height:1080},locale:'zh-CN', colorScheme:'dark'});
  const page=await context.newPage();
  await page.goto('https://ywt.yunhe.ink/heroes',{waitUntil:'domcontentloaded',timeout:90000});
  async function ready(){
    await page.waitForFunction(() => {
      const imgs=[...document.querySelectorAll('.hero-catalog-grid img')].filter(i => {const r=i.getBoundingClientRect();return r.top<innerHeight && r.bottom>0;});
      return imgs.length>=6 && imgs.every(i=>i.complete && i.naturalWidth>100 && parseFloat(getComputedStyle(i).opacity)>=.99);
    },null,{timeout:120000});
  }
  await ready();
  await page.evaluate(()=>scrollTo(0,360));
  await ready();
  await page.evaluate(()=>scrollTo(0,0));
  await page.waitForTimeout(1500);
  console.log('READY: all images visible across planned scroll loaded');
  await page.screenshot({path:path.join(out,'motion-first-frame.png')});
  const cdp=await context.newCDPSession(page);
  let capturing=true;
  const samples=[];
  const writes=[];
  cdp.on('Page.screencastFrame', ev=>{
    void cdp.send('Page.screencastFrameAck',{sessionId:ev.sessionId}).catch(()=>{});
    if(!capturing)return;
    const name=`frame-${String(samples.length).padStart(5,'0')}.jpg`;
    samples.push({name,stamp:ev.metadata.timestamp});
    writes.push(fs.writeFile(path.join(frames,name),Buffer.from(ev.data,'base64')));
  });
  await cdp.send('Page.startScreencast',{format:'jpeg',quality:93,maxWidth:1920,maxHeight:1080,everyNthFrame:1});
  await page.mouse.move(200,620);
  await page.waitForTimeout(700);
  await page.mouse.move(840,680,{steps:36});
  await page.waitForTimeout(1400);
  await page.evaluate(()=>new Promise(resolve=>{
    const started=performance.now(),from=scrollY,to=360,duration=2300;
    function step(now){const p=Math.min(1,(now-started)/duration);const ease=p<.5?2*p*p:1-((-2*p+2)**2)/2;scrollTo(0,from+(to-from)*ease);if(p<1)requestAnimationFrame(step);else resolve();}
    requestAnimationFrame(step);
  }));
  await page.mouse.move(1150,500,{steps:40});
  await page.waitForTimeout(1700);
  await page.mouse.move(843,650,{steps:40});
  await page.waitForTimeout(1400);
  await page.screenshot({path:path.join(out,'motion-last-frame.png')});
  const endStamp=Date.now()/1000;
  capturing=false;
  await cdp.send('Page.stopScreencast');
  await Promise.all(writes);
  if(samples.length<10)throw Error(`Too few video samples: ${samples.length}`);
  const lines=[];
  for(let i=0;i<samples.length;i++){
    const duration=Math.max(.001,(i+1<samples.length?samples[i+1].stamp:endStamp)-samples[i].stamp);
    lines.push(`file 'frames/${samples[i].name}'`,`duration ${duration.toFixed(6)}`);
  }
  lines.push(`file 'frames/${samples.at(-1).name}'`);
  await fs.writeFile(path.join(out,'timeline.ffconcat'),lines.join('\n'));
  const stats={frames:samples.length,duration:endStamp-samples[0].stamp,width:1920,height:1080,source:'Real Chromium CDP video frames while scrolling and hovering live loaded public heroes page',url:page.url()};
  await fs.writeFile(path.join(out,'capture-evidence.json'),JSON.stringify(stats,null,2));
  console.log(JSON.stringify(stats));
  const ff=path.resolve(out,'../../.deps/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe');
  const result=spawnSync(ff,['-y','-hide_banner','-loglevel','warning','-f','concat','-safe','0','-i',path.join(out,'timeline.ffconcat'),'-vf','fps=30','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',path.join(out,'hero-ui-motion.mp4')],{encoding:'utf8'});
  if(result.status!==0)throw Error(result.stderr);
  console.log('VIDEO_READY '+path.join(out,'hero-ui-motion.mp4'));
}finally{await browser.close();}
