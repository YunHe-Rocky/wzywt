import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const out = path.dirname(fileURLToPath(import.meta.url));
const ffmpeg = path.resolve(out, '../../.deps/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe');
const chosen = process.argv.slice(2);
const should = id => !chosen.length || chosen.includes(id);
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true, args: ['--hide-scrollbars'] });
const context = await browser.newContext({ viewport: { width:1920, height:1080 }, locale:'zh-CN', colorScheme:'dark' });
const page = await context.newPage();
page.setDefaultTimeout(45000);

async function open(route){
  await page.goto(`https://ywt.yunhe.ink${route}`, {waitUntil:'domcontentloaded', timeout:90000});
  await page.waitForLoadState('networkidle',{timeout:20000}).catch(()=>{});
  await page.evaluate(async()=>{await document.fonts.ready;});
}
async function imagesReady(selector='img', minimum=0){
  await page.waitForFunction(({selector,minimum})=>{
    const imgs=[...document.querySelectorAll(selector)].filter(i=>{const r=i.getBoundingClientRect();const s=getComputedStyle(i);return r.top<innerHeight && r.bottom>0 && r.width>0 && r.height>0 && s.display!=='none' && s.visibility!=='hidden';});
    return imgs.length>=minimum && imgs.every(i=>i.complete && i.naturalWidth>0 && Number.parseFloat(getComputedStyle(i).opacity)>=.99);
  },{selector,minimum},{timeout:120000});
  await page.waitForTimeout(450);
}
async function smoothScroll(to,duration=1800){
  await page.evaluate(({to,duration})=>new Promise(resolve=>{
    const start=performance.now(),from=scrollY;
    function tick(now){const p=Math.min(1,(now-start)/duration),e=p<.5?2*p*p:1-((-2*p+2)**2)/2;scrollTo(0,from+(to-from)*e);if(p<1)requestAnimationFrame(tick);else resolve();}
    requestAnimationFrame(tick);
  }),{to,duration});
}
async function point(locator){const box=await locator.boundingBox();if(!box)throw Error('No visible target');await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5,{steps:16});}

async function record(name, minSeconds, description, actions){
  const dir=path.join(out,name); await fs.mkdir(path.join(dir,'frames'),{recursive:true});
  await page.screenshot({path:path.join(dir,'first.png')});
  const cdp=await context.newCDPSession(page),samples=[],writes=[],events=[];
  let active=true;
  cdp.on('Page.screencastFrame',event=>{
    void cdp.send('Page.screencastFrameAck',{sessionId:event.sessionId}).catch(()=>{});
    if(!active)return;
    const file=`frames/${String(samples.length).padStart(5,'0')}.jpg`;
    samples.push({file,stamp:event.metadata.timestamp});
    writes.push(fs.writeFile(path.join(dir,file),Buffer.from(event.data,'base64')));
  });
  await cdp.send('Page.startScreencast',{format:'jpeg',quality:92,maxWidth:1920,maxHeight:1080,everyNthFrame:1});
  const start=Date.now();
  const mark=label=>events.push({at:((Date.now()-start)/1000),label});
  await actions(mark);
  const remain=minSeconds*1000-(Date.now()-start);if(remain>0)await page.waitForTimeout(remain);
  const end=Date.now()/1000;active=false;
  await cdp.send('Page.stopScreencast');await Promise.all(writes);await cdp.detach();
  await page.screenshot({path:path.join(dir,'last.png')});
  if(samples.length<20)throw Error(`Insufficient frames in ${name}: ${samples.length}`);
  const concat=[];
  for(let i=0;i<samples.length;i++){
    concat.push(`file '${samples[i].file}'`,'option framerate 1000',`duration ${Math.max(.001,(samples[i+1]?.stamp??end)-samples[i].stamp).toFixed(6)}`);
  }
  concat.push(`file '${samples.at(-1).file}'`,'option framerate 1000');
  await fs.writeFile(path.join(dir,'timeline.ffconcat'),concat.join('\n'));
  const output=path.join(out,`${name}.mp4`);
  const result=spawnSync(ffmpeg,['-y','-hide_banner','-loglevel','error','-f','concat','-safe','0','-i',path.join(dir,'timeline.ffconcat'),'-vf','scale=in_range=full:out_range=tv,format=yuv420p,fps=30','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-color_range','tv','-movflags','+faststart',output],{encoding:'utf8'});
  if(result.status!==0)throw Error(result.stderr);
  const info={name,output,description,url:page.url(),sourceFrameCount:samples.length,sourceSeconds:end-samples[0].stamp,width:1920,height:1080,events};
  await fs.writeFile(path.join(dir,'evidence.json'),JSON.stringify(info,null,2));
  console.log('TAKE_READY '+JSON.stringify(info));
}

