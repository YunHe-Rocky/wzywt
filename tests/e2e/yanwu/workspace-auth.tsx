import { makeWorkspaceFixture } from './workspace-fixtures';
const params = new URLSearchParams(location.search);
const identity = makeWorkspaceFixture(params.get('role') || 'owner', params.get('case') || 'default').user;
export function useAuth() { return { loaded: true, user: identity }; }
