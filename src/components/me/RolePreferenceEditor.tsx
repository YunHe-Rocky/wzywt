"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";

const ROLE_LABELS: Record<string, string> = {
  top: "对抗路", jungle: "打野", mid: "中路", adc: "发育路", support: "游走",
};

const RANK_TIERS = [
  { label: "未设置", value: 0, color: "#666", bg: "#222" },
  { label: "青铜", value: 1, color: "#CD853F", bg: "#2a1a0a" },
  { label: "白银", value: 2, color: "#B0C4DE", bg: "#1a2230" },
  { label: "黄金", value: 3, color: "#FFD700", bg: "#2a2408" },
  { label: "铂金", value: 4, color: "#34C8E0", bg: "#0a1c24" },
  { label: "钻石", value: 5, color: "#5B8DEE", bg: "#0a1030" },
  { label: "星耀", value: 6, color: "#BB5BE0", bg: "#180828" },
  { label: "王者", value: 7, color: "#E8453C", bg: "#280808" },
  { label: "无双王者", value: 8, color: "#F0A030", bg: "#281808" },
  { label: "荣耀王者", value: 9, color: "#FF4444", bg: "#280404" },
];

// ── SVG Icons ───────────────────────────────────────────────────────

function RankBadge({ value, size = 48 }: { value: number; size?: number }) {
  const tier = RANK_TIERS.find(t => t.value === value) || RANK_TIERS[0];
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
      <circle cx={24} cy={24} r={22} fill="none" stroke={tier.color} strokeWidth={1.5} opacity={0.3} />
      <path d="M24 4 L38 14 L38 26 C38 34 31 40 24 44 C17 40 10 34 10 26 L10 14 Z"
        fill={tier.bg} stroke={tier.color} strokeWidth={1.8} />
      <path d="M24 8 L34 15 L34 26 C34 32 28 37 24 40 C20 37 14 32 14 26 L14 15 Z"
        fill="none" stroke={tier.color} strokeWidth={0.6} opacity={0.4} />
      {value >= 7 ? (
        <path d="M16 22 L20 16 L24 20 L28 16 L32 22 L30 27 L18 27 Z"
          fill={tier.color} opacity={0.9} />
      ) : value > 0 ? (
        <text x={24} y={31} textAnchor="middle" fill={tier.color}
          fontSize={value >= 6 ? 18 : 16} fontWeight={700} fontFamily="serif">
          {["", "III", "II", "I", "IV", "V", "VI"][value] || ""}
        </text>
      ) : (
        <text x={24} y={31} textAnchor="middle" fill="#555" fontSize={11} fontWeight={600}>?</text>
      )}
    </svg>
  );
}

function LaneIcon({ role, size = 24 }: { role: string; size?: number }) {
  const s = size;
  const c: Record<string, string> = {
    top: "#D4A574", jungle: "#7EC87B", mid: "#C08ED8", adc: "#E8A040", support: "#6BB5D8",
  };
  const color = c[role] || "#888";
  if (role === "top") return (
    <svg width={s} height={s} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
      <path d="M8 2 L16 2 L16 18 L8 18 Z" fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      <line x1={12} y1={4} x2={12} y2={16} stroke={color} strokeWidth={1} opacity={0.5} />
    </svg>
  );
  if (role === "jungle") return (
    <svg width={s} height={s} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
      <path d="M12 2 L22 10 L19 16 L15 16 L17 22 L7 22 L9 16 L5 16 L2 10 Z"
        fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <circle cx={12} cy={10} r={3} fill="none" stroke={color} strokeWidth={1} opacity={0.5} />
    </svg>
  );
  if (role === "mid") return (
    <svg width={s} height={s} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
      <circle cx={12} cy={12} r={9} fill="none" stroke={color} strokeWidth={2} />
      <circle cx={12} cy={12} r={3} fill={color} opacity={0.6} />
      <path d="M8 8 L16 16 M16 8 L8 16" stroke={color} strokeWidth={1} opacity={0.4} />
    </svg>
  );
  if (role === "adc") return (
    <svg width={s} height={s} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
      <path d="M5 20 L12 3 L19 20" fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      <line x1={8} y1={14} x2={16} y2={14} stroke={color} strokeWidth={1} opacity={0.5} />
    </svg>
  );
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
      <path d="M12 2 C5 7 3 14 4 19 C5 21 8 22 12 22 C16 22 19 21 20 19 C21 14 19 7 12 2 Z"
        fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      <circle cx={12} cy={13} r={4} fill="none" stroke={color} strokeWidth={1} opacity={0.5} />
    </svg>
  );
}

