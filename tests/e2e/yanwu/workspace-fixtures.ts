// Test-only fictional records, adapted from room-archive and human-factors regressions.
export const stamp = '2026-09-19T08:00:00.000Z';
export const roles = ['top', 'jungle', 'mid', 'adc', 'support'];
export const stats = {
    damageDealt: 12000,
    damageTaken: 9000,
    gold: 11000,
    participationRate: .65,
    damageConversionRate: 1.1,
    damageTakenPerDeath: 3000,
    jungleGold: 1800,
    minionKills: 120,
    kills: 4,
    deaths: 2,
    assists: 8,
    controlScore: 16,
    healing: 600,
    towerDamage: 3200
};
export const players = Array.from({ length: 10 }, (_, i) => ({
    id: i + 1,
    memberId: i + 1,
    userId: i + 1,
    side: i < 5 ? 'red' : 'blue',
    slot: i % 5 + 1,
    roleType: roles[i % 5],
    isGuest: false,
    isTemporary: false,
    isSpectator: false,
    tempName: null,
    gameNickname: `山河${i + 1}`,
    heroId: null,
    heroName: ['廉颇', '赵云', '小乔', '后羿', '大乔'][i % 5],
    score: 12 + i / 10,
    updatedAt: stamp,
    statsUpdatedAt: stamp,
    user: { id: i + 1, username: `云中客${i + 1}`, gameNickname: `山河${i + 1}`, avatar: null },
    stats: { ...stats, kills: i + 1, updatedAt: stamp }
}));
export const split = {
    teamRed: players.slice(0, 5),
    teamBlue: players.slice(5),
    playerDetails: players.map(p => ({ userId: p.id, username: p.gameNickname })),
    strengthDiff: 100,
    preferenceScore: 25
};
export const rooms = [
    {
        id: 101,
        name: '山河同游 · 周末好友局',
        code: '628319',
        deadline: '2030-09-19T13:30:00.000Z',
        status: 'completed',
        _count: { players: 10 },
        admins: [{ userId: 1, role: 'owner' }]
    },
    {
        id: 102,
        name: '晚风过峡谷',
        code: '326918',
        deadline: '2030-09-19T14:00:00.000Z',
        status: 'recruiting',
        _count: { players: 6 },
        admins: [{ userId: 2, role: 'owner' }]
    },
    {
        id: 103,
        name: '灯下再会',
        code: '510628',
        deadline: '2030-09-19T14:30:00.000Z',
        status: 'locked',
        _count: { players: 10 },
        admins: [{ userId: 3, role: 'owner' }]
    },
];
export const resources = [
    {
        key: 'public:heroes.catalog',
        name: '英雄目录',
        state: 'HOT',
        scope: 'public',
        leases: 1,
        loads: 2,
        sharedLoads: 3,
        cacheHits: 9,
        staleHits: 0,
        evictions: 0,
        version: stamp,
        loadedAt: stamp,
        expiresAt: null,
        idleSince: null,
        lastError: null,
        loadErrors: 0
    }
];
export function makeMonitorFixture(userId = 1) {
    return {
        userId,
        leaseId: `workspace-monitor-${userId}`,
        resources: structuredClone(resources),
        events: [
            { type: 'connected' },
            {
                type: 'monitor-check',
                cycle: 8,
                results: [
                    { module: 'heroes', ok: true, changed: false, detail: '英雄目录与上次检查一致' },
                    { module: 'news', ok: true, changed: true, detail: '检测到公告变化' },
                    { module: 'skins', ok: true, changed: false, detail: '皮肤资源数量保持一致' },
                ]
            },
        ],
    };
}
export function makeWorkspaceFixture(role = 'owner', scenario = 'default') {
    const id = role === 'member' ? 7 : role === 'visitor' ? 20 : 1;
    const manager = role === 'owner' || role === 'admin';
    const user = role === 'guest' ? null : {
        userId: id,
        username: `云中客${id}`,
        role: role === 'admin' ? 'admin' : 'user',
        avatar: null
    };
    const roomPlayers = scenario === 'recruiting' ? players.slice(0, 6) : players;
    const tournament = {
        ...rooms[0],
        name: scenario === 'long' ? '山河同游ABCDEFGHIJKLMNOPQRSTUVWXYZ很长的房间标题' : rooms[0].name,
        isPublic: true,
        announcement: '先确认分路，再一起开局。\n友好交流，赛后复盘。',
        status: scenario === 'recruiting' ? 'recruiting' : 'completed',
        playerCount: roomPlayers.length,
        players: role === 'visitor' ? [] : roomPlayers,
        admins: [{ userId: 1, role: 'owner', user: players[0].user }],
        applications: [],
        splitResult: scenario === 'recruiting' ? null : split
    };
    const ownSide = id === 7 ? 'blue' : 'red';
    const match = {
        match: {
            id: 201,
            tournamentId: 101,
            tournamentName: tournament.name,
            playedAt: stamp,
            status: scenario === 'readonly' || role === 'member' ? 'SUBMITTED' : scenario === 'draft' ? 'DRAFT' : 'CONFIRMED',
            winnerSide: 'red',
            redTotalKills: 15,
            blueTotalKills: 40,
            consistencyStatus: 'PASS',
            consistencyDetails: {},
            evidenceRevision: 1,
            recordRevision: 1,
            updatedAt: stamp,
            players: manager ? players : players.filter(p => p.side === ownSide),
            screenshots: (scenario === 'draft' ? [] : ['DATA', 'OUTPUT', 'SURVIVAL', 'DEVELOPMENT', 'KDA', 'TEAM']).map((type, i) => ({
                id: i + 1,
                type,
                originalFilename: `${type.toLowerCase()}.png`,
                size: 450 * 1024,
                recognitionStatus: 'COMPLETED'
            })),
            recognition: {
                status: scenario === 'ocr-error' ? 'FAILED' : 'COMPLETED',
                errorCode: scenario === 'ocr-error' ? 'PROVIDER_UNAVAILABLE' : null,
                warnings: [],
                attemptCount: 1,
                availableAt: stamp,
                heartbeatAt: stamp,
                normalizedResult: {
                    version: 2,
                    players: players.map(p => ({
                        side: p.side,
                        slot: p.slot,
                        nickname: p.gameNickname,
                        heroId: p.heroId,
                        heroName: p.heroName,
                        score: { value: p.score, sources: [], conflict: false },
                        stats: Object.fromEntries(Object.keys(stats).map(k => [k, { value: p.stats[k as keyof typeof stats], sources: [], conflict: false }])),
                        warnings: []
                    }))
                }
            },
            disputes: []
        },
        access: {
            canManage: manager,
            isSuperAdmin: role === 'admin',
            currentUserId: id,
            ownSide
        },
        eligibleMembers: players.map(p => ({ id: p.id, username: p.user.username, gameNickname: p.gameNickname }))
    };
    const tactics = {
        room: {
            id: 1,
            side: ownSide,
            layers: scenario === 'empty' ? [] : [
                {
                    id: 1,
                    name: '开局协同',
                    description: '第一波兵线与河道视野',
                    startTime: 0,
                    endTime: 240,
                    updatedAt: stamp,
                    routes: [
                        {
                            id: 1,
                            ownerMemberId: id,
                            colorKey: ownSide === 'red' ? 'crimson' : 'azure',
                            geometry: { version: 1, arrow: true, points: [{ x: .2, y: .78 }, { x: .42, y: .56 }] },
                            revision: 1,
                            canEdit: scenario !== 'readonly',
                            ownerMember: { username: user?.username }
                        }
                    ],
                    markers: []
                }
            ]
        },
        access: {
            userId: id,
            canManageLayers: manager,
            canDraw: scenario !== 'readonly',
            ownColorKey: ownSide === 'red' ? 'crimson' : 'azure',
            sharedAnnotationsVisible: scenario === 'readonly'
        }
    };
    const post = {
        id: 1,
        title: scenario === 'long' ? '高地反打复盘ABCDEFGHIJKLMNOPQRSTUVWXYZ与队友并肩再出发' : '守住高地，一起反打',
        content: '先拉开阵型，等到关键控制交出，再集中火力反打。\n这一局最值得记住的，是队友之间及时的提醒。',
        status: scenario === 'hidden' ? 'hidden' : 'published',
        createdAt: stamp,
        authorId: 1,
        author: { username: '云中客1' },
        likedByMe: false,
        videoUrl: '/api/combat-posts/1/video',
        comments: scenario === 'empty' ? [] : [
            {
                id: 1,
                content: '河道视野很关键，下次也要提前布置。',
                createdAt: stamp,
                authorId: 1,
                author: { username: '云中客1' }
            }
        ],
        _count: { likes: 3, comments: scenario === 'empty' ? 0 : 1 }
    };
    return { user, tournament, match, tactics, post, ownSide, manager };
}
