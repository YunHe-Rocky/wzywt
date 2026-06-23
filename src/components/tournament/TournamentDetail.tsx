"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { LineupSimulator } from "./LineupSimulator";

interface PlayerInfo {
  userId: number; user: { id: number; username: string };
  isTemporary: boolean; tempName: string | null; isSpectator: boolean;
}
interface Tournament {
  id: number; name: string; code: string; deadline: string; status: string; isPublic: boolean;
  announcement?: string;
  players: PlayerInfo[];
  admins: { userId: number; role: string; user: { id: number; username: string } }[];
  applications: { id: number; tempName: string | null; applicant: { id: number; username: string } }[];
}
interface SplitResult {
  teamRed: { userId: number; roleType: string }[];
  teamBlue: { userId: number; roleType: string }[];
  powerDiff: number;
  preferenceScore: number;
  playerDetails: { userId: number; username: string; peakPower: number }[];
}

interface Hero {
  id: number; heroId: number; name: string; title: string; roleType: string;
}

const ROLE_LABELS: Record<string, string> = {
  top: "对抗路", jungle: "打野", mid: "中路", adc: "发育路", support: "游走",
};

type TeamColor = "red" | "blue";

const EMPTY_LINEUP: Record<TeamColor, Record<string, number | null>> = {
  red: { top: null, jungle: null, mid: null, adc: null, support: null },
  blue: { top: null, jungle: null, mid: null, adc: null, support: null },
};