try{
  if(should('A')){
    await open('/');await page.locator('.arena-hero').waitFor();await imagesReady('.arena-hero-art',1);await page.waitForTimeout(5000);
    const principlesY=await page.locator('.arena-principles').evaluate(el=>el.getBoundingClientRect().top+scrollY);
    console.log('HOME_READY '+principlesY);
    await record('A-home-and-three-steps',18,'Public home hero, hover on event-hall call to action, smooth reveal of actual three-step friend-match flow.',async mark=>{
      mark('Home hero and slogan');await page.waitForTimeout(2200);
      await point(page.locator('.arena-main-cta'));mark('Hover event-hall CTA');await page.waitForTimeout(1600);
      mark('Scroll to friend-match three-step flow');await smoothScroll(Math.max(120,principlesY-570),2300);await page.waitForTimeout(2300);
      await point(page.locator('.arena-principles > div').nth(1));mark('Three steps visible');await page.waitForTimeout(2500);
      mark('Return to hero');await smoothScroll(0,2200);await page.waitForTimeout(2000);
    });
  }
  if(should('B')){
    await open('/heroes');await page.locator('.hero-catalog-grid button').first().waitFor();await imagesReady('.hero-catalog-grid img',6);
    await page.getByRole('button',{name:'打野',exact:true}).click();await imagesReady('.hero-catalog-grid img',6);
    await page.evaluate(()=>scrollTo(0,200));await imagesReady('.hero-catalog-grid img',6);await page.evaluate(()=>scrollTo(0,0));
    await page.getByRole('button',{name:'全部分路',exact:true}).click();await imagesReady('.hero-catalog-grid img',6);
    console.log('HERO_FILTERS_READY');
    await record('B-hero-role-and-search',18,'Hero catalog: filter by jungle lane, inspect matching portraits, search the real hero Zhao Yun.',async mark=>{
      mark('Fully loaded initial catalog');await page.waitForTimeout(2000);
      await point(page.getByRole('button',{name:'打野',exact:true}));mark('Click jungle role filter');await page.getByRole('button',{name:'打野',exact:true}).click();await page.waitForTimeout(1800);
      mark('Scroll filtered portrait rows');await smoothScroll(200,1600);await page.waitForTimeout(1200);await smoothScroll(0,1300);
      const search=page.getByRole('textbox',{name:'搜索英雄名称'});await point(search);await search.click();mark('Search Zhao Yun');await search.pressSequentially('赵云',{delay:420});await page.waitForTimeout(1800);
      await point(page.getByRole('button',{name:'查看赵云详情',exact:true}));mark('Zhao Yun search result and hover');await page.waitForTimeout(2400);
    });
    await page.getByRole('button',{name:'查看赵云详情',exact:true}).click();
    await page.locator('.hero-detail h1').waitFor();await imagesReady('.hero-detail img',1);await page.waitForTimeout(1200);
    console.log('HERO_DETAIL_READY '+page.url());
    await record('B2-zhaoyun-stats-and-skills',12,'Real Zhao Yun detail opened from search result; hero art, skin thumbnails, base stats and skill descriptions.',async mark=>{
      mark('Loaded Zhao Yun detail and skin thumbnails');await page.waitForTimeout(2200);
      mark('Scroll into base stats and skill descriptions');await smoothScroll(550,2700);await page.waitForTimeout(2800);
      await page.mouse.move(1000,630,{steps:15});await page.waitForTimeout(1400);mark('Skill text hold');
    });
  }
  if(should('C')){
    await open('/equipment');await page.locator('.arena-equipment-grid .card').first().waitFor();await imagesReady('.arena-equipment-grid img',4);
    await page.getByRole('button',{name:'三级',exact:true}).click();await imagesReady('.arena-equipment-grid img',2);
    await page.getByRole('button',{name:'物理',exact:true}).click();await imagesReady('.arena-equipment-grid img',2);
    await page.evaluate(()=>scrollTo(0,260));await imagesReady('.arena-equipment-grid img',2);await page.evaluate(()=>scrollTo(0,0));
    await page.getByRole('button',{name:'物理',exact:true}).click();await page.getByRole('button',{name:'全部',exact:true}).first().click();await imagesReady('.arena-equipment-grid img',4);
    console.log('EQUIPMENT_FILTERS_READY');
    await record('C-equipment-filter-and-passives',18,'Actual equipment catalog tier filter, physical-category filter, search and displayed prices/stats/passive effects. No unsupported composition interaction.',async mark=>{
      mark('Fully loaded equipment catalog');await page.waitForTimeout(1800);
      await point(page.getByRole('button',{name:'三级',exact:true}));mark('Click tier-three filter');await page.getByRole('button',{name:'三级',exact:true}).click();await page.waitForTimeout(1600);
      await point(page.getByRole('button',{name:'物理',exact:true}));mark('Click physical-equipment filter');await page.getByRole('button',{name:'物理',exact:true}).click();await page.waitForTimeout(1700);
      mark('Scroll and inspect equipment passives');await smoothScroll(260,2200);await page.waitForTimeout(1600);await smoothScroll(0,1500);
      const search=page.getByRole('textbox',{name:'搜索装备名称'});await point(search);await search.click();mark('Search 无尽战刃');await search.pressSequentially('无尽战刃',{delay:240});await page.waitForTimeout(2200);
    });
  }
}finally{await browser.close();}
