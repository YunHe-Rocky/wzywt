"use client";

import { useEffect, useState } from "react";
import { ROLE_BADGES, CLASS_BADGES, ROLES, CLASS_TO_LANE } from "@/core/game";
import { apiRequest, jsonRequest } from "@/features/shared/client/api";

interface Hero {
  heroId: number;
  name: string;
  title: string;
  roleType: string;
  secondaryRoleTypes: string[];
  heroType: number;
  heroType2: number;
}

export default function AdminHeroesPage() {
  const [heroes, setHeroes] = useState<Hero[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});

  useEffect(() => {
    const controller = new AbortController();
    void apiRequest<Hero[]>("/api/heroes", { signal: controller.signal })
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        setHeroes(Array.isArray(data)
          ? data.map((hero) => ({ ...hero, secondaryRoleTypes: hero.secondaryRoleTypes ?? [] }))
          : []);
      })
      .catch(() => { if (!controller.signal.aborted) setHeroes([]); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  async function saveLanes(heroId: number, roleType: string, secondaryRoleTypes: string[]) {
    setSaving((prev) => ({ ...prev, [heroId]: true }));
    setErrors((prev) => { const n = { ...prev }; delete n[heroId]; return n; });

    try {
      const normalizedSecondary = secondaryRoleTypes.filter((lane) => lane !== roleType);
      const res = await jsonRequest<{ error?: string }>(`/api/heroes/${heroId}`, "PATCH", { roleType, secondaryRoleTypes: normalizedSecondary });

      if (res.ok) {
        setHeroes((prev) => prev.map((hero) => (
          hero.heroId === heroId
            ? { ...hero, roleType, secondaryRoleTypes: normalizedSecondary }
            : hero
        )));
      } else {
        setErrors((prev) => ({ ...prev, [heroId]: res.data.error || "保存失败" }));
      }
    } catch {
      setErrors((prev) => ({ ...prev, [heroId]: "网络异常，请重试" }));
    } finally {
      setSaving((prev) => { const n = { ...prev }; delete n[heroId]; return n; });
    }
  }

  const filtered = heroes.filter((h) => {
    if (!filter) return true;
    if (filter === "changed") {
      const d = CLASS_TO_LANE[h.heroType];
      return d && h.roleType !== d;
    }
    return h.roleType === filter || h.secondaryRoleTypes.includes(filter);
  });

  if (loading) {
    return <div className="px-6 py-8"><div className="skeleton h-[400px] rounded-lg" /></div>;
  }

  return (
    <div className="px-6 py-8">
      <h1 className="text-xl font-bold mb-1">英雄分路管理</h1>
      <p className="text-[12px] text-text-muted mb-5">主分路与附属分路修改即保存 · 同步不覆盖 · 共 {heroes.length} 位英雄</p>

      {/* Filter */}
      <div className="flex gap-1.5 mb-5 flex-wrap">
        <button onClick={() => setFilter("")}
          className={`px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors ${
            filter === "" ? "bg-gold/10 text-gold border border-gold/20" : "text-text-muted hover:text-text border border-transparent hover:bg-black/3"
          }`}>
          全部
        </button>
        {ROLES.map((r) => (
          <button key={r} onClick={() => setFilter(r)}
            className={`px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors ${
              filter === r ? "bg-gold/10 text-gold border border-gold/20" : "text-text-muted hover:text-text border border-transparent hover:bg-black/3"
            }`}>
            {ROLE_BADGES[r].label}
          </button>
        ))}
        <button onClick={() => setFilter("changed")}
          className={`px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors ${
            filter === "changed" ? "bg-gold/10 text-gold border border-gold/20" : "text-text-muted hover:text-text border border-transparent hover:bg-black/3"
          }`}>
          已修正
        </button>
      </div>

      {/* Table */}
      <div className="card !p-0 overflow-hidden">
        <div style={{ overflowX: "auto" }}>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border-light bg-black/[0.015]">
                <th className="py-3 px-5 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wider">#</th>
                <th className="py-3 px-5 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wider">英雄</th>
                <th className="py-3 px-5 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wider">职业</th>
                <th className="py-3 px-5 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wider">分路</th>
                <th className="py-3 px-5 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wider min-w-[300px]">附属分路</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((hero) => {
                const cls = CLASS_BADGES[hero.heroType];
                const lane = ROLE_BADGES[hero.roleType];
                const defaultLane = CLASS_TO_LANE[hero.heroType];
                const isModified = hero.roleType !== defaultLane;
                const isSaving = saving[hero.heroId];
                const err = errors[hero.heroId];

                return (
                  <tr key={hero.heroId} className="border-b border-border-light transition-colors hover:bg-black/[0.02]">
                    <td className="py-3 px-5 text-text-muted text-[12px] font-mono">{hero.heroId}</td>
                    <td className="py-3 px-5">
                      <span className="font-semibold text-text">{hero.name}</span>
                      <span className="text-[12px] text-text-muted ml-2">{hero.title}</span>
                    </td>
                    <td className="py-3 px-5">
                      <div className="flex gap-1">
                        {cls && (
                          <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold border"
                            style={{ background: cls.color + "15", color: cls.color, borderColor: cls.color + "30" }}>
                            {cls.label}
                          </span>
                        )}
                        {hero.heroType2 > 0 && CLASS_BADGES[hero.heroType2] && (
                          <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold border"
                            style={{
                              background: CLASS_BADGES[hero.heroType2].color + "12",
                              color: CLASS_BADGES[hero.heroType2].color,
                              borderColor: CLASS_BADGES[hero.heroType2].color + "25",
                            }}>
                            {CLASS_BADGES[hero.heroType2].label}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-2">
                        <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold border shrink-0 w-[72px] text-center"
                          style={{
                            background: lane ? lane.color + "15" : "var(--bg-hover)",
                            color: lane ? lane.color : "var(--text-muted)",
                            borderColor: lane ? lane.color + "30" : "var(--border)",
                          }}>
                          {lane ? lane.label : hero.roleType}
                          {isModified && <span className="text-[9px] text-gold ml-0.5">*</span>}
                        </span>
                        <select
                          value={hero.roleType}
                          disabled={isSaving}
                          onChange={(e) => void saveLanes(hero.heroId, e.target.value, hero.secondaryRoleTypes)}
                          className="text-[12px] w-[120px] px-2.5 py-1 rounded-md border border-border-light bg-input text-text disabled:opacity-50 focus:outline-none focus:border-gold/30"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_BADGES[r].label}{r === defaultLane ? " (默认)" : ""}
                            </option>
                          ))}
                        </select>
                        {isSaving && <span className="text-[11px] text-gold shrink-0 animate-pulse">保存中...</span>}
                        {err && <span className="text-[11px] text-red shrink-0">{err}</span>}
                      </div>
                    </td>
                    <td className="py-3 px-5">
                      <div className="flex flex-wrap gap-1.5" aria-label={`${hero.name}附属分路`}>
                        {ROLES.filter((role) => role !== hero.roleType).map((role) => {
                          const selected = hero.secondaryRoleTypes.includes(role);
                          const badge = ROLE_BADGES[role];
                          return (
                            <button
                              key={role}
                              type="button"
                              disabled={isSaving}
                              aria-pressed={selected}
                              onClick={() => {
                                const next = selected
                                  ? hero.secondaryRoleTypes.filter((lane) => lane !== role)
                                  : [...hero.secondaryRoleTypes, role];
                                void saveLanes(hero.heroId, hero.roleType, next);
                              }}
                              className="min-h-9 px-2.5 rounded-md text-[11px] font-semibold border transition-colors disabled:opacity-50"
                              style={{
                                background: selected ? `${badge.color}18` : "var(--bg-input)",
                                color: selected ? badge.color : "var(--text-muted)",
                                borderColor: selected ? `${badge.color}45` : "var(--border-light)",
                              }}
                            >
                              {badge.label}
                            </button>
                          );
                        })}
                        {hero.secondaryRoleTypes.length === 0 && (
                          <span className="self-center text-[11px] text-text-muted">未设置</span>
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