// ── Component ───────────────────────────────────────────────────────

interface Pref {
  roleType: string; preferenceRank: number; roleRank: number; peakScore: number; peakRank: number;
}

interface HeroPower {
  id: number; heroId: number; heroName: string; powerScore: number; roleType: string;
}

export function RolePreferenceEditor() {
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [heroPowers, setHeroPowers] = useState<Record<string, HeroPower[]>>({});
  const [sharedRank, setSharedRank] = useState(0);
  const [saving, setSaving] = useState(false);
  const { success, error } = useToast();

  useEffect(() => {
    fetch("/api/users/me/roles").then(r => r.json()).then(d => {
      if (d.preferences?.length) {
        const sorted = d.preferences.sort((a: Pref, b: Pref) => a.preferenceRank - b.preferenceRank);
        setPrefs(sorted);
        setSharedRank(sorted[0]?.roleRank || 0);
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
    fetch("/api/users/me/heroes").then(r => r.json()).then(d => {
      if (d.heroPowers) {
        const grouped: Record<string, HeroPower[]> = {};
        for (const role of ["top", "jungle", "mid", "adc", "support"]) {
          grouped[role] = d.heroPowers[role] || [];
        }
        setHeroPowers(grouped);
      }
    });
  }, []);

  function moveUp(i: number) {
    if (i === 0) return;
    const next = [...prefs];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    setPrefs(next.map((p, j) => ({ ...p, preferenceRank: j + 1 })));
  }
  function moveDown(i: number) {
    if (i === 4) return;
    const next = [...prefs];
    [next[i], next[i + 1]] = [next[i + 1], next[i]];
    setPrefs(next.map((p, j) => ({ ...p, preferenceRank: j + 1 })));
  }
  function setSharedRankAndSync(rank: number) {
    setSharedRank(rank);
    setPrefs(prev => prev.map(p => ({ ...p, roleRank: rank })));
  }
  function setPeakScore(i: number, score: number) {
    setPrefs(prev => prev.map((p, j) => (j === i ? { ...p, peakScore: score } : p)));
  }
  function setPeakRank(i: number, rank: number) {
    setPrefs(prev => prev.map((p, j) => (j === i ? { ...p, peakRank: rank } : p)));
  }

  async function save() {
    setSaving(true);
    const res = await fetch("/api/users/me/roles", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        preferences: prefs.map(p => ({
          role_type: p.roleType,
          preference_rank: p.preferenceRank,
          role_rank: p.roleRank,
          peak_score: p.peakScore,
          peak_rank: p.peakRank,
        })),
      }),
    });
    setSaving(false);
    if (res.ok) success("保存成功");
    else error("保存失败");
  }

  const activeTier = RANK_TIERS.find(t => t.value === sharedRank) || RANK_TIERS[0];

  return (
    <>
      {/* ── 当前段位（独立） ── */}
      <div className="card" style={{ animation: "slide-up 0.4s ease-out both" }}>
        <div className="section-title">当前段位</div>
        <div style={{
          display: "flex", alignItems: "center", gap: 16,
          padding: "16px 20px", marginTop: 12,
          background: `linear-gradient(135deg, ${activeTier.bg}66 0%, rgba(255,255,255,0.02) 100%)`,
          border: `1px solid ${activeTier.color}33`,
          borderRadius: "var(--radius)",
        }}>
          <RankBadge value={sharedRank} size={72} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8, letterSpacing: 1 }}>
              王者荣耀段位
            </div>
            <select
              value={sharedRank}
              onChange={e => setSharedRankAndSync(parseInt(e.target.value))}
              style={{
                width: "100%", maxWidth: 200, fontSize: 16, fontWeight: 700, padding: "10px 12px",
                color: sharedRank > 0 ? activeTier.color : "var(--text-muted)",
                background: "var(--bg-card)", border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
              }}
            >
              {RANK_TIERS.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── 分路配置：偏好排序 + 巅峰分 + 历史段位 + 英雄战力 ── */}
      <div className="card" style={{ animation: "slide-up 0.4s 0.05s ease-out both" }}>
        <div className="section-title">分路配置</div>
        <p style={{ color: "var(--text-secondary)", fontSize: 12, marginBottom: 16, lineHeight: 1.5 }}>
          设置分路偏好排序、各分路巅峰赛历史最高分、历史最高段位
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {prefs.map((p, i) => {
            const laneHeroes = heroPowers[p.roleType] || [];
            const avgPower = laneHeroes.length > 0
              ? Math.round(laneHeroes.reduce((s, h) => s + h.powerScore, 0) / laneHeroes.length)
              : 0;
            return (
              <div
                key={p.roleType}
                className="role-row"
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  overflow: "hidden",
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-hover)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "var(--bg-card)"; }}
              >
                {/* Main row */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                }}>
                  <span style={{ color: "var(--gold)", fontWeight: 700, fontSize: 15, minWidth: 22, textAlign: "center", flexShrink: 0 }}>
                    {i + 1}
                  </span>
                  <LaneIcon role={p.roleType} size={26} />
                  <span style={{ flex: 1, minWidth: 0, color: "var(--text)", fontSize: 14, fontWeight: 600 }}>
                    {ROLE_LABELS[p.roleType]}
                  </span>

                  {/* Hero power summary */}
                  <span style={{
                    fontSize: 11, color: avgPower > 0 ? "var(--gold)" : "var(--text-muted)",
                    minWidth: 70, textAlign: "center", flexShrink: 0,
                  }}>
                    {avgPower > 0 ? `战力 ${avgPower}` : "无战力"}
                  </span>

                  {/* Peak score */}
                  <input type="number" placeholder="巅峰分"
                    value={p.peakScore || ""}
                    onChange={e => setPeakScore(i, parseInt(e.target.value) || 0)}
                    style={{
                      width: 70, fontSize: 12, padding: "5px 6px", flexShrink: 0,
                      color: p.peakScore > 0 ? "var(--gold)" : "var(--text-muted)",
                      fontWeight: p.peakScore > 0 ? 600 : 400,
                      background: "var(--bg-card)", border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                    }}
                  />

                  {/* Peak rank */}
                  <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                    <RankBadge value={p.peakRank} size={22} />
                    <select value={p.peakRank} onChange={e => setPeakRank(i, parseInt(e.target.value))}
                      style={{
                        width: 88, fontSize: 12, padding: "5px 4px", flexShrink: 0,
                        color: p.peakRank > 0 ? "var(--gold)" : "var(--text-muted)",
                        fontWeight: p.peakRank > 0 ? 600 : 400,
                      }}>
                      {RANK_TIERS.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Order buttons */}
                  <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                    <button className="btn-subtle" onClick={() => moveUp(i)} disabled={i === 0}
                      style={{ padding: "3px 7px", fontSize: 12, minWidth: 26, fontWeight: 600 }}>↑</button>
                    <button className="btn-subtle" onClick={() => moveDown(i)} disabled={i === 4}
                      style={{ padding: "3px 7px", fontSize: 12, minWidth: 26, fontWeight: 600 }}>↓</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
          <button className="btn-primary" onClick={save} disabled={saving}
            style={{ fontSize: 14, fontWeight: 600, padding: "10px 28px" }}>
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 480px) {
          .role-row > div {
            gap: 6px !important;
            padding: 8px 10px !important;
            flex-wrap: wrap;
          }
        }
      `}</style>
    </>
  );
}
