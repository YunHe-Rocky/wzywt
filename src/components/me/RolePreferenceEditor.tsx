"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";

const ROLE_LABELS: Record<string, string> = {
  top: "对抗路", jungle: "打野", mid: "中路", adc: "发育路", support: "游走",
};

const RANK_TIERS = [
  { label: "未设置", value: 0 },
  { label: "青铜", value: 1 },
  { label: "白银", value: 2 },
  { label: "黄金", value: 3 },
  { label: "铂金", value: 4 },
  { label: "钻石", value: 5 },
  { label: "星耀", value: 6 },
  { label: "王者", value: 7 },
  { label: "无双王者", value: 8 },
  { label: "荣耀王者", value: 9 },
];

interface Pref { roleType: string; preferenceRank: number; roleRank: number }

export function RolePreferenceEditor() {
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [saving, setSaving] = useState(false);
  const { success, error } = useToast();

  useEffect(() => {
    fetch("/api/users/me/roles").then((r) => r.json()).then((d) => {
      if (d.preferences?.length) {
        setPrefs(d.preferences.sort((a: Pref, b: Pref) => a.preferenceRank - b.preferenceRank));
      } else {
        setPrefs([
          { roleType: "top", preferenceRank: 1, roleRank: 0 },
          { roleType: "jungle", preferenceRank: 2, roleRank: 0 },
          { roleType: "mid", preferenceRank: 3, roleRank: 0 },
          { roleType: "adc", preferenceRank: 4, roleRank: 0 },
          { roleType: "support", preferenceRank: 5, roleRank: 0 },
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
        拖拽排序偏好，选择各分路段位。分队时优先按段位均衡 → 偏好 → 战力
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {prefs.map((p, i) => (
          <div
            key={p.roleType}
            className="role-pref-row"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              padding: "10px 14px",
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
            {/* Rank number */}
            <span style={{
              color: "var(--gold)", fontWeight: 700, fontSize: 16,
              minWidth: 24, textAlign: "center", flexShrink: 0,
            }}>
              {i + 1}
            </span>

            {/* Role name */}
            <span style={{ flex: 1, color: "var(--text)", fontSize: 14, fontWeight: 500 }}>
              {ROLE_LABELS[p.roleType]}
            </span>

            {/* Rank tier select */}
            <select
              value={p.roleRank}
              onChange={(e) => setRoleRank(i, parseInt(e.target.value))}
              style={{
                width: 110, fontSize: 13, padding: "6px 8px", flexShrink: 0,
                color: p.roleRank > 0 ? "var(--gold)" : "var(--text-muted)",
                fontWeight: p.roleRank > 0 ? 600 : 400,
              }}
            >
              {RANK_TIERS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>

            {/* Arrow buttons */}
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
          .role-pref-row {
            flex-wrap: wrap;
            padding: 10px 12px !important;
            gap: 6px !important;
          }
        }
      `}</style>
    </div>
  );
}
