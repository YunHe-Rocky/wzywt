"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getHeroes } from "@/features/heroes/client/api";
import { ROLE_LABELS, selectHeroesForLane } from "@/core/game";

interface Hero {
  heroId: number;
  name: string;
  title: string;
  imageUrl: string;
  roleType: string;
  secondaryRoleTypes: string[];
}

interface Props {
  roleType: string;
  value: string;
  onChange: (heroId: string, heroName: string) => void;
}

let pinyinModule: typeof import("pinyin").default | null = null;
async function getPinyin() {
  if (!pinyinModule) {
    pinyinModule = (await import("pinyin")).default;
  }
  return pinyinModule;
}

function fuzzyMatch(hero: Hero, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase().trim();

  if (hero.name.includes(q)) return true;
  if (hero.title.includes(q)) return true;

  // Numeric heroId match (no pinyin needed)
  if (String(hero.heroId).includes(q)) return true;

  return false;
}

async function fuzzyMatchPinyin(hero: Hero, query: string): Promise<boolean> {
  const q = query.toLowerCase().trim();

  const pinyin = await getPinyin();

  const pyInitials = pinyin(hero.name, { style: (pinyin as any).STYLE_FIRST_LETTER })
    .map((item: string[]) => item[0])
    .join("")
    .toLowerCase();
  if (pyInitials.includes(q)) return true;

  const pyFull = pinyin(hero.name, { style: (pinyin as any).STYLE_NORMAL })
    .map((item: string[]) => item[0])
    .join("")
    .toLowerCase();
  if (pyFull.includes(q)) return true;

  return false;
}

