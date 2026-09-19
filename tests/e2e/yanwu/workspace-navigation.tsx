export { useRouter, usePathname, useSearchParams } from './routing-shim';
export function useParams() {
    const parts = location.pathname.replace(/^\/m(?=\/|$)/, '').split('/');
    return {
        id: parts[2] || '101',
        matchId: parts[4] || '201',
        side: parts[6] || 'red',
        postId: parts[2] || '1'
    };
}
