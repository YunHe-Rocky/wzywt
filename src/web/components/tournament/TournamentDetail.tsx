"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarModal } from "@/web/components/ui/CalendarModal";
import { useParams, useRouter } from "next/navigation";
import { useToast } from "@/web/components/ui/Toast";
import { ROLE_LABELS } from "@/core/game";
import { TeamBuilder } from "@/web/components/tournament/TeamBuilder";
import { getCurrentUser } from "@/features/auth/client/api";
import {
  addTemporaryPlayer,
  extendTournament,
  getTournament,
  joinTournament,
  kickTournamentPlayer,
  leaveTournament,
  resignTournamentAdmin,
  splitTournament,
  updateTournament,
  updateTournamentAdmin,
} from "@/features/tournaments/client/api";

interface PlayerInfo {
  userId: number; user: {
    id: number;
    username: string;
    gameNickname?: string | null;
    gameId?: string | null;
  };
  isTemporary: boolean; tempName: string | null; isSpectator: boolean;
}
interface Tournament {
  id: number; name: string; code: string; deadline: string; status: string; isPublic: boolean;
  announcement?: string;
  playerCount?: number;
  splitResult?: unknown;
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
  const [canViewMemberIdentity, setCanViewMemberIdentity] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState(false);
  const [announcementText, setAnnouncementText] = useState("");
  const [promotingId, setPromotingId] = useState<number | null>(null);
  const [demotingId, setDemotingId] = useState<number | null>(null);
  const [showExtendCalendar, setShowExtendCalendar] = useState(false);
  const [addingFiller, setAddingFiller] = useState(false);
  const [splitTab, setSplitTab] = useState("result");
  const { success, error: showError } = useToast();

  const refreshTournament = useCallback(async () => {
    const { ok, status, data } = await getTournament(id);
    if (ok) {
      setTournament(data.tournament);
      setCanViewMemberIdentity(data.canViewMemberIdentity === true);
      if (data.splitResult) setSplitResult(data.splitResult);
    } else if (status === 401 || status === 403) {
      router.replace("/login");
    }
  }, [id, router]);

  useEffect(() => {
    getCurrentUser()
      .then(({ data }) => {
        setMe(data.user);
        setAuthChecked(true);
        if (!data.user) {
          router.replace(`/login?redirect=/tournaments/${id}`);
          return;
        }
        void refreshTournament();
      });
  }, [id, refreshTournament, router]);

  async function join() {
    const { ok, data } = await joinTournament(id);
    if (ok) { void refreshTournament(); success("已加入战场！"); }
    else showError(data.error || "加入失败");
  }

  async function leave() {
    const { ok, data } = await leaveTournament(id);
    if (ok) { void refreshTournament(); success("已退出战场"); }
    else showError(data.error || "退出失败");
  }

