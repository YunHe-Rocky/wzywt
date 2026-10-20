"use client";

import { useEffect, useState } from "react";
import { ROLE_BADGES, CLASS_BADGES, ROLES, CLASS_TO_LANE } from "@/core/game";
import { apiRequest, jsonRequest } from "@/features/shared/client/api";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminRoutePrefix } from "@/features/admin/navigation";

interface Hero {
  heroId: number;
  name: string;
  title: string;
  roleType: string;
  secondaryRoleTypes: string[];
  heroType: number;
  heroType2: number;
}

export function HeroLaneManager() {
  const prefix = adminRoutePrefix(usePathname());
  const [heroes, setHeroes] = useState<Hero[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [query, setQuery] = useState("");
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setLoadError("");
    void apiRequest<Hero[]>("/api/heroes", { signal: controller.signal })
      .then(({ ok, data }) => {
        if (controller.signal.aborted) return;
        if (!ok || !Array.isArray(data)) throw new Error("英雄资料加载失败");
        setHeroes(Array.isArray(data)
          ? data.map((hero) => ({ ...hero, secondaryRoleTypes: hero.secondaryRoleTypes ?? [] }))
          : []);
      })
      .catch(() => { if (!controller.signal.aborted) setLoadError("英雄资料加载失败，请重新加载。"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);

  async function saveLanes(heroId: number, roleType: string, secondaryRoleTypes: string[]) {
    if (saving[heroId]) return;
    setNotice("");
    setSaving((prev) => ({ ...prev, [heroId]: true }));
    setErrors((prev) => { const n = { ...prev }; delete n[heroId]; return n; });

    try {
      const normalizedSecondary = secondaryRoleTypes.filter((lane) => lane !== roleType);
      const res = await jsonRequest<{ error?: string }>(`/api/heroes/${heroId}`, "PATCH", { roleType, secondaryRoleTypes: normalizedSecondary });

      if (res.ok) {
        setNotice(`${heroes.find(hero => hero.heroId === heroId)?.name || "英雄"}的分路已保存`);
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
    if (query.trim() && !`${h.name} ${h.title} ${h.heroId}`.includes(query.trim())) return false;
    if (!filter) return true;
    if (filter === "changed") {
      const d = CLASS_TO_LANE[h.heroType];
      return d && h.roleType !== d;
    }
    return h.roleType === filter || h.secondaryRoleTypes.includes(filter);
  });

  return <div className="admin-page">
    <header className="admin-page-heading"><div><p className="feature-kicker">HERO DIRECTORY</p><h1>英雄分路管理</h1><p>修改即保存，同步保留人工修正 · 共 {heroes.length} 位英雄</p></div><Link className="btn-subtle" href={`${prefix}/admin/settings`}>同步英雄资料</Link></header>
    <div className="admin-filter-bar"><label>查找英雄<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="英雄名称、称号或编号" /></label><p className="settings-help">筛选结果 {filtered.length} 位</p></div>
    <div className="admin-hero-filters" aria-label="分路筛选">
      {[["","全部"],...ROLES.map(role => [role,ROLE_BADGES[role].label]),["changed","已修正"]].map(([value,label]) => <button key={value} className="btn-subtle" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
    </div>
    {notice && <p className="admin-notice" role="status">{notice}</p>}
    {loadError && <div role="alert" className="admin-error"><p>{loadError}</p><button className="btn-subtle" onClick={() => setRevision(value => value + 1)}>重新加载英雄</button></div>}
    {loading ? <p role="status" className="admin-empty">正在加载英雄…</p> : !filtered.length ? <p className="admin-empty">没有符合条件的英雄</p> : <div className="admin-table-wrap admin-card-table-wrap" role="region" aria-label="英雄分路表格" tabIndex={0}>
      <table className="admin-table admin-card-table" role="table"><caption>先选择主分路，再勾选附属分路；每次修改自动保存。</caption><thead><tr role="row">{["编号","英雄","职业","主分路","附属分路"].map(title => <th scope="col" role="columnheader" key={title}>{title}</th>)}</tr></thead>
        <tbody>{filtered.map(hero => <tr key={hero.heroId} role="row"><td data-label="英雄编号" role="cell">#{hero.heroId}</td><td className="admin-name admin-card-title" data-label="英雄" role="cell"><strong>{hero.name}</strong><p>{hero.title}</p></td>
          <td data-label="职业" role="cell"><span className="admin-state">{CLASS_BADGES[hero.heroType]?.label}</span>{hero.heroType2 > 0 && <span className="admin-state">{CLASS_BADGES[hero.heroType2]?.label}</span>}</td>
          <td data-label="主分路" role="cell"><label><span className="sr-only">{hero.name}主分路</span><select aria-label={hero.name+"主分路"} value={hero.roleType} disabled={saving[hero.heroId]} onChange={event => void saveLanes(hero.heroId,event.target.value,hero.secondaryRoleTypes)}>{ROLES.map(role => <option key={role} value={role}>{ROLE_BADGES[role].label}{role === CLASS_TO_LANE[hero.heroType] ? "（默认）" : ""}</option>)}</select></label>
            {saving[hero.heroId] && <p role="status">保存中…</p>}{errors[hero.heroId] && <p role="alert" className="admin-danger">{errors[hero.heroId]}</p>}
          </td><td className="admin-secondary-lanes" data-label="附属分路" role="cell"><div className="admin-row-actions" aria-label={hero.name+"附属分路"}>{ROLES.filter(role => role !== hero.roleType).map(role => {
            const selected=hero.secondaryRoleTypes.includes(role);
            return <button key={role} className="btn-subtle" disabled={saving[hero.heroId]} aria-pressed={selected} onClick={() => void saveLanes(hero.heroId,hero.roleType,selected ? hero.secondaryRoleTypes.filter(lane => lane !== role) : [...hero.secondaryRoleTypes,role])}>{selected ? "✓ " : ""}{ROLE_BADGES[role].label}</button>;
          })}</div>{!hero.secondaryRoleTypes.length && <p>未设置</p>}</td>
        </tr>)}</tbody>
      </table>
    </div>}
  </div>;
}
