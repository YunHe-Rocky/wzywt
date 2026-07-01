"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useHeroes } from "@/hooks/useHeroes";
import { cardStagger } from "@/engine";

interface Hero {
  heroId: number;
  name: string;
  title: string;
  roleType: string;
  heroType: number;
  heroType2: number;
  imageUrl: string;
  mingge: boolean;
  minggeName?: string | null;
  minggeRelatedId?: number | null;
}

import { ROLE_BADGES, CLASS_BADGES, ROLE_FILTERS, CLASS_FILTERS } from "@/engine";

function HeroImage({ hero }: { hero: Hero }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  // Use user's preferred skin if stored in localStorage, otherwise DB default
  const skinIndex = (() => {
    try { return parseInt(localStorage.getItem(`hero_skin_${hero.heroId}`) || "") || 1; }
    catch { return 1; }
  })();
  const imageUrl = skinIndex === 1
    ? hero.imageUrl  // DB default (works for all heroes including 大禹)
    : `https://game.gtimg.cn/images/yxzj/img201606/skin/hero-info/${hero.heroId}/${hero.heroId}-bigskin-${skinIndex}.jpg`;

  return (
    <div
      style={{
        width: "100%",
        aspectRatio: "1",
        background: "var(--bg-hover)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Placeholder while loading */}
      {!loaded && !failed && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(135deg, var(--gold-alpha-08), var(--gold-alpha-04))",
          }}
        >
          <span style={{ fontSize: 32, fontWeight: 800, color: "var(--gold-alpha-20)" }}>
            {hero.name[0]}
          </span>
        </div>
      )}
      {/* Failed fallback */}
      {failed && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--bg-card)",
          }}
        >
          <span style={{ fontSize: 32, fontWeight: 800, color: "var(--text-muted)" }}>
            {hero.name[0]}
          </span>
        </div>
      )}
      <img
        src={imageUrl}
        alt={hero.name}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: loaded ? 1 : 0,
          transition: "opacity 0.3s",
        }}
      />
    </div>
  );
}

