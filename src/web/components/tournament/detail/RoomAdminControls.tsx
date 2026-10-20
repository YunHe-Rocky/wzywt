import type { Tournament } from "./types";

interface RoomAdminControlsProps {
  tournament: Pick<Tournament, "status" | "isPublic">;
  isOwner: boolean;
  playerCount: number;
  hasSplitResult: boolean;
  addingFiller: boolean;
  splitting?: boolean;
  actions: {
    split: () => void;
    addFiller: () => void;
    togglePublic: () => void;
    resignAdmin: () => void;
  };
}

export function RoomAdminControls({ tournament, isOwner, playerCount, hasSplitResult, addingFiller, splitting = false, actions }: RoomAdminControlsProps) {

  return (
        <section id="room-management" className="yanwu-room-admin" aria-labelledby="room-management-title" tabIndex={-1}>
          <div className="room-management-heading">
            <h2 id="room-management-title">房间管理</h2>
            <span className="badge badge-gold">{isOwner ? "房主" : "管理"}</span>
          </div>
          <p className="room-management-next">{hasSplitResult ? "分队已完成，可在比赛档案中继续记录对局。" : playerCount === 10 ? "10 位选手已就位，可以开始分队。" : playerCount < 10 ? `还差 ${10 - playerCount} 位选手，分享房间号邀请好友。` : "当前人数超过 10 位，请先调整参赛名单。"}</p>
          <div className="room-management-actions">
              {/* Split button */}
              {(tournament.status === "recruiting" || tournament.status === "locked") && !hasSplitResult && (
                <button
                  onClick={actions.split}
                  className="btn-primary"
                  disabled={playerCount !== 10 || splitting || addingFiller}
                  title={playerCount !== 10 ? `需要正好10人，当前${playerCount}人` : "开始分队"}
                  style={{ fontSize: 13, padding: "8px 18px" }}
                >
                  {splitting ? "正在分队…" : `分队 (${playerCount}/10)`}
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
                  disabled={addingFiller || splitting || playerCount >= 10}
                  className="btn-ghost"
                  style={{ fontSize: 13, padding: "8px 18px", opacity: addingFiller ? 0.6 : 1 }}
                >
                  {addingFiller ? "添加中…" : "添加补位"}
                </button>
              )}

          </div>
          <div className="room-management-secondary">
              {tournament.status !== "finished" && (
                <button
                  onClick={actions.togglePublic}
                  className="btn-ghost"
                  style={{ fontSize: 13, padding: "8px 18px" }}
                >
                  {tournament.isPublic ? "公开中" : "私有"}
                </button>
              )}
              <p>{tournament.isPublic ? "公开房间会出现在赛事大厅。" : "私有房间仅通过房间号加入。"}</p>
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
          {!isOwner && <p className="room-management-hint">可踢人、分队、延长截止；房主操作后 5 分钟内不可重复。</p>}
        </section>

  );
}
