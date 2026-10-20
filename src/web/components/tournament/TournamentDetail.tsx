"use client";

import "@/web/styles/yanwu-workspaces.css";
import { useCallback, useEffect, useState } from "react";
import { CalendarModal } from "@/web/components/ui/CalendarModal";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useToast } from "@/web/components/ui/Toast";
import { copyText } from "@/web/components/ui/clipboard";
import { ROLE_LABELS } from "@/core/game";
import { getCurrentUser } from "@/features/auth/client/api";
import { protectedPageLoginRedirect } from "@/features/auth/redirect";
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

import type { PlayerInfo, SplitResult, Tournament } from "./detail/types";
import { LineupPanel } from "./detail/LineupPanel";
import { RoomSkeleton } from "./detail/RoomSkeleton";
import { RoomHeader } from "./detail/RoomHeader";
import { RoomVisitorPreview } from "./detail/RoomVisitorPreview";
import { RoomAdminMessage } from "./detail/RoomAdminMessage";
import { RoomAdminControls } from "./detail/RoomAdminControls";
import { RoomAnnouncement } from "./detail/RoomAnnouncement";
import { RoomMembers } from "./detail/RoomMembers";
import { RoomResultWorkspace } from "./detail/RoomResultWorkspace";

export function TournamentDetail() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const prefix = /^\/m(?:\/|$)/.test(pathname) ? "/m" : "";
  const id = params.id as string;
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [splitResult, setSplitResult] = useState<SplitResult | null>(null);
  const [adminMsg, setAdminMsg] = useState("");
  const [me, setMe] = useState<{ userId: number; role?: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [editingAnnouncement, setEditingAnnouncement] = useState(false);
  const [announcementText, setAnnouncementText] = useState("");
  const [promotingId, setPromotingId] = useState<number | null>(null);
  const [demotingId, setDemotingId] = useState<number | null>(null);
  const [showExtendCalendar, setShowExtendCalendar] = useState(false);
  const [addingFiller, setAddingFiller] = useState(false);
  const [splitTab, setSplitTab] = useState("result");
  const [primaryAction, setPrimaryAction] = useState<"join" | "leave" | "split" | null>(null);
  const { success, error: showError } = useToast();

  const redirectToLogin = useCallback(() => {
    router.replace(protectedPageLoginRedirect(pathname + window.location.search));
  }, [pathname, router]);

  const refreshTournament = useCallback(async (signal?: AbortSignal) => {
    try {
      const { ok, status, data } = await getTournament(id, signal);
      if (signal?.aborted) return;
      if (ok && data.tournament) {
        setLoadError(null);
        setTournament(data.tournament);
        setSplitResult(data.splitResult || null);
      } else if (status === 401) {
        redirectToLogin();
      } else {
        setLoadError(data.error || "战场加载失败，请稍后重试");
      }
    } catch (error) {
      if (!signal?.aborted) setLoadError(error instanceof Error ? error.message : "战场加载失败，请稍后重试");
    }
  }, [id, redirectToLogin]);

  useEffect(() => {
    const controller = new AbortController();
    setTournament(null);
    setSplitResult(null);
    setLoadError(null);
    getCurrentUser(controller.signal)
      .then(async ({ ok, status, data }) => {
        if (controller.signal.aborted) return;
        if (status === 401 || (ok && !data.user)) {
          redirectToLogin();
          return;
        }
        if (!ok) throw new Error(status === 403 ? "当前账号无法访问战场" : "登录状态检查失败，请稍后重试");
        setMe(data.user);
        await refreshTournament(controller.signal);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "战场加载失败，请稍后重试");
      });
    return () => controller.abort();
  }, [loadAttempt, refreshTournament, redirectToLogin]);

  async function join() {
    if (primaryAction) return;
    setPrimaryAction("join");
    try {
      const { ok, data } = await joinTournament(id);
      if (ok) { void refreshTournament(); success("已加入战场！"); }
      else showError(data.error || "加入失败");
    } catch { showError("加入失败，请检查连接后重试"); }
    finally { setPrimaryAction(null); }
  }

  async function leave() {
    if (primaryAction || !confirm("确定退出赛事吗？退出后将不再占用参赛位置。")) return;
    setPrimaryAction("leave");
    try {
      const { ok, data } = await leaveTournament(id);
      if (ok) { void refreshTournament(); success("已退出战场"); }
      else showError(data.error || "退出失败");
    } catch { showError("退出失败，请检查连接后重试"); }
    finally { setPrimaryAction(null); }
  }

  async function doSplit() {
    if (primaryAction) return;
    setAdminMsg("");
    if (playerCount !== 10) {
      setAdminMsg(`分队需要正好10人，当前${playerCount}人`);
      return;
    }
    setPrimaryAction("split");
    try {
      const { ok, data } = await splitTournament<SplitResult & { error?: string; isBeforeDeadline?: boolean }>(id);
      if (ok) {
        setSplitResult(data);
        setTournament((prev) => prev ? { ...prev, status: "completed", splitResult: data } : null);
        if (data.isBeforeDeadline) {
          success("分队完成！（截止时间未到，提前锁定）");
        } else {
          success("分队完成！");
        }
      } else {
        setAdminMsg(data.error || "分队失败");
      }
    } catch { setAdminMsg("分队失败，请检查连接后重试；当前成员名单会保留。"); }
    finally { setPrimaryAction(null); }
  }

  async function doExtend(datetime: string) {
    setShowExtendCalendar(false);
    setAdminMsg("");
    const { ok, data } = await extendTournament(id, new Date(datetime).toISOString());
    if (ok) { void refreshTournament(); success("截止时间已延长"); }
    else showError(data.error || "延长失败");
  }

  async function copyRoomCode() {
    if (!tournament) return;
    try {
      await copyText(tournament.code);
      success("房间号已复制: " + tournament.code);
    } catch {
      showError("复制失败，请手动复制房间号：" + tournament.code);
    }
  }

  async function addFiller() {
    setAddingFiller(true);
    const n = tempCount + 1;
    const { ok, data } = await addTemporaryPlayer(id, `补位${n}`);
    setAddingFiller(false);
    if (ok) { void refreshTournament(); success(`已添加补位${n}`); }
    else showError(data.error || "添加补位失败");
  }

  async function togglePublic() {
    if (!tournament) return;
    const { ok, data } = await updateTournament(id, {
      isPublic: !tournament.isPublic,
    });
    if (ok) { void refreshTournament(); success(tournament.isPublic ? "已设为私有" : "已设为公开"); }
    else showError(data.error || "修改房间状态失败");
  }

  async function resignAdmin() {
    if (!confirm("确定辞去管理权限吗？你将变为普通选手。")) return;
    const { ok, data } = await resignTournamentAdmin(id);
    if (ok) { void refreshTournament(); success("已辞去管理权限"); }
    else showError(data.error || "辞去管理失败");
  }

  async function saveAnnouncement() {
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
  }

  async function promotePlayer(p: PlayerInfo) {
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
  }

  async function demotePlayer(p: PlayerInfo) {
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
  }

  async function kickPlayer(p: PlayerInfo) {
    const name = p.isTemporary ? (p.tempName || "补位选手") : p.user.username;
    const isCoOwner = tournament?.admins.some(a => a.userId === p.userId && a.role === "co_owner");
    const msg = p.isTemporary
      ? `确定移除补位选手 ${name} 吗？`
      : isCoOwner
        ? `确定将管理 ${name} 降级并踢出吗？`
        : `确定踢出 ${name} 吗？`;
    if (!confirm(msg)) return;
    const { ok, data } = await kickTournamentPlayer(id, p.userId);
    if (ok) { void refreshTournament(); success(p.isTemporary ? "已移除补位" : isCoOwner ? "已降级并踢出" : "已踢出"); }
    else showError(data.error || "踢出失败");
  }

  if (loadError) return (
    <div className="page-shell page-shell--medium">
      <div className="card" role="alert">
        <h1 className="text-xl font-bold text-text">暂时无法进入战场</h1>
        <p className="mt-3 text-text-muted break-words">{loadError}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" className="btn-primary" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>重试</button>
          <Link className="btn-secondary" href={`${prefix}/tournaments`}>返回战场列表</Link>
        </div>
      </div>
    </div>
  );

  if (!tournament) return <RoomSkeleton />;

  const isAdmin = tournament.admins.some((a) => a.userId === me?.userId);
  const isOwner = tournament.admins.some((a) => a.userId === me?.userId && a.role === "owner");
  const isPlayer = tournament.players.some((p) => p.userId === me?.userId);
  const playerCount = tournament.playerCount
    ?? tournament.players.filter((p) => !p.isSpectator).length;
  const tempCount = tournament.players.filter((p) => p.isTemporary && !p.isSpectator).length;
  const spectatorCount = tournament.players.filter((p) => p.isSpectator).length;
  const permissions = { isAdmin, isOwner, isPlayer };
  const counts = { playerCount, tempCount, spectatorCount };
  const ownTeam = splitResult?.teamRed.some(p => p.userId === me?.userId) ? "red"
    : splitResult?.teamBlue.some(p => p.userId === me?.userId) ? "blue" : null;
  const ownSlot = ownTeam && splitResult
    ? (ownTeam === "red" ? splitResult.teamRed : splitResult.teamBlue).find(p => p.userId === me?.userId)
    : undefined;

  return (
    <div className="tournament-detail page-shell page-shell--wide animate-fade-in">
      <RoomHeader tournament={tournament} permissions={permissions} playerCount={playerCount}
        hasSplitResult={!!splitResult} onCopyCode={copyRoomCode} onExtend={() => setShowExtendCalendar(true)} />
      {(isPlayer || isAdmin) && <nav className="room-task-nav" aria-label="房间任务导航">
        {ownTeam && <a href="#my-lineup">我的分队</a>}
        <a href="#room-members">选手名单 <span>{playerCount}/10</span></a>
        {isAdmin && <a href="#room-management">房间管理</a>}
        {splitResult && <a href="#room-results">分队与比赛档案</a>}
      </nav>}
      <CalendarModal open={showExtendCalendar} onClose={() => setShowExtendCalendar(false)} onSelect={doExtend} initialValue={tournament.deadline} minValue={tournament.deadline} title="延长报名截止时间" confirmLabel="确认延长" />
      {splitResult && ownTeam && (
        <section id="my-lineup" className="room-own-lineup" aria-labelledby="my-split-title" tabIndex={-1}>
          <h2 id="my-split-title" className="section-title">我的分队结果</h2>
          <p className="yanwu-own-role">我的分路：{ROLE_LABELS[ownSlot?.roleType || ""] || "待确认"}</p>
          <LineupPanel teamColor={ownTeam} splitResult={splitResult} currentUserId={me?.userId} />
        </section>
      )}
      {/* Visitor preview excludes private member identities. */}
      {!isPlayer && !isAdmin && tournament.status === "recruiting" && tournament.isPublic && (
        <RoomVisitorPreview tournament={tournament} playerCount={playerCount} joining={primaryAction === "join"} onJoin={join} />
      )}
      {adminMsg && <RoomAdminMessage adminMsg={adminMsg} />}
      <div className="room-workspace-layout" data-has-sidebar={isPlayer || isAdmin}>
      {(isPlayer || isAdmin) && <aside className="room-workspace-sidebar" aria-label="房间信息与管理">
      {isAdmin && (
        <RoomAdminControls tournament={tournament} isOwner={isOwner} playerCount={playerCount}
          hasSplitResult={!!splitResult} addingFiller={addingFiller} splitting={primaryAction === "split"}
          actions={{ split: doSplit, addFiller, togglePublic, resignAdmin }} />
      )}
      <RoomAnnouncement announcement={tournament.announcement} canView={isPlayer || isAdmin} isAdmin={isAdmin}
        editingAnnouncement={editingAnnouncement} announcementText={announcementText}
        onTextChange={setAnnouncementText} onSave={saveAnnouncement}
        onCancel={() => setEditingAnnouncement(false)}
        onEdit={() => { setEditingAnnouncement(true); setAnnouncementText(tournament.announcement || ""); }} />
      {!isAdmin && isPlayer && tournament.status === "recruiting" && (
        <div className="room-membership-actions">
          <p>已为你保留参赛位置，等待人齐后由房主分队。</p>
          <button onClick={leave} disabled={Boolean(primaryAction)} className="btn-subtle room-leave-button">
            {primaryAction === "leave" ? "退出中…" : "退出赛事"}
          </button>
        </div>
      )}
      </aside>}
      <div className="room-workspace-main">
      {(isPlayer || isAdmin) && (
        <section id="room-members" tabIndex={-1} aria-label="选手名单">
        <RoomMembers tournament={tournament} splitResult={splitResult} currentUserId={me?.userId}
          permissions={permissions} counts={counts} promotingId={promotingId} demotingId={demotingId}
          actions={{ promotePlayer, demotePlayer, kickPlayer }} />
        </section>
      )}
      {splitResult && (
        <section id="room-results" tabIndex={-1} aria-label="分队与比赛档案">
        <RoomResultWorkspace tournament={tournament} splitResult={splitResult} ownTeam={ownTeam}
          currentUserId={me?.userId} isOwner={isOwner} canManageArchive={isAdmin || me?.role === "admin"}
          splitTab={splitTab} onTabChange={setSplitTab} />
        </section>
      )}
      </div>
      </div>
    </div>
  );
}
