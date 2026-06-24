"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";

const ROLE_LABELS: Record<string, string> = {
  top: "对抗路", jungle: "打野", mid: "中路", adc: "发育路", support: "游走",
};

const ROLE_EMOJIS: Record<string, string> = {
  top: "⚔️", jungle: "🌲", mid: "🔮", adc: "🏹", support: "🛡️",
};

const RANK_TIERS = [
  { label: "未设置", value: 0, color: "#666" },
  { label: "青铜", value: 1, color: "#B8860B" },
  { label: "白银", value: 2, color: "#A8B8C8" },
  { label: "黄金", value: 3, color: "#DAA520" },
  { label: "铂金", value: 4, color: "#34C8E0" },
  { label: "钻石", value: 5, color: "#5B8DEE" },
  { label: "星耀", value: 6, color: "#9B59B6" },
  { label: "王者", value: 7, color: "#E74C3C" },
  { label: "无双王者", value: 8, color: "#F39C12" },
  { label: "荣耀王者", value: 9, color: "#E74C3C" },
];

function RankEmblem({ color, size = 10 }: { color: string; size?: number }) {
  return (
    <span style={{
      display: "inline-block", width: size, height: size,
      background: color, borderRadius: 2,
      transform: "rotate(45deg)", flexShrink: 0,
      boxShadow: `0 0 8px ${color}66`,
    }} />
  );
}

type TabKey = "rank" | "peak" | "history";

const TAB_LABELS: Record<TabKey, string> = { rank: "当前段位", peak: "巅峰分", history: "历史最高" };

interface Pref { roleType: string; preferenceRank: number; roleRank: number; peakScore: number; peakRank: number }

function prefValue(p: Pref, tab: TabKey): string {
  if (tab === "rank") return RANK_TIERS.find(t => t.value === p.roleRank)?.label || "未设置";
  if (tab === "peak") return p.peakScore > 0 ? String(p.peakScore) : "—";
  return RANK_TIERS.find(t => t.value === p.peakRank)?.label || "未设置";
}

function prefColor(p: Pref, tab: TabKey): string {
  if (tab === "rank") return RANK_TIERS.find(t => t.value === p.roleRank)?.color || "#666";
  if (tab === "peak") return p.peakScore > 0 ? "#DAA520" : "#666";
  return RANK_TIERS.find(t => t.value === p.peakRank)?.color || "#666";
}

