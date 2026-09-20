import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { inspectContrast, inspectPlayerControls, inspectScrolledTable } from './yanwu/workspace-audit.mjs';
import { startYanwuHost } from './yanwu/host.mjs';
import { makeWorkspaceFixture, makeMonitorFixture, rooms, resources, stamp } from './yanwu/workspace-fixtures.ts';
const output = path.resolve('test-results/yanwu-workspaces');
await mkdir(output, { recursive: true });
for (const name of ['manifest.json', 'verification.json'])
    await rm(path.join(output, name), { force: true });
let fixture = makeWorkspaceFixture(), scenario = 'default';
const mutations = [];
const host = await startYanwuHost({
    entry: 'tests/e2e/yanwu/workspace-entry.tsx',
    aliases: {
        'next/navigation': 'tests/e2e/yanwu/workspace-navigation.tsx',
        '@/features/auth/client': 'tests/e2e/yanwu/workspace-auth.tsx',
        '@/features/auth/client/api': 'src/features/auth/client/api.ts',
        '@/features/resource-scheduler/client': 'tests/e2e/yanwu/workspace-resources.tsx'
    },
    apiHandlers: async ({ request, url }) => {
        const p = url.pathname, m = request.method, fail = scenario === 'error';
        if (m === 'GET' && p === '/api/auth/me')
            return { body: { user: fixture.user } };
        if (m === 'GET' && p === '/api/equipment')
            return { body: [] };
        if (m === 'GET' && p === '/api/tournaments/101/picks')
            return { body: { picks: [] } };
        if (m === 'GET' && p === '/api/heroes/9001')
            return { body: { id: 9001, name: '测试先锋', meta: { imageUrl: '', title: '阵容测试', heroType: 1 }, effects: [] } };
        if (m === 'GET' && p === '/api/tournaments/101')
            return {
                body: {
                    tournament: fixture.tournament,
                    splitResult: fixture.tournament.splitResult
                }
            };
        if (m === 'GET' && p === '/api/tournaments')
            return {
                body: {
                    tournaments: [],
                    publicTournaments: [],
                    nextCursors: { tournaments: null, publicTournaments: null }
                }
            };
        if (m === 'GET' && p === '/api/tournaments/101/matches')
            return {
                body: {
                    matches: [
                        {
                            id: 201,
                            status: fixture.match.match.status,
                            playedAt: stamp,
                            ownSide: fixture.ownSide,
                            canViewArchive: fixture.manager || fixture.match.match.status === 'SUBMITTED',
                            winnerSide: 'red',
                            redTotalKills: 15,
                            blueTotalKills: 40,
                            consistencyStatus: 'PASS',
                            _count: { screenshots: 6, players: 10, combatPosts: 1 }
                        }
                    ]
                }
            };
        if (m === 'GET' && p === '/api/tournaments/101/matches/201')
            return { status: fail ? 503 : 200, body: fail ? { error: '测试：档案读取失败' } : fixture.match };
        if (m === 'GET' && /^\/api\/tournaments\/101\/matches\/201\/tactics\/(red|blue)$/.test(p))
            return {
                status: scenario === 'denied' ? 403 : 200,
                body: scenario === 'denied' ? { error: '测试：无权访问对方战术室' } : fixture.tactics
            };
        if (m === 'GET' && p === '/api/combat-posts')
            return {
                status: fail ? 503 : 200,
                body: fail ? { error: '测试：动态读取失败' } : {
                    posts: scenario === 'empty' ? [] : [fixture.post],
                    total: scenario === 'empty' ? 0 : 1,
                    totalPages: 1
                }
            };
        if (m === 'GET' && p === '/api/combat-posts/policy')
            return {
                body: { maxBytes: 512 * 1024 ** 2, maxDurationSeconds: 300, uploadTimeoutMs: 900000 }
            };
        if (m === 'GET' && p === '/api/combat-posts/1')
            return {
                status: fail ? 503 : 200,
                body: fail ? { error: '测试：复盘读取失败' } : {
                    post: fixture.post,
                    access: { canModerate: fixture.manager },
                    commentPage: { hasMore: false, nextCursor: null }
                }
            };
        if (m === 'GET' && p === '/api/combat-posts/1/video')
            return {
                status: 404,
                contentType: 'text/plain',
                body: 'declared test-only unavailable media'
            };
        if (m === 'GET' && p === '/api/admin/resources')
            return {
                status: fail ? 503 : 200,
                body: fail ? { error: '测试：资源读取失败' } : { resources: scenario === 'empty' ? [] : resources }
            };
        if (m === 'GET' && p === '/api/heroes/watch' && scenario === 'connection-error')
            return { status: 204, body: '' };
        if (m === 'GET' && p === '/api/heroes/watch')
            return {
                keepOpen: true,
                contentType: 'text/event-stream',
                body: makeMonitorFixture(fixture.user?.userId).events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')
            };
        const known = (m === 'POST' && [
            '/api/tournaments',
            '/api/tournaments/join-by-code',
            '/api/tournaments/101/join',
            '/api/heroes/watch',
            '/api/tournaments/101/matches/201/submit',
            '/api/tournaments/101/matches/201/disputes',
            '/api/combat-posts/1/comments'
        ].includes(p)) || (m === 'PUT' && [
            '/api/tournaments/101/picks',
            '/api/tournaments/101/matches/201/confirmation',
            '/api/combat-posts/1/like',
            '/api/tournaments/101/matches/201/tactics/red/layers/1/route'
        ].includes(p)) || (m === 'DELETE' && ['/api/combat-posts/1/like', '/api/combat-posts/1/comments/1'].includes(p)) || (m === 'PATCH' && p === '/api/combat-posts/1');
        if (known) {
            let raw = '';
            for await (const chunk of request)
                raw += chunk;
            const body = raw ? JSON.parse(raw) : {};
            mutations.push({ p, m, body });
            if (fail)
                return { status: 503, body: { error: '测试：保存失败' } };
            if (p === '/api/tournaments')
                return { body: { tournament: { id: 101 } } };
            if (p.endsWith('join-by-code'))
                return {
                    body: {
                        room: {
                            id: 101,
                            code: '628319',
                            name: rooms[0].name,
                            deadline: rooms[0].deadline,
                            status: 'recruiting',
                            isPublic: true,
                            announcement: '欢迎加入',
                            playerCount: 6
                        },
                        existing: false,
                        canJoin: true,
                        unavailableReason: null
                    }
                };
            if (p.endsWith('/like')) {
                fixture.post.likedByMe = m === 'PUT';
                fixture.post._count.likes += m === 'PUT' ? 1 : -1;
            }
            if (p.endsWith('/submit'))
                fixture.match.match.status = 'SUBMITTED';
            if (p.endsWith('/comments')) {
                fixture.post.comments.push({
                    id: 2,
                    content: body.content,
                    createdAt: stamp,
                    authorId: 1,
                    author: { username: '云中客1' }
                });
                fixture.post._count.comments++;
            }
            if (p.endsWith('/comments/1'))
                fixture.post.comments = fixture.post.comments.filter(c => c.id !== 1);
            return { body: {} };
        }
        return null;
    }
});
const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.E2E_BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
});
const errors = [], external = [], manifest = [], contrast = [];
// This small, visibly labeled synthetic video is committed under tests only.
const videoBytes = await readFile(new URL('./yanwu/workspace-video.mp4', import.meta.url));
const pairs = [
    ['09', '/tournaments', 'TournamentList', 'owner'],
    ['10', '/tournaments/101', 'TournamentDetail', 'owner'],
    ['11', '/tournaments/101/matches/201', 'MatchWorkspace', 'owner'],
    [
        '12',
        '/tournaments/101/matches/201/tactics/red',
        'TacticBoard',
        'owner'
    ],
    ['15', '/combat', 'CombatWall', 'owner'],
    ['16', '/combat/1', 'CombatPostDetail', 'owner'],
    ['17', '/monitor', 'MonitorDashboard', 'admin']
];
async function open(route, width = 390, height = 844, role = 'owner', state = 'default') {
    scenario = state;
    fixture = makeWorkspaceFixture(role, state);
    const context = await browser.newContext({
        viewport: { width, height },
        reducedMotion: 'reduce',
        userAgent: width <= 900 ? 'Mozilla/5.0 iPhone Mobile' : 'Mozilla/5.0 Windows Chrome/140'
    });
    await context.addInitScript(() => sessionStorage.setItem('yanwu:intro-seen:v1', '1'));
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', request => {
        const url = new URL(request.request().url());
        if (url.origin !== host.baseURL) {
            external.push(url.href);
            return request.abort();
        }
        if (request.request().resourceType() === 'document') {
            return request.fulfill({ contentType: 'text/html', body: host.html });
        }
        if (url.pathname === '/heroes/skins/9001/1.jpg') {
            return request.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#b18a54"/></svg>' });
        }
        if (url.pathname === '/images/tactic-map-source.jpg' && state === 'map-missing') {
            return request.fulfill({ status: 404, body: 'declared missing map' });
        }
        if (url.pathname === '/api/combat-posts/1/video' && state !== 'media-error') {
            return request.fulfill({ contentType: 'video/mp4', body: videoBytes });
        }
        return request.continue();
    });
    await page.goto(`${host.baseURL}${route}?role=${role}&case=${state}`, {
        waitUntil: route.endsWith('/monitor') ? 'domcontentloaded' : 'networkidle'
    });
    if (route.endsWith('/monitor'))
        await page.waitForTimeout(200);
    return { context, page };
}
async function bounds(page, label) {
    const result = await page.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
        overflow: [
            ...document.querySelectorAll('main button, main input, main select, .tournament-detail button, .tournament-list button')
        ].filter(element => {
            const rect = element.getBoundingClientRect();
            const localScroller = element.closest(
                '.data-table-wrap,.tactic-resource-table-wrap,.tactic-layer-list,.tactic-clock-presets,.match-result-table-wrap'
            );
            return element.checkVisibility() && rect.width && rect.height
                && (rect.right > innerWidth + 1 || rect.left < -1) && !localScroller;
        }).map(element => element.textContent?.trim().slice(0, 40))
    }));
    assert.ok(result.scroll <= result.width, `${label} page overflow ${JSON.stringify(result)}`);
    assert.deepEqual(result.overflow, [], `${label} controls stay within viewport`);
}
async function capture(page, family, route, component, role, state, profile) {
    await bounds(page, `${family}-${state}`);
    const file = path.join(output, `${family}-${state === 'baseline' ? profile : state}.png`);
    await page.screenshot({ path: file, fullPage: profile === 'desktop' || state !== 'baseline' });
    let fullPageFile;
    if (profile === 'mobile' && state === 'baseline' && await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)) {
        fullPageFile = path.join(output, `${family}-mobile-full.png`);
        await page.screenshot({ path: fullPageFile, fullPage: true });
    }
    manifest.push({
        family,
        route,
        component,
        viewport: page.viewportSize(),
        profile,
        role,
        fixture: `workspace-${family}-${state}-v1`,
        state,
        source: 'isolated-component-fixture',
        file,
        ...(fullPageFile ? { fullPageFile } : {})
    });
}
try {
    for (const [width, height] of [[1024, 768], [812, 375]]) {
        const { context, page } = await open('/m/tournaments/101/matches/201', width, height);
        const result = await inspectScrolledTable(page);
        console.log(`PASS: ${width}px scrolled table corner remains exposed; layers ${result.layers.join(' > ')}`);
        await context.close();
    }
    // Fails if small inline room controls override the 44px interaction target.
    let { context, page } = await open('/m/tournaments/101', 320, 812);
    const copy = await page.getByRole('button', { name: '复制房间号 628319' }).boundingBox();
    assert.ok(copy.height >= 44 && copy.width >= 44, `room code control must remain at least 44px; observed ${copy.width} × ${copy.height}`);
    await bounds(page, '320 room');
    await context.close();
    ({ context, page } = await open('/m/tournaments', 320, 812));
    for (const row of await page.locator('.yanwu-room-row').all()) {
        const title = await row.locator('h3').boundingBox(), seats = await row.locator('.yanwu-room-capacity').boundingBox(), button = await row.getByRole('button').boundingBox();
        assert.ok(title.y + title.height <= seats.y && seats.y + seats.height <= button.y, 'mobile room title, seats and action do not overlap');
    }
    await context.close();
    for (const [family, route, component, role] of pairs.filter(p => !process.env.YANWU_FAMILY || process.env.YANWU_FAMILY === p[0])) {
        for (const [profile, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
            const logical = profile === 'mobile' ? `/m${route}` : route;
            ({ context, page } = await open(logical, width, height, role));
            await page.locator('h1').first().waitFor();
            if (family === '10')
                contrast.push(await inspectContrast(page, '.yanwu-own-role,.yanwu-lineup header,.yanwu-lineup small'));
            if (family === '12')
                assert.ok(await page.locator('h1').evaluate(e => parseFloat(getComputedStyle(e).fontSize) >= 30), 'tactic heading retains workspace hierarchy');
            if (family === '16') {
                await page.locator('video').evaluate(async video => {
                    video.muted = true;
                    await video.play();
                });
                await page.waitForFunction(() => {
                    const video = document.querySelector('video');
                    return video && !video.paused && video.currentTime > 0;
                });
                await page.locator('video').evaluate(v => v.pause());
            }
            if (family === '17') {
                await page.getByText('实时连接正常', { exact: true }).waitFor();
                assert.ok(await page.getByRole('button', { name: '立即检查' }).isEnabled());
            }
            await capture(page, family, logical, component, role, 'baseline', profile);
            await context.close();
        }
        for (const [width, height] of [[320, 812], [375, 812], [768, 1024], [812, 375], [1024, 768]]) {
            ({ context, page } = await open(`/m${route}`, width, height, role));
            await bounds(page, `${family}-${width}`);
            await context.close();
        }
    }
    // Opening the deferred builder must preserve self-only editing and the pick API contract.
    for (const [role, userId, width, height] of [['owner', 1, 1440, 900], ['member', 7, 390, 844]]) {
        const requestStart = host.apiRequests.length;
        ({ context, page } = await open('/m/tournaments/101', width, height, role));
        assert.ok(!host.apiRequests.slice(requestStart).some(r => r.includes('/picks') || r.includes('/api/equipment')), 'builder data stays deferred until its tab opens');
        await page.getByRole('button', { name: '英雄阵容', exact: true }).click();
        await page.getByRole('heading', { name: role === 'owner' ? '🔴 红队' : '🔵 蓝队', exact: true }).waitFor();
        assert.equal(await page.getByRole('heading', { name: role === 'owner' ? '🔵 蓝队' : '🔴 红队', exact: true }).count(), 0, 'opponent builder stays private');
        assert.equal(await page.getByRole('button', { name: '打开英雄列表', exact: true }).count(), 1, `${role} can edit only their own real player`);
        await page.getByRole('button', { name: '打开英雄列表', exact: true }).click();
        const savedPick = page.waitForResponse(r => r.url().endsWith('/api/tournaments/101/picks') && r.request().method() === 'PUT');
        await page.getByRole('option', { name: /测试先锋/ }).click();
        assert.equal((await savedPick).status(), 200);
        assert.deepEqual(mutations.filter(m => m.p.endsWith('/picks')).at(-1).body, {
            targetUserId: userId, heroId: 9001, heroName: '测试先锋', equipIds: []
        });
        await page.getByRole('button', { name: '已选择测试先锋，打开英雄列表', exact: true }).waitFor();
        await page.getByRole('button', { name: '分队结果', exact: true }).click();
        await page.getByRole('heading', { name: '完整分队结果', exact: true }).waitFor();
        await context.close();
    }
    // Supplemental viewport documents a real player record, not a compressed full-page table.
    ({ context, page } = await open('/m/tournaments/101/matches/201', 390, 844));
    await inspectPlayerControls(page);
    await page.locator('.match-result-team--red tr').nth(1).evaluate(e => window.scrollTo(0, e.getBoundingClientRect().top + scrollY - 100));
    const playerFile = path.join(output, '11-player-fields-viewport.png');
    await page.screenshot({ path: playerFile });
    manifest.push({
        family: '11',
        route: '/m/tournaments/101/matches/201',
        component: 'MatchWorkspace',
        viewport: page.viewportSize(),
        profile: 'mobile',
        role: 'owner',
        fixture: 'match-confirmed-v1',
        state: 'player-fields-viewport',
        source: 'isolated-component-fixture',
        file: playerFile
    });
    await context.close();
    ({ context, page } = await open('/monitor', 1440, 900, 'admin'));
    await page.getByRole('button', { name: '立即检查' }).click();
    await page.getByText('检查已入队，结果会通过实时连接推送', { exact: true }).waitFor();
    await context.close();
    // Actual form/mutation, keyboard and focus contracts, never mock UI.
    ({ context, page } = await open('/m/tournaments', 320, 812));
    await page.getByRole('textbox', { name: '6 位房间号' }).fill('628319');
    await page.getByRole('textbox', { name: '6 位房间号' }).press('Enter');
    await page.getByRole('dialog').waitFor();
    await page.keyboard.press('Escape');
    await context.close();
    ({ context, page } = await open('/m/tournaments/101/matches/201', 320, 812));
    await inspectPlayerControls(page);
    await page.getByRole('tab').first().focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.getByRole('tab').nth(1).getAttribute('aria-selected'), 'true');
    await page.getByRole('button', { name: '保存复核结果' }).click();
    await page.waitForTimeout(150);
    assert.equal(mutations.find(x => x.p.endsWith('/confirmation')).body.players.length, 10);
    const submit = page.getByRole('button', { name: '正式提交并锁定', exact: true });
    await submit.click();
    await page.getByRole('alertdialog').waitFor();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.activeElement?.textContent === '正式提交并锁定');
    assert.ok(await submit.evaluate(e => e === document.activeElement));
    await context.close();
    ({ context, page } = await open('/m/tournaments/101/matches/201/tactics/red', 320, 812));
    await page.getByText('图层与精确编辑', { exact: true }).click();
    await page.getByRole('spinbutton', { name: 'X（0–1）' }).fill('0.35');
    await page.getByRole('spinbutton', { name: 'Y（0–1）' }).fill('0.45');
    await page.getByRole('button', { name: '按坐标添加' }).click();
    await page.getByRole('button', { name: '保存路线' }).click();
    await page.waitForTimeout(150);
    assert.ok(mutations.find(x => x.p.endsWith('/route')).body.geometry.points.some(p => p.x === .35 && p.y === .45));
    await bounds(page, 'precise map controls');
    await context.close();
    ({ context, page } = await open('/m/combat/1', 320, 812, 'owner', 'media-error'));
    assert.ok(await page.locator('video').evaluate(e => e.controls));
    await page.getByRole('button', { name: '重新加载视频' }).waitFor();
    contrast.push(await inspectContrast(page, '.combat-player-status,.combat-player-status .btn-subtle'));
    await page.getByRole('button', { name: '点赞 · 3', exact: true }).click();
    await page.getByRole('button', { name: '已赞 · 4', exact: true }).waitFor();
    const del = page.getByRole('button', { name: '删除动态', exact: true });
    await del.click();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.activeElement?.textContent === '删除动态');
    assert.ok(await del.evaluate(e => e === document.activeElement));
    await context.close();
    for (const [family, route, component, role, state] of [
        ['09', '/tournaments', 'TournamentList', 'guest', 'guest'],
        ['09', '/tournaments', 'TournamentList', 'owner', 'empty'],
        ['10', '/tournaments/101', 'TournamentDetail', 'visitor', 'recruiting'],
        ['10', '/tournaments/101', 'TournamentDetail', 'member', 'readonly'],
        [
            '11',
            '/tournaments/101/matches/201',
            'MatchWorkspace',
            'member',
            'readonly'
        ],
        ['11', '/tournaments/101/matches/201', 'MatchWorkspace', 'owner', 'draft'],
        ['11', '/tournaments/101/matches/201', 'MatchWorkspace', 'owner', 'error'],
        [
            '12',
            '/tournaments/101/matches/201/tactics/red',
            'TacticBoard',
            'owner',
            'empty'
        ],
        [
            '12',
            '/tournaments/101/matches/201/tactics/red',
            'TacticBoard',
            'owner',
            'readonly'
        ],
        [
            '12',
            '/tournaments/101/matches/201/tactics/red',
            'TacticBoard',
            'owner',
            'map-missing'
        ],
        [
            '12',
            '/tournaments/101/matches/201/tactics/red',
            'TacticBoard',
            'owner',
            'denied'
        ],
        ['15', '/combat', 'CombatWall', 'owner', 'empty'],
        ['15', '/combat', 'CombatWall', 'owner', 'error'],
        ['16', '/combat/1', 'CombatPostDetail', 'owner', 'hidden'],
        ['17', '/monitor', 'MonitorDashboard', 'admin', 'error'],
        ['17', '/monitor', 'MonitorDashboard', 'admin', 'lease-error'],
        ['17', '/monitor', 'MonitorDashboard', 'admin', 'connection-error'],
        ['16', '/combat/1', 'CombatPostDetail', 'owner', 'media-error']
    ]) {
        ({ context, page } = await open(`/m${route}`, 320, 812, role, state));
        if (family === '11' && role === 'member')
            assert.equal(await page.getByRole('button', { name: '保存复核结果' }).count(), 0);
        if (family === '12' && state === 'readonly')
            assert.ok(await page.getByRole('button', { name: '保存路线' }).isDisabled());
        await capture(page, family, `/m${route}`, component, role, state, 'mobile');
        await context.close();
    }
    assert.deepEqual(host.violations, []);
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    if (!process.env.YANWU_FAMILY) {
        assert.equal(manifest.filter(x => x.state === 'baseline').length, 14);
        await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
        await writeFile(path.join(output, 'verification.json'), JSON.stringify({
            passed: true,
            browser: 'Local Microsoft Edge / Chromium',
            contrast,
            checks: [
                'native local H.264 play advances currentTime',
                'actual player field containment',
                'sampled text/media contrast >= 4.5',
                '14 actual-component baselines',
                'seven widths',
                'real API mutation contracts',
                'keyboard and focus restoration',
                'role/read-only/error states',
                'zero host violations and unhandled errors'
            ],
            limitations: [
                'No DB or production E2E',
                'Resource hook is an explicit boundary fixture',
                'Video is a synthetic labeled local H.264; media-error is supplemental',
                'Single local browser engine'
            ]
        }, null, 2));
    }
    const galleryItems = manifest.map(record => `
        <section>
            <h2>${record.family} · ${record.profile} · ${record.state}</h2>
            <p>${record.component} / ${record.role}</p>
            <img loading="lazy" src="${path.basename(record.file)}">
            ${record.fullPageFile
                ? `<p><a href="${path.basename(record.fullPageFile)}">查看手机完整页面</a></p>`
                : ''}
        </section>
    `).join('');
    await writeFile(path.join(output, 'index.html'), `<!doctype html>
        <html lang="zh-CN"><meta charset="utf-8"><title>演武工作区验收</title>
        <style>
            body{background:#f5f2ea;color:#252b28;font:16px system-ui;margin:40px}
            section{margin:32px 0}img{max-width:100%;border:1px solid #dcdccf}a{color:#8f342a}
        </style>
        <h1>演武工作区 · 真实组件夹具</h1>
        <p>桌面完整页面；手机首屏用于判断底栏位置，长图为独立合成。
        视频为标注的本地测试片；媒体失败为补充状态。</p>
        ${galleryItems}
    `);
    console.log(process.env.YANWU_FAMILY
        ? 'PASS: focused workspace checks; no full success manifest written.'
        : 'PASS: Yanwu workspaces; 14 baseline records and seven widths.');
}
finally {
    await browser.close();
    await host.close();
}
