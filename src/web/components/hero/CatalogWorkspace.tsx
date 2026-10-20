"use client";

import "@/web/styles/public-workflows.css";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

interface CatalogWorkspaceProps {
  kind: "heroes" | "equipment";
  search: string;
  onSearch: (value: string) => void;
  searchLabel: string;
  activeCount: number;
  count: number;
  loading?: boolean;
  onReset: () => void;
  filters: ReactNode;
  children: ReactNode;
}

/** One filter form keeps its state when moving between a side panel and phone disclosure. */
export function CatalogWorkspace({ kind, search, onSearch, searchLabel, activeCount, count, loading, onReset, filters, children }: CatalogWorkspaceProps) {
  const pathname = usePathname();
  const prefix = pathname === "/m" || pathname.startsWith("/m/") ? "/m" : "";
  const [wide, setWide] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 901px)");
    const update = () => setWide(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return <>
    <nav className="catalog-kind-nav" aria-label="图鉴分类">
      <Link href={`${prefix}/heroes`} aria-current={kind === "heroes" ? "page" : undefined}>英雄图鉴<span>分路与技能</span></Link>
      <Link href={`${prefix}/equipment`} aria-current={kind === "equipment" ? "page" : undefined}>装备图鉴<span>属性与合成</span></Link>
    </nav>
    <div className="catalog-workbench">
      <aside className="catalog-control-panel" aria-label="图鉴查询">
        <label className="catalog-search"><span>{searchLabel}</span><input type="search" value={search} onChange={event => onSearch(event.target.value)} placeholder={kind === "heroes" ? "名称、称号或命格" : "输入装备名称"} autoComplete="off" /></label>
        <details className="catalog-filter-disclosure" open={wide || expanded} onToggle={event => { if (!wide) setExpanded(event.currentTarget.open); }}>
          <summary>筛选条件<span>{activeCount ? `已选 ${activeCount} 项` : "全部"}</span></summary>
          <div className="catalog-filter-fields">{filters}</div>
        </details>
        {(activeCount > 0 || search) && <button type="button" className="btn-subtle catalog-reset" onClick={onReset}>清除搜索和筛选</button>}
      </aside>
      <section className="catalog-results" aria-label={kind === "heroes" ? "英雄查询结果" : "装备查询结果"} aria-busy={loading}>
        <div className="catalog-results-toolbar"><p role="status">{loading ? "正在查询…" : <>找到 <strong>{count}</strong> {kind === "heroes" ? "位英雄" : "件装备"}</>}</p><span>{kind === "heroes" ? "点选查看技能与属性" : "点选名称查看合成路径"}</span></div>
        {children}
      </section>
    </div>
  </>;
}
