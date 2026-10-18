import { useState } from 'react';
import { rooms, makeMonitorFixture, makeWorkspaceFixture } from './workspace-fixtures';
const params = new URLSearchParams(location.search), scenario = params.get('case');
const monitor = makeMonitorFixture(makeWorkspaceFixture(params.get('role') || 'owner').user?.userId);
const lobby = {
    tournaments: scenario === 'empty' ? [] : [rooms[0]],
    publicTournaments: scenario === 'empty' ? [] : rooms.slice(1),
    nextCursors: { tournaments: 101, publicTournaments: 103 }
};
const immediate = { 'tournaments.lobby': { data: lobby, version: 'fixture-v1' } };
export function usePageResources(name: string) {
    const [retried, setRetried] = useState(false);
    if (name === 'heroes') return {
        leaseId: 'fixture-heroes',
        immediate: { 'heroes.list': { data: [{ heroId: 9001, name: '测试先锋', title: '阵容测试', imageUrl: '', roleType: 'top', secondaryRoleTypes: ['jungle'] }] } },
        loading: false,
        error: null,
        loadResource: async () => [],
        retry: () => setRetried(true)
    };
    if (!['tournaments', 'monitor'].includes(name))
        throw new Error(`Unknown workspace resource page ${name}`);
    return {
        leaseId: name === 'monitor' && scenario !== 'lease-error' ? monitor.leaseId : null,
        immediate: name === 'tournaments' ? immediate : {},
        loading: scenario === 'loading',
        error: scenario === 'lease-error' || scenario === 'error' && !retried ? '测试：资源暂不可用' : null,
        loadResource: async (resource: string) => {
            if (resource !== 'tournaments.lobby') {
                throw new Error(`Unknown resource ${resource}`);
            }
            setRetried(true);
            return lobby;
        },
        retry: () => setRetried(true)
    };
}
