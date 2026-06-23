"use client";

import { useEffect, useRef, useState } from "react";

interface Hero {
  heroId: number;
  name: string;
  title: string;
  roleType: string;
  heroType: number;
  heroType2: number;
}

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  top: { label: "对抗路", color: "#e05555" },
  jungle: { label: "打野", color: "#55b055" },
  mid: { label: "中路", color: "#5588cc" },
  adc: { label: "发育路", color: "#ddaa33" },
  support: { label: "游走", color: "#aa66cc" },
};

const CLASS_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: "战士", color: "#dd7744" },
  2: { label: "法师", color: "#44aaaa" },
  3: { label: "坦克", color: "#88aa44" },
  4: { label: "刺客", color: "#cc4466" },
  5: { label: "射手", color: "#cc8833" },
  6: { label: "辅助", color: "#66aacc" },
};

const ROLES = ["top", "jungle", "mid", "adc", "support"];

const CLASS_TO_LANE: Record<number, string> = {
  1: "top", 2: "mid", 3: "top", 4: "jungle", 5: "adc", 6: "support",
};

export default function AdminHeroesPage() {
  const [heroes, setHeroes] = useState<Hero[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  // Track pending changes: heroId → newRoleType
  const [pending, setPending] = useState<Record<number, string>>({});
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  useEffect(() => {
    fetch("/api/heroes")
      .then((r) => r.json())
      .then((data) => {
        setHeroes(data);
        setLoading(false);
      });
  }, []);

  function changeLocal(heroId: number, roleType: string) {
    setPending((prev) => ({ ...prev, [heroId]: roleType }));
  }

  async function saveAll() {
    const changes = pendingRef.current;
    const ids = Object.keys(changes);
    if (ids.length === 0) {
      setMessage({ type: "err", text: "没有待保存的修改" });
      return;
    }
    setSaving(true);
    setMessage(null);
    let ok = 0;
    let fail = 0;
    for (const id of ids) {
      try {
        const res = await fetch(`/api/heroes/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roleType: changes[Number(id)] }),
        });
        if (res.ok) {
          ok++;
        } else {
          const err = await res.json().catch(() => ({ error: "请求失败" }));
          if (res.status === 401) {
            setMessage({ type: "err", text: "请先登录后再保存" });
            setSaving(false);
            return;
          }
          fail++;
        }
      } catch {
        fail++;
      }
    }
    // Apply saved changes to local state
    setHeroes((prev) =>
      prev.map((h) =>
        changes[h.heroId] ? { ...h, roleType: changes[h.heroId] } : h
      )
    );
    setPending({});
    setSaving(false);
    setMessage({ type: "ok", text: `保存成功：${ok} 位英雄，${fail > 0 ? `失败 ${fail} 位` : ""}` });
    setTimeout(() => setMessage(null), 3000);
  }

  const pendingCount = Object.keys(pending).length;

  const filtered = heroes.filter((h) => {
    // Show pending changes: use pending value if exists
    const effectiveRole = pending[h.heroId] || h.roleType;
    if (!filter) return true;
    if (filter === "changed") {
      const defaultLane = CLASS_TO_LANE[h.heroType];
      return effectiveRole !== defaultLane;
    }
    if (filter === "unsaved") return pending[h.heroId] !== undefined;
    return effectiveRole === filter;
  });

  if (loading) {
    return (
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px" }}>
        <div className="skeleton" style={{ height: 400 }} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text)", margin: "0 0 4px" }}>
            英雄分路管理
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
            手动修正分路 · 同步不会覆盖 · 共 {heroes.length} 位英雄
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <a href="/heroes" style={{ fontSize: 13, color: "var(--text-secondary)", textDecoration: "none" }}>
            ← 图鉴
          </a>
          <button
            className="btn-primary"
            disabled={pendingCount === 0 || saving}
            onClick={saveAll}
            style={{ fontSize: 13, padding: "10px 24px" }}
          >
            {saving ? "保存中..." : `保存修改${pendingCount > 0 ? ` (${pendingCount})` : ""}`}
          </button>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div style={{
          marginBottom: 16, padding: "10px 16px", borderRadius: 6,
          background: message.type === "ok" ? "rgba(80,176,80,0.1)" : "rgba(224,80,80,0.1)",
          border: `1px solid ${message.type === "ok" ? "rgba(80,176,80,0.2)" : "rgba(224,80,80,0.2)"}`,
          color: message.type === "ok" ? "var(--green)" : "var(--red)",
          fontSize: 13, fontWeight: 500,
        }}>
          {message.text}
        </div>
      )}

      {/* Filter */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        <button onClick={() => setFilter("")} className={filter === "" ? "btn-primary" : "btn-subtle"} style={{ padding: "5px 14px", fontSize: 12 }}>
          全部
        </button>
        {ROLES.map((r) => (
          <button key={r} onClick={() => setFilter(r)} className={filter === r ? "btn-primary" : "btn-subtle"} style={{ padding: "5px 14px", fontSize: 12 }}>
            {ROLE_LABELS[r].label}
          </button>
        ))}
        <button onClick={() => setFilter("changed")} className={filter === "changed" ? "btn-primary" : "btn-subtle"} style={{ padding: "5px 14px", fontSize: 12 }}>
          已修正
        </button>
        {pendingCount > 0 && (
          <button onClick={() => setFilter("unsaved")} className={filter === "unsaved" ? "btn-primary" : "btn-subtle"} style={{ padding: "5px 14px", fontSize: 12, borderColor: "rgba(240,192,64,0.4)" }}>
            待保存 ({pendingCount})
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-hover)" }}>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "var(--text-secondary)", fontSize: 11, letterSpacing: 1, whiteSpace: "nowrap" }}>#</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "var(--text-secondary)", fontSize: 11, letterSpacing: 1, whiteSpace: "nowrap" }}>英雄</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "var(--text-secondary)", fontSize: 11, letterSpacing: 1, whiteSpace: "nowrap" }}>职业</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "var(--text-secondary)", fontSize: 11, letterSpacing: 1, whiteSpace: "nowrap" }}>分路</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((hero) => {
                const cls = CLASS_LABELS[hero.heroType];
                const effectiveRole = pending[hero.heroId] || hero.roleType;
                const lane = ROLE_LABELS[effectiveRole];
                const defaultLane = CLASS_TO_LANE[hero.heroType];
                const isModified = effectiveRole !== defaultLane;
                const isPending = pending[hero.heroId] !== undefined;
                const originalLane = ROLE_LABELS[hero.roleType];

                return (
                  <tr
                    key={hero.heroId}
                    style={{
                      borderBottom: "1px solid var(--border-light)",
                      background: isPending ? "rgba(240,192,64,0.04)" : "transparent",
                      transition: "background 0.2s",
                    }}
                  >
                    <td style={{ padding: "8px 16px", color: "var(--text-muted)", fontSize: 11, fontFamily: "monospace" }}>
                      {hero.heroId}
                    </td>
                    <td style={{ padding: "8px 16px" }}>
                      <span style={{ fontWeight: 600, color: "var(--text)" }}>{hero.name}</span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>{hero.title}</span>
                    </td>
                    <td style={{ padding: "8px 16px" }}>
                      {cls && (
                        <span style={{
                          display: "inline-block", padding: "2px 8px", borderRadius: 3,
                          fontSize: 11, fontWeight: 600,
                          background: cls.color + "20", color: cls.color,
                          border: "1px solid " + cls.color + "30",
                        }}>
                          {cls.label}
                        </span>
                      )}
                      {hero.heroType2 > 0 && CLASS_LABELS[hero.heroType2] && (
                        <span style={{
                          display: "inline-block", padding: "2px 8px", borderRadius: 3,
                          fontSize: 11, fontWeight: 600, marginLeft: 4,
                          background: CLASS_LABELS[hero.heroType2].color + "15",
                          color: CLASS_LABELS[hero.heroType2].color,
                          border: "1px solid " + CLASS_LABELS[hero.heroType2].color + "25",
                        }}>
                          {CLASS_LABELS[hero.heroType2].label}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "8px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {/* Current/Original lane */}
                        {isPending && (
                          <span style={{
                            display: "inline-block", padding: "2px 8px", borderRadius: 3,
                            fontSize: 11, fontWeight: 600, textDecoration: "line-through",
                            opacity: 0.5,
                            background: originalLane ? originalLane.color + "18" : "var(--bg-hover)",
                            color: originalLane ? originalLane.color : "var(--text-muted)",
                          }}>
                            {originalLane ? originalLane.label : hero.roleType}
                          </span>
                        )}
                        {/* Effective/New lane */}
                        <span style={{
                          display: "inline-block", padding: "2px 8px", borderRadius: 3,
                          fontSize: 11, fontWeight: 600,
                          background: lane ? lane.color + "18" : "var(--bg-hover)",
                          color: lane ? lane.color : "var(--text-muted)",
                          border: `1px solid ${isPending ? "var(--gold)" : (lane ? lane.color + "25" : "var(--border)")}`,
                          boxShadow: isPending ? "0 0 6px rgba(240,192,64,0.2)" : "none",
                        }}>
                          {lane ? lane.label : effectiveRole}
                          {isModified && !isPending && <span style={{ marginLeft: 4, fontSize: 9, color: "var(--gold)" }}>*</span>}
                        </span>
                        {/* Dropdown */}
                        <select
                          value={effectiveRole}
                          onChange={(e) => changeLocal(hero.heroId, e.target.value)}
                          style={{ padding: "4px 8px", fontSize: 12, width: 100 }}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r].label}{r === defaultLane ? " (默认)" : ""}
                            </option>
                          ))}
                        </select>
                        {isPending && (
                          <button
                            onClick={() => {
                              setPending((prev) => {
                                const next = { ...prev };
                                delete next[hero.heroId];
                                return next;
                              });
                            }}
                            style={{
                              background: "none", border: "none", cursor: "pointer",
                              color: "var(--text-muted)", fontSize: 16, padding: 0, lineHeight: 1,
                            }}
                            title="撤销修改"
                          >
                            ↩
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
