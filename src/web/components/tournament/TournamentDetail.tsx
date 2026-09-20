"use client";

import "@/web/styles/yanwu-workspaces.css";
import { useCallback, useEffect, useState } from "react";
import { CalendarModal } from "@/web/components/ui/CalendarModal";
import { useParams, useRouter } from "next/navigation";
import { useToast } from "@/web/components/ui/Toast";
import { copyText } from "@/web/components/ui/clipboard";
import { ROLE_LABELS } from "@/core/game";
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
  const id = params.id as string;
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [splitResult, setSplitResult] = useState<SplitResult | null>(null);
  const [adminMsg, setAdminMsg] = useState("");
  const [me, setMe] = useState<{ userId: number; role?: string } | null>(null);
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
      setSplitResult(data.splitResult || null);
    } else if (status === 401 || status === 403) {
      router.replace("/login");
    }
  }, [id, router]);

  useEffect(() => {
    getCurrentUser()
      .then(({ data }) => {
        setMe(data.user);
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
    <div className="tournament-detail page-shell page-shell--medium animate-fade-in">
      <RoomHeader tournament={tournament} permissions={permissions} playerCount={playerCount}
        hasSplitResult={!!splitResult} onCopyCode={copyRoomCode} onExtend={() => setShowExtendCalendar(true)} />
      <CalendarModal open={showExtendCalendar} onClose={() => setShowExtendCalendar(false)} onSelect={doExtend} initialValue={tournament.deadline} minValue={tournament.deadline} title="延长报名截止时间" confirmLabel="确认延长" />
      {splitResult && ownTeam && (
        <section aria-labelledby="my-split-title" style={{ marginBottom: 24 }}>
          <h2 id="my-split-title" className="section-title">我的分队结果</h2>
          <p className="yanwu-own-role">我的分路：{ROLE_LABELS[ownSlot?.roleType || ""] || "待确认"}</p>
          <LineupPanel teamColor={ownTeam} splitResult={splitResult} currentUserId={me?.userId} />
        </section>
      )}
      {/* Visitor preview excludes private member identities. */}
      {!isPlayer && !isAdmin && tournament.status === "recruiting" && tournament.isPublic && (
        <RoomVisitorPreview tournament={tournament} playerCount={playerCount} onJoin={join} />
      )}
      {adminMsg && <RoomAdminMessage adminMsg={adminMsg} />}
      {isAdmin && (
        <RoomAdminControls tournament={tournament} isOwner={isOwner} playerCount={playerCount}
          hasSplitResult={!!splitResult} addingFiller={addingFiller}
          actions={{ split: doSplit, addFiller, togglePublic, resignAdmin }} />
      )}
      <RoomAnnouncement announcement={tournament.announcement} canView={isPlayer || isAdmin} isAdmin={isAdmin}
        editingAnnouncement={editingAnnouncement} announcementText={announcementText}
        onTextChange={setAnnouncementText} onSave={saveAnnouncement}
        onCancel={() => setEditingAnnouncement(false)}
        onEdit={() => { setEditingAnnouncement(true); setAnnouncementText(tournament.announcement || ""); }} />
      {(isPlayer || isAdmin) && (
        <RoomMembers tournament={tournament} splitResult={splitResult} currentUserId={me?.userId}
          permissions={permissions} counts={counts} promotingId={promotingId} demotingId={demotingId}
          actions={{ promotePlayer, demotePlayer, kickPlayer }} />
      )}
      {!isAdmin && isPlayer && tournament.status === "recruiting" && (
        <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
          <button onClick={leave} className="btn-danger" style={{ fontSize: 14, padding: "12px 28px" }}>
            退出赛事
          </button>
        </div>
      )}
      {splitResult && (
        <RoomResultWorkspace tournament={tournament} splitResult={splitResult} ownTeam={ownTeam}
          currentUserId={me?.userId} isOwner={isOwner} canManageArchive={isAdmin || me?.role === "admin"}
          splitTab={splitTab} onTabChange={setSplitTab} />
      )}
    </div>
  );
}
