import { lazy, Suspense } from "react";
import { SplitExplanation } from "../SplitExplanation";
import { MatchArchivePanel } from "@/web/MatchArchivePanel";
import { LineupPanel } from "./LineupPanel";
import type { SplitResult, TeamColor, Tournament } from "./types";

const TeamBuilder = lazy(() => import("../TeamBuilder").then(module => ({ default: module.TeamBuilder })));

interface RoomResultWorkspaceProps {
  tournament: Pick<Tournament, "id" | "players">;
  splitResult: SplitResult;
  ownTeam: TeamColor | null;
  currentUserId?: number;
  isOwner: boolean;
  canManageArchive: boolean;
  splitTab: string;
  onTabChange: (tab: string) => void;
}

export function RoomResultWorkspace({ tournament, splitResult, ownTeam, currentUserId, isOwner, canManageArchive, splitTab, onTabChange }: RoomResultWorkspaceProps) {

  return (
        <div style={{ marginBottom: 32 }}>
          <nav className="yanwu-room-tabs" aria-label="房间工作区">
            {[{ k: "result", l: "分队结果" }, { k: "builder", l: "英雄阵容" }, ...(ownTeam ? [{ k: "tactics", l: "本队战术" }] : []), { k: "archive", l: "比赛档案" }].map(t => (
              <button key={t.k} aria-current={splitTab === t.k ? "page" : undefined} onClick={() => onTabChange(t.k)}
                style={{ padding: "6px 20px", borderRadius: 8, fontSize: 14, fontWeight: splitTab === t.k ? 600 : 400, border: splitTab === t.k ? "1px solid var(--gold)" : "1px solid transparent", background: splitTab === t.k ? "var(--gold-alpha-08)" : "transparent", color: splitTab === t.k ? "var(--gold)" : "var(--text-secondary)", cursor: "pointer" }}>{t.l}</button>
            ))}
          </nav>
          {splitTab === "result" && <div className="animate-slide-up">
          {/* Section title */}
          <h3 className="section-title" style={{ marginBottom: 16 }}>
            完整分队结果
          </h3>

          {/* Team cards side by side */}
          <div className="split-result-grid" style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
          }}>
            <LineupPanel
              teamColor="red"
              splitResult={splitResult}
            />
            <LineupPanel
              teamColor="blue"
              splitResult={splitResult}
            />
          </div>

          {/* Versus divider */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "12px 0 4px",
            gap: 12,
          }}>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            <span style={{
              fontSize: 12,
              fontWeight: 700,
              color: "var(--text-muted)",
              letterSpacing: 3,
            }}>
              VS
            </span>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>

          {/* =========================================================== */}
          {/*  STATS BAR                                                   */}
          {/* =========================================================== */}
          <div className="yanwu-room-stats">
            {/* Power diff */}
            <div style={{ textAlign: "center" as const }}>
              <div style={{
                fontSize: 12,
                color: "var(--text-muted)",
                marginBottom: 6,
              }}>
                战力差
              </div>
              <div style={{
                fontSize: 32,
                fontWeight: 700,
                fontFamily: "monospace",
                color: splitResult.strengthDiff <= 200 ? "var(--green)" : "var(--gold)",
                lineHeight: 1,
              }}>
                {Math.round(splitResult.strengthDiff)}
              </div>
              <div style={{
                fontSize: 12,
                color: splitResult.strengthDiff <= 200 ? "var(--green)" : "var(--gold-light)",
                fontWeight: 500,
                marginTop: 4,
              }}>
                {splitResult.strengthDiff <= 200 ? "完美平衡" : splitResult.strengthDiff <= 500 ? "基本均衡" : "差距较大"}
              </div>
            </div>

            {/* Preference score */}
            <div style={{ textAlign: "center" as const }}>
              <div style={{
                fontSize: 12,
                color: "var(--text-muted)",
                marginBottom: 6,
              }}>
                {splitResult.preferenceSummary ? "第一志愿" : "偏好分"}
              </div>
              <div style={{
                fontSize: 32,
                fontWeight: 700,
                fontFamily: "monospace",
                color: (splitResult.preferenceSummary
                  ? splitResult.preferenceSummary.first >= 8
                  : splitResult.preferenceScore >= 20) ? "var(--green)" : "var(--text)",
                lineHeight: 1,
              }}>
                {splitResult.preferenceSummary?.first ?? Math.round(splitResult.preferenceScore)}
              </div>
              <div style={{
                fontSize: 12,
                color: (splitResult.preferenceSummary
                  ? splitResult.preferenceSummary.first >= 8
                  : splitResult.preferenceScore >= 20) ? "var(--green)" : "var(--text-secondary)",
                fontWeight: 500,
                marginTop: 4,
              }}>
                {splitResult.preferenceSummary
                  ? `第二 ${splitResult.preferenceSummary.second} · 第三 ${splitResult.preferenceSummary.third}`
                  : splitResult.preferenceScore >= 20 ? "高度契合" : splitResult.preferenceScore >= 10 ? "基本满足" : "一般"}
              </div>
            </div>
          </div>
          <SplitExplanation explanation={splitResult.explanation} summary={splitResult.balanceSummary} />
        </div>
        }
        {splitTab === "builder" && (
          <Suspense fallback={<p role="status">正在加载英雄阵容…</p>}>
          <TeamBuilder
            tournamentId={tournament.id}
            teamRed={splitResult.teamRed}
            teamBlue={splitResult.teamBlue}
            players={tournament.players.map(p => ({
              userId: p.userId,
              username: p.isTemporary ? (p.tempName || "临时选手") : p.user.username,
              isTemp: p.isTemporary,
            }))}
            currentUserId={currentUserId || 0}
            isOwner={isOwner}
          />
          </Suspense>
        )}
        {splitTab === "archive" && (
          <MatchArchivePanel tournamentId={tournament.id} canManage={canManageArchive} />
        )}
        {splitTab === "tactics" && ownTeam && (
          <MatchArchivePanel tournamentId={tournament.id} canManage={canManageArchive} mode="tactics" />
        )}
      <style jsx>{`
        @media (max-width: 640px) {
          .split-result-grid {
            grid-template-columns: 1fr !important;
          }
          .stats-bar {
            gap: 16px !important;
            padding: 16px 20px !important;
          }
        }
      `}</style>
        </div>
  );
}
