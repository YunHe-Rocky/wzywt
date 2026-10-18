"use client";

import { PageHeading } from "@/web/components/arena/PageHeading";

import { useState, useMemo } from "react";
import { useEquipment } from "@/features/equipment/client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PageEntrance } from "@/web/components/layout/PageEntrance";
import { TIER_LABELS, TIER_FILTERS, CHAR_TAGS, CHAR_COLORS, STAT_PCT_KEYS, STAT_LONG_LABELS } from "@/core/game";

function matchesFilter(item: any, tier: number, charTag: string): boolean {
  const itemTier = item.meta?.tier ?? (item.extraJson as any)?.tier ?? 0;
  if (tier > 0 && itemTier !== tier) return false;
  if (charTag) {
    const itemTags = item.tags ?? (item.extraJson as any)?.tags ?? [];
    if (!itemTags.includes(charTag)) return false;
  }
  return true;
}

export default function EquipmentPage() {
  const { items, loading, error, refetch } = useEquipment();
  const [tier, setTier] = useState(0);
  const [charTag, setCharTag] = useState("");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() =>
    items
      .filter((item) => matchesFilter(item, tier, charTag))
      .filter((item) => item.name.includes(search)),
    [items, tier, charTag, search]);

  const pathname = usePathname();
  const prefix = pathname === "/m" || pathname.startsWith("/m/") ? "/m" : "";


  return <PageEntrance><div className="page-shell page-shell--wide arena-equipment-page">
    <PageHeading eyebrow="图鉴 / 兵器篇" title="装备图鉴" description={`共 ${items.length} 件装备 · 查属性、看合成，为这局挑一套。`} icon="swords" />
    {loading ? <div className="skeleton" role="status" aria-label="正在加载装备" style={{ height: 400 }} /> : error ? <div className="yanwu-feedback" role="alert"><p>装备数据加载失败，请检查网络后重试</p><button type="button" className="btn-primary" onClick={() => void refetch()}>重新加载</button></div> : <>
      <div className="arena-filter-panel">
        <input aria-label="搜索装备名称" placeholder="搜索装备名称..." value={search} onChange={e => setSearch(e.target.value)} />
        <div className="yanwu-filter-group"><span>等级</span><div className="yanwu-filter-options">{TIER_FILTERS.map(t => <button type="button" key={t.value} aria-pressed={tier === t.value} className={tier === t.value ? "btn-primary" : "btn-subtle"} onClick={() => setTier(t.value)}>{t.label}</button>)}</div></div>
        <div className="yanwu-filter-group"><span>特性</span><div className="yanwu-filter-options"><button type="button" aria-pressed={!charTag} className={!charTag ? "btn-primary" : "btn-subtle"} onClick={() => setCharTag("")}>全部</button>{CHAR_TAGS.map(tag => <button type="button" key={tag} aria-pressed={charTag === tag} className={charTag === tag ? "btn-primary" : "btn-subtle"} onClick={() => setCharTag(charTag === tag ? "" : tag)}>{tag}</button>)}</div></div>
      </div>
      {filtered.length === 0 ? <div className="yanwu-feedback">{search ? `未找到匹配“${search}”的装备` : "没有匹配的装备"}</div> : <div className="arena-equipment-grid">{filtered.map(item => <article key={item.id} className="yanwu-equipment-row">
        <div className="yanwu-equipment-image"><img src={item.meta?.imageUrl || `/equipment/images/${item.id}.png`} alt={item.name} loading="lazy" width={64} height={64} onError={e => { e.currentTarget.style.display = "none"; e.currentTarget.parentElement!.textContent = item.name[0]; }} /></div>
        <div className="yanwu-equipment-copy">
          <div className="yanwu-equipment-title"><h2><Link href={`${prefix}/equipment/${item.id}`}>{item.name}</Link></h2><span className="yanwu-equipment-price">{item.meta?.price} 金</span>{item.meta?.tier ? <span className="yanwu-equipment-tier">{TIER_LABELS[item.meta.tier]}</span> : null}</div>
          <div className="yanwu-equipment-stats">{(item.stats ?? []).map(stat => <span key={stat.stat}>+{stat.value}{STAT_PCT_KEYS.has(stat.stat) ? "%" : ""} {STAT_LONG_LABELS[stat.stat] || stat.stat}</span>)}</div>
          {(item.effects ?? []).map((effect, i) => <p className="yanwu-equipment-passive" key={i}><strong>{effect.unique ? "唯一" : ""}被动 · {effect.name}：</strong>{effect.desc}</p>)}
        </div>
      </article>)}</div>}
    </>}
  </div></PageEntrance>;
}
