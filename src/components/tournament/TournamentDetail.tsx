"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";

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
  strengthDiff: number;
  preferenceScore: number;
  playerDetails: { userId: number; username: string }[];
}

const ROLE_LABELS: Record<string, string> = {
  top: "对抗路", jungle: "打野", mid: "中路", adc: "发育路", support: "游走",
};

type TeamColor = "red" | "blue";

// ============================================================================
// LineupPanel — 阵容演练 (inline component, fully client-side)
// ============================================================================
function LineupPanel({
  teamColor,
  splitResult,
}: {
  teamColor: TeamColor;
  splitResult: SplitResult;
}) {
  const team = teamColor === "red" ? splitResult.teamRed : splitResult.teamBlue;
  const isRed = teamColor === "red";

  const teamLabel = isRed ? "红队" : "蓝队";
  const accentColor = isRed ? "var(--red)" : "var(--blue)";
  const accentBg = isRed ? "rgba(224, 80, 80, 0.08)" : "rgba(80, 144, 208, 0.08)";
  const accentBorder = isRed ? "rgba(224, 80, 80, 0.18)" : "rgba(80, 144, 208, 0.18)";
  const accentText = isRed ? "var(--red)" : "var(--blue)";

  return (
    <div className={`${isRed ? "card-red" : "card-blue"} !p-0 overflow-hidden`}>
      <div className="flex items-center justify-between px-6 py-[18px] border-b" style={{ borderColor: accentBorder }}>
        <span className="text-xl font-bold text-text">{teamLabel}</span>
        <span className={`${isRed ? "badge badge-red" : "badge badge-blue"} !text-[13px] !px-3.5 !py-1`}>{team.length} 人</span>
      </div>
      <div className="px-6 py-3.5">
        {team.map((p) => {
          const detail = splitResult.playerDetails.find((d) => d.userId === p.userId);
          return (
            <div key={p.userId} className="flex items-center justify-between py-2.5 border-b border-white/5">
              <span className="text-[15px] font-semibold text-text min-w-[80px]">{detail?.username || "?"}</span>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-md border" style={{ background: accentBg, color: accentText, borderColor: accentBorder }}>
                {ROLE_LABELS[p.roleType]}
              </span>
            </div>
          );
        })}
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
  const [addingFiller, setAddingFiller] = useState(false);
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
      // Load persisted split result
      if (data.splitResult) {
        setSplitResult(data.splitResult);
      }
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
    if (playerCount !== 10) {
      setAdminMsg(`分队需要正好10人，当前${playerCount}人`);
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
  const tempCount = tournament.players.filter((p) => p.isTemporary && !p.isSpectator).length;
  const realCount = playerCount - tempCount;
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
      className="tournament-detail max-w-3xl mx-auto px-4 py-10 py-16 animate-fade-in"
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
                color: playerCount === 10 ? "var(--gold)" : "var(--text)",
              }}>
                {playerCount}
              </span>
              /10 人参战
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

      {/* Visitor banner — for public rooms when user is not a player */}
      {!isPlayer && !isAdmin && tournament.status === "recruiting" && tournament.isPublic && (
        <div className="card" style={{
          marginBottom: 20,
          padding: "16px 24px",
          borderColor: "var(--gold)",
          background: "var(--gold-alpha-04)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--gold)" }}>👋 你尚未加入此房间</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
              这是公开赛事，目前 {playerCount}/10 人参战，快来加入吧
            </div>
          </div>
          <button onClick={join} className="btn-primary" style={{ fontSize: 14, padding: "10px 24px", fontWeight: 600 }}>
            加入赛事
          </button>
        </div>
      )}

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
              {!isOwner && <span className="badge badge-gold">管理</span>}
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {isOwner ? "可任命管理、添加补位、踢人、分队、切换公开私有" : "可踢人、分队、延长截止（房主操作后5分钟内不可重复）"}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {/* Split button */}
              {(tournament.status === "recruiting" || tournament.status === "locked") && !splitResult && (
                <button
                  onClick={doSplit}
                  className="btn-primary"
                  disabled={playerCount !== 10}
                  title={playerCount !== 10 ? `需要正好10人，当前${playerCount}人` : "开始分队"}
                  style={{ fontSize: 13, padding: "8px 18px" }}
                >
                  分队 ({playerCount}/10)
                </button>
              )}
              {splitResult && (
                <span className="badge badge-gold" style={{ fontSize: 13, padding: "8px 18px" }}>
                  已分队
                </span>
              )}
              {/* Extend button */}
              {(tournament.status === "recruiting" || tournament.status === "locked") && (
                <button onClick={openExtendCalendar} className="btn-ghost" style={{ fontSize: 13, padding: "8px 18px" }}>
                  延长截止
                </button>
              )}
              {/* Add filler player — owner only, recruiting/locked, not yet split */}
              {isOwner && (tournament.status === "recruiting" || tournament.status === "locked") && !splitResult && (
                <button
                  onClick={async () => {
                    setAddingFiller(true);
                    const n = tempCount + 1;
                    const res = await fetch(`/api/tournaments/${id}/temp-player`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ tempName: `补位${n}` }),
                    });
                    setAddingFiller(false);
                    if (res.ok) { refreshTournament(); success(`已添加补位${n}`); }
                    else { const d = await res.json(); showError(d.error); }
                  }}
                  disabled={addingFiller}
                  className="btn-ghost"
                  style={{ fontSize: 13, padding: "8px 18px", opacity: addingFiller ? 0.6 : 1 }}
                >
                  {addingFiller ? "..." : "添加补位"}
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
              {/* Resign button -- only for co-owners */}
              {!isOwner && (
                <button
                  onClick={async () => {
                    if (!confirm("确定辞去管理权限吗？你将变为普通选手。")) return;
                    const res = await fetch(`/api/tournaments/${id}/admin/resign`, { method: "POST" });
                    if (res.ok) { refreshTournament(); success("已辞去管理权限"); }
                    else { const d = await res.json(); showError(d.error); }
                  }}
                  className="btn-subtle"
                  style={{ fontSize: 13, padding: "8px 18px", color: "var(--red)" }}
                >
                  辞去管理
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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
            else if (adminRole?.role === "co_owner") { roleLabel = "管理"; roleBadge = "badge badge-gold"; }

            let typeLabel = "正式";
            if (p.isSpectator) typeLabel = "观众";
            else if (p.isTemporary) typeLabel = "补位";

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
                  flexWrap: "wrap",
                  rowGap: 4,
                  padding: "10px 0",
                  borderBottom: "1px solid var(--border-light)",
                  background: isMe ? "var(--gold-alpha-04)" : teamBg,
                  borderLeft: teamColor ? `3px solid ${teamColor === "red" ? "var(--red)" : "var(--blue)"}` : "3px solid transparent",
                  paddingLeft: teamColor ? 14 : 17,
                  gap: 8,
                }}
              >
                {/* Left: info */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flexWrap: "wrap", rowGap: 3 }}>
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
                      background: "var(--gold-alpha-08)", color: "var(--gold-light)",
                      border: "1px solid var(--gold-alpha-20)", flexShrink: 0,
                    }}>
                      {ROLE_LABELS[splitRole]}
                    </span>
                  )}
                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
                    {p.isTemporary ? (p.tempName || "临时选手") : p.user.username}
                    {isMe && <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 400, marginLeft: 4 }}>(我)</span>}
                  </span>
                  <span className={roleBadge} style={{ fontSize: 11, padding: "2px 8px", flexShrink: 0 }}>
                    {roleLabel}
                  </span>
                  {typeLabel !== "正式" && (
                    <span className={p.isSpectator ? "badge badge-muted" : "badge"} style={{
                      fontSize: 11, padding: "2px 8px", flexShrink: 0,
                      ...(typeLabel === "临时" ? { background: "var(--gold-alpha-08)", color: "var(--gold-light)" } : {}),
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
                        if (!confirm(`确定将 ${username} 设为管理吗？管理可以管理房间、踢人、分队。`)) return;
                        setPromotingId(p.userId);
                        try {
                          const res = await fetch(`/api/tournaments/${id}/admin`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ targetUserId: p.userId, action: "promote" }),
                          });
                          if (res.ok) { refreshTournament(); success(`已将 ${username} 设为管理`); }
                          else { const d = await res.json(); showError(d.error); }
                        } finally {
                          setPromotingId(null);
                        }
                      }}
                      disabled={promotingId === p.userId}
                      className="btn-subtle"
                      style={{ fontSize: 12, padding: "5px 12px", whiteSpace: "nowrap", opacity: promotingId === p.userId ? 0.6 : 1 }}
                    >
                      {promotingId === p.userId ? "..." : "设为管理"}
                    </button>
                  )}
                  {canDemote && (
                    <button
                      onClick={async () => {
                        const username = p.isTemporary ? (p.tempName || "临时选手") : p.user.username;
                        if (!confirm(`确定撤销 ${username} 的管理权限吗？`)) return;
                        setDemotingId(p.userId);
                        try {
                          const res = await fetch(`/api/tournaments/${id}/admin`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ targetUserId: p.userId, action: "demote" }),
                          });
                          if (res.ok) { refreshTournament(); success(`已撤销 ${username} 的管理权限`); }
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
                        const name = p.isTemporary ? (p.tempName || "补位选手") : p.user.username;
                        const isCoOwner = adminRole?.role === "co_owner";
                        const msg = p.isTemporary
                          ? `确定移除补位选手 ${name} 吗？`
                          : isCoOwner
                            ? `确定将管理 ${name} 降级并踢出吗？`
                            : `确定踢出 ${name} 吗？`;
                        if (!confirm(msg)) return;
                        const res = await fetch(`/api/tournaments/${id}/kick`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ targetUserId: p.userId }),
                        });
                        if (res.ok) { refreshTournament(); success(p.isTemporary ? "已移除补位" : isCoOwner ? "已降级并踢出" : "已踢出"); }
                        else { const d = await res.json(); showError(d.error); }
                      }}
                      className="btn-subtle"
                      style={{ fontSize: 12, padding: "5px 12px", color: "var(--red)", whiteSpace: "nowrap" }}
                    >
                      {p.isTemporary ? "移除补位" : adminRole?.role === "co_owner" ? "降级并踢出" : "踢出"}
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
          <span>参赛 <b style={{ color: "var(--text)", fontWeight: 600 }}>{playerCount}</b>/10 人</span>
          {tempCount > 0 && <span>补位 <b style={{ color: "var(--text-secondary)", fontWeight: 600 }}>{tempCount}</b> 人</span>}
          {spectatorCount > 0 && <span>观战 <b style={{ color: "var(--text-secondary)", fontWeight: 600 }}>{spectatorCount}</b> 人</span>}
          <span style={{ marginLeft: "auto", fontSize: 11 }}>共 {tournament.players.length} 人</span>
        </div>
      </div>

      {/* ================================================================== */}
      {/*  LEAVE (non-admin players)                                            */}
      {/* ================================================================== */}
      {!isAdmin && isPlayer && tournament.status === "recruiting" && (
        <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
          <button onClick={leave} className="btn-danger" style={{ fontSize: 14, padding: "12px 28px" }}>
            退出赛事
          </button>
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
          <div className="card stats-bar !flex !items-center !justify-center !gap-12 !p-6 !p-8 !mt-4">
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
                color: splitResult.strengthDiff <= 200 ? "var(--green)" : "var(--gold)",
                lineHeight: 1,
              }}>
                {splitResult.strengthDiff}
              </div>
              <div style={{
                fontSize: 11,
                color: splitResult.strengthDiff <= 200 ? "var(--green)" : "var(--gold-light)",
                fontWeight: 500,
                marginTop: 4,
              }}>
                {splitResult.strengthDiff <= 200 ? "完美平衡" : splitResult.strengthDiff <= 500 ? "基本均衡" : "差距较大"}
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

      <style jsx>{`
        @media (max-width: 640px) {
          .tournament-detail {
            padding: 24px 12px 48px !important;
          }
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
