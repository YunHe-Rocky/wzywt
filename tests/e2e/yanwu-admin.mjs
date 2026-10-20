import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startYanwuHost } from './yanwu/host.mjs';
import { makeAdminFixture } from './yanwu/admin-fixtures.ts';
import { makeMonitorFixture } from './yanwu/workspace-fixtures.ts';
import { inspectContrast } from './yanwu/workspace-audit.mjs';
const output = path.resolve('test-results/yanwu-admin');
await mkdir(output, { recursive: true });
for (const name of ['manifest.json', 'verification.json']) await rm(path.join(output, name), { force: true });
let fixture = { ...makeAdminFixture(), monitor: makeMonitorFixture() }, scenario = 'default';
const mutations = [], errors = [], external = [], manifest = [], contrast = [];
const host = await startYanwuHost({
  entry: 'tests/e2e/yanwu/admin-entry.tsx',
  aliases: {
    '@/features/auth/client': 'src/features/auth/client/index.ts',
    '@/features/auth/client/api': 'src/features/auth/client/api.ts',
    '@/features/resource-scheduler/client': 'tests/e2e/yanwu/admin-resources.tsx',
  },
  apiHandlers: async ({ request, url }) => {
    const p = url.pathname, m = request.method, fail = scenario === 'error', empty = scenario === 'empty';
    if (scenario === 'loading' && m === 'GET' && p !== '/api/auth/me') await new Promise(resolve => setTimeout(resolve, 1200));
    if (m === 'GET' && p === '/api/auth/me') return { body: { user: fixture.user } };
    if (m === 'GET' && p === '/api/admin/stats') return { status: fail ? 503 : 200, body: fail ? { error: '测试：概览读取失败' } : { userCount: 28, tournamentCount: 12, activeTournamentCount: 3, heroCount: 124, postCount: 18, hiddenPostCount: 2, videoBytes: 183500800, recentPosts: empty ? [] : fixture.posts } };
    if (m === 'GET' && p === '/api/admin/users') return { status: fail ? 503 : 200, body: { users: empty ? [] : fixture.users, total: empty ? 0 : 24 } };
    if (m === 'GET' && p === '/api/admin/tournaments') return { status: fail ? 503 : 200, body: { tournaments: empty ? [] : fixture.rooms, total: empty ? 0 : 24 } };
    if (m === 'GET' && p === '/api/admin/combat-posts') return { status: fail ? 503 : 200, body: fail ? { error: '测试：动态读取失败' } : { posts: empty ? [] : fixture.posts.filter(post => !url.searchParams.get('status') || post.status === url.searchParams.get('status')), page: Number(url.searchParams.get('page') || 1), total: empty ? 0 : 21, totalPages: empty ? 1 : 2 } };
    if (m === 'GET' && p === '/api/admin/announcements') return { status: fail ? 503 : 200, body: { announcements: empty ? [] : fixture.announcements, ...(fail ? { error: '测试：公告读取失败' } : {}) } };
    if (m === 'GET' && p === '/api/heroes') return { status: fail ? 503 : 200, body: empty ? [] : fixture.heroes };
    if (m === 'GET' && p === '/api/admin/settings') return { status: fail ? 503 : 200, body: fail ? { error: '测试：配置读取失败' } : { settings: fixture.settings } };
    if (m === 'GET' && p === '/api/admin/sync-status') return { body: { progress: fixture.syncProgress || { phase: scenario === 'sync-error' ? 'error' : 'done', current: 124, total: 124, message: scenario === 'sync-error' ? '测试：同步失败' : '测试：同步完成' } } };
    if (m === 'GET' && p === '/api/admin/resources') return { status: fail ? 503 : 200, body: fail ? { error: '测试：资源读取失败' } : { resources: empty ? [] : fixture.monitor.resources } };
    if (m === 'GET' && p === '/api/heroes/watch') return scenario === 'connection-error' ? { status: 204, body: '' } : { contentType: 'text/event-stream', keepOpen: true, body: fixture.monitor.events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') };
    const known = m === 'POST' && ['/api/auth/logout', '/api/admin/announcements', '/api/heroes', '/api/heroes/watch'].includes(p)
      || m === 'PUT' && ['/api/admin/settings', '/api/announcements/1', '/api/announcements/2'].includes(p)
      || m === 'PATCH' && ['/api/admin/users/7', '/api/combat-posts/1', '/api/heroes/105', '/api/heroes/106'].includes(p)
      || m === 'DELETE' && ['/api/admin/users/7', '/api/tournaments/101', '/api/tournaments/102', '/api/announcements/1', '/api/announcements/2'].includes(p);
    if (!known) return null;
    let raw = ''; for await (const chunk of request) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    mutations.push({ p, m, body });
    if (scenario === 'save-error' || scenario === 'logout-error') return { status: 503, body: { error: '测试：操作失败' } };
    if (scenario === 'saving') await new Promise(resolve => setTimeout(resolve, 650));
    if (p === '/api/auth/logout') fixture.user = null;
    if (p === '/api/admin/settings') { fixture.settings = body; return { body: { ok: true, settings: fixture.settings } }; }
    if (p === '/api/heroes' && m === 'POST') { fixture.syncProgress = { jobId: 'fixture-sync-job', phase: 'done', current: 124, total: 124, message: '测试：同步完成' }; return { status: 202, body: { ok: true, jobId: 'fixture-sync-job' } }; }
    if (p === '/api/admin/users/7') fixture.users = m === 'DELETE' ? fixture.users.filter(user => user.id !== 7) : fixture.users.map(user => user.id === 7 ? { ...user, ...body } : user);
    if (p.startsWith('/api/tournaments/') && m === 'DELETE') fixture.rooms = fixture.rooms.filter(room => room.id !== Number(p.split('/').at(-1)));
    if (p === '/api/combat-posts/1') fixture.posts = body.action === 'DELETE' ? [] : fixture.posts.map(post => ({ ...post, status: body.action === 'HIDE' ? 'hidden' : 'published' }));
    if (p.startsWith('/api/announcements/')) fixture.announcements = m === 'DELETE' ? fixture.announcements.filter(a => a.id !== Number(p.split('/').at(-1))) : fixture.announcements.map(a => a.id === Number(p.split('/').at(-1)) ? { ...a, ...body } : a);
    return { body: { ok: true } };
  },
});
const browser = await chromium.launch({ headless: true, executablePath: process.env.E2E_BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
const pairs = [
  ['18','/admin','AdminDashboard'], ['19','/admin/users','AdminUsersPage'],
  ['20','/admin/tournaments','AdminTournamentsPage'], ['21','/admin/combat','CombatPostManager'],
  ['22','/admin/announcements','AnnouncementManager'], ['23','/admin/history-themes','HistoryThemeStudio'],
  ['24','/admin/heroes','AdminHeroesPage'], ['25','/admin/monitor','MonitorDashboard'], ['26','/admin/settings','AdminSettingsPage'],
];
async function bounds(page, label) {
  const data = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
    overflow:[...document.querySelectorAll('#admin-content *')].filter(e=>e.checkVisibility()&&(!e.closest('.admin-table-wrap,.data-table-wrap,.monitor-log-scroll')||getComputedStyle(e).position==='absolute')&&e.getBoundingClientRect().right>innerWidth+1).map(e=>[e.tagName,e.className,e.getBoundingClientRect().right]),
    controls: [...document.querySelectorAll('.admin-workspace button,.admin-workspace input:not([type=radio]),.admin-workspace select')].filter(e => e.checkVisibility()).map(e => {
      const r=e.getBoundingClientRect(); return { name:e.textContent?.trim().slice(0,30)||e.getAttribute('aria-label'), height:r.height, font:parseFloat(getComputedStyle(e).fontSize), input:e.tagName==='INPUT'||e.tagName==='SELECT' };
    }) }));
  assert.ok(data.scroll<=data.width, `${label}: page overflow ${JSON.stringify(data)}`);
  for(const c of data.controls) { assert.ok(c.height>=44,`${label}: target ${JSON.stringify(c)}`); if(c.input) assert.ok(c.font>=16,`${label}: input text ${JSON.stringify(c)}`); }
}
async function capture(page, family, route, component, profile, state='baseline') {
  await bounds(page,`${family}-${profile}-${state}`);
  await page.evaluate(()=>window.scrollTo(0,0));
  const file=path.join(output,`${family}-${state==='baseline'?profile:state}.png`);
  await page.screenshot({path:file,fullPage:profile==='desktop'||state!=='baseline'});
  let fullPageFile;
  if(profile==='mobile'&&state==='baseline') {fullPageFile=path.join(output,`${family}-mobile-full.png`);await page.screenshot({path:fullPageFile,fullPage:true});}
  manifest.push({family,route,component,viewport:page.viewportSize(),profile,role:'admin',fixture:`admin-${family}-${state}-v1`,state,source:'isolated-component-fixture',file,...(fullPageFile?{fullPageFile}:{})});
}
async function open(route, width = 390, height = 844, state = 'default') {
  scenario = state; fixture = { ...makeAdminFixture(state), monitor: makeMonitorFixture() };
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', dialog => dialog.accept());
  await page.route('**/*', request => {
    const url = new URL(request.request().url());
    if (url.origin !== host.baseURL) { external.push(url.href); return request.abort(); }
    if (request.request().resourceType() === 'document') return request.fulfill({ contentType: 'text/html', body: host.html });
    return request.continue();
  });
  await page.goto(`${host.baseURL}${route}?case=${state}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.admin-workspace').waitFor();
  if (state !== 'loading') await page.waitForTimeout(180);
  return { page, context };
}
try {
  if (process.env.YANWU_RED === 'errors') {
    const failures = [];
    let opened = await open('/m/admin', 320, 812, 'logout-error');
    await opened.page.getByRole('button', { name: '退出登录', exact: true }).click();
    await opened.page.waitForTimeout(200);
    if (!await opened.page.getByRole('alert').filter({ hasText: '退出失败' }).isVisible()) failures.push('HTTP503 logout must retain admin identity and show retry error');
    await opened.context.close();
    opened = await open('/m/admin/settings', 320, 812, 'error');
    if (!await opened.page.getByRole('alert').isVisible()) failures.push('settings load failure must show an error instead of an empty editable form');
    await opened.context.close();
    assert.deepEqual(failures, []);
  }
  let { page, context } = await open('/m/admin', 320, 812, 'long');
  // RED: the existing mobile rail leaves all nine destinations visible and tabbable.
  assert.equal(await page.getByRole('navigation', { name: '后台导航' }).isVisible(), false, 'mobile admin navigation must start collapsed');
  const trigger = page.getByRole('button', { name: '管理菜单', exact: true });
  await trigger.click();
  assert.equal(await page.getByRole('navigation', { name: '后台导航' }).getByRole('link').count(), 9);
  await page.keyboard.press('Escape');
  assert.ok(await trigger.evaluate(el => el === document.activeElement));
  await trigger.focus(); await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>Boolean(document.activeElement?.closest('#admin-navigation'))),false,'collapsed links cannot receive Tab');
  await trigger.click();
  await page.getByRole('navigation',{name:'后台导航'}).getByRole('link',{name:/用户管理/}).click();
  await page.getByRole('heading',{name:'用户管理',exact:true}).waitFor();
  const dangerColor=await page.getByRole('button',{name:'删除',exact:true}).evaluate(e=>getComputedStyle(e).color);
  assert.equal(dangerColor,'rgb(143, 29, 20)','danger controls retain semantic red foreground');
  assert.equal(await trigger.getAttribute('aria-expanded'),'false','navigation closes menu');
  await trigger.click(); await page.goBack();
  assert.equal(await trigger.getAttribute('aria-expanded'),'false','browser Back closes menu');
  await bounds(page,'long admin name at 320');
  await trigger.click(); await capture(page,'18','/m/admin','AdminShell','mobile','menu-open');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'全部管理',exact:true}).click();
  assert.equal(await trigger.getAttribute('aria-expanded'),'true','bottom shortcut opens the complete administration menu');
  assert.ok(await page.evaluate(()=>Boolean(document.activeElement?.closest('#admin-navigation'))),'bottom menu shortcut moves focus to visible navigation');
  await page.keyboard.press('Escape');
  assert.ok(await page.getByRole('button',{name:'全部管理',exact:true}).evaluate(element=>element===document.activeElement),'Escape returns to the bottom trigger');
  await context.close();
  for (const [family,route,component] of pairs.filter(row=>!process.env.YANWU_FAMILY||row[0]===process.env.YANWU_FAMILY)) {
    for (const [profile,width,height] of [['desktop',1440,900],['mobile',390,844]]) {
      const logical=profile==='mobile'?`/m${route}`:route;
      ({page,context}=await open(logical,width,height));
      await page.locator('#admin-content h1').waitFor();
      assert.equal(await page.locator('.header-primary-nav,.dock').count(),0,'admin has no public navigation');
      if(family==='25') await page.getByText('实时连接正常',{exact:true}).waitFor();
      if(family==='26') await page.getByRole('button',{name:'同步英雄资料',exact:true}).waitFor();
      if(profile==='mobile' && ['19','20','22','24'].includes(family)) assert.equal(await page.locator('.admin-card-table tbody tr').first().evaluate(element=>getComputedStyle(element).display),'grid','mobile data rows become labelled cards');
      await capture(page,family,logical,component,profile);
      if(profile==='desktop') contrast.push(await inspectContrast(page,'.admin-nav-group a span,.admin-topbar small'));
      await context.close();
    }
    console.log(`CAPTURED: ${family} desktop/mobile`);
    for(const [width,height] of [[320,812],[375,812],[768,1024],[812,375],[1024,768]]) {
      ({page,context}=await open(`/m${route}`,width,height)); await bounds(page,`${family}-${width}`); await context.close();
    }
  }
  for(const [route,state] of [['/admin','logout-error'],['/admin/settings','error']]) {
    ({page,context}=await open(`/m${route}`,320,812,state));
    if(state==='logout-error') await page.getByRole('button',{name:'退出登录',exact:true}).click();
    await page.getByRole('alert').waitFor();
    assert.ok(new URL(page.url()).pathname.startsWith('/m/admin'));
    await capture(page,route.endsWith('settings')?'26':'18',`/m${route}`,route.endsWith('settings')?'AdminSettingsPage':'AdminShell','mobile',state);
    await context.close();
  }
  ({page,context}=await open('/m/admin',390,844));
  await page.getByRole('button',{name:'退出登录',exact:true}).click();
  await page.waitForURL('**/login'); await context.close();
  ({page,context}=await open('/m/admin',390,844,'logout-error'));
  await page.getByRole('link',{name:'← 返回演武堂'}).click();
  await page.getByRole('button',{name:'打开用户菜单'}).click();
  await page.getByRole('button',{name:'退出登录',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'退出失败'}).waitFor();
  assert.ok(await page.getByRole('button',{name:'退出登录',exact:true}).isEnabled(),'public Header offers retry without unhandled rejection');
  scenario='default'; await page.getByRole('button',{name:'退出登录',exact:true}).click();
  await page.waitForURL('**/login'); await context.close();
  ({page,context}=await open('/m/admin/settings',320,812,'saving'));
  await page.locator('.settings-advanced summary').click();
  await page.getByLabel('备用英雄名单',{exact:true}).fill('https://pvp.qq.com/changed/herolist.shtml');
  await page.getByRole('button',{name:'保存配置'}).click();
  assert.ok(await page.getByRole('button',{name:'正在保存…'}).isDisabled());
  await page.getByText('配置已保存。下次同步会使用这些地址，现有英雄资料不会立即改变。',{exact:true}).waitFor();
  assert.equal(mutations.findLast(x=>x.p==='/api/admin/settings').body.hero_list_page,'https://pvp.qq.com/changed/herolist.shtml');
  await page.locator('.settings-source-field').filter({has:page.getByLabel('备用英雄名单',{exact:true})}).getByRole('button',{name:'使用此项默认值'}).click();
  await page.getByRole('button',{name:'保存并同步英雄',exact:true}).click();
  await page.getByText('测试：同步完成',{exact:true}).last().waitFor();
  await capture(page,'26','/m/admin/settings','AdminSettingsPage','mobile','sync-done'); await context.close();
  ({page,context}=await open('/m/admin/users',320,812));
  assert.ok(await page.getByRole('button',{name:'上一页'}).isDisabled());
  await page.getByRole('button',{name:'下一页'}).click();
  assert.ok(await page.getByRole('button',{name:'下一页'}).isDisabled());
  await page.getByRole('button',{name:'封禁',exact:true}).click();
  assert.equal(mutations.filter(x=>x.p==='/api/admin/users/7').length,0,'opening confirmation must not change the member');
  await page.getByRole('alertdialog').getByRole('button',{name:'确认封禁',exact:true}).click(); await page.getByRole('button',{name:'解封'}).waitFor();
  assert.deepEqual(mutations.findLast(x=>x.p==='/api/admin/users/7').body,{banned:true});
  await page.getByRole('button',{name:'删除',exact:true}).click(); await page.getByRole('alertdialog').getByRole('button',{name:'确认删除',exact:true}).click(); await page.getByText('听雨客',{exact:true}).waitFor({state:'hidden'}); await context.close();
  ({page,context}=await open('/m/admin/tournaments',320,812));
  await page.getByRole('button',{name:'删除',exact:true}).first().click(); await page.getByRole('alertdialog').waitFor();
  await page.keyboard.press('Escape'); assert.equal(mutations.filter(x=>x.p==='/api/tournaments/101').length,0,'cancelled room deletion must not mutate');
  await page.getByRole('button',{name:'删除',exact:true}).first().click(); await page.getByRole('alertdialog').getByRole('button',{name:'确认删除房间',exact:true}).click();
  await page.getByRole('link',{name:'周末松风演武',exact:true}).waitFor({state:'hidden'}); await context.close();
  ({page,context}=await open('/m/admin/heroes',320,812,'saving'));
  await page.getByLabel('廉颇主分路',{exact:true}).selectOption('jungle');
  assert.ok(await page.getByLabel('廉颇主分路',{exact:true}).isDisabled());
  await page.getByText('保存中…',{exact:true}).waitFor({state:'hidden'});
  assert.equal(mutations.findLast(x=>x.p==='/api/heroes/105').body.roleType,'jungle'); await context.close();
  ({page,context}=await open('/m/admin/announcements',320,812,'saving'));
  await page.getByRole('button',{name:'编辑',exact:true}).first().click();
  await page.getByRole('button',{name:'阅读预览',exact:true}).click();
  assert.ok(await page.getByRole('article',{name:'公告 Markdown 预览'}).isVisible());
  assert.equal(await page.getByRole('textbox',{name:'Markdown 正文'}).isVisible(),false,'mobile preview focuses the reading task');
  await page.getByRole('button',{name:'编写正文',exact:true}).click();
  await page.getByRole('textbox',{name:/公告主题名称/}).fill('秋日整理');
  await page.getByRole('button',{name:'保存修改'}).click();
  assert.ok(await page.getByRole('button',{name:'保存中...'}).isDisabled());
  await page.getByText('公告已更新',{exact:true}).waitFor();
  assert.equal(mutations.findLast(x=>x.p==='/api/announcements/1').body.title,'秋日整理'); await context.close();
  ({page,context}=await open('/m/admin/combat',320,812));
  await page.getByRole('button',{name:'永久删除',exact:true}).click();
  await page.getByRole('alertdialog').waitFor(); await page.keyboard.press('Escape');
  assert.ok(await page.getByRole('button',{name:'永久删除',exact:true}).evaluate(e=>e===document.activeElement));
  await page.getByRole('button',{name:'隐藏动态'}).click();
  await page.getByRole('alertdialog').getByRole('button',{name:'确认',exact:true}).click();
  await page.getByRole('button',{name:'恢复发布'}).waitFor(); await context.close();
  ({page,context}=await open('/m/admin/monitor',320,812));
  await page.getByText('实时连接正常',{exact:true}).waitFor();
  await page.getByRole('button',{name:'立即检查'}).click();
  await page.getByText('检查已入队，结果会通过实时连接推送',{exact:true}).waitFor(); await context.close();
  for(const state of ['empty','error','lease-error','connection-error']) {
    ({page,context}=await open('/m/admin/monitor',320,812,state));
    await capture(page,'25','/m/admin/monitor','MonitorDashboard','mobile',state); await context.close();
  }
  for(const category of ['ANCIENT_BATTLE','MODERN_COMMEMORATION']) {
    for(const [profile,width,height] of [['desktop',1440,900],['mobile',390,844]]) {
      ({page,context}=await open('/m/admin/history-themes',width,height));
      await page.getByLabel('主题标题',{exact:true}).fill(category==='ANCIENT_BATTLE'?'循着史料，读懂来时的路':'铭记与致敬');
      await page.getByLabel('主题摘要',{exact:true}).fill('界面阅读样章 · 尚未发布，内容与来源待核。');
      await page.getByLabel('主题分类',{exact:true}).selectOption(category);
      await page.getByLabel('语调',{exact:true}).selectOption(category==='ANCIENT_BATTLE'?'CULTURAL':'SOLEMN');
      await page.getByRole('button',{name:'内容块',exact:true}).click();
      await page.getByLabel('内容块标题',{exact:true}).fill('每一次引用，都有来处');
      await page.getByLabel('内容块正文',{exact:true}).fill('这是一段用于核对阅读节奏的设计文案，不是史实陈述。正式内容需要查证原始资料，并明确日期口径和出处。');
      await page.getByRole('radio',{name:'主题详情',exact:true}).check();
      await capture(page,'23','/m/admin/history-themes','HistoryThemeStudio',profile,`${category==='ANCIENT_BATTLE'?'culture':'solemn'}-${profile}`);
      await context.close();
    }
  }
  assert.deepEqual(host.violations, []); assert.deepEqual(errors, []); assert.deepEqual(external, []);
  if(process.env.YANWU_FAMILY) { console.log('PASS: focused admin diagnostics; no full success artifacts'); process.exitCode=0; }
  else {
  assert.equal(manifest.filter(x=>x.state==='baseline').length,18);
  await writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2));
  await writeFile(path.join(output,'verification.json'),JSON.stringify({passed:true,browser:'Local Microsoft Edge / Chromium',contrast,checks:['18 actual component baseline records','seven widths','44px buttons and 16px inputs','collapsed keyboard menu and route/back close','real HTTP mutations and logout error/success','settings load/save and sync','history existing safety suite separately required','zero host violations/errors/external requests'],limitations:['No DB/server authorization or production E2E','Resource hook is a test boundary','Only Edge; no native browser zoom claim']},null,2));
  await writeFile(path.join(output,'index.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>演武后台验收</title><style>body{background:#f5f2ea;color:#252b28;font:16px system-ui;margin:32px}section{margin:32px 0}img{max-width:100%;border:1px solid #dcdccf}</style><h1>后台九页 · 真实组件夹具</h1><p>桌面完整页面；手机首屏与长图分别记录。内容为隔离测试，未连接数据库。</p>${manifest.map(r=>`<section><h2>${r.family} · ${r.profile} · ${r.state}</h2><p>${r.route} / ${r.component}</p><img loading="lazy" src="${path.basename(r.file)}">${r.fullPageFile?`<p><a href="${path.basename(r.fullPageFile)}">手机完整页面</a></p>`:''}</section>`).join('')}</html>`);
  console.log('PASS: Yanwu admin; 18 baseline records and seven widths');
  }
} finally { await browser.close(); await host.close(); }