// ============================================================================
// LineupPanel — 阵容演练 (inline component, fully client-side)
// ============================================================================
function LineupPanel({
  teamColor,
  splitResult,
  teamPower,
}: {
  teamColor: TeamColor;
  splitResult: SplitResult;
  teamPower: number;
}) {
  const team = teamColor === "red" ? splitResult.teamRed : splitResult.teamBlue;
  const [lineup, setLineup] = useState<Record<string, number | null>>(
    EMPTY_LINEUP[teamColor]
  );
  const [heroesByRole, setHeroesByRole] = useState<Record<string, Hero[]>>({});
  const [showLineup, setShowLineup] = useState(false);
  const [loadingHeroes, setLoadingHeroes] = useState(false);

  useEffect(() => {
    if (!showLineup) return;
    const roleSet = new Set(team.map((p) => p.roleType));
    const roles = Array.from(roleSet);
    const missingRoles = roles.filter((r) => !heroesByRole[r]);

    if (missingRoles.length === 0) return;

    setLoadingHeroes(true);
    Promise.all(
      missingRoles.map((role) =>
        fetch(`/api/heroes?role_type=${role}`)
          .then((r) => r.json())
          .then((heroes) => ({ role, heroes }))
      )
    ).then((results) => {
      setHeroesByRole((prev) => {
        const next = { ...prev };
        results.forEach(({ role, heroes }) => {
          next[role] = heroes;
        });
        return next;
      });
      setLoadingHeroes(false);
    });
  }, [showLineup, team]);

  const selectHero = (roleType: string, heroId: number | null) => {
    setLineup((prev) => ({ ...prev, [roleType]: heroId }));
  };

  const resetLineup = () => {
    setLineup({ ...EMPTY_LINEUP[teamColor] });
  };

  const isRed = teamColor === "red";

  const teamLabel = isRed ? "红队" : "蓝队";
  const accentColor = isRed ? "var(--red)" : "var(--blue)";
  const accentBg = isRed ? "rgba(224, 80, 80, 0.08)" : "rgba(80, 144, 208, 0.08)";
  const accentBorder = isRed ? "rgba(224, 80, 80, 0.18)" : "rgba(80, 144, 208, 0.18)";
  const accentText = isRed ? "var(--red)" : "var(--blue)";

  return (
    <div className={isRed ? "card-red" : "card-blue"} style={{ padding: 0, overflow: "hidden" }}>
      {/* ── Team Header ── */}
      <div
        style={{
          padding: "18px 24px",
          borderBottom: `1px solid ${accentBorder}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            fontSize: 20,
            fontWeight: 700,
            color: "var(--text)",
          }}>
            {teamLabel}
          </span>
        </div>
        <div style={{ textAlign: "right" as const }}>
          <div style={{
            fontSize: 28,
            fontWeight: 700,
            color: "var(--gold)",
            lineHeight: 1,
            fontFamily: "monospace",
          }}>
            {teamPower}
          </div>
          <div style={{
            fontSize: 10,
            color: "var(--text-muted)",
            marginTop: 2,
          }}>
            总战力
          </div>
        </div>
        <span className={isRed ? "badge badge-red" : "badge badge-blue"} style={{ fontSize: 13, padding: "4px 14px" }}>
          {team.length} 人
        </span>
      </div>

      {/* ── Player Rows ── */}
      <div style={{ padding: "14px 24px" }}>
        {team.map((p) => {
          const detail = splitResult.playerDetails.find((d) => d.userId === p.userId);
          return (
            <div
              key={p.userId}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 0",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
              }}
            >
              {/* Player name */}
              <span style={{
                fontSize: 15,
                fontWeight: 600,
                color: "var(--text)",
                minWidth: 80,
              }}>
                {detail?.username || "?"}
              </span>

              {/* Role badge + Power */}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "3px 10px",
                  borderRadius: "var(--radius-sm)",
                  background: accentBg,
                  color: accentText,
                  border: `1px solid ${accentBorder}`,
                }}>
                  {ROLE_LABELS[p.roleType]}
                </span>
                <span style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: "var(--gold)",
                  minWidth: 48,
                  textAlign: "right" as const,
                  fontFamily: "monospace",
                }}>
                  {detail?.peakPower || 0}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Lineup Planning Toggle + Content ── */}
      <div style={{ borderTop: `1px solid ${accentBorder}` }}>
        <button
          onClick={() => setShowLineup(!showLineup)}
          style={{
            width: "100%",
            padding: "12px 24px",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text-secondary)",
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = "var(--text)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
          }}
        >
          <span style={{
            display: "inline-flex",
            fontSize: 10,
            transition: "transform 0.2s ease",
            transform: showLineup ? "rotate(90deg)" : "rotate(0deg)",
          }}>
            ▶
          </span>
          阵容演练
        </button>

        {showLineup && (
          <div className="animate-slide-up" style={{ padding: "0 24px 20px" }}>
            {loadingHeroes ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="skeleton" style={{ height: 42, borderRadius: "var(--radius-sm)" }} />
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {team.map((p) => {
                  const heroes = heroesByRole[p.roleType] || [];
                  const selectedHeroId = lineup[p.roleType];
                  const selectedHero = heroes.find((h) => h.heroId === selectedHeroId);
                  const detail = splitResult.playerDetails.find((d) => d.userId === p.userId);

                  return (
                    <div
                      key={p.userId}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 12px",
                        borderRadius: "var(--radius-sm)",
                        background: selectedHero ? "rgba(200, 169, 90, 0.06)" : "var(--bg-input)",
                        border: selectedHero ? "1px solid var(--gold-dim)" : "1px solid var(--border)",
                        transition: "border-color 0.15s, background 0.15s",
                      }}
                    >
                      {/* Player name */}
                      <span style={{
                        fontSize: 13,
                        fontWeight: 600,
                        minWidth: 72,
                        color: "var(--text)",
                      }}>
                        {detail?.username || "?"}
                      </span>

                      {/* Role tag */}
                      <span style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: 3,
                        background: accentBg,
                        color: accentText,
                        minWidth: 44,
                        textAlign: "center" as const,
                        whiteSpace: "nowrap" as const,
                      }}>
                        {ROLE_LABELS[p.roleType]}
                      </span>

                      {/* Hero select */}
                      <select
                        value={selectedHeroId ?? ""}
                        onChange={(e) =>
                          selectHero(p.roleType, e.target.value ? Number(e.target.value) : null)
                        }
                        style={{
                          flex: 1,
                          fontSize: 12,
                          fontWeight: selectedHero ? 600 : 400,
                          padding: "6px 10px",
                          background: "var(--bg-input)",
                          border: `1px solid ${selectedHero ? "var(--gold-dim)" : "var(--border)"}`,
                          borderRadius: "var(--radius-sm)",
                          color: selectedHero ? "var(--gold-light)" : "var(--text-secondary)",
                          outline: "none",
                          cursor: "pointer",
                          transition: "border-color 0.15s",
                        }}
                      >
                        <option value="">选择英雄...</option>
                        {heroes.map((h) => (
                          <option key={h.heroId} value={h.heroId}>
                            {h.name}{h.title ? ` · ${h.title}` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Reset button */}
            <button
              onClick={resetLineup}
              className="btn-subtle"
              style={{
                marginTop: 14,
                fontSize: 12,
                padding: "7px 18px",
                width: "100%",
              }}
            >
              清空
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// TournamentDetail — 赛事详情主页面
// ============================================================================
export function TournamentDetail() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [splitResult, setSplitResult] = useState<SplitResult | null>(null);
  const [adminMsg, setAdminMsg] = useState("");
  const [me, setMe] = useState<{ userId: number } | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState(false);
  const [announcementText, setAnnouncementText] = useState("");
  const [promotingId, setPromotingId] = useState<number | null>(null);
  const [demotingId, setDemotingId] = useState<number | null>(null);
  const [showExtendCalendar, setShowExtendCalendar] = useState(false);
  const [extendYear, setExtendYear] = useState(new Date().getFullYear());
  const [extendMonth, setExtendMonth] = useState(new Date().getMonth());
  const [extendDay, setExtendDay] = useState<number | null>(null);
  const [extendHour, setExtendHour] = useState(20);
  const [extendMin, setExtendMin] = useState(0);
  const { success, error: showError } = useToast();

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        setMe(d.user);
        setAuthChecked(true);
        if (!d.user) {
          router.replace(`/login?redirect=/tournaments/${id}`);
          return;
        }
        refreshTournament();
      });
  }, [id]);

  async function refreshTournament() {
    const res = await fetch(`/api/tournaments/${id}`);
    if (res.ok) {
      const data = await res.json();
      setTournament(data.tournament);
    } else if (res.status === 401 || res.status === 403) {
      router.replace("/login");
    }
  }

  async function join() {
    const res = await fetch(`/api/tournaments/${id}/join`, { method: "POST" });
    if (res.ok) { refreshTournament(); success("已加入战场！"); }
    else { const d = await res.json(); showError(d.error); }
  }

  async function leave() {
    const res = await fetch(`/api/tournaments/${id}/leave`, { method: "POST" });
    if (res.ok) { refreshTournament(); success("已退出战场"); }
    else { const d = await res.json(); showError(d.error); }
  }

  async function doSplit() {
    setAdminMsg("");
    if (playerCount < 10) {
      setAdminMsg(`分队需要至少10人，当前仅${playerCount}人`);
      return;
    }
    if (playerCount % 2 !== 0) {
      setAdminMsg(`需要偶数人数才能公平分队，当前${playerCount}人`);
      return;
    }
    const res = await fetch(`/api/tournaments/${id}/split`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setSplitResult(data);
      setTournament((prev) => prev ? { ...prev, status: "locked" } : null);
      if (data.isBeforeDeadline) {
        success("分队完成！（截止时间未到，提前锁定）");
      } else {
        success("分队完成！");
      }
    } else {
      setAdminMsg(data.error || "分队失败");
    }
  }

  function openExtendCalendar() {
    const d = tournament?.deadline ? new Date(tournament.deadline) : new Date();
    setExtendYear(d.getFullYear());
    setExtendMonth(d.getMonth());
    setExtendDay(d.getDate());
    setExtendHour(d.getHours());
    setExtendMin(d.getMinutes());
    setShowExtendCalendar(true);
  }

  async function doExtend() {
    if (!extendDay) return;
    const newDeadline = new Date(extendYear, extendMonth, extendDay, extendHour, extendMin);
    setShowExtendCalendar(false);
    setAdminMsg("");
    const res = await fetch(`/api/tournaments/${id}/extend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newDeadline: newDeadline.toISOString() }),
    });
    if (res.ok) { refreshTournament(); success("截止时间已延长"); }
    else { const d = await res.json(); showError(d.error); }
  }

  // ── SKELETON LOADING ──
  if (!tournament) return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "48px 16px" }}>
      {/* Title skeleton */}
      <div className="skeleton" style={{ height: 40, width: 240, marginBottom: 12, borderRadius: "var(--radius-sm)" }} />
      <div className="skeleton" style={{ height: 16, width: 320, marginBottom: 36, borderRadius: "var(--radius-sm)" }} />

      {/* Card skeleton */}
      <div className="card" style={{ padding: "24px", marginBottom: 20 }}>
        <div className="skeleton" style={{ height: 14, width: 80, marginBottom: 16, borderRadius: 4 }} />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton" style={{ height: 34, width: 110, borderRadius: "var(--radius-sm)" }} />
          ))}
        </div>
      </div>

      {/* Action skeleton */}
      <div style={{ display: "flex", gap: 12 }}>
        <div className="skeleton" style={{ height: 44, width: 140, borderRadius: "var(--radius-sm)" }} />
        <div className="skeleton" style={{ height: 44, width: 120, borderRadius: "var(--radius-sm)" }} />
      </div>
    </div>
  );

  // ── PERMISSION CHECKS ──
  const isAdmin = tournament.admins.some((a) => a.userId === me?.userId);
  const isOwner = tournament.admins.some((a) => a.userId === me?.userId && a.role === "owner");
  const isPlayer = tournament.players.some((p) => p.userId === me?.userId);
  const playerCount = tournament.players.filter((p) => !p.isSpectator).length;
  const spectatorCount = tournament.players.filter((p) => p.isSpectator).length;

  const statusLabel =
    tournament.status === "recruiting"
      ? "报名中"
      : tournament.status === "locked"
        ? "已锁定"
        : "已结束";

  const statusBadgeClass =
    tournament.status === "recruiting"
      ? "badge badge-green"
      : tournament.status === "locked"
        ? "badge badge-gold"
        : "badge badge-muted";

  return (
    <div
      className="animate-fade-in"
      style={{ maxWidth: 860, margin: "0 auto", padding: "40px 16px 64px" }}
    >

      {/* ================================================================== */}
      {/*  HEADER                                                             */}
      {/* ================================================================== */}
      <div style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        marginBottom: 24,
        gap: 16,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Tournament name */}
          <h1
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: "var(--text)",
              margin: "0 0 10px 0",
              lineHeight: 1.3,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap" as const,
            }}
          >
            {tournament.name}
          </h1>

          {/* Meta row: code | deadline | player count */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap" as const,
          }}>
            <span style={{
              fontSize: 13,
              color: "var(--text-muted)",
              fontFamily: "monospace",
              fontWeight: 600,
              letterSpacing: 1,
              padding: "3px 10px",
              background: "var(--bg-input)",
              borderRadius: "var(--radius-sm)",
            }}>
              #{tournament.code}
            </span>

            <span style={{ color: "var(--border)", fontSize: 10 }}>|</span>

            <span style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}>
              <span style={{ color: "var(--text-muted)" }}>截止</span>
              {new Date(tournament.deadline).toLocaleString("zh-CN")}
            </span>

            <span style={{ color: "var(--border)", fontSize: 10 }}>|</span>

            <span style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}>
              <span style={{
                fontSize: 15,
                fontWeight: 700,
                color: playerCount >= 10 ? "var(--gold)" : "var(--text)",
              }}>
                {playerCount}
              </span>
              人参战
            </span>
          </div>
        </div>

        {/* Status badge */}
        <div style={{ flexShrink: 0 }}>
          <span className={statusBadgeClass} style={{ fontSize: 14, padding: "7px 18px" }}>
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Admin / Toast message */}
      {adminMsg && (
        <div style={{
          marginBottom: 20,
          padding: "14px 18px",
          borderRadius: "var(--radius)",
          fontSize: 13,
          fontWeight: 500,
          background: adminMsg.includes("成功") || adminMsg.includes("延长") || adminMsg.includes("恭喜")
            ? "rgba(80, 176, 80, 0.06)"
            : "rgba(224, 80, 80, 0.06)",
          border: `1px solid ${
            adminMsg.includes("成功") || adminMsg.includes("延长") || adminMsg.includes("恭喜")
              ? "rgba(80, 176, 80, 0.2)"
              : "rgba(224, 80, 80, 0.2)"
          }`,
          color: adminMsg.includes("成功") || adminMsg.includes("延长") || adminMsg.includes("恭喜")
            ? "var(--green)"
            : "var(--red)",
        }}>
          {adminMsg}
        </div>
      )}

      {/* ================================================================== */}
      {/*  ADMIN CONTROLS (prominent card for admins)                         */}
      {/* ================================================================== */}
      {isAdmin && (
        <div className="card" style={{ marginBottom: 16, padding: "16px 20px", borderColor: "var(--gold)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: "var(--gold)" }}>
                ⚙ 房间管理
              </span>
              {isOwner && <span className="badge badge-gold">房主</span>}
              {!isOwner && <span className="badge badge-gold">次房主</span>}
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {isOwner ? "可任命次房主、踢人、分队、切换公开私有" : "可踢人、分队、延长截止（房主操作后5分钟内不可重复）"}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {/* Split button */}
              {(tournament.status === "recruiting" || tournament.status === "locked") && (
                <button
                  onClick={doSplit}
                  className="btn-primary"
                  disabled={playerCount < 10}
                  title={playerCount < 10 ? `需要10人，当前${playerCount}人` : playerCount % 2 !== 0 ? `需要偶数人数` : ""}
                  style={{ fontSize: 13, padding: "8px 18px" }}
                >
                  分队 ({playerCount}人)
                </button>
              )}
              {/* Extend button */}
              {(tournament.status === "recruiting" || tournament.status === "locked") && (
                <button onClick={openExtendCalendar} className="btn-ghost" style={{ fontSize: 13, padding: "8px 18px" }}>
                  延长截止
                </button>
              )}
              {/* Public toggle */}
              {tournament.status !== "finished" && (
                <button
                  onClick={async () => {
                    const res = await fetch(`/api/tournaments/${id}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ isPublic: !tournament.isPublic }),
                    });
                    if (res.ok) { refreshTournament(); success(tournament.isPublic ? "已设为私有" : "已设为公开"); }
                    else { const d = await res.json(); showError(d.error); }
                  }}
                  className="btn-ghost"
                  style={{ fontSize: 13, padding: "8px 18px" }}
                >
                  {tournament.isPublic ? "🔓 公开中" : "🔒 私有"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/*  LINEUP SIMULATOR (always visible when there are players)           */}
      {/* ================================================================== */}
      <LineupSimulator />

      {/* ================================================================== */}
      {/*  ANNOUNCEMENT                                                       */}
      {/* ================================================================== */}
      {editingAnnouncement ? (
        <div className="card animate-slide-up" style={{ marginBottom: 20, padding: "20px 24px" }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", display: "block", marginBottom: 12 }}>
            📢 编辑公告
          </span>
          <textarea
            value={announcementText}
            onChange={(e) => setAnnouncementText(e.target.value)}
            style={{
              width: "100%",
              minHeight: 100,
              background: "var(--bg-input)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text)",
              fontSize: 13,
              padding: "10px 14px",
              resize: "vertical" as const,
              outline: "none",
              boxSizing: "border-box" as const,
              marginBottom: 12,
            }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={async () => {
                const res = await fetch(`/api/tournaments/${id}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ announcement: announcementText || null }),
                });
                if (res.ok) {
                  success("公告已更新");
                  setEditingAnnouncement(false);
                  refreshTournament();
                } else {
                  const d = await res.json();
                  showError(d.error || "更新失败");
                }
              }}
              className="btn-primary"
              style={{ fontSize: 13, padding: "8px 20px" }}
            >
              保存
            </button>
            <button
              onClick={() => setEditingAnnouncement(false)}
              className="btn-ghost"
              style={{ fontSize: 13, padding: "8px 20px" }}
            >
              取消
            </button>
          </div>
        </div>
      ) : tournament.announcement ? (
        <div className="card" style={{ marginBottom: 20, padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
              📢 房间公告
            </span>
            {isAdmin && (
              <button
                onClick={() => { setEditingAnnouncement(true); setAnnouncementText(tournament.announcement || ""); }}
                className="btn-subtle"
                style={{ fontSize: 12, padding: "4px 12px" }}
              >
                编辑
              </button>
            )}
          </div>
          {tournament.announcement.split("\n").map((line, i) => (
            <p key={i} style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 4px", lineHeight: 1.6 }}>
              {line}
            </p>
          ))}
        </div>
      ) : null}

      {/* ================================================================== */}
      {/*  PLAYER LIST                                                        */}
      {/* ================================================================== */}
      <div
        className="card animate-slide-up"
        style={{ marginBottom: 20, padding: "20px 0 0" }}
      >
        <h3 className="section-title" style={{ padding: "0 20px" }}>
          选手列表 · {playerCount}人参战{spectatorCount > 0 ? ` · ${spectatorCount}人观战` : ""}
        </h3>

        {/* Player rows */}
        <div style={{ padding: "0 20px" }}>
          {tournament.players.map((p) => {
            const adminRole = tournament.admins.find((a) => a.userId === p.userId);
            const isMe = p.userId === me?.userId;

            // Determine team color & role from split result
            let teamColor: "red" | "blue" | null = null;
            let splitRole: string | null = null;
            if (splitResult) {
              const red = splitResult.teamRed.find((t) => t.userId === p.userId);
              if (red) { teamColor = "red"; splitRole = red.roleType; }
              else {
                const blue = splitResult.teamBlue.find((t) => t.userId === p.userId);
                if (blue) { teamColor = "blue"; splitRole = blue.roleType; }
              }
            }

            let roleLabel = "选手";
            let roleBadge = "badge";
            if (adminRole?.role === "owner") { roleLabel = "房主"; roleBadge = "badge badge-gold"; }
            else if (adminRole?.role === "co_owner") { roleLabel = "次房主"; roleBadge = "badge badge-gold"; }

            let typeLabel = "正式";
            if (p.isSpectator) typeLabel = "观众";
            else if (p.isTemporary) typeLabel = "临时";

            const canKick = isAdmin && p.userId !== me?.userId && adminRole?.role !== "owner";
            const canPromote = isOwner && !adminRole && !p.isSpectator && p.userId !== me?.userId;
            const canDemote = isOwner && adminRole?.role === "co_owner";

            const teamBg = teamColor === "red" ? "rgba(224,80,80,0.06)" : teamColor === "blue" ? "rgba(80,144,208,0.06)" : "transparent";
            const teamBorder = teamColor === "red" ? "rgba(224,80,80,0.15)" : teamColor === "blue" ? "rgba(80,144,208,0.15)" : "transparent";

            return (
              <div
                key={p.userId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 0",
                  borderBottom: "1px solid var(--border-light)",
                  background: isMe ? "rgba(200, 169, 90, 0.03)" : teamBg,
                  borderLeft: teamColor ? `3px solid ${teamColor === "red" ? "var(--red)" : "var(--blue)"}` : "3px solid transparent",
                  paddingLeft: teamColor ? 14 : 17,
                  gap: 12,
                }}
              >
                {/* Left: info */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  {/* Team indicator */}
                  {teamColor && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 3,
                      background: teamColor === "red" ? "rgba(224,80,80,0.15)" : "rgba(80,144,208,0.15)",
                      color: teamColor === "red" ? "var(--red)" : "var(--blue)",
                      flexShrink: 0,
                    }}>
                      {teamColor === "red" ? "红队" : "蓝队"}
                    </span>
                  )}
                  {/* Split role */}
                  {splitRole && (
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 3,
                      background: "rgba(240,192,64,0.08)", color: "var(--gold-light)",
                      border: "1px solid rgba(240,192,64,0.15)", flexShrink: 0,
                    }}>
                      {ROLE_LABELS[splitRole]}
                    </span>
                  )}
                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.isTemporary ? (p.tempName || "临时选手") : p.user.username}
                    {isMe && <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 400, marginLeft: 4 }}>(我)</span>}
                  </span>
                  <span className={roleBadge} style={{ fontSize: 11, padding: "2px 8px", flexShrink: 0 }}>
                    {roleLabel}
                  </span>
                  {typeLabel !== "正式" && (
                    <span className={p.isSpectator ? "badge badge-muted" : "badge"} style={{
                      fontSize: 11, padding: "2px 8px", flexShrink: 0,
                      ...(typeLabel === "临时" ? { background: "rgba(200,169,90,0.08)", color: "var(--gold-light)" } : {}),
                    }}>
                      {typeLabel}
                    </span>
                  )}
                </div>

                {/* Right: action buttons */}
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {canPromote && (
                    <button
                      onClick={async () => {
                        const username = p.isTemporary ? (p.tempName || "临时选手") : p.user.username;
                        if (!confirm(`确定将 ${username} 设为次房主吗？次房主可以管理房间、踢人、分队。`)) return;
                        setPromotingId(p.userId);
                        try {
                          const res = await fetch(`/api/tournaments/${id}/admin`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ targetUserId: p.userId, action: "promote" }),
                          });
                          if (res.ok) { refreshTournament(); success(`已将 ${username} 设为次房主`); }
                          else { const d = await res.json(); showError(d.error); }
                        } finally {
                          setPromotingId(null);
                        }
                      }}
                      disabled={promotingId === p.userId}
                      className="btn-subtle"
                      style={{ fontSize: 12, padding: "5px 12px", whiteSpace: "nowrap", opacity: promotingId === p.userId ? 0.6 : 1 }}
                    >
                      {promotingId === p.userId ? "..." : "设为次房主"}
                    </button>
                  )}
                  {canDemote && (
                    <button
                      onClick={async () => {
                        const username = p.isTemporary ? (p.tempName || "临时选手") : p.user.username;
                        if (!confirm(`确定撤销 ${username} 的次房主权限吗？`)) return;
                        setDemotingId(p.userId);
                        try {
                          const res = await fetch(`/api/tournaments/${id}/admin`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ targetUserId: p.userId, action: "demote" }),
                          });
                          if (res.ok) { refreshTournament(); success(`已撤销 ${username} 的次房主权限`); }
                          else { const d = await res.json(); showError(d.error); }
                        } finally {
                          setDemotingId(null);
                        }
                      }}
                      disabled={demotingId === p.userId}
                      className="btn-subtle"
                      style={{ fontSize: 12, padding: "5px 12px", color: "var(--red)", whiteSpace: "nowrap", opacity: demotingId === p.userId ? 0.6 : 1 }}
                    >
                      {demotingId === p.userId ? "..." : "撤销管理"}
                    </button>
                  )}
                  {canKick && (
                    <button
                      onClick={async () => {
                        const name = p.isTemporary ? (p.tempName || "临时选手") : p.user.username;
                        if (!confirm(`确定踢出 ${name} 吗？`)) return;
                        const res = await fetch(`/api/tournaments/${id}/kick`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ targetUserId: p.userId }),
                        });
                        if (res.ok) { refreshTournament(); success("已踢出"); }
                        else { const d = await res.json(); showError(d.error); }
                      }}
                      className="btn-subtle"
                      style={{ fontSize: 12, padding: "5px 12px", color: "var(--red)", whiteSpace: "nowrap" }}
                    >
                      踢出
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary bar */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "12px 20px",
          borderTop: "1px solid var(--border)",
          fontSize: 12,
          color: "var(--text-muted)",
        }}>
          <span>参赛 <b style={{ color: "var(--text)", fontWeight: 600 }}>{playerCount}</b> 人</span>
          {spectatorCount > 0 && <span>观战 <b style={{ color: "var(--text-secondary)", fontWeight: 600 }}>{spectatorCount}</b> 人</span>}
          <span style={{ marginLeft: "auto", fontSize: 11 }}>共 {tournament.players.length} 人</span>
        </div>
      </div>

      {/* ================================================================== */}
      {/*  JOIN / LEAVE (non-admin actions)                                    */}
      {/* ================================================================== */}
      {!isAdmin && (
        <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
          {tournament.status === "recruiting" && !isPlayer && (
            <button onClick={join} className="btn-primary" style={{ fontSize: 14, padding: "12px 28px" }}>
              加入赛事
            </button>
          )}
          {tournament.status === "recruiting" && isPlayer && (
            <button onClick={leave} className="btn-danger" style={{ fontSize: 14, padding: "12px 28px" }}>
              退出赛事
            </button>
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/*  SPLIT RESULT                                                       */}
      {/* ================================================================== */}
      {splitResult && (
        <div className="animate-slide-up" style={{ marginBottom: 32 }}>
          {/* Section title */}
          <h3 className="section-title" style={{ marginBottom: 16 }}>
            分队结果
          </h3>

          {/* Team cards side by side */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
          }}>
            <LineupPanel
              teamColor="red"
              splitResult={splitResult}
              teamPower={splitResult.teamRed.reduce((sum, p) => {
                const d = splitResult.playerDetails.find((x) => x.userId === p.userId);
                return sum + (d?.peakPower || 0);
              }, 0)}
            />
            <LineupPanel
              teamColor="blue"
              splitResult={splitResult}
              teamPower={splitResult.teamBlue.reduce((sum, p) => {
                const d = splitResult.playerDetails.find((x) => x.userId === p.userId);
                return sum + (d?.peakPower || 0);
              }, 0)}
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
          <div
            className="card"
            style={{
              marginTop: 16,
              padding: "24px 32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 48,
            }}
          >
            {/* Power diff */}
            <div style={{ textAlign: "center" as const }}>
              <div style={{
                fontSize: 11,
                color: "var(--text-muted)",
                marginBottom: 6,
              }}>
                战力差
              </div>
              <div style={{
                fontSize: 32,
                fontWeight: 700,
                fontFamily: "monospace",
                color: splitResult.powerDiff <= 50 ? "var(--green)" : "var(--gold)",
                lineHeight: 1,
              }}>
                {splitResult.powerDiff}
              </div>
              <div style={{
                fontSize: 11,
                color: splitResult.powerDiff <= 50 ? "var(--green)" : "var(--gold-light)",
                fontWeight: 500,
                marginTop: 4,
              }}>
                {splitResult.powerDiff <= 50 ? "完美平衡" : "基本均衡"}
              </div>
            </div>

            {/* Divider */}
            <div style={{
              width: 1,
              height: 48,
              background: "var(--border)",
            }} />

            {/* Preference score */}
            <div style={{ textAlign: "center" as const }}>
              <div style={{
                fontSize: 11,
                color: "var(--text-muted)",
                marginBottom: 6,
              }}>
                偏好分
              </div>
              <div style={{
                fontSize: 32,
                fontWeight: 700,
                fontFamily: "monospace",
                color: splitResult.preferenceScore >= 20 ? "var(--green)" : "var(--text)",
                lineHeight: 1,
              }}>
                {splitResult.preferenceScore}
              </div>
              <div style={{
                fontSize: 11,
                color: splitResult.preferenceScore >= 20 ? "var(--green)" : "var(--text-secondary)",
                fontWeight: 500,
                marginTop: 4,
              }}>
                {splitResult.preferenceScore >= 20 ? "高度契合" : splitResult.preferenceScore >= 10 ? "基本满足" : "一般"}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/*  EXTEND CALENDAR MODAL                                              */}
      {/* ================================================================== */}
      {showExtendCalendar && (
        <>
          <div
            onClick={() => setShowExtendCalendar(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000 }}
          />
          <div className="card" style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 1001, padding: 24, width: 320 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", margin: "0 0 16px" }}>选择新的截止时间</h3>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <button
                type="button"
                onClick={() => { if (extendMonth === 0) { setExtendMonth(11); setExtendYear(y => y - 1); } else setExtendMonth(m => m - 1); }}
                style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 18, padding: "4px 10px" }}
              >‹</button>
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{extendYear}年{extendMonth + 1}月</span>
              <button
                type="button"
                onClick={() => { if (extendMonth === 11) { setExtendMonth(0); setExtendYear(y => y + 1); } else setExtendMonth(m => m + 1); }}
                style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 18, padding: "4px 10px" }}
              >›</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 16 }}>
              {["一","二","三","四","五","六","日"].map(d => <div key={d} style={{ textAlign: "center", fontSize: 11, color: "var(--text-muted)", padding: "4px 0" }}>{d}</div>)}
              {(() => {
                const firstDay = new Date(extendYear, extendMonth, 1).getDay();
                const daysInMonth = new Date(extendYear, extendMonth + 1, 0).getDate();
                const blanks = firstDay === 0 ? 6 : firstDay - 1;
                const cells: React.ReactNode[] = [];
                for (let i = 0; i < blanks; i++) cells.push(<div key={"be" + i} />);
                for (let d = 1; d <= daysInMonth; d++) {
                  const isSel = extendDay === d;
                  const today = new Date();
                  const isToday = d === today.getDate() && extendMonth === today.getMonth() && extendYear === today.getFullYear();
                  cells.push(
                    <button
                      key={d} type="button" onClick={() => setExtendDay(d)}
                      style={{
                        textAlign: "center", padding: "6px 0", fontSize: 13, fontWeight: isSel ? 600 : 400,
                        background: isSel ? "var(--gold)" : "transparent", color: isSel ? "#1a1408" : isToday ? "var(--gold)" : "var(--text)",
                        border: isToday && !isSel ? "1px solid var(--gold)" : "1px solid transparent", borderRadius: "var(--radius-sm)", cursor: "pointer",
                      }}
                    >{d}</button>
                  );
                }
                return cells;
              })()}
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20 }}>
              <select value={extendHour} onChange={e => setExtendHour(parseInt(e.target.value))} style={{ flex: 1 }}>
                {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, "0")} 时</option>)}
              </select>
              <select value={extendMin} onChange={e => setExtendMin(parseInt(e.target.value))} style={{ flex: 1 }}>
                {[0,5,10,15,20,25,30,35,40,45,50,55].map(m => <option key={m} value={m}>{String(m).padStart(2, "0")} 分</option>)}
              </select>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowExtendCalendar(false)} className="btn-ghost" style={{ flex: 1, fontSize: 13 }}>取消</button>
              <button onClick={doExtend} disabled={!extendDay} className="btn-primary" style={{ flex: 1, fontSize: 13 }}>确认延长</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
