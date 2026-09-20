import { RoomCapacity } from "../RoomCapacity";
import type { RoomPermissions, Tournament } from "./types";

interface RoomHeaderProps {
  tournament: Tournament;
  permissions: RoomPermissions;
  playerCount: number;
  hasSplitResult: boolean;
  onCopyCode: () => void;
  onExtend: () => void;
}

export function RoomHeader({ tournament, permissions, playerCount, hasSplitResult, onCopyCode, onExtend }: RoomHeaderProps) {
  const { isAdmin, isOwner, isPlayer } = permissions;
  const isOverdue = tournament.deadline ? new Date(tournament.deadline) < new Date() : false;
  const isSplit = tournament.status === "completed" && tournament.splitResult;
  const isCapacityLocked = tournament.status === "locked" && playerCount >= 10 && !isSplit;
  const statusLabel = isSplit ? "已分队" : isCapacityLocked ? "满员已截止"
    : tournament.status === "recruiting" ? "报名中" : "报名已截止";
  const statusBadgeClass = isSplit ? "badge badge-gold" : isCapacityLocked ? "badge badge-blue"
    : tournament.status === "recruiting" ? "badge badge-green" : "badge badge-muted";
  return (
    <>
      <header className="yanwu-room-header">
        <div>
          <p className="feature-kicker">ROOM · 好友相聚</p>
          <h1>{tournament.name}</h1>
          <div className="yanwu-room-header-meta">
          <button
            type="button"
            className="btn-subtle"
            aria-label={`复制房间号 ${tournament.code}`}
            onClick={onCopyCode}
          >
            房间号 #{tournament.code}
          </button>
          <span className={statusBadgeClass}>{statusLabel}</span>
          <span>{isOwner ? "房主" : isAdmin ? "协管" : isPlayer ? "已加入" : "访客"}</span>
          </div>
        </div>
        <RoomCapacity count={playerCount} />
      </header>
      <div className="yanwu-room-deadline" data-overdue={isOverdue}>
        <span>
          报名截止 <time dateTime={tournament.deadline}>{new Date(tournament.deadline).toLocaleString("zh-CN")}</time>
          {isOverdue ? "（已过期）" : ""}
        </span>
        {isAdmin && !hasSplitResult && playerCount < 10 && (
          <button className="btn-subtle" onClick={onExtend}>
            延长截止
          </button>
        )}
      </div>
    </>
  );
}
