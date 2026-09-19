import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@/web/themes/ThemeProvider';
import { ToastProvider } from '@/web/components/ui/Toast';
import { ThemeLayout } from '@/web/components/layout/ThemeLayout';
import { usePathname } from './routing-shim';
import { TournamentList } from '@/web/components/tournament/TournamentList';
import { TournamentDetail } from '@/web/components/tournament/TournamentDetail';
import { MatchWorkspace } from '@/web/MatchWorkspace';
import { TacticBoard } from '@/web/TacticBoard';
import { CombatWall } from '@/web/CombatWall';
import { CombatPostDetail } from '@/web/CombatPostDetail';
import { MonitorDashboard } from '@/web/MonitorDashboard';
function Content() {
    const route = usePathname().replace(/^\/m(?=\/|$)/, '');
    if (route.includes('/tactics/')) return <TacticBoard />;
    if (route.includes('/matches/')) return <MatchWorkspace />;
    if (route === '/tournaments') return <TournamentList />;
    if (route.startsWith('/tournaments/')) return <TournamentDetail />;
    if (route === '/combat') return <CombatWall />;
    if (route.startsWith('/combat/')) return <CombatPostDetail />;
    if (route === '/monitor') return <MonitorDashboard />;
    return <p>测试目的地：{route}</p>;
}

createRoot(document.getElementById('root')!).render(
    <ThemeProvider>
        <ToastProvider>
            <ThemeLayout>
                <Content />
            </ThemeLayout>
        </ToastProvider>
    </ThemeProvider>
);
