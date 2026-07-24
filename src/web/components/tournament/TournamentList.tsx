"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarModal } from "@/web/components/ui/CalendarModal";
import {
  createTournament,
  joinTournament,
  joinTournamentByCode,
  listTournaments,
  type JoinRoomPreview,
} from "@/features/tournaments/client/api";
import { JoinRoomPreviewModal } from "@/web/components/tournament/JoinRoomPreviewModal";

interface Tournament {
  id: number; name: string; code: string; deadline: string; status: string;
  _count: { players: number };
  admins: { userId: number; role: string }[];
  splitResult?: unknown;
}

export function TournamentList() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [publicTournaments, setPublicTournaments] = useState<Tournament[]>([]);
  const [name, setName] = useState("");
  const [deadline, setDeadline] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [joinCode, setJoinCode] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [error, setError] = useState("");
  const [showCalendar, setShowCalendar] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [joinPreview, setJoinPreview] = useState<JoinRoomPreview | null>(null);
  const [joining, setJoining] = useState(false);
  const router = useRouter();

  useEffect(() => { refresh(); }, []);

  async function refresh() {
    const { data } = await listTournaments();
    if (data.tournaments) setTournaments(data.tournaments);
    if (data.publicTournaments) setPublicTournaments(data.publicTournaments);
  }

  async function create() {
    setError("");
    if (!name || !deadline) { setError("请填写完整"); return; }
    const { ok, data } = await createTournament({
      name,
      deadline: new Date(deadline).toISOString(),
      isPublic,
      announcement: announcement || undefined,
    });
    if (!ok) { setError(data.error || "创建失败"); return; }
    setName("");
    setDeadline("");
    setAnnouncement("");
    setShowMore(false);
    refresh();
    router.push(`/tournaments/${data.tournament.id}`);
  }

  async function joinByCode() {
    setError("");
    if (!joinCode.trim()) { setError("请输入赛事号"); return; }
    const { ok, data } = await joinTournamentByCode(joinCode.trim());
    if (!ok) { setError(data.error || "加入失败"); return; }
    setJoinPreview(data);
  }

  async function confirmJoin() {
    if (!joinPreview) return;
    if (joinPreview.existing) {
      router.push(`/tournaments/${joinPreview.room.id}`);
      return;
    }

    setJoining(true);
    const { ok, data } = await joinTournament(joinPreview.room.id);
    setJoining(false);
    if (!ok) {
      setError(data.error || "加入失败");
      setJoinPreview(null);
      return;
    }
    router.push(`/tournaments/${joinPreview.room.id}`);
  }

  return (
    <div className="stagger-enter tournament-list page-shell page-shell--medium">

      {/* ============ PAGE HEADER ============ */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text)", margin: "0 0 4px" }}>
          赛事大厅
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
          Honor of Kings · 荣耀战场
        </p>
      </div>

      {/* ============ TWO CARDS: JOIN + CREATE ============ */}
      <div className="lobby-cards" style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 24,
      }}>
        {/* Quick join card */}
        <div className="card" style={{ padding: "18px 20px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 10 }}>
            🔢 快速加入
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              placeholder="6 位房间号"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void joinByCode();
              }}
              maxLength={6}
              style={{
                flex: 1, fontSize: 15, fontWeight: 600, fontFamily: "monospace",
                letterSpacing: 3, textAlign: "center",
              }}
            />
            <button onClick={joinByCode} className="btn-primary"
              style={{ fontSize: 13, padding: "8px 18px", whiteSpace: "nowrap", flexShrink: 0 }}>
              加入
            </button>
          </div>
        </div>

        {/* Create card */}
        <div className="card" style={{ padding: "18px 20px", borderColor: "var(--gold)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--gold)", marginBottom: 10 }}>
            ⚔️ 创建赛事
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input type="text" placeholder="赛事名称" value={name} onChange={(e) => setName(e.target.value)} />
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => setShowCalendar(!showCalendar)}
                style={{
                  flex: 1, padding: "8px 10px", background: "var(--bg-input)",
                  border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                  color: deadline ? "var(--text)" : "var(--text-muted)", fontSize: 13,
                  textAlign: "left", cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                {deadline
                  ? new Date(deadline).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
                  : "截止时间"}
              </button>
              <button onClick={() => setShowMore(!showMore)}
                className="btn-subtle" style={{ fontSize: 12, padding: "8px 12px", whiteSpace: "nowrap", flexShrink: 0 }}>
                {showMore ? "收起" : "更多"}
              </button>
              <button onClick={create} className="btn-primary"
                style={{ fontSize: 13, padding: "8px 20px", whiteSpace: "nowrap", flexShrink: 0 }}>
                创建
              </button>
            </div>
          </div>

          {/* Calendar modal */}
          <CalendarModal
            open={showCalendar}
            onClose={() => setShowCalendar(false)}
            onSelect={setDeadline}
            title="设置报名截止时间"
            confirmLabel="使用此时间"
          />

          {/* Expanded options */}
          {showMore && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4, animation: "slide-up 0.15s ease-out" }}>
              <textarea placeholder="公告（可选）" value={announcement} onChange={(e) => setAnnouncement(e.target.value)}
                style={{ minHeight: 60, background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text)", fontSize: 13, padding: "8px 12px", resize: "vertical", outline: "none", width: "100%", boxSizing: "border-box" }} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>公开赛事</span>
                <button type="button" onClick={() => setIsPublic(!isPublic)}
                  style={{
                    width: 44, height: 26, borderRadius: 13, border: "none",
                    background: isPublic ? "var(--gold)" : "var(--border)", cursor: "pointer",
                    position: "relative", flexShrink: 0,
                  }}>
                  <span style={{ position: "absolute", top: 3, left: isPublic ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {joinPreview && (
        <JoinRoomPreviewModal
          preview={joinPreview}
          joining={joining}
          onClose={() => setJoinPreview(null)}
          onConfirm={confirmJoin}
        />
      )}

      {/* Error */}
      {error && (
        <p style={{
          color: "var(--red)", fontSize: 13, fontWeight: 500, marginBottom: 16,
          padding: "10px 14px", background: "rgba(224, 80, 80, 0.06)",
          border: "1px solid rgba(224, 80, 80, 0.2)", borderRadius: "var(--radius-sm)",
        }}>{error}</p>
      )}

      {/* ============ MY TOURNAMENTS ============ */}
      {tournaments.length === 0 && publicTournaments.length === 0 ? (
        <div style={{ textAlign: "center", padding: "64px 0" }}>
          <p style={{ color: "var(--text-muted)", fontSize: 15 }}>暂无赛事</p>
          <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 8 }}>创建或加入一个赛事开始吧</p>
        </div>
      ) : (
        <>
          {/* My tournaments */}
          {tournaments.length > 0 && (
            <>
              <div style={{ marginBottom: 12 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>我的赛事</h3>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
                {tournaments.map((t, i) => {
                  const isSplit2 = t.status === "completed" && t.splitResult;
                  const isFull2 = t._count.players >= 10;
                  const isCapacityLocked = isFull2 && t.status === "locked";
                  const statusText = isSplit2 ? "已分队" : isCapacityLocked ? "满员已截止" : t.status === "recruiting" ? "报名中" : "报名已截止";
                  const statusClass = isSplit2 ? "badge badge-gold" : isFull2 ? "badge badge-blue" : t.status === "recruiting" ? "badge badge-green" : "badge badge-muted";
                  return (
                    <button key={t.id} onClick={() => router.push(`/tournaments/${t.id}`)}
                      className="card" style={{
                        textAlign: "left", padding: "14px 18px", cursor: "pointer",
                        animation: `fade-in 0.3s ease-out ${i * 0.04}s both`,
                        transition: "border-color 0.15s",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", rowGap: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: "1 1 auto" }}>
                          <span style={{ fontWeight: 600, fontSize: 16, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                          <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "monospace", fontWeight: 600, letterSpacing: 1, padding: "2px 6px", background: "var(--bg-input)", borderRadius: "var(--radius-sm)", flexShrink: 0 }}>#{t.code}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
                            <span style={{ fontSize: 16, fontWeight: 700, color: t._count.players >= 10 ? "var(--gold)" : "var(--text)" }}>{t._count.players}</span>
                            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>人</span>
                          </div>
                          <span style={{ fontSize: 12, color: "var(--text-secondary)", fontFamily: "monospace", whiteSpace: "nowrap" }}>
                            {new Date(t.deadline).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <span className={statusClass}>{statusText}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Public tournaments */}
          {publicTournaments.length > 0 && (
            <>
              <div style={{ marginBottom: 12 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>公开赛事</h3>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {publicTournaments.map((t, i) => (
                  <button key={t.id} onClick={() => router.push(`/tournaments/${t.id}`)}
                    className="card" style={{
                      textAlign: "left", padding: "14px 18px", cursor: "pointer",
                      animation: `fade-in 0.3s ease-out ${i * 0.04}s both`,
                    }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", rowGap: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: "1 1 auto" }}>
                        <span style={{ fontWeight: 600, fontSize: 16, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                        <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "monospace", fontWeight: 600, letterSpacing: 1, padding: "2px 6px", background: "var(--bg-input)", borderRadius: "var(--radius-sm)", flexShrink: 0 }}>#{t.code}</span>
                        <span className="badge badge-green" style={{ fontSize: 10, flexShrink: 0 }}>公开</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
                          <span style={{ fontSize: 16, fontWeight: 700, color: t._count.players >= 10 ? "var(--gold)" : "var(--text)" }}>{t._count.players}</span>
                          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>/10人</span>
                        </div>
                        <span style={{ fontSize: 12, color: "var(--text-secondary)", fontFamily: "monospace" }}>
                          {new Date(t.deadline).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Create card needs relative positioning for calendar */}
      <style jsx>{`
        .lobby-cards > .card { position: relative; }
        @media (max-width: 640px) {
          .lobby-cards { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