export function HeroSelect({ roleType, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [heroes, setHeroes] = useState<Hero[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getHeroes<Hero>()
      .then(({ data }) => {
        if (!Array.isArray(data)) return;
        const normalized = data.map((hero) => ({
          ...hero,
          secondaryRoleTypes: hero.secondaryRoleTypes ?? [],
        }));
        const sorted = selectHeroesForLane(normalized, roleType);
        setHeroes(sorted);
      })
      .catch(() => {});
  }, [roleType]);

  const portalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        // 点击 portal 下拉内容时不关闭
        if (portalRef.current && portalRef.current.contains(e.target as Node)) return;
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, maxHeight: 320, sheet: false });
  useEffect(() => {
    if (!open || !ref.current) return;
    function update() {
      if (!ref.current) return;
      const r = ref.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const edge = 12;

      if (viewportWidth <= 640) {
        setPos({
          top: 0,
          left: edge,
          width: viewportWidth - edge * 2,
          maxHeight: Math.min(580, viewportHeight * 0.72),
          sheet: true,
        });
        return;
      }

      const width = Math.min(Math.max(r.width, 340), viewportWidth - edge * 2);
      const left = Math.min(Math.max(edge, r.left), viewportWidth - width - edge);
      const below = viewportHeight - r.bottom - edge;
      const above = r.top - edge;
      const openAbove = below < 300 && above > below;
      const available = Math.max(160, openAbove ? above : below);
      const maxHeight = Math.min(420, available);
      const top = openAbove
        ? Math.max(edge, r.top - maxHeight - 8)
        : Math.min(r.bottom + 8, viewportHeight - maxHeight - edge);

      setPos({ top, left, width, maxHeight, sheet: false });
    }
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const selectedHero = heroes.find((h) => String(h.heroId) === value);

  const [filtered, setFiltered] = useState<Hero[]>(heroes);

  useEffect(() => {
    let cancelled = false;
    // Instant basic filter
    const basic = heroes.filter((h) => fuzzyMatch(h, search));
    setFiltered(basic);
    // Then enhance with pinyin (lazy loaded)
    if (search.trim()) {
      Promise.all(heroes.map(async (h) => {
        if (basic.includes(h)) return h;
        const match = await fuzzyMatchPinyin(h, search);
        return match ? h : null;
      })).then((results) => {
        if (!cancelled) {
          const pinyinResults = results.filter(Boolean) as Hero[];
          if (pinyinResults.length > basic.length) {
            setFiltered([...basic, ...pinyinResults.filter(h => !basic.includes(h))]);
          }
        }
      });
      return () => { cancelled = true; };
    }
  }, [heroes, search]);

  return (
    <div ref={ref} style={{ position: "relative", flex: 1 }}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={selectedHero ? `已选择${selectedHero.name}，打开英雄列表` : "打开英雄列表"}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          minHeight: 44,
          padding: selectedHero ? "6px 8px 6px 10px" : "0 8px 0 12px",
          background: open ? "var(--bg-hover)" : "var(--bg-input)",
          border: `1px solid ${open ? "var(--gold)" : "var(--border)"}`,
          borderRadius: "var(--radius-sm)",
          cursor: "pointer",
          color: selectedHero ? "var(--text)" : "var(--text-secondary)",
          fontSize: 13,
          fontWeight: selectedHero ? 400 : 500,
          transition: "background 0.15s, border-color 0.15s, box-shadow 0.15s",
          textAlign: "left" as const,
          boxSizing: "border-box" as const,
        }}
        onMouseEnter={(e) => {
          if (!open) {
            e.currentTarget.style.background = getComputedStyle(document.documentElement).getPropertyValue("--bg-hover").trim();
            e.currentTarget.style.borderColor = getComputedStyle(document.documentElement).getPropertyValue("--gold").trim();
          }
        }}
        onMouseLeave={(e) => {
          if (!open) {
            e.currentTarget.style.background = getComputedStyle(document.documentElement).getPropertyValue("--bg-input").trim();
            e.currentTarget.style.borderColor = getComputedStyle(document.documentElement).getPropertyValue("--border").trim();
          }
        }}
      >
        {selectedHero ? (
          <>
            <img
              src={selectedHero.imageUrl}
              alt=""
              style={{ width: 28, height: 28, borderRadius: 4, objectFit: "cover" }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                <span style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap" }}>{selectedHero.name}</span>
                <span style={{ color: "var(--text-muted)", fontSize: 10, fontFamily: "monospace", whiteSpace: "nowrap" }}>#{selectedHero.heroId}</span>
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: 10, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{selectedHero.title}</div>
            </div>
          </>
        ) : (
          <>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7, flexShrink: 0 }}>
              <circle cx={12} cy={12} r={10} />
              <path d="M12 8v8M8 12h8" />
            </svg>
            <span style={{ flex: 1 }}>选择英雄</span>
          </>
        )}
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
          style={{ opacity: 0.4, flexShrink: 0, transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "rotate(0)" }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Dropdown — portal to body */}
      {open && createPortal(
        <div
          className="hero-select-layer"
          data-sheet={pos.sheet ? "true" : "false"}
          onMouseDown={(event) => {
            if (pos.sheet && event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div
            ref={portalRef}
            className="hero-select-popover"
            data-hero-select-dropdown=""
            style={{
              top: pos.sheet ? "auto" : pos.top,
              left: pos.left,
              width: pos.width,
              maxHeight: pos.maxHeight,
            }}
          >
          <div className="hero-select-header">
            <input
              type="text"
              placeholder="搜索英雄名、拼音或 ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              aria-label="搜索英雄"
              style={{ minHeight: 44, fontSize: 14, padding: "8px 10px" }}
            />
            <button
              type="button"
              className="btn-ghost"
              aria-label="关闭英雄列表"
              onClick={() => setOpen(false)}
              style={{ width: 44, height: 44, padding: 0, flexShrink: 0, fontSize: 20 }}
            >
              ×
            </button>
          </div>

          <div style={{ padding: "7px 12px 5px", color: "var(--text-muted)", fontSize: 11 }}>
            共 {filtered.length} 位英雄 · 主分路优先，附属分路随后
          </div>

          <div className="hero-select-results" role="listbox" aria-label="英雄候选列表">
            {filtered.length === 0 ? (
              <p style={{ padding: "16px", textAlign: "center", fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
                无匹配英雄
              </p>
            ) : (
              filtered.map((hero) => (
                <button
                  key={hero.heroId}
                  type="button"
                  role="option"
                  aria-selected={String(hero.heroId) === value}
                  className="hero-select-option"
                  onClick={() => {
                    onChange(String(hero.heroId), hero.name);
                    setOpen(false);
                    setSearch("");
                  }}
                  style={{
                    background: String(hero.heroId) === value ? "var(--gold-alpha-08)" : "transparent",
                  }}
                >
                  <img
                    src={hero.imageUrl}
                    alt=""
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 4,
                      objectFit: "cover",
                      background: "var(--bg-hover)",
                    }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                      <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{hero.name}</span>
                      <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "monospace", whiteSpace: "nowrap" }}>#{hero.heroId}</span>
                      <span
                        style={{
                          marginLeft: "auto",
                          padding: "1px 6px",
                          borderRadius: 999,
                          color: hero.roleType === roleType ? "var(--gold)" : "var(--text-muted)",
                          background: hero.roleType === roleType ? "var(--gold-alpha-08)" : "var(--bg-hover)",
                          fontSize: 10,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {hero.roleType === roleType
                          ? ROLE_LABELS[hero.roleType] || hero.roleType
                          : `兼${ROLE_LABELS[roleType] || roleType}`}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{hero.title}</div>
                  </div>
                </button>
              ))
            )}
          </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
