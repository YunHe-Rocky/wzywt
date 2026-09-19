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

  return <div className="admin-page">
    <header className="admin-page-heading"><div><p className="feature-kicker">HERO DIRECTORY</p><h1>英雄分路管理</h1><p>主分路与附属分路修改即保存 · 同步不覆盖 · 共 {heroes.length} 位英雄</p></div></header>
    <div className="admin-hero-filters" aria-label="分路筛选">
      {[["","全部"],...ROLES.map(role => [role,ROLE_BADGES[role].label]),["changed","已修正"]].map(([value,label]) => <button key={value} className="btn-subtle" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
    </div>
    {loading ? <p role="status" className="admin-empty">正在加载英雄…</p> : !filtered.length ? <p className="admin-empty">没有符合条件的英雄</p> : <div className="admin-table-wrap" role="region" aria-label="英雄分路表格" tabIndex={0}>
      <table className="admin-table"><caption>逐行编辑主分路和附属分路 · 窄屏可横向滚动</caption><thead><tr>{["编号","英雄","职业","主分路","附属分路"].map(title => <th scope="col" key={title}>{title}</th>)}</tr></thead>
        <tbody>{filtered.map(hero => <tr key={hero.heroId}><td>{hero.heroId}</td><td className="admin-name"><strong>{hero.name}</strong><p>{hero.title}</p></td>
          <td><span className="admin-state">{CLASS_BADGES[hero.heroType]?.label}</span>{hero.heroType2 > 0 && <span className="admin-state">{CLASS_BADGES[hero.heroType2]?.label}</span>}</td>
          <td><label><span className="sr-only">{hero.name}主分路</span><select aria-label={hero.name+"主分路"} value={hero.roleType} disabled={saving[hero.heroId]} onChange={event => void saveLanes(hero.heroId,event.target.value,hero.secondaryRoleTypes)}>{ROLES.map(role => <option key={role} value={role}>{ROLE_BADGES[role].label}{role === CLASS_TO_LANE[hero.heroType] ? "（默认）" : ""}</option>)}</select></label>
            {saving[hero.heroId] && <p role="status">保存中…</p>}{errors[hero.heroId] && <p role="alert" className="admin-danger">{errors[hero.heroId]}</p>}
          </td><td className="admin-secondary-lanes"><div className="admin-row-actions" aria-label={hero.name+"附属分路"}>{ROLES.filter(role => role !== hero.roleType).map(role => {
            const selected=hero.secondaryRoleTypes.includes(role);
            return <button key={role} className="btn-subtle" disabled={saving[hero.heroId]} aria-pressed={selected} onClick={() => void saveLanes(hero.heroId,hero.roleType,selected ? hero.secondaryRoleTypes.filter(lane => lane !== role) : [...hero.secondaryRoleTypes,role])}>{selected ? "✓ " : ""}{ROLE_BADGES[role].label}</button>;
          })}</div>{!hero.secondaryRoleTypes.length && <p>未设置</p>}</td>
        </tr>)}</tbody>
      </table>
    </div>}
  </div>;
}
