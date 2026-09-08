import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const base = process.env.E2E_BASE_URL || "http://localhost:8001";
const artifacts = process.env.E2E_ARTIFACTS_DIR || ".cache/arena-redesign";
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.E2E_BROWSER_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" });
const desktopUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36";
const mobileUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
const rooms = [
  { id: 101, name: "周末好友局 · 峡谷集结", code: "628319", announcement: "今晚八点准时开战，记得先填写分路偏好。", _count: { players: 7 }, deadline: "2099-09-06T12:00:00.000Z", status: "recruiting", admins: [] },
  { id: 102, name: "以战会友 · 五路争锋", code: "519826", announcement: "不限段位，一起打场尽兴的内战。", _count: { players: 4 }, deadline: "2099-09-06T13:00:00.000Z", status: "recruiting", admins: [] },
  { id: 103, name: "老朋友，新对手", code: "372610", announcement: "势均力敌的较量，才值得全力以赴。", _count: { players: 10 }, deadline: "2099-09-06T14:00:00.000Z", status: "locked", admins: [] },
];
const heroData = ["李白", "曜", "镜", "貂蝉", "孙尚香", "张飞"].map((name, i) => ({ id: 131+i, heroId: 131+i, name, title: ["青莲剑仙", "星辰之子", "破镜之刃", "绝世舞姬", "千金重弩", "禁血狂兽"][i], roleType: i < 3 ? "jungle" : "mid", heroType: i < 3 ? 4 : 2, heroType2: 0, imageUrl: "/art/arena.webp", skinsJson: "[]", mingge: false }));
const heroDetail = {
  ...heroData[0],
  baseJson: { hp: 3200, mp: 450, atk: 170, ap: 0, def: 90, mdef: 50, atkSpeed: 0, moveSpeed: 380, hpPerLv: 210, mpPerLv: 45, atkPerLv: 13, apPerLv: 0, defPerLv: 18, mdefPerLv: 8, atkSpeedPerLv: 2 },
  skills: [{ name: "侠客行", cd: "0", cost: "0", desc: "连续攻击后解除青莲剑歌限制。", skillIndex: 0 }],
};
const equipmentData = ["泣血之刃", "无尽战刃", "破军", "博学者之怒"].map((name,i) => ({ id: 1100+i, name, tags: [i === 3 ? "法术" : "物理"], meta: { tier: 3, price: 2100+i*100, imageUrl: "/art/arena.webp" }, stats: [{ stat: "physicalAttack", value: 100 }], effects: [{ name: "破势", desc: "对低生命值目标造成额外伤害。", unique: true }] }));
const payload = data => ({ data, version: "arena-fixture" });
async function fixtures(context, state = {}) {
  await context.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/auth/me") {
      if (state.authDelay) await new Promise(resolve => setTimeout(resolve, state.authDelay));
      return route.fulfill({ json: { user: state.user || null } });
    }
    if (url.pathname === "/api/heroes/watch") return route.fulfill({ contentType: "text/event-stream", body: ": connected\n\n" });
    if (url.pathname === "/api/heroes/131") return route.fulfill({ json: heroDetail });
    if (url.pathname === "/api/resources/leases") {
      if (route.request().method() !== "POST") return route.fulfill({ json: { ok: true } });
      const page = route.request().postDataJSON().page;
      if (page === "tournaments") state.lobbyLeases = (state.lobbyLeases || 0) + 1;
      const immediate = page === "home" ? {
        "home.public-tournaments": payload(state.empty ? [] : rooms),
        "home.announcements": payload([{ slug: "arena-update", title: "演武堂全新启程", version: "V2.2", date: "2026-09-06", brief: "集结好友，开启下一场精彩对局。", content: "## 新的战场\n\n现在可以查看完整的赛事记录。" }]),
      } : page === "tournaments" ? { "tournaments.lobby": payload({ tournaments: [], publicTournaments: rooms }) } : page === "heroes" ? { "heroes.list": payload(heroData) } : page === "equipment" ? { "equipment.list": payload(equipmentData) } : {};
      return route.fulfill({ json: { lease: { id: `test-${page}`, userId: null }, immediate } });
    }
    if (url.pathname === "/api/resources/data") {
      if (state.failNews) { state.failNews = false; return route.fulfill({ status: 503, json: { error: "测试：资讯暂时无法加载" } }); }
      return route.fulfill({ json: payload([{ title: "英雄调整与峡谷对局情报", date: "09-06", url: "https://pvp.qq.com/" }, { title: "新版本内容一览", date: "09-05", url: "https://pvp.qq.com/" }]) });
    }
    return route.fulfill({ json: {} });
  });
}
async function noOverflow(page, label) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const result = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, bad: [...document.querySelectorAll("main *")].filter(el => { const r=el.getBoundingClientRect(); return r.width && (r.right > innerWidth+1 || r.left < -1) && getComputedStyle(el).position !== "absolute"; }).slice(0,5).map(el => `${el.tagName}.${el.className}`) }));
  assert.ok(result.scroll <= result.width + 1, `${label}: overflow ${JSON.stringify(result)}`);
}
async function capture(page, name) {
  const close = page.getByRole("button",{name:"关闭提示"});
  await close.evaluateAll(buttons => buttons.forEach(button => button.click()));
  await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});
  await page.screenshot({path:`${artifacts}/${name}.png`,fullPage:true});
}
async function ready(page) { await page.locator(".skeleton").first().waitFor({state:"detached",timeout:20000}).catch(() => undefined); }
try {
 const context = await browser.newContext({viewport:{width:1440,height:1000}, reducedMotion:"reduce"});
 const state = {failNews:true};
 await fixtures(context,state);
 await context.addInitScript(() => { Object.defineProperty(navigator, "clipboard", {value:{writeText:async text=>{window.__copied=text;}}}); });
 const page=await context.newPage(); const errors=[]; page.on("pageerror",e=>errors.push(e.message));
 page.setDefaultNavigationTimeout(60_000);
 await page.goto(base); await page.getByRole("heading", {name:rooms[0].name}).waitFor();
 assert.equal(await page.getByRole("navigation",{name:"底部导航"}).isVisible(),false);
 assert.equal(await page.getByRole("navigation",{name:"主导航"}).isVisible(),true);
 await page.getByRole("button",{name:"复制房间号 628319"}).click();
 assert.equal(await page.evaluate(()=>window.__copied),"628319");
 await page.getByRole("button",{name:/演武堂全新启程/}).click();
 await page.getByRole("heading",{name:"新的战场"}).waitFor();
 await page.getByRole("button",{name:"重新加载"}).click();
 await page.getByRole("link",{name:/英雄调整与峡谷对局情报/}).waitFor();
 assert.equal(await page.getByRole("link",{name:/英雄调整与峡谷对局情报/}).getAttribute("target"),"_blank");
 await page.getByRole("button",{name:/演武堂全新启程/}).click();
 await capture(page,"home-desktop");
 for (const [width,height] of [[320,720],[375,812],[390,844],[768,1024],[812,375],[1024,768],[1440,900]]) {
   await page.setViewportSize({width,height}); await noOverflow(page,`home ${width}x${height}`);
   assert.equal(await page.getByRole("navigation",{name:"底部导航"}).isVisible(),width<=900);
 }
 await page.setViewportSize({width:390,height:844});
 await capture(page,"home-mobile");
 await page.setViewportSize({width:320,height:720});
 await page.goto(base+"/heroes/131");
 await page.getByRole("heading",{name:"基础属性",exact:true}).waitFor();
 const statGrid=page.getByRole("heading",{name:"基础属性",exact:true}).locator("xpath=following-sibling::div[1]/div");
 const statLayout=await statGrid.evaluate(node=>({columns:getComputedStyle(node).gridTemplateColumns,scrollWidth:node.scrollWidth,clientWidth:node.clientWidth}));
 assert.equal(statLayout.columns.trim().split(/\s+/).length,1,`Mobile hero stats must use one column: ${statLayout.columns}`);
 assert.ok(statLayout.scrollWidth<=statLayout.clientWidth+1,`Mobile hero stats overflow: ${JSON.stringify(statLayout)}`);
 const overlappingStatRows=await statGrid.locator(".hero-stat-row").evaluateAll(rows=>rows.filter(row=>{const [label,values]=row.children;const a=label.getBoundingClientRect();const b=values.getBoundingClientRect();return a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1;}).length);
 assert.equal(overlappingStatRows,0,"Mobile hero stat labels and values must not overlap at 320px");
 await capture(page,"hero-detail-mobile");
 await page.goto(base);
 await page.getByRole("heading",{name:rooms[0].name}).waitFor();
 await page.locator('.arena-room').nth(1).scrollIntoViewIfNeeded();
 await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
 await page.screenshot({path:`${artifacts}/rooms-mobile-viewport.png`});
 await page.getByRole("button",{name:"打开图鉴菜单"}).click();
 await page.locator("#dock-catalog-menu").waitFor(); await page.keyboard.press("Escape");
 assert.equal(await page.getByRole("button",{name:"打开图鉴菜单"}).evaluate(el=>el===document.activeElement),true);
 for (const [route,title] of [["/tournaments","赛事大厅"],["/heroes","英雄图鉴"],["/equipment","装备图鉴"],["/login","登录"],["/register","注册"]]) {
   state.user = route === "/tournaments" ? { id: 7, username: "演武堂测试", role: "user", avatar: null } : null;
   await page.goto(base+route); await page.getByRole("heading",{name:title,exact:true}).waitFor(); await ready(page);
   for (const [width,height] of [[320,720],[375,812],[812,375],[1440,900]]) { await page.setViewportSize({width,height}); await noOverflow(page,`${route} ${width}x${height}`); }
   await capture(page,`${route.slice(1)}-desktop`);
   await page.setViewportSize({width:390,height:844}); await capture(page,`${route.slice(1)}-mobile`);
   if (route==="/tournaments") { await page.getByRole("button",{name:"截止时间",exact:true}).click(); const dialog=page.getByRole("dialog",{name:"设置报名截止时间"}); await dialog.waitFor(); await page.setViewportSize({width:812,height:375}); const box=await dialog.boundingBox(); assert.ok(box.y>=0 && box.y+box.height<=376, "Calendar fits landscape"); await page.getByRole("button",{name:"关闭日期时间选择器"}).click(); }
   if (route==="/heroes") { await page.getByLabel("搜索英雄名称").fill("李白"); assert.equal(await page.getByRole("button",{name:/查看.*详情/}).count(),1); }
   if (route==="/equipment") { await page.getByLabel("搜索装备名称").fill("破军"); assert.equal(await page.getByText("破军",{exact:true}).count(),1); }
   if (route==="/login") { await page.getByLabel("召唤师名称",{exact:true}).fill("测试召唤师"); await page.getByLabel("密码",{exact:true}).fill("sample-password"); await page.getByRole("button",{name:"显示密码"}).click(); assert.equal(await page.getByLabel("密码",{exact:true}).getAttribute("type"),"text"); }
 }
 state.user = null;
 state.lobbyLeases = 0;
 await page.goto(base+"/tournaments");
 await page.getByRole("link",{name:"登录并进入"}).waitFor();
 assert.equal(state.lobbyLeases,0,"Guest lobby avoids authenticated resource requests");
 state.authDelay = 1200;
 await page.goto(base+"/login",{waitUntil:"domcontentloaded"});
 await page.locator(".auth-scene .skeleton").waitFor();
 await noOverflow(page,"mobile login loading state");
 await page.getByLabel("召唤师名称",{exact:true}).waitFor();
 assert.ok(await page.getByLabel("召唤师名称",{exact:true}).evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=16),"Mobile input avoids iOS focus zoom");
 state.authDelay = 0;
 state.user = { id: 7, username: "ABCDEFGHIJKLMNOPQRSTUVWXYZ123456", role: "user", avatar: null };
 await context.addCookies([{name:"wzyt_session",value:"arena-browser-fixture",url:base}]);
 await page.goto(base+"/me");
 await page.getByRole("heading",{name:state.user.username,exact:true}).waitFor();
 await noOverflow(page,"mobile profile with 32-character username");
 await page.getByRole("button",{name:"打开用户菜单"}).click();
 await page.locator("#header-user-menu").getByRole("link",{name:"演武动态",exact:true}).waitFor();
 await page.keyboard.press("Escape");
 await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});
 await page.screenshot({path:`${artifacts}/profile-mobile.png`,fullPage:true});
 assert.deepEqual(errors,[],"No runtime errors");
 await context.close();
 const mobile=await browser.newContext({viewport:{width:390,height:844},userAgent:mobileUA,isMobile:true,hasTouch:true,reducedMotion:"reduce"});
 await fixtures(mobile,{empty:true}); const phone=await mobile.newPage();
 await phone.goto(`${base}/?from=friend`); assert.equal(new URL(phone.url()).pathname,"/m"); assert.equal(new URL(phone.url()).search,"?from=friend");
 await phone.getByRole("link",{name:"创建房间",exact:true}).waitFor();
 await phone.getByRole("button",{name:"打开图鉴菜单"}).click(); await phone.locator("#dock-catalog-menu").getByRole("link",{name:"英雄",exact:true}).click();
 await phone.waitForURL("**/m/heroes"); await noOverflow(phone,"mobile redirected heroes");
 await mobile.close();
 const switching=await browser.newContext({viewport:{width:390,height:844},reducedMotion:"reduce"});
 await fixtures(switching,{empty:true}); const switchedPage=await switching.newPage();
 const cdp=await switching.newCDPSession(switchedPage);
 await cdp.send("Network.setUserAgentOverride",{userAgent:desktopUA});
 await switchedPage.goto(`${base}/m?mode=desktop`); assert.equal(new URL(switchedPage.url()).pathname,"/");
 await switchedPage.getByRole("link",{name:"创建房间",exact:true}).waitFor();
 await cdp.send("Network.setUserAgentOverride",{userAgent:mobileUA});
 await switchedPage.goto(`${base}/m?mode=desktop`); assert.equal(new URL(switchedPage.url()).pathname,"/m");
 await switchedPage.getByRole("link",{name:"创建房间",exact:true}).waitFor();
 await switchedPage.goto(`${base}/?mode=mobile`); assert.equal(new URL(switchedPage.url()).pathname,"/m");
 await cdp.send("Network.setUserAgentOverride",{userAgent:desktopUA});
 await switchedPage.goto(`${base}/?mode=mobile`); assert.equal(new URL(switchedPage.url()).pathname,"/");
 await switchedPage.getByRole("link",{name:"创建房间",exact:true}).waitFor();
 await switching.close();
 console.log("Arena UI regression passed: 7 viewports, 5 feature screens, mobile redirect, same-context desktop/mobile switching, navigation, clipboard, announcements, news retry, filters, password visibility, landscape calendar, guest lobby, loading state, long profile name and mobile account navigation.");
} finally { await browser.close(); }
