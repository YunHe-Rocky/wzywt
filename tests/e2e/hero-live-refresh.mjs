import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=process.env.E2E_BASE_URL||'http://localhost:8001';
const browser=await chromium.launch({headless:true,executablePath:process.env.E2E_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try {
 const page=await browser.newPage({reducedMotion:'reduce'});
 const errors=[]; page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
   window.heroStreams=[];
   window.EventSource=class {
     constructor(url){this.url=url;this.closed=false;window.heroStreams.push(this);}
     close(){this.closed=true;}
   };
 });
 const heroes=[{id:131,heroId:131,name:'李白',title:'青莲剑仙',roleType:'jungle',heroType:4,imageUrl:'/art/arena.webp',skinsJson:'[]',mingge:false}];
 let releaseLease;
 const gate=new Promise(resolve=>{releaseLease=resolve;});
 let refreshes=0;
 let failRefresh=0;
 let leases=0;
 await page.route('**/api/**',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname==='/api/auth/me') return route.fulfill({json:{user:null}});
   if(url.pathname==='/api/resources/leases'&&route.request().method()==='POST') {
     await gate;
     return route.fulfill({json:{lease:{id:`heroes-test-${++leases}`,userId:null},immediate:{'heroes.list':{data:heroes,version:String(leases)}}}});
   }
   if(url.pathname==='/api/resources/data') {
     refreshes++;
     return route.fulfill(failRefresh?{status:failRefresh,json:{error:'暂时无法刷新',code:failRefresh===410?'LEASE_NOT_FOUND':undefined}}:{json:{data:heroes,version:'2'}});
   }
   return route.fulfill({json:{ok:true}});
 });
 await page.goto(base+'/heroes',{waitUntil:'domcontentloaded'});
 await page.getByLabel('搜索英雄名称').waitFor();
 await page.waitForTimeout(200);
 assert.equal(await page.evaluate(()=>window.heroStreams.length),0,'Live subscription waits for the initial lease');
 releaseLease();
 await page.getByRole('button',{name:/查看.*详情/}).first().waitFor();
 await page.waitForFunction(()=>window.heroStreams.length===1);
 await page.getByLabel('搜索英雄名称').fill('李白');
 assert.equal(await page.evaluate(()=>window.heroStreams.length),1,'Typing does not reconnect the live feed');
 const emit=()=>page.evaluate(()=>window.heroStreams.filter(s=>!s.closed).forEach(s=>s.onmessage?.({data:JSON.stringify({type:'heroes-updated'})})));
 await Promise.all([page.waitForResponse(response=>new URL(response.url()).pathname==='/api/resources/data'),emit()]);
 assert.equal(refreshes,1);
 assert.equal(await page.evaluate(()=>window.heroStreams.length),1,'Refreshing data does not reopen the feed');
 failRefresh=503;
 await emit(); await page.getByRole('button',{name:'重新加载',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.heroStreams.filter(s=>!s.closed).length),0,'Failed refresh closes subscription until recovery');
 failRefresh=0;
 await page.getByRole('button',{name:'重新加载',exact:true}).click();
 await page.getByRole('button',{name:'重新加载',exact:true}).waitFor({state:'detached'});
 await page.waitForFunction(()=>window.heroStreams.filter(s=>!s.closed).length===1);
 failRefresh=410;
 await Promise.all([page.waitForResponse(response=>new URL(response.url()).pathname==='/api/resources/leases'&&response.request().method()==='POST'),emit()]);
 await page.getByRole('button',{name:'重新加载',exact:true}).waitFor({state:'detached'});
 await page.waitForFunction(()=>window.heroStreams.filter(s=>!s.closed).length===1);
 assert.equal(leases,2,'Expired lease automatically recovers data and its live subscription');
 assert.deepEqual(errors,[],'Refresh failures are represented in the UI without unhandled promises');
 console.log('Hero live refresh passed: lease ordering, stable subscription, error feedback, retry and automatic expired-lease recovery.');
} finally {await browser.close();}