function CardInfo({ hero, form, minggeHero, onToggle }: { hero: Hero; form: string; minggeHero?: Hero; onToggle: (h: Hero) => void }) {
  const displayHero = (form === "mingge" && minggeHero) ? minggeHero : hero;
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{displayHero.name}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{displayHero.title}</div>
        </div>
        {hero.mingge && hero.minggeRelatedId && (
          <button onClick={(e) => { e.stopPropagation(); onToggle(hero); }}
            title={form === "mingge" ? "切回本命" : "切换命格"}
            style={{ width: 26, height: 26, borderRadius: "50%", border: "1px solid rgba(232,170,60,0.3)", background: form === "mingge" ? "rgba(232,170,60,0.15)" : "transparent", color: form === "mingge" ? "#d4992a" : "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
            ⇄
          </button>
        )}
      </div>
      <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
        {displayHero.heroType > 0 && CLASS_BADGES[displayHero.heroType] && (
          <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 6px", borderRadius: 3, fontSize: 10, fontWeight: 600, background: CLASS_BADGES[displayHero.heroType].color + "20", color: CLASS_BADGES[displayHero.heroType].color, border: "1px solid " + CLASS_BADGES[displayHero.heroType].color + "30" }}>
            {CLASS_BADGES[displayHero.heroType].label}
          </span>
        )}
        {ROLE_BADGES[displayHero.roleType] && (
          <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 6px", borderRadius: 3, fontSize: 10, fontWeight: 600, background: ROLE_BADGES[displayHero.roleType].color + "18", color: ROLE_BADGES[displayHero.roleType].color, border: "1px solid " + ROLE_BADGES[displayHero.roleType].color + "25" }}>
            {ROLE_BADGES[displayHero.roleType].label}
          </span>
        )}
        {form === "mingge" && (
          <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 6px", borderRadius: 3, fontSize: 10, fontWeight: 700, background: "rgba(232,170,60,0.12)", color: "#d4992a", border: "1px solid rgba(232,170,60,0.25)" }}>
            命格
          </span>
        )}
      </div>
    </>
  );
}

export function HeroGrid() {
  const router = useRouter();
  const [roleFilter, setRoleFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [search, setSearch] = useState("");
  const [cardForms, setCardForms] = useState<Record<number, "base" | "mingge">>({});
  const [minggeHeroes, setMinggeHeroes] = useState<Record<number, Hero>>({});
  const { heroes, loading, error: fetchError, refetch } = useHeroes(roleFilter || undefined, classFilter || undefined);

  const toggleCardForm = async (hero: Hero) => {
    const current = cardForms[hero.heroId] || "base";
    if (current === "base") {
      // 切换到命格 — 先检查是否已加载
      if (!minggeHeroes[hero.heroId] && hero.minggeRelatedId) {
        try {
          const res = await fetch(`/api/heroes/${hero.minggeRelatedId}`);
          const data = await res.json();
          if (data.heroId) {
            setMinggeHeroes(prev => ({ ...prev, [hero.heroId]: data }));
          }
        } catch {}
      }
      setCardForms(prev => ({ ...prev, [hero.heroId]: "mingge" }));
    } else {
      setCardForms(prev => ({ ...prev, [hero.heroId]: "base" }));
    }
  };

  // SSE: auto-refresh when hero data changes
  useEffect(() => {
    const es = new EventSource("/api/heroes/watch");
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "heroes-updated") {
          refetch();
        }
      } catch {}
    };
    return () => es.close();
  }, [refetch]);

  // 命格形态名称集合（如"心魔六耳"），这些英雄不在图鉴中单独展示
  const minggeFormNames = new Set(heroes.filter(h => h.mingge && h.minggeName).map(h => h.minggeName!));

  const filtered = heroes
    .filter((h) => !minggeFormNames.has(h.name)) // 隐藏命格形态
    .filter((h) => h.name.includes(search) || h.title.includes(search));

  return (
    <div className="stagger-enter" style={{ maxWidth: 960, margin: "0 auto", padding: "40px 24px" }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text)", margin: "0 0 8px" }}>
          英雄图鉴
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: 0 }}>
          共 {heroes.length} 位英雄 · 浏览详情与技能
        </p>
      </div>

      {/* Filters */}
      <div style={{ marginBottom: 24 }}>
        {/* Search */}
        <input
          type="text"
          placeholder="搜索英雄名称..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 260, marginBottom: 16 }}
        />

        {/* 分路筛选 */}
        <div style={{ marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginRight: 10, letterSpacing: 1 }}>
            分路
          </span>
          <div style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
            {ROLE_FILTERS.map((r) => (
              <button
                key={r.value}
                onClick={() => setRoleFilter(r.value)}
                className={roleFilter === r.value ? "btn-primary" : "btn-subtle"}
                style={{ padding: "5px 12px", fontSize: 12, fontWeight: roleFilter === r.value ? 600 : 400 }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* 职业筛选 */}
        <div>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginRight: 10, letterSpacing: 1 }}>
            职业
          </span>
          <div style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
            {CLASS_FILTERS.map((c) => (
              <button
                key={c.value}
                onClick={() => setClassFilter(c.value)}
                className={classFilter === c.value ? "btn-primary" : "btn-subtle"}
                style={{ padding: "5px 12px", fontSize: 12, fontWeight: classFilter === c.value ? 600 : 400 }}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* Error state */}
      {fetchError && (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <p style={{ color: "var(--text-secondary)", marginBottom: 16 }}>加载失败，请检查网络后重试</p>
          <button className="btn-primary" onClick={() => setRoleFilter(roleFilter)} style={{ fontSize: 13 }}>
            重新加载
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !fetchError && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
          {Array.from({ length: 24 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 220 }} />
          ))}
        </div>
      )}

      {/* Hero Grid */}
      {!loading && !fetchError && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
            gap: 12,
          }}
        >
          {filtered.map((hero, i) => (
            <button
              key={hero.heroId}
              onClick={() => router.push(`/heroes/${hero.heroId}`)}
              className="card"
              style={{
                padding: 0,
                overflow: "hidden",
                cursor: "pointer",
                ...cardStagger(i),
                textAlign: "left",
              }}
            >
              <HeroImage hero={(cardForms[hero.heroId] === "mingge" && minggeHeroes[hero.heroId]) || hero} />
              <div style={{ padding: "10px 12px 12px" }}>
                <CardInfo hero={hero} form={cardForms[hero.heroId] || "base"} minggeHero={minggeHeroes[hero.heroId]} onToggle={toggleCardForm} />
              </div>
            </button>
          ))}
        </div>
      )}

      {!loading && !fetchError && filtered.length === 0 && (
        <p style={{ textAlign: "center", color: "var(--text-muted)", padding: "60px 0", fontSize: 14 }}>
          未找到匹配&quot;{search}&quot;的英雄
        </p>
      )}

    </div>
  );
}
