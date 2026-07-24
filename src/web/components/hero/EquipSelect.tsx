"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { STAT_LONG_LABELS, STAT_PCT_KEYS, CHAR_TAGS, CHAR_COLORS } from "@/core/game";
import { getEquipment } from "@/features/equipment/client/api";

interface EquipItem {
  id: number; name: string;
  meta: { price: number; tier?: number; imageUrl?: string };
  stats: { stat: string; value: number }[];
  tags: string[];
}

interface Props {
  value: number[];
  onChange: (ids: number[]) => void;
}

let cache: EquipItem[] | null = null;

export function EquipSelect({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<EquipItem[]>([]);
  const [mode, setMode] = useState<"t3" | "all">("t3");
  const [cat, setCat] = useState(""); // category filter
  const ref = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const maxSlots = mode === "t3" ? 6 : 24;

  useEffect(() => {
    if (cache) { setItems(cache); return; }
    getEquipment<EquipItem>().then(({ data }) => {
      cache = data;
      setItems(data);
    });
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        if (portalRef.current && portalRef.current.contains(e.target as Node)) return;
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  useEffect(() => {
    if (!open || !ref.current) return;
    function update() {
      if (!ref.current) return;
      const r = ref.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 380) });
    }
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  const filtered = items.filter(eq => {
    if ((eq.meta.tier || 0) < 3) return false; // 两种模式都只要最大级(三级)
    if (cat && !eq.tags.includes(cat)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return eq.name.includes(q) || eq.stats.some(s => (STAT_LONG_LABELS[s.stat] || "").includes(q));
  });

  const toggle = (id: number) => {
    if (value.includes(id)) onChange(value.filter(v => v !== id));
    else if (value.length < maxSlots) onChange([...value, id]);
  };

  const selected = items.filter(eq => value.includes(eq.id));

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Trigger - equipment row */}
      <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
        {/* Mode toggle */}
        <button type="button" onClick={() => setMode(m => m === "t3" ? "all" : "t3")}
          style={{
            padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: "pointer",
            border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-secondary)",
            marginRight: 4,
          }}>
          {mode === "t3" ? "三级(6格)" : "全部(24格)"}
        </button>
        {Array.from({ length: Math.min(maxSlots, mode === "t3" ? 6 : 12) }).map((_, i) => {
          const eq = selected[i];
          return (
            <button key={i} type="button" onClick={() => setOpen(!open)}
              style={{
                width: 38, height: 38, borderRadius: 8, border: "1px solid var(--border)",
                background: eq ? "var(--bg-card)" : "var(--bg-hover)", cursor: "pointer",
                overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
              {eq ? (
                <img src={eq.meta.imageUrl || `/equipment/images/${eq.id}.png`}
                  alt={eq.name}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  onError={e => { (e.target as HTMLImageElement).textContent = "?"; }} />
              ) : (
                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>+</span>
              )}
            </button>
          );
        })}
        {selected.length > 0 && (
          <button type="button" onClick={() => onChange([])}
            className="btn-subtle" style={{ fontSize: 10, marginLeft: 4 }}>清空</button>
        )}
      </div>

      {/* Dropdown portal */}
      {open && createPortal(
        <div ref={portalRef} style={{
          position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: "var(--layer-popover)",
          background: "var(--bg-card)", border: "1px solid var(--border)",
          borderRadius: "var(--radius)", boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          maxHeight: 360, display: "flex", flexDirection: "column",
        }}>
          <div style={{ padding: "8px 8px 0" }}>
            <input type="text" placeholder="搜索装备..." value={search}
              onChange={e => setSearch(e.target.value)} autoFocus
              style={{ fontSize: 13, padding: "8px 10px" }} />
            <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
              <button type="button" onClick={() => setCat("")}
                style={{
                  padding: "2px 8px", borderRadius: 10, fontSize: 11, cursor: "pointer",
                  border: !cat ? "1px solid var(--gold)" : "1px solid var(--border)",
                  background: !cat ? "var(--gold-alpha-08)" : "var(--bg-card)", color: !cat ? "var(--gold)" : "var(--text-secondary)",
                }}>全部</button>
              {CHAR_TAGS.map(tag => (
                <button key={tag} type="button" onClick={() => setCat(cat === tag ? "" : tag)}
                  style={{
                    padding: "2px 8px", borderRadius: 10, fontSize: 11, cursor: "pointer",
                    border: cat === tag ? `1px solid ${CHAR_COLORS[tag]}` : "1px solid var(--border)",
                    background: cat === tag ? `${CHAR_COLORS[tag]}18` : "var(--bg-card)",
                    color: cat === tag ? CHAR_COLORS[tag] : "var(--text-secondary)",
                  }}>{tag}</button>
              ))}
            </div>
          </div>
          <div style={{ overflow: "auto", flex: 1, padding: "4px 4px 8px" }}>
            {filtered.map(eq => {
              const sel = value.includes(eq.id);
              return (
                <button key={eq.id} type="button" onClick={() => toggle(eq.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, width: "100%",
                    padding: "6px 10px", border: "none", borderRadius: 6, cursor: "pointer",
                    background: sel ? "var(--gold-alpha-08)" : "transparent",
                    color: "var(--text)", fontSize: 12, textAlign: "left",
                  }}>
                  <img src={eq.meta.imageUrl || `/equipment/images/${eq.id}.png`}
                    alt={eq.name}
                    style={{ width: 28, height: 28, borderRadius: 6, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{eq.name}</div>
                    <div style={{ fontSize: 10, color: "#44aacc", marginTop: 1 }}>
                      {eq.stats.map(s => `+${s.value}${STAT_PCT_KEYS.has(s.stat)?"%":""} ${STAT_LONG_LABELS[s.stat]||s.stat}`).join(" ")}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: "var(--gold)", flexShrink: 0 }}>{eq.meta.price}</span>
                  {sel && <span style={{ color: "var(--gold)", fontWeight: 700, flexShrink: 0 }}>✓</span>}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
