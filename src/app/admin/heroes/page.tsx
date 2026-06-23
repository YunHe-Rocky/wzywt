"use client";

import { useEffect, useState } from "react";

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
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [needLogin, setNeedLogin] = useState(false);

  useEffect(() => {
    fetch("/api/heroes")
      .then((r) => r.json())
      .then((data) => {
        setHeroes(data);
        setLoading(false);
      });
  }, []);

  async function changeLane(heroId: number, roleType: string) {
    setSaving((prev) => ({ ...prev, [heroId]: true }));
    setErrors((prev) => { const n = { ...prev }; delete n[heroId]; return n; });

    const res = await fetch(`/api/heroes/${heroId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roleType }),
    });

    if (res.ok) {
      setHeroes((prev) =>
        prev.map((h) => (h.heroId === heroId ? { ...h, roleType } : h))
      );
      setNeedLogin(false);
    } else if (res.status === 401) {
      setNeedLogin(true);
    } else {
      const err = await res.json().catch(() => ({ error: "保存失败" }));
      setErrors((prev) => ({ ...prev, [heroId]: err.error || "保存失败" }));
    }
    setSaving((prev) => { const n = { ...prev }; delete n[heroId]; return n; });
  }

  const filtered = heroes.filter((h) => {
    if (!filter) return true;
    if (filter === "changed") {
      const d = CLASS_TO_LANE[h.heroType];
      return d && h.roleType !== d;
    }
    return h.roleType === filter;
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
            修改即保存 · 同步不会覆盖 · 共 {heroes.length} 位英雄
          </p>
        </div>
        <a href="/heroes" style={{ fontSize: 13, color: "var(--text-secondary)", textDecoration: "none" }}>
          ← 返回图鉴
        </a>
      </div>

      {needLogin && (
        <div style={{
          marginBottom: 16, padding: "10px 16px", borderRadius: 6,
          background: "rgba(224,80,80,0.1)", border: "1px solid rgba(224,80,80,0.2)",
          color: "var(--red)", fontSize: 13,
        }}>
          请先<a href="/login" style={{ color: "var(--gold)", fontWeight: 600 }}>登录</a>后再修改分路
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
                const lane = ROLE_LABELS[hero.roleType];
                const defaultLane = CLASS_TO_LANE[hero.heroType];
                const isModified = hero.roleType !== defaultLane;
                const isSaving = saving[hero.heroId];
                const err = errors[hero.heroId];

                return (
                  <tr key={hero.heroId} style={{ borderBottom: "1px solid var(--border-light)" }}>
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
                        <span style={{
                          display: "inline-block", padding: "2px 8px", borderRadius: 3,
                          fontSize: 11, fontWeight: 600, flexShrink: 0,
                          background: lane ? lane.color + "18" : "var(--bg-hover)",
                          color: lane ? lane.color : "var(--text-muted)",
                          border: "1px solid " + (lane ? lane.color + "25" : "var(--border)"),
                        }}>
                          {lane ? lane.label : hero.roleType}
                          {isModified && <span style={{ marginLeft: 4, fontSize: 9, color: "var(--gold)" }}>*</span>}
                        </span>
                        <select
                          value={hero.roleType}
                          disabled={isSaving}
                          onChange={(e) => changeLane(hero.heroId, e.target.value)}
                          style={{
                            padding: "4px 8px", fontSize: 12, width: 110,
                            opacity: isSaving ? 0.5 : 1,
                          }}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r].label}{r === defaultLane ? " (默认)" : ""}
                            </option>
                          ))}
                        </select>
                        {isSaving && <span style={{ fontSize: 11, color: "var(--gold)", flexShrink: 0 }}>保存中...</span>}
                        {err && <span style={{ fontSize: 11, color: "var(--red)", flexShrink: 0 }}>{err}</span>}
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
