import { ROLE_LABELS } from "@/core/game";
import { UserAvatar } from "@/web/components/ui/UserAvatar";
import type { PlayerInfo, RoomCounts, RoomPermissions, SplitResult, Tournament } from "./types";

interface RoomMembersProps {
  tournament: Pick<Tournament, "players" | "admins">;
  splitResult: SplitResult | null;
  currentUserId?: number;
  permissions: RoomPermissions;
  counts: RoomCounts;
  promotingId: number | null;
  demotingId: number | null;
  actions: {
    promotePlayer: (player: PlayerInfo) => void;
    demotePlayer: (player: PlayerInfo) => void;
    kickPlayer: (player: PlayerInfo) => void;
  };
}

export function RoomMembers({ tournament, splitResult, currentUserId, permissions, counts, promotingId, demotingId, actions }: RoomMembersProps) {
  const { isAdmin, isOwner } = permissions;
  const { playerCount, tempCount, spectatorCount } = counts;
  return (
      <div
        className="yanwu-room-block"
        style={{ marginBottom: 20, padding: "20px 0 0" }}
      >
        <h3 className="section-title" style={{ padding: "0 20px" }}>
          选手列表 · {playerCount}人参战{spectatorCount > 0 ? ` · ${spectatorCount}人观战` : ""}
        </h3>

        {/* Player rows */}
        <div style={{ padding: "0 20px" }}>
          {tournament.players.map((p) => {
            const adminRole = tournament.admins.find((a) => a.userId === p.userId);
            const isMe = p.userId === currentUserId;

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

            const canKick = isAdmin && p.userId !== currentUserId && adminRole?.role !== "owner";
            const canPromote = isOwner && !adminRole && !p.isSpectator && !p.isTemporary && p.userId !== currentUserId;
            const canDemote = isOwner && adminRole?.role === "co_owner";

            const teamBg = teamColor === "red" ? "rgba(224,80,80,0.06)" : teamColor === "blue" ? "rgba(80,144,208,0.06)" : "transparent";

            return (
              <div
                key={p.userId}
                className="room-member-row"
                data-side={teamColor || undefined}
                data-self={isMe}
                style={{ background: isMe ? "var(--gold-alpha-04)" : teamBg }}
              >
                {/* Left: info */}
                <UserAvatar avatar={p.isTemporary ? null : p.user.avatar} name={p.isTemporary ? p.tempName || "临时选手" : p.user.username} />
                <div className="room-member-identity">
                  {/* Team indicator */}
                  {teamColor && (
                    <span style={{
                      fontSize: 12, fontWeight: 700, padding: "2px 6px", borderRadius: 3,
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
                      fontSize: 12, fontWeight: 600, padding: "2px 6px", borderRadius: 3,
                      background: "var(--gold-alpha-08)", color: "var(--gold-light)",
                      border: "1px solid var(--gold-alpha-20)", flexShrink: 0,
                    }}>
                      {ROLE_LABELS[splitRole]}
                    </span>
                  )}
                  <span className="room-member-name">
                    {p.isTemporary
                      ? (p.tempName || "临时选手")
                      : (p.user.gameNickname || p.user.username)}
                    {isMe && <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 400, marginLeft: 4 }}>(我)</span>}
                  </span>
                  <span className={roleBadge} style={{ fontSize: 12, padding: "2px 8px", flexShrink: 0 }}>
                    {roleLabel}
                  </span>
                  {typeLabel !== "正式" && (
                    <span className={p.isSpectator ? "badge badge-muted" : "badge"} style={{
                      fontSize: 12, padding: "2px 8px", flexShrink: 0,
                      ...(typeLabel === "临时" ? { background: "var(--gold-alpha-08)", color: "var(--gold-light)" } : {}),
                    }}>
                      {typeLabel}
                    </span>
                  )}
                </div>

                {/* Right: action buttons */}
                <div className="room-member-actions">
                  {canPromote && (
                    <button
                      onClick={() => actions.promotePlayer(p)}
                      disabled={promotingId === p.userId}
                      className="btn-subtle"
                      style={{ fontSize: 12, padding: "5px 12px", whiteSpace: "nowrap", opacity: promotingId === p.userId ? 0.6 : 1 }}
                    >
                      {promotingId === p.userId ? "..." : "设为管理"}
                    </button>
                  )}
                  {canDemote && (
                    <button
                      onClick={() => actions.demotePlayer(p)}
                      disabled={demotingId === p.userId}
                      className="btn-subtle"
                      style={{ fontSize: 12, padding: "5px 12px", color: "var(--red)", whiteSpace: "nowrap", opacity: demotingId === p.userId ? 0.6 : 1 }}
                    >
                      {demotingId === p.userId ? "..." : "撤销管理"}
                    </button>
                  )}
                  {canKick && (
                    <button
                      onClick={() => actions.kickPlayer(p)}
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
          flexWrap: "wrap",
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
          <span style={{ marginLeft: "auto", fontSize: 12 }}>共 {tournament.players.length} 人</span>
        </div>
      </div>

  );
}
