"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useHeroes } from "@/features/heroes/client";
import { cardStagger } from "@/web/animation";

interface Hero {
  id: number;
  heroId?: number;
  name: string;
  title: string;
  roleType: string;
  heroType: number;
  heroType2: number;
  imageUrl: string;
  skinsJson?: string;
  mingge: boolean;
  minggeName?: string | null;
  minggeRelatedId?: number | null;
}

import { ROLE_BADGES, CLASS_BADGES, ROLE_FILTERS, CLASS_FILTERS } from "@/core/game";
import { getHero } from "@/features/heroes/client/api";

function HeroImage({ hero }: { hero: Hero }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [candidateIndex, setCandidateIndex] = useState(0);

  // Use user's preferred skin if stored in localStorage, otherwise DB default
  const skinIndex = (() => {
    try { return parseInt(localStorage.getItem(`hero_skin_${hero.id}`) || "") || 1; }
    catch { return 1; }
  })();
  const skin = (() => {
    try {
      const skins = JSON.parse(hero.skinsJson || "[]") as {
        index: number;
        imageUrls?: string[];
      }[];
      return skins.find((item) => item.index === skinIndex);
    } catch {
      return undefined;
    }
  })();
  const generatedHigh = `https://game.gtimg.cn/images/yxzj/img201606/skin/hero-info/${hero.id}/${hero.id}-bigskin-${skinIndex}.jpg`;
  const candidates = Array.from(new Set([
    ...(skinIndex === 1 ? [hero.imageUrl] : []),
    ...(skin?.imageUrls ?? [generatedHigh, generatedHigh.replace("-bigskin-", "-mobileskin-")]),
    hero.imageUrl,
  ].filter(Boolean)));
  const imageUrl = candidates[candidateIndex];

  useEffect(() => {
    setCandidateIndex(0);
    setLoaded(false);
    setFailed(false);
  }, [hero.id, skinIndex]);

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
        onError={() => {
          if (candidateIndex + 1 < candidates.length) {
            setCandidateIndex((current) => current + 1);
            return;
          }
          setFailed(true);
        }}
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

function CardInfo({ hero, form, minggeHero }: { hero: Hero; form: string; minggeHero?: Hero }) {
  const displayHero = (form === "mingge" && minggeHero) ? minggeHero : hero;
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{displayHero.name}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{displayHero.title}</div>
        </div>
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
    const current = cardForms[hero.id] || "base";
    if (current === "base") {
      // 切换到命格 — 先检查是否已加载
      if (!minggeHeroes[hero.id] && (hero as any).minggeRelatedId) {
        try {
          const { data } = await getHero<Hero>((hero as any).minggeRelatedId);
          if (data.heroId) {
            setMinggeHeroes(prev => ({ ...prev, [hero.id]: data }));
          }
        } catch {}
      }
      setCardForms(prev => ({ ...prev, [hero.id]: "mingge" }));
    } else {
      setCardForms(prev => ({ ...prev, [hero.id]: "base" }));
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

  // 只隐藏被本命英雄明确指向的命格记录，避免依赖名称推断。
  const minggeFormIds = new Set(
    heroes
      .filter((hero) => hero.mingge && hero.minggeName && hero.minggeRelatedId)
      .map((hero) => hero.minggeRelatedId as number),
  );

  const filtered = heroes
    .filter((hero) => !minggeFormIds.has(hero.id))
    .filter((hero) => (
      hero.name.includes(search)
      || (hero.title ?? "").includes(search)
      || hero.minggeName?.includes(search)
    ));

  return (
    <div className="stagger-enter page-shell page-shell--medium">
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
        <div className="hero-catalog-grid">
          {Array.from({ length: 24 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 220 }} />
          ))}
        </div>
      )}

      {/* Hero Grid */}
      {!loading && !fetchError && (
        <div className="hero-catalog-grid">
          {filtered.map((hero, i) => (
            <div
              key={hero.id}
              className="card"
              style={{
                padding: 0,
                overflow: "hidden",
                position: "relative",
                ...cardStagger(i),
                textAlign: "left",
              }}
            >
              <button
                type="button"
                onClick={() => router.push(`/heroes/${hero.id}`)}
                aria-label={`查看${hero.name}详情`}
                style={{
                  display: "block",
                  width: "100%",
                  padding: 0,
                  border: 0,
                  background: "transparent",
                  color: "inherit",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <HeroImage hero={((cardForms[hero.id] === "mingge" && minggeHeroes[hero.id]) || hero) as Hero} />
                <div style={{ padding: "10px 48px 12px 12px" }}>
                  <CardInfo hero={hero as Hero} form={cardForms[hero.id] || "base"} minggeHero={minggeHeroes[hero.id]} />
                </div>
              </button>
              {(hero as any).mingge && (hero as any).minggeRelatedId && (
                <button
                  type="button"
                  onClick={() => toggleCardForm(hero as Hero)}
                  aria-label={cardForms[hero.id] === "mingge" ? `切回${hero.name}本命形态` : `切换${hero.name}命格形态`}
                  title={cardForms[hero.id] === "mingge" ? "切回本命" : "切换命格"}
                  style={{
                    position: "absolute",
                    right: 10,
                    bottom: 12,
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    border: "1px solid rgba(232,170,60,0.3)",
                    background: cardForms[hero.id] === "mingge" ? "rgba(232,170,60,0.15)" : "var(--bg-card)",
                    color: cardForms[hero.id] === "mingge" ? "#d4992a" : "var(--text-muted)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                >
                  ⇄
                </button>
              )}
            </div>
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
