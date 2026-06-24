"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Tournament {
  id: number; name: string; code: string; deadline: string; status: string;
  _count: { players: number };
  admins: { userId: number; role: string }[];
}

export function TournamentList() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [publicTournaments, setPublicTournaments] = useState<Tournament[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [deadline, setDeadline] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [joinCode, setJoinCode] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [error, setError] = useState("");
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedHour, setSelectedHour] = useState(20);
  const [selectedMinute, setSelectedMinute] = useState(0);
  const router = useRouter();

  useEffect(() => { refresh(); }, []);

  async function refresh() {
    const res = await fetch("/api/tournaments");
    const data = await res.json();
    if (data.tournaments) setTournaments(data.tournaments);
    if (data.publicTournaments) setPublicTournaments(data.publicTournaments);
  }

  async function create() {
    setError("");
    if (!name || !deadline) { setError("请填写完整"); return; }
    const res = await fetch("/api/tournaments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, deadline: new Date(deadline).toISOString(), isPublic, announcement: announcement || undefined }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); return; }
    setShowCreate(false);
    setName("");
    setDeadline("");
    refresh();
    router.push(`/tournaments/${data.tournament.id}`);
  }

  async function joinByCode() {
    setError("");
    if (!joinCode.trim()) { setError("请输入赛事号"); return; }
    const res = await fetch("/api/tournaments/join-by-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: joinCode.trim() }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); return; }
    router.push(`/tournaments/${data.tournamentId}`);
  }

  return (
    <div className="tournament-list" style={{ maxWidth: 780, margin: "0 auto", padding: "48px 16px 64px" }}>

      {/* ============ PAGE HEADER ============ */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 8,
      }}>
        <h1 style={{
          fontSize: 28,
          fontWeight: 700,
          color: "var(--text)",
          margin: 0,
          lineHeight: 1.3,
        }}>
          赛事大厅
        </h1>
        <button
          onClick={() => { setShowCreate(!showCreate); setError(""); }}
          className="btn-primary"
          style={{ fontSize: 14, padding: "12px 24px" }}
        >
          {showCreate ? "收起" : "创建赛事"}
        </button>
      </div>

      {/* Subtitle */}
      <p style={{
        fontSize: 13,
        color: "var(--text-muted)",
        marginBottom: 28,
      }}>
        Honor of Kings · 荣耀战场
      </p>

      {/* ============ JOIN BY CODE ============ */}
      <div className="card" style={{ marginBottom: 20, padding: "20px 24px" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <label style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text-secondary)",
            whiteSpace: "nowrap" as const,
          }}>
            快速加入
          </label>
          <div style={{ flex: 1 }}>
            <input
              type="text"
              placeholder="输入 6 位房间号"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              maxLength={6}
              style={{
                fontSize: 16,
                fontWeight: 600,
                fontFamily: "monospace",
                letterSpacing: 3,
                textAlign: "center" as const,
                textTransform: "uppercase" as const,
              }}
            />
          </div>
          <button
            onClick={joinByCode}
            className="btn-primary"
            style={{ fontSize: 13, padding: "10px 24px", whiteSpace: "nowrap" as const }}
          >
            加入战场
          </button>
        </div>
      </div>

      {/* ============ CREATE FORM ============ */}
      {showCreate && (
        <div
          className="card"
          style={{
            marginBottom: 20,
            padding: "24px",
            animation: "slide-up 0.2s ease-out",
          }}
        >
          <div style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text-secondary)",
            marginBottom: 16,
          }}>
            创建新赛事
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <input
              type="text"
              placeholder="赛事名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {/* Calendar picker */}
            <div style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setShowCalendar(!showCalendar)}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  background: "var(--bg-input)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  color: deadline ? "var(--text)" : "var(--text-muted)",
                  fontSize: 14,
                  textAlign: "left" as const,
                  cursor: "pointer",
                }}
              >
                {deadline
                  ? new Date(deadline).toLocaleString("zh-CN", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })
                  : "选择截止时间"}
              </button>
              {showCalendar && (
                <div
                  className="card"
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    marginTop: 4,
                    padding: 16,
                    zIndex: 10,
                    minWidth: 280,
                  }}
                >
                  {/* Month navigation */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (calendarMonth === 0) { setCalendarMonth(11); setCalendarYear((y) => y - 1); }
                        else setCalendarMonth((m) => m - 1);
                      }}
                      style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 18, padding: "2px 8px" }}
                    >
                      ‹
                    </button>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
                      {calendarYear}年{calendarMonth + 1}月
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (calendarMonth === 11) { setCalendarMonth(0); setCalendarYear((y) => y + 1); }
                        else setCalendarMonth((m) => m + 1);
                      }}
                      style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 18, padding: "2px 8px" }}
                    >
                      ›
                    </button>
                  </div>

                  {/* Day-of-week headers */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4, textAlign: "center" as const }}>
                    {["日", "一", "二", "三", "四", "五", "六"].map((d) => (
                      <span key={d} style={{ fontSize: 11, color: "var(--text-muted)", padding: "4px 0" }}>{d}</span>
                    ))}
                  </div>

                  {/* Day grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
                    {(() => {
                      const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
                      const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
                      const today = new Date();
                      const cells: (number | null)[] = [];
                      for (let i = 0; i < firstDay; i++) cells.push(null);
                      for (let d = 1; d <= daysInMonth; d++) cells.push(d);

                      return cells.map((day, i) => {
                        if (day === null) return <div key={`empty-${i}`} />;
                        const isToday = calendarYear === today.getFullYear() && calendarMonth === today.getMonth() && day === today.getDate();
                        const isSelected = day === selectedDay;
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => {
                              const month = String(calendarMonth + 1).padStart(2, "0");
                              const dayStr = String(day).padStart(2, "0");
                              const hour = String(selectedHour).padStart(2, "0");
                              const minute = String(selectedMinute).padStart(2, "0");
                              setDeadline(`${calendarYear}-${month}-${dayStr}T${hour}:${minute}`);
                              setSelectedDay(day);
                              setShowCalendar(false);
                            }}
                            style={{
                              padding: "7px 0",
                              textAlign: "center" as const,
                              fontSize: 13,
                              fontWeight: isSelected ? 700 : isToday ? 600 : 400,
                              color: isSelected ? "var(--bg-root)" : isToday ? "var(--gold)" : "var(--text-secondary)",
                              background: isSelected ? "var(--gold)" : "transparent",
                              border: "none",
                              borderRadius: "var(--radius-sm)",
                              cursor: "pointer",
                            }}
                          >
                            {day}
                          </button>
                        );
                      });
                    })()}
                  </div>

                  {/* Time select */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, justifyContent: "center" }}>
                    <select
                      value={selectedHour}
                      onChange={(e) => setSelectedHour(Number(e.target.value))}
                      style={{
                        background: "var(--bg-input)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-sm)",
                        color: "var(--text)",
                        fontSize: 13,
                        padding: "6px 10px",
                        outline: "none",
                        cursor: "pointer",
                      }}
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>{String(i).padStart(2, "0")}</option>
                      ))}
                    </select>
                    <span style={{ color: "var(--text-secondary)", fontSize: 14, fontWeight: 600 }}>:</span>
                    <select
                      value={selectedMinute}
                      onChange={(e) => setSelectedMinute(Number(e.target.value))}
                      style={{
                        background: "var(--bg-input)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-sm)",
                        color: "var(--text)",
                        fontSize: 13,
                        padding: "6px 10px",
                        outline: "none",
                        cursor: "pointer",
                      }}
                    >
                      {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
                        <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Announcement textarea */}
            <textarea
              placeholder={`公告（可选）\n第一行写问候语\n后面每条一行写规则...`}
              value={announcement}
              onChange={(e) => setAnnouncement(e.target.value)}
              style={{
                minHeight: 100,
                background: "var(--bg-input)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text)",
                fontSize: 13,
                padding: "10px 14px",
                resize: "vertical" as const,
                outline: "none",
                width: "100%",
                boxSizing: "border-box" as const,
              }}
            />

            {/* Public/Private toggle */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>公开赛事</span>
                <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>首页可见，任何人都能加入</span>
              </div>
              <button
                type="button"
                onClick={() => setIsPublic(!isPublic)}
                style={{
                  width: 44,
                  height: 26,
                  borderRadius: 13,
                  border: "none",
                  background: isPublic ? "var(--gold)" : "var(--border)",
                  cursor: "pointer",
                  position: "relative",
                  transition: "background 0.2s",
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 3,
                    left: isPublic ? 21 : 3,
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: "#fff",
                    transition: "left 0.2s",
                  }}
                />
              </button>
            </div>
            {error && (
              <p style={{
                color: "var(--red)",
                fontSize: 13,
                fontWeight: 500,
                padding: "8px 12px",
                background: "rgba(224, 80, 80, 0.06)",
                border: "1px solid rgba(224, 80, 80, 0.2)",
                borderRadius: "var(--radius-sm)",
                margin: 0,
              }}>
                {error}
              </p>
            )}
            <button
              onClick={create}
              className="btn-primary"
              style={{ fontSize: 14, padding: "12px 0", width: "100%" }}
            >
              创建赛事
            </button>
          </div>
        </div>
      )}

      {/* Error for join-by-code */}
      {error && !showCreate && (
        <p style={{
          color: "var(--red)",
          fontSize: 13,
          fontWeight: 500,
          marginBottom: 16,
          padding: "10px 14px",
          background: "rgba(224, 80, 80, 0.06)",
          border: "1px solid rgba(224, 80, 80, 0.2)",
          borderRadius: "var(--radius-sm)",
        }}>
          {error}
        </p>
      )}

      {/* ============ TOURNAMENT LIST ============ */}
      {tournaments.length === 0 ? (
        <div style={{ textAlign: "center", padding: "64px 0" }}>
          <p style={{ color: "var(--text-muted)", fontSize: 15 }}>
            暂无赛事
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {tournaments.map((t, i) => {
            const statusText = t.status === "recruiting"
              ? "报名中"
              : t.status === "locked"
                ? "已锁定"
                : "已结束";

            const statusClass = t.status === "recruiting"
              ? "badge badge-green"
              : t.status === "locked"
                ? "badge badge-gold"
                : "badge badge-muted";

            return (
              <button
                key={t.id}
                onClick={() => router.push(`/tournaments/${t.id}`)}
                className="card"
                style={{
                  textAlign: "left" as const,
                  padding: "16px 24px",
                  cursor: "pointer",
                  animation: `fade-in 0.3s ease-out ${i * 0.04}s both`,
                  transition: "border-color 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--border)";
                }}
              >
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 16,
                }}>
                  {/* Left: name + code */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                    <span style={{
                      fontWeight: 600,
                      fontSize: 16,
                      color: "var(--text)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap" as const,
                      maxWidth: 240,
                    }}>
                      {t.name}
                    </span>
                    <span style={{
                      fontSize: 12,
                      color: "var(--text-muted)",
                      fontFamily: "monospace",
                      fontWeight: 600,
                      letterSpacing: 1,
                      padding: "2px 8px",
                      background: "var(--bg-input)",
                      borderRadius: "var(--radius-sm)",
                    }}>
                      #{t.code}
                    </span>
                  </div>

                  {/* Right: stats + status */}
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    flexShrink: 0,
                  }}>
                    {/* Player count */}
                    <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                      <span style={{
                        fontSize: 18,
                        fontWeight: 700,
                        color: t._count.players >= 10 ? "var(--gold)" : "var(--text)",
                      }}>
                        {t._count.players}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        人
                      </span>
                    </div>

                    {/* Deadline */}
                    <span style={{
                      fontSize: 12,
                      color: "var(--text-secondary)",
                      fontFamily: "monospace",
                      whiteSpace: "nowrap" as const,
                    }}>
                      {new Date(t.deadline).toLocaleString("zh-CN", {
                        month: "numeric",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>

                    {/* Status badge */}
                    <span className={statusClass}>{statusText}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Public tournaments section */}
      {publicTournaments.length > 0 && (
        <>
          <div style={{ marginTop: 32, marginBottom: 12 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
              公开赛事
            </h3>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {publicTournaments.map((t, i) => (
              <button
                key={t.id}
                onClick={() => router.push(`/tournaments/${t.id}`)}
                className="card"
                style={{
                  textAlign: "left" as const,
                  padding: "16px 24px",
                  cursor: "pointer",
                  animation: `fade-in 0.3s ease-out ${i * 0.04}s both`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                    <span style={{
                      fontWeight: 600, fontSize: 16, color: "var(--text)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, maxWidth: 240,
                    }}>
                      {t.name}
                    </span>
                    <span style={{
                      fontSize: 12, color: "var(--text-muted)", fontFamily: "monospace",
                      fontWeight: 600, letterSpacing: 1, padding: "2px 8px",
                      background: "var(--bg-input)", borderRadius: "var(--radius-sm)",
                    }}>
                      #{t.code}
                    </span>
                    <span className="badge badge-green" style={{ fontSize: 10 }}>公开</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                      <span style={{ fontSize: 18, fontWeight: 700, color: t._count.players >= 10 ? "var(--gold)" : "var(--text)" }}>
                        {t._count.players}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>人</span>
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

      <style jsx>{`
        @media (max-width: 480px) {
          .tournament-list {
            padding: 24px 12px 48px !important;
          }
        }
      `}</style>
    </div>
  );
}
