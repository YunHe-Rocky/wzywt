"use client";

import { useEffect, useRef, useState } from "react";

interface Hero {
  heroId: number;
  name: string;
  title: string;
  imageUrl: string;
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
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/heroes?role_type=${roleType}`)
      .then((r) => r.json())
      .then(setHeroes);
  }, [roleType]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (!open || !ref.current) return;
    function update() {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      setDropdownStyle({
        position: "fixed",
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 280),
        zIndex: 9999,
      });
    }
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
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
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          height: 40,
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
            e.currentTarget.style.background = "var(--bg-hover)";
            e.currentTarget.style.borderColor = "rgba(184,152,96,0.3)";
          }
        }}
        onMouseLeave={(e) => {
          if (!open) {
            e.currentTarget.style.background = "var(--bg-input)";
            e.currentTarget.style.borderColor = "var(--border)";
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

      {/* Dropdown */}
      {open && (
        <div
          style={{
            ...dropdownStyle,
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            maxHeight: 320,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Search input */}
          <div style={{ padding: "8px 8px 0" }}>
            <input
              type="text"
              placeholder="搜索（拼音/中文/缩写）..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              style={{ fontSize: 13, padding: "8px 10px" }}
            />
          </div>

          {/* List */}
          <div style={{ overflow: "auto", flex: 1, padding: "4px 4px 8px" }}>
            {filtered.length === 0 ? (
              <p style={{ padding: "16px", textAlign: "center", fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
                无匹配英雄
              </p>
            ) : (
              filtered.map((hero) => (
                <button
                  key={hero.heroId}
                  type="button"
                  onClick={() => {
                    onChange(String(hero.heroId), hero.name);
                    setOpen(false);
                    setSearch("");
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "8px 10px",
                    background: String(hero.heroId) === value ? "rgba(200,169,90,0.08)" : "transparent",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                    color: "var(--text)",
                    fontSize: 13,
                    textAlign: "left",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = String(hero.heroId) === value
                      ? "rgba(200,169,90,0.12)"
                      : "var(--bg-hover)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = String(hero.heroId) === value
                      ? "rgba(200,169,90,0.08)"
                      : "transparent";
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
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{hero.title}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
