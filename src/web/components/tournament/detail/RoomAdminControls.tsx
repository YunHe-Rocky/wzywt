import type { Tournament } from "./types";

interface RoomAdminControlsProps {
  tournament: Pick<Tournament, "status" | "isPublic">;
  isOwner: boolean;
  playerCount: number;
  hasSplitResult: boolean;
  addingFiller: boolean;
  actions: {
    split: () => void;
    addFiller: () => void;
    togglePublic: () => void;
    resignAdmin: () => void;
  };
}

export function RoomAdminControls({ tournament, isOwner, playerCount, hasSplitResult, addingFiller, actions }: RoomAdminControlsProps) {

  return (
        <div className="yanwu-room-admin">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: "var(--gold)" }}>
                房间管理
              </span>
              {isOwner && <span className="badge badge-gold">房主</span>}
              {!isOwner && <span className="badge badge-gold">管理</span>}
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {isOwner ? "可任命管理、添加补位、踢人、分队、切换公开私有" : "可踢人、分队、延长截止（房主操作后5分钟内不可重复）"}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {/* Split button */}
              {(tournament.status === "recruiting" || tournament.status === "locked") && !hasSplitResult && (
                <button
                  onClick={actions.split}
                  className="btn-primary"
                  disabled={playerCount !== 10}
                  title={playerCount !== 10 ? `需要正好10人，当前${playerCount}人` : "开始分队"}
                  style={{ fontSize: 13, padding: "8px 18px" }}
                >
                  分队 ({playerCount}/10)
                </button>
              )}
              {hasSplitResult && (
                <span className="badge badge-gold" style={{ fontSize: 13, padding: "8px 18px" }}>
                  已分队
                </span>
              )}
              {/* Add filler player — owner only, recruiting/locked, not yet split */}
              {isOwner && (tournament.status === "recruiting" || tournament.status === "locked") && !hasSplitResult && (
                <button
                  onClick={actions.addFiller}
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
                  onClick={actions.togglePublic}
                  className="btn-ghost"
                  style={{ fontSize: 13, padding: "8px 18px" }}
                >
                  {tournament.isPublic ? "公开中" : "私有"}
                </button>
              )}
              {/* Resign button -- only for co-owners */}
              {!isOwner && (
                <button
                  onClick={actions.resignAdmin}
                  className="btn-subtle"
                  style={{ fontSize: 13, padding: "8px 18px", color: "var(--red)" }}
                >
                  辞去管理
                </button>
              )}
            </div>
          </div>
        </div>

  );
}