export function RolePreferenceEditor() {
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [activeTabs, setActiveTabs] = useState<TabKey[]>(["rank", "rank", "rank", "rank", "rank"]);
  const [saving, setSaving] = useState(false);
  const { success, error } = useToast();

  useEffect(() => {
    fetch("/api/users/me/roles").then((r) => r.json()).then((d) => {
      if (d.preferences?.length) {
        setPrefs(d.preferences.sort((a: Pref, b: Pref) => a.preferenceRank - b.preferenceRank));
      } else {
        setPrefs([
          { roleType: "top", preferenceRank: 1, roleRank: 0, peakScore: 0, peakRank: 0 },
          { roleType: "jungle", preferenceRank: 2, roleRank: 0, peakScore: 0, peakRank: 0 },
          { roleType: "mid", preferenceRank: 3, roleRank: 0, peakScore: 0, peakRank: 0 },
          { roleType: "adc", preferenceRank: 4, roleRank: 0, peakScore: 0, peakRank: 0 },
          { roleType: "support", preferenceRank: 5, roleRank: 0, peakScore: 0, peakRank: 0 },
        ]);
      }
    });
  }, []);

  function moveUp(index: number) {
    if (index === 0) return;
    const next = [...prefs];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    setPrefs(next.map((p, i) => ({ ...p, preferenceRank: i + 1 })));
  }

  function moveDown(index: number) {
    if (index === 4) return;
    const next = [...prefs];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    setPrefs(next.map((p, i) => ({ ...p, preferenceRank: i + 1 })));
  }

  function setRoleRank(index: number, rank: number) {
    setPrefs((prev) => prev.map((p, i) => (i === index ? { ...p, roleRank: rank } : p)));
  }

  function setPeakScore(index: number, score: number) {
    setPrefs((prev) => prev.map((p, i) => (i === index ? { ...p, peakScore: score } : p)));
  }

  function setPeakRank(index: number, rank: number) {
    setPrefs((prev) => prev.map((p, i) => (i === index ? { ...p, peakRank: rank } : p)));
  }

  function setActiveTab(index: number, tab: TabKey) {
    setActiveTabs((prev) => prev.map((t, i) => (i === index ? tab : t)));
  }

  async function save() {
    setSaving(true);
    const res = await fetch("/api/users/me/roles", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        preferences: prefs.map((p) => ({
          role_type: p.roleType,
          preference_rank: p.preferenceRank,
          role_rank: p.roleRank,
          peak_score: p.peakScore,
          peak_rank: p.peakRank,
        })),
      }),
    });
    setSaving(false);
    if (res.ok) {
      success("分路偏好已保存");
    } else {
      error("保存失败，请重试");
    }
  }

  return (
    <div className="card">
      <div className="section-title">分路偏好与段位</div>
      <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
        排序偏好分路，点击下方标签切换编辑段位、巅峰分与历史最高段位
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {prefs.map((p, i) => (
          <div
            key={p.roleType}
            className="role-pref-row"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              overflow: "hidden",
              transition: "background 0.15s, border-color 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-hover)";
              e.currentTarget.style.borderColor = "var(--border-light)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--bg-card)";
              e.currentTarget.style.borderColor = "var(--border)";
            }}
          >
            {/* Top row: rank# + role name + arrows */}
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 14px",
            }}>
              <span style={{
                color: "var(--gold)", fontWeight: 700, fontSize: 16,
                minWidth: 24, textAlign: "center", flexShrink: 0,
              }}>
                {i + 1}
              </span>

              <span style={{ flex: 1, minWidth: 0, color: "var(--text)", fontSize: 14, fontWeight: 600 }}>
                <span className="role-emoji" style={{ marginRight: 6 }}>{ROLE_EMOJIS[p.roleType]}</span>
                <span className="role-label">{ROLE_LABELS[p.roleType]}</span>
              </span>

              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                <button
                  className="btn-subtle"
                  onClick={() => moveUp(i)}
                  disabled={i === 0}
                  style={{ padding: "4px 8px", fontSize: 13, minWidth: 28, fontWeight: 600 }}
                >↑</button>
                <button
                  className="btn-subtle"
                  onClick={() => moveDown(i)}
                  disabled={i === 4}
                  style={{ padding: "4px 8px", fontSize: 13, minWidth: 28, fontWeight: 600 }}
                >↓</button>
              </div>
            </div>

            {/* Bottom row: tab switcher + active field */}
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "0 14px 10px",
            }}>
              {/* Rank emblem for active tab */}
              <RankEmblem color={prefColor(p, activeTabs[i])} size={12} />

              {/* Tab buttons */}
              <div className="tab-switcher" style={{
                display: "flex", flex: 1, minWidth: 0,
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                overflow: "hidden",
              }}>
                {(["rank", "peak", "history"] as TabKey[]).map((tab) => {
                  const isActive = activeTabs[i] === tab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveTab(i, tab)}
                      style={{
                        flex: 1,
                        padding: "5px 4px",
                        fontSize: 11,
                        fontWeight: isActive ? 600 : 400,
                        border: "none",
                        cursor: "pointer",
                        background: isActive ? "rgba(192,168,74,0.12)" : "transparent",
                        color: isActive ? "var(--gold)" : "var(--text-muted)",
                        borderRight: tab !== "history" ? "1px solid var(--border)" : "none",
                        transition: "background 0.15s",
                      }}
                    >
                      <span style={{ display: "block", fontSize: 9, opacity: 0.7, marginBottom: 1 }}>
                        {TAB_LABELS[tab]}
                      </span>
                      <span style={{
                        display: "block", fontSize: 12,
                        color: isActive ? "var(--gold)" : prefColor(p, tab) !== "#666" ? "var(--text)" : "var(--text-muted)",
                      }}>
                        {prefValue(p, tab)}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Active field editor */}
              <div className="tab-editor" style={{ flexShrink: 0 }}>
                {activeTabs[i] === "rank" && (
                  <select
                    value={p.roleRank}
                    onChange={(e) => setRoleRank(i, parseInt(e.target.value))}
                    style={{
                      width: 100, fontSize: 13, padding: "6px 8px",
                      color: p.roleRank > 0 ? "var(--gold)" : "var(--text-muted)",
                      fontWeight: p.roleRank > 0 ? 600 : 400,
                    }}
                  >
                    {RANK_TIERS.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                )}
                {activeTabs[i] === "peak" && (
                  <input
                    type="number"
                    placeholder="巅峰赛分"
                    value={p.peakScore || ""}
                    onChange={(e) => setPeakScore(i, parseInt(e.target.value) || 0)}
                    style={{
                      width: 100, fontSize: 13, padding: "6px 8px",
                      color: p.peakScore > 0 ? "var(--gold)" : "var(--text-muted)",
                      fontWeight: p.peakScore > 0 ? 600 : 400,
                      background: "var(--bg-card)", border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                    }}
                  />
                )}
                {activeTabs[i] === "history" && (
                  <select
                    value={p.peakRank}
                    onChange={(e) => setPeakRank(i, parseInt(e.target.value))}
                    style={{
                      width: 100, fontSize: 13, padding: "6px 8px",
                      color: p.peakRank > 0 ? "var(--gold)" : "var(--text-muted)",
                      fontWeight: p.peakRank > 0 ? 600 : 400,
                    }}
                  >
                    {RANK_TIERS.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
        <button className="btn-primary" onClick={save} disabled={saving}
          style={{ fontSize: 14, fontWeight: 600, padding: "10px 28px" }}>
          {saving ? "保存中..." : "保存"}
        </button>
      </div>

      <style jsx>{`
        @media (max-width: 480px) {
          .tab-switcher button {
            padding: 4px 2px !important;
          }
          .tab-editor select,
          .tab-editor input {
            width: 80px !important;
            font-size: 12px !important;
          }
          .role-emoji {
            display: none;
          }
          .role-label {
            font-size: 13px;
          }
        }
      `}</style>
    </div>
  );
}