  async function doSplit() {
    setAdminMsg("");
    if (playerCount !== 10) {
      setAdminMsg(`分队需要正好10人，当前${playerCount}人`);
      return;
    }
    const { ok, data } = await splitTournament<SplitResult & { error?: string; isBeforeDeadline?: boolean }>(id);
    if (ok) {
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

  async function doExtend(datetime: string) {
    setShowExtendCalendar(false);
    setAdminMsg("");
    const { ok, data } = await extendTournament(id, new Date(datetime).toISOString());
    if (ok) { void refreshTournament(); success("截止时间已延长"); }
    else showError(data.error || "延长失败");
  }

  // ── SKELETON LOADING ──
  if (!tournament) return (
    <div className="page-shell page-shell--medium">
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
  const playerCount = tournament.playerCount
    ?? tournament.players.filter((p) => !p.isSpectator).length;
  const tempCount = tournament.players.filter((p) => p.isTemporary && !p.isSpectator).length;
  const realCount = playerCount - tempCount;
  const spectatorCount = tournament.players.filter((p) => p.isSpectator).length;
  const isOverdue = tournament.deadline ? new Date(tournament.deadline) < new Date() : false;

  const isFull = playerCount >= 10;
  const isSplit = tournament.status === "completed" && tournament.splitResult;
  const isCapacityLocked = tournament.status === "locked" && isFull && !isSplit;
  const statusLabel =
    isSplit ? "已分队"
    : isCapacityLocked ? "满员已截止"
    : tournament.status === "recruiting" ? "报名中"
    : "报名已截止";

  const statusBadgeClass =
    isSplit ? "badge badge-gold"
    : isCapacityLocked ? "badge badge-blue"
    : tournament.status === "recruiting" ? "badge badge-green"
    : "badge badge-muted";

  return (
    <div
      className="tournament-detail page-shell page-shell--medium animate-fade-in"
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

          {/* Deadline banner */}
          <div style={{
            background: isOverdue ? "var(--red)/8" : "var(--gold-alpha-08)",
            border: `1px solid ${isOverdue ? "var(--red)/20" : "var(--gold-alpha-10)"}`,
            borderRadius: 8, padding: "8px 16px", marginBottom: showExtendCalendar ? 0 : 16,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            flexWrap: "wrap", gap: 8,
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: isOverdue ? "var(--red)" : "var(--gold)" }}>
              ⏰ 截止时间：{new Date(tournament.deadline).toLocaleString("zh-CN")}
              {isOverdue ? "（已过期）" : ""}
            </span>
            {isAdmin && !splitResult && playerCount < 10 && (
              <button onClick={() => setShowExtendCalendar(true)}
                className="btn-subtle" style={{ fontSize: 12, padding: "4px 12px" }}>
                延长截止
              </button>
            )}
          </div>

          <CalendarModal
            open={showExtendCalendar}
            onClose={() => setShowExtendCalendar(false)}
            onSelect={doExtend}
            initialValue={tournament.deadline}
            minValue={tournament.deadline}
            title="延长报名截止时间"
            confirmLabel="确认延长"
          />

          {/* Meta row: code | player count */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap" as const,
          }}>
            <button
              onClick={() => {
                navigator.clipboard.writeText(tournament.code).then(() => success("房间号已复制: " + tournament.code));
              }}
              title="点击复制房间号"
              style={{
                fontSize: 13,
                color: "var(--text-muted)",
                fontFamily: "monospace",
                fontWeight: 600,
                letterSpacing: 1,
                padding: "3px 10px",
                background: "var(--bg-input)",
                borderRadius: "var(--radius-sm)",
                border: "none",
                cursor: "pointer",
              }}
            >
              #{tournament.code}
            </button>

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

      {/* Visitor preview — information first, member identities stay private */}
      {!isPlayer && !isAdmin && tournament.status === "recruiting" && tournament.isPublic && (
        <div className="card" style={{
          marginBottom: 20,
          padding: "22px 24px",
          borderColor: "var(--gold)",
          background: "var(--gold-alpha-04)",
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.4, color: "var(--text-muted)", marginBottom: 12 }}>
            加入前请确认房间信息
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>截止时间</span>
              <strong style={{ fontSize: 13, color: "var(--gold)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {new Date(tournament.deadline).toLocaleString("zh-CN")}
              </strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>报名情况</span>
              <strong style={{ fontSize: 13, color: "var(--text)" }}>{playerCount}/10</strong>
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>房间公告</div>
            <div style={{
              minHeight: 64,
              padding: "10px 12px",
              borderRadius: 8,
              background: "var(--bg-input)",
              color: tournament.announcement ? "var(--text-secondary)" : "var(--text-muted)",
              fontSize: 13,
              lineHeight: 1.7,
              whiteSpace: "pre-wrap",
            }}>
              {tournament.announcement || "房主暂未发布公告"}
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
            <button onClick={join} className="btn-primary" style={{ minHeight: 44, fontSize: 14, padding: "10px 24px", fontWeight: 600 }}>
              确认加入
            </button>
          </div>
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
              {/* Add filler player — owner only, recruiting/locked, not yet split */}
              {isOwner && (tournament.status === "recruiting" || tournament.status === "locked") && !splitResult && (
                <button
                  onClick={async () => {
                    setAddingFiller(true);
                    const n = tempCount + 1;
                    const { ok, data } = await addTemporaryPlayer(id, `补位${n}`);
                    setAddingFiller(false);
                    if (ok) { void refreshTournament(); success(`已添加补位${n}`); }
                    else showError(data.error || "添加补位失败");
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
                    const { ok, data } = await updateTournament(id, {
                      isPublic: !tournament.isPublic,
                    });
                    if (ok) { void refreshTournament(); success(tournament.isPublic ? "已设为私有" : "已设为公开"); }
                    else showError(data.error || "修改房间状态失败");
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
                    const { ok, data } = await resignTournamentAdmin(id);
                    if (ok) { void refreshTournament(); success("已辞去管理权限"); }
                    else showError(data.error || "辞去管理失败");
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
                const { ok, data } = await updateTournament(id, {
                  announcement: announcementText || null,
                });
                if (ok) {
                  success("公告已更新");
                  setEditingAnnouncement(false);
                  void refreshTournament();
                } else {
                  showError(data.error || "更新失败");
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
      ) : tournament.announcement && (isPlayer || isAdmin) ? (
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
      {(isPlayer || isAdmin) && (
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
            const canPromote = isOwner && !adminRole && !p.isSpectator && !p.isTemporary && p.userId !== me?.userId;
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
                <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1, flexWrap: "wrap", rowGap: 3 }}>
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
                    {p.isTemporary
                      ? (p.tempName || "临时选手")
                      : canViewMemberIdentity
                        ? (p.user.gameNickname || p.user.username)
                        : p.user.username}
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
                  {canViewMemberIdentity && !p.isTemporary && (
                    <span
                      style={{
                        flexBasis: "100%",
                        paddingLeft: teamColor || splitRole ? 0 : 0,
                        fontSize: 11,
                        lineHeight: 1.5,
                        color: "var(--text-muted)",
                        overflowWrap: "anywhere",
                      }}
                    >
                      账号：{p.user.username} · UID：#{p.user.id} · 游戏 ID：{p.user.gameId || "未填写"}
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
                          const { ok, data } = await updateTournamentAdmin(id, p.userId, "promote");
                          if (ok) { void refreshTournament(); success(`已将 ${username} 设为管理`); }
                          else showError(data.error || "设置管理失败");
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
                          const { ok, data } = await updateTournamentAdmin(id, p.userId, "demote");
                          if (ok) { void refreshTournament(); success(`已撤销 ${username} 的管理权限`); }
                          else showError(data.error || "撤销管理失败");
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
                        const { ok, data } = await kickTournamentPlayer(id, p.userId);
                        if (ok) { void refreshTournament(); success(p.isTemporary ? "已移除补位" : isCoOwner ? "已降级并踢出" : "已踢出"); }
                        else showError(data.error || "踢出失败");
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
      )}

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
      {/*  SPLIT RESULT / 英雄选人                                            */}
      {/* ================================================================== */}
      {splitResult && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {[{ k: "result", l: "分队结果" }, { k: "builder", l: "英雄阵容" }].map(t => (
              <button key={t.k} onClick={() => setSplitTab(t.k)}
                style={{ padding: "6px 20px", borderRadius: 8, fontSize: 14, fontWeight: splitTab === t.k ? 600 : 400, border: splitTab === t.k ? "1px solid var(--gold)" : "1px solid transparent", background: splitTab === t.k ? "var(--gold-alpha-08)" : "transparent", color: splitTab === t.k ? "var(--gold)" : "var(--text-secondary)", cursor: "pointer" }}>{t.l}</button>
            ))}
          </div>
          {splitTab === "result" && <div className="animate-slide-up">
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
                {Math.round(splitResult.strengthDiff)}
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
                {Math.round(splitResult.preferenceScore)}
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
        }
        {splitTab === "builder" && (
          <TeamBuilder
            tournamentId={tournament.id}
            teamRed={splitResult.teamRed}
            teamBlue={splitResult.teamBlue}
            players={tournament.players.map(p => ({
              userId: p.userId,
              username: p.isTemporary ? (p.tempName || "临时选手") : p.user.username,
              isTemp: p.isTemporary,
            }))}
            currentUserId={me?.userId || 0}
            isOwner={isOwner}
          />
        )}
        </div>
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
