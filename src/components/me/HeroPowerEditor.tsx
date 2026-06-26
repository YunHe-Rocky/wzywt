"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { HeroSelect } from "@/components/hero/HeroSelect";

const ROLE_LABELS: Record<string, string> = {
  top: "对抗路", jungle: "打野", mid: "中路", adc: "发育路", support: "游走",
};
const ROLES = ["top", "jungle", "mid", "adc", "support"];

interface HeroEntry { id: number; heroId: number; heroName: string; powerScore: number }
interface HeroOption { heroId: number; name: string; title: string }

export function HeroPowerEditor() {
  const [grouped, setGrouped] = useState<Record<string, HeroEntry[]>>({});
  const [heroOptions, setHeroOptions] = useState<Record<string, HeroOption[]>>({});
  const [activeRole, setActiveRole] = useState<string | null>(null);
  const [selectedHero, setSelectedHero] = useState("");
  const [selectedHeroName, setSelectedHeroName] = useState("");
  const [powerScore, setPowerScore] = useState("");
  const { success, error } = useToast();

  useEffect(() => {
    fetch("/api/users/me/heroes").then((r) => r.json()).then((d) => {
      if (d.heroPowers) setGrouped(d.heroPowers);
    });
  }, []);

  async function loadHeroes(role: string) {
    if (heroOptions[role]) { setActiveRole(role); return; }
    const res = await fetch(`/api/heroes?role_type=${role}`);
    const data = await res.json();
    setHeroOptions((prev) => ({ ...prev, [role]: data }));
    setActiveRole(role);
  }

  async function addHero() {
    if (!activeRole || !selectedHero || !selectedHeroName || !powerScore) return;

    const res = await fetch("/api/users/me/heroes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roleType: activeRole,
        heroId: parseInt(selectedHero),
        heroName: selectedHeroName,
        powerScore: parseInt(powerScore),
      }),
    });
    if (res.ok) {
      const created = await res.json();
      setGrouped((prev) => ({
        ...prev,
        [activeRole]: [...(prev[activeRole] || []), created],
      }));
      setSelectedHero("");
      setPowerScore("");
      success("英雄添加成功");
    } else {
      const err = await res.json();
      error(err.error || "添加失败");
    }
  }

  async function removeHero(id: number, role: string) {
    await fetch(`/api/users/me/heroes?id=${id}`, { method: "DELETE" });
    setGrouped((prev) => ({
      ...prev,
      [role]: prev[role].filter((h) => h.id !== id),
    }));
    success("已删除英雄");
  }

  return (
    <div className="card">
      <div className="section-title">英雄战力</div>
      <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
        每个分路选 1-3 个擅长的英雄，填写战力
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {ROLES.map((role) => {
          const heroes = grouped[role] || [];
          const expanded = activeRole === role;
          const isFull = heroes.length >= 3;

          return (
            <div key={role}>
              {/* Collapsed/Expandable row */}
              <button
                onClick={() =>
                  expanded ? setActiveRole(null) : loadHeroes(role)
                }
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                  background: expanded ? "var(--bg-hover)" : "var(--bg-card)",
                  border: `1px solid ${expanded ? "var(--border-gold)" : "var(--border)"}`,
                  borderRadius: "var(--radius-sm)",
                  padding: "12px 16px",
                  color: "var(--text)",
                  fontSize: 14,
                  cursor: "pointer",
                  transition: "background 0.15s, border-color 0.15s",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => {
                  if (!expanded) {
                    e.currentTarget.style.background = "var(--bg-hover)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!expanded) {
                    e.currentTarget.style.background = "var(--bg-card)";
                  }
                }}
              >
                <span style={{
                  fontWeight: 600,
                  fontSize: 15,
                  color: expanded ? "var(--gold)" : "var(--text)",
                  transition: "color 0.15s",
                }}>
                  {ROLE_LABELS[role]}
                </span>
                <span className="hero-collapsed-summary" style={{
                  color: expanded ? "var(--text-secondary)" : "var(--text-muted)",
                  fontSize: 12,
                  transition: "color 0.15s",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: "55%",
                  textAlign: "right",
                }}>
                  {heroes.length > 0
                    ? heroes.map((h) => `${h.heroName}(${h.powerScore})`).join(", ")
                    : "未选择"}
                </span>
              </button>

              {/* Expanded content */}
              {expanded && (
                <div
                  style={{
                    marginTop: 6,
                    padding: "16px 16px 16px 20px",
                    border: "1px solid var(--border-gold)",
                    borderLeft: "2px solid var(--gold)",
                    borderRadius: "0 var(--radius-sm) var(--radius-sm) 0",
                    background: "var(--bg-card)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    overflow: "hidden",
                    animation: "role-expand-in 0.3s ease-out",
                  }}
                >
                  {/* Hero entries */}
                  {heroes.map((h, idx) => (
                    <div
                      key={h.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        animation: `role-item-in 0.25s ease-out ${idx * 0.05}s both`,
                      }}
                    >
                      <span className="badge badge-gold" style={{
                        fontSize: 13,
                        padding: "5px 12px",
                        fontWeight: 600,
                      }}>
                        {h.heroName}
                      </span>
                      <span style={{
                        color: "var(--text-secondary)",
                        fontSize: 13,
                        flex: 1,
                      }}>
                        {h.powerScore} 战力
                      </span>
                      <button
                        onClick={() => removeHero(h.id, role)}
                        title="删除英雄"
                        style={{
                          background: "none",
                          border: "1px solid var(--border)",
                          borderRadius: "var(--radius-sm)",
                          color: "var(--text-muted)",
                          fontSize: 12,
                          cursor: "pointer",
                          padding: "4px 10px",
                          transition: "all 0.15s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = "var(--red)";
                          e.currentTarget.style.borderColor = "rgba(224, 80, 80, 0.3)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = "var(--text-muted)";
                          e.currentTarget.style.borderColor = "var(--border)";
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}

                  {/* Add form — only shown when not full */}
                  {!isFull && (
                    <div>
                      <HeroSelect
                        roleType={role}
                        value={selectedHero}
                        onChange={(heroId, heroName) => {
                          setSelectedHero(heroId);
                          setSelectedHeroName(heroName);
                        }}
                      />
                      <div className="hero-add-row" style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <input
                          type="number"
                          placeholder="战力"
                          value={powerScore}
                          onChange={(e) => setPowerScore(e.target.value)}
                        />
                        <button className="btn-primary" onClick={addHero}>
                          添加
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Full indicator */}
                  {isFull && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "10px 14px",
                        borderRadius: "var(--radius-sm)",
                        background: "var(--bg-input)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <span style={{
                        color: "var(--gold)",
                        fontSize: 16,
                        fontWeight: 700,
                      }}>
                        3/3
                      </span>
                      <span style={{
                        color: "var(--text-muted)",
                        fontSize: 12,
                      }}>
                        已达上限
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style jsx>{`
        @media (max-width: 480px) {
          .hero-collapsed-summary {
            display: none;
          }
          .hero-add-form {
            flex-direction: column;
            gap: 8px;
          }
          .hero-add-row {
            display: flex;
            gap: 8px;
            width: 100%;
          }
          .hero-add-row input {
            flex: 1;
            min-width: 0;
          }
          .hero-add-row button {
            flex-shrink: 0;
          }
        }
      `}</style>
    </div>
  );
}
