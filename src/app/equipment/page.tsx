"use client";

import { useState, useMemo } from "react";
import { useEquipment } from "@/hooks/useEquipment";
import { PageEntrance } from "@/components/layout/PageEntrance";
import { TIER_LABELS, TIER_FILTERS, CHAR_TAGS, CHAR_COLORS, STAT_PCT_KEYS, STAT_LONG_LABELS } from "@/engine";

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
  const { items, loading } = useEquipment();
  const [tier, setTier] = useState(0);
  const [charTag, setCharTag] = useState("");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() =>
    items
      .filter((item) => matchesFilter(item, tier, charTag))
      .filter((item) => item.name.includes(search)),
    [items, tier, charTag, search]);

  const clearAll = () => { setTier(0); setCharTag(""); setSearch(""); };

  if (loading) {
    return (
      <PageEntrance>
      <div className="stagger-enter" style={{ maxWidth: 960, margin: "0 auto", padding: "40px 24px" }}>
        <div className="skeleton" style={{ height: 400 }} />
      </div>
      </PageEntrance>
    );
  }

  return (
    <PageEntrance>
    <div className="stagger-enter" style={{ maxWidth: 960, margin: "0 auto", padding: "40px 24px" }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text)", margin: "0 0 8px" }}>
          装备图鉴
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: 0 }}>
          共 {items.length} 件装备 · {tier > 0 ? TIER_LABELS[tier] : "全部等级"}{charTag ? ` · ${charTag}` : ""}
        </p>
      </div>

      {/* Filters */}
      <div style={{ marginBottom: 24 }}>
        {/* Search */}
        <input
          type="text"
          placeholder="搜索装备名称..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 260, marginBottom: 16 }}
        />

        {/* 等级筛选 */}
        <div style={{ marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginRight: 10, letterSpacing: 1 }}>
            等级
          </span>
          <div style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
            {TIER_FILTERS.map((t) => (
              <button
                key={t.value}
                onClick={() => setTier(t.value)}
                className={tier === t.value ? "btn-primary" : "btn-subtle"}
                style={{ padding: "5px 12px", fontSize: 12, fontWeight: tier === t.value ? 600 : 400 }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* 特性筛选 */}
        <div>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginRight: 10, letterSpacing: 1 }}>
            特性
          </span>
          <div style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
            <button
              onClick={() => setCharTag("")}
              className={!charTag ? "btn-primary" : "btn-subtle"}
              style={{ padding: "5px 12px", fontSize: 12, fontWeight: !charTag ? 600 : 400 }}
            >
              全部
            </button>
            {CHAR_TAGS.map((tag) => {
              const color = CHAR_COLORS[tag];
              return (
                <button
                  key={tag}
                  onClick={() => setCharTag(charTag === tag ? "" : tag)}
                  style={{
                    padding: "5px 12px", fontSize: 12,
                    fontWeight: charTag === tag ? 600 : 400,
                    border: charTag === tag ? `1px solid ${color}` : "1px solid var(--border)",
                    background: charTag === tag ? `${color}18` : "var(--bg-card)",
                    color: charTag === tag ? color : "var(--text-secondary)",
                    borderRadius: 6, cursor: "pointer",
                  }}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <p style={{ textAlign: "center", color: "var(--text-muted)", padding: "60px 0", fontSize: 14 }}>
          {search ? `未找到匹配"${search}"的装备` : "没有匹配的装备"}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((item) => {
            const effects = item.effects ?? [];
            const tier = item.meta?.tier;
            const imageUrl = item.meta?.imageUrl;
            const stats = item.stats ?? [];
            const cat = (item.tags ?? []).find((t: string) => CHAR_COLORS[t]);
            const accent = cat ? CHAR_COLORS[cat] : "var(--border)";
            return (
              <div
                key={item.id}
                className="card"
                style={{
                  padding: "14px 18px",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 14,
                  borderLeft: `3px solid ${accent}30`,
                }}
              >
                {/* Icon */}
                <div style={{
                  width: 52, height: 52, borderRadius: 12, flexShrink: 0,
                  overflow: "hidden", background: "var(--bg-hover)",
                  border: "1px solid var(--border)",
                }}>
                  <img
                    src={imageUrl || `/equipment/images/${item.id}.png`}
                    alt={item.name}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    onError={(e) => {
                      const t = e.target as HTMLImageElement;
                      t.style.display = "none";
                      t.parentElement!.textContent = item.name[0];
                      t.parentElement!.style.display = "flex";
                      t.parentElement!.style.alignItems = "center";
                      t.parentElement!.style.justifyContent = "center";
                      t.parentElement!.style.fontSize = "20px";
                      t.parentElement!.style.color = "var(--text-muted)";
                    }}
                  />
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
                      {item.name}
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: "var(--gold)",
                      padding: "1px 6px", borderRadius: 3,
                      background: "var(--gold-alpha-08)",
                    }}>
                      {item.meta?.price}
                    </span>
                    {tier && (
                      <span style={{
                        fontSize: 10, padding: "1px 5px", borderRadius: 3,
                        background: "var(--bg-hover)", color: "var(--text-muted)",
                        border: "1px solid var(--border)",
                      }}>
                        {TIER_LABELS[tier as number]}
                      </span>
                    )}
                  </div>

                  {/* Stats */}
                  {stats.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 8px", marginBottom: 4 }}>
                      {stats.map((s: any) => (
                        <span key={s.stat} style={{ fontSize: 11, color: "#44aacc" }}>
                          +{s.value}{STAT_PCT_KEYS.has(s.stat) ? "%" : ""} {(STAT_LONG_LABELS as any)[s.stat] || s.stat}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Passives */}
                  {effects.map((e: any, i: number) => (
                    <div key={i} style={{
                      fontSize: 11,
                      color: e.unique ? "#e8aa3c" : "#7eb855",
                      marginTop: 2, lineHeight: 1.5,
                    }}>
                      <span style={{ fontWeight: 600 }}>
                        {e.unique ? "唯一" : ""}被动-{e.name}：
                      </span>
                      {e.desc}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
    </PageEntrance>
  );
}
