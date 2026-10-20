import type { Tournament } from "./types";

interface RoomVisitorPreviewProps {
  tournament: Pick<Tournament, "deadline" | "announcement">;
  playerCount: number;
  onJoin: () => void;
  joining?: boolean;
}

export function RoomVisitorPreview({ tournament, playerCount, onJoin, joining = false }: RoomVisitorPreviewProps) {

  return (
        <div className="yanwu-room-block" style={{
          marginBottom: 20,
          padding: "22px 24px",
          borderColor: "var(--gold)",
          background: "var(--gold-alpha-04)",
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.4, color: "var(--text-muted)", marginBottom: 12 }}>
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
            <button disabled={joining} onClick={onJoin} className="btn-primary" style={{ minHeight: 44, fontSize: 14, padding: "10px 24px", fontWeight: 600 }}>
              {joining ? "加入中…" : "确认加入"}
            </button>
          </div>
        </div>

  );
}
