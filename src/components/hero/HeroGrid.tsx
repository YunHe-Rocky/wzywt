"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Hero {
  heroId: number;
  name: string;
  title: string;
  roleType: string;
  heroType: number;
  heroType2: number;
  imageUrl: string;
}

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  top: { label: "对抗路", color: "#e05050" },
  jungle: { label: "打野", color: "#50b050" },
  mid: { label: "中路", color: "#5090d0" },
  adc: { label: "发育路", color: "#e0a030" },
  support: { label: "游走", color: "#b080d0" },
};

const CLASS_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: "战士", color: "#d08050" },
  2: { label: "法师", color: "#5090d0" },
  3: { label: "坦克", color: "#90b050" },
  4: { label: "刺客", color: "#c05080" },
  5: { label: "射手", color: "#e0a030" },
  6: { label: "辅助", color: "#b080d0" },
};

const ROLE_FILTERS = [
  { value: "", label: "全部分路" },
  { value: "top", label: "对抗路" },
  { value: "jungle", label: "打野" },
  { value: "mid", label: "中路" },
  { value: "adc", label: "发育路" },
  { value: "support", label: "游走" },
];

const CLASS_FILTERS = [
  { value: "", label: "全部职业" },
  { value: "1", label: "战士" },
  { value: "2", label: "法师" },
  { value: "3", label: "坦克" },
  { value: "4", label: "刺客" },
  { value: "5", label: "射手" },
  { value: "6", label: "辅助" },
];

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
            background: "linear-gradient(135deg, rgba(200,169,90,0.08), rgba(200,169,90,0.02))",
          }}
        >
          <span style={{ fontSize: 32, fontWeight: 800, color: "rgba(200,169,90,0.3)" }}>
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

export function HeroGrid() {
  const router = useRouter();
  const [heroes, setHeroes] = useState<Hero[]>([]);
  const [roleFilter, setRoleFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setFetchError(false);
    const params = new URLSearchParams();
    if (roleFilter) params.set("role_type", roleFilter);
    if (classFilter) params.set("hero_type", classFilter);
    fetch(`/api/heroes?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then((data) => {
        setHeroes(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => {
        setFetchError(true);
        setLoading(false);
      });
  }, [roleFilter, classFilter]);

  const filtered = heroes.filter(
    (h) =>
      h.name.includes(search) ||
      h.title.includes(search)
  );

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "40px 24px" }}>
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
                animation: `fade-in 0.3s ${i * 0.015}s ease-out both`,
                textAlign: "left",
              }}
            >
              <HeroImage hero={hero} />
              <div style={{ padding: "10px 12px 12px" }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
                  {hero.name}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                  {hero.title}
                </div>
                <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                  {/* 职业标签 */}
                  {hero.heroType > 0 && CLASS_LABELS[hero.heroType] && (
                    <span style={{
                      display: "inline-flex", alignItems: "center", padding: "2px 6px", borderRadius: 3,
                      fontSize: 10, fontWeight: 600,
                      background: CLASS_LABELS[hero.heroType].color + "20",
                      color: CLASS_LABELS[hero.heroType].color,
                      border: "1px solid " + CLASS_LABELS[hero.heroType].color + "30",
                    }}>
                      {CLASS_LABELS[hero.heroType].label}
                    </span>
                  )}
                  {/* 分路标签 */}
                  {ROLE_LABELS[hero.roleType] && (
                    <span style={{
                      display: "inline-flex", alignItems: "center", padding: "2px 6px", borderRadius: 3,
                      fontSize: 10, fontWeight: 600,
                      background: ROLE_LABELS[hero.roleType].color + "18",
                      color: ROLE_LABELS[hero.roleType].color,
                      border: "1px solid " + ROLE_LABELS[hero.roleType].color + "25",
                    }}>
                      {ROLE_LABELS[hero.roleType].label}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {!loading && !fetchError && filtered.length === 0 && (
        <p style={{ textAlign: "center", color: "var(--text-muted)", padding: "60px 0", fontSize: 14 }}>
          未找到匹配"{search}"的英雄
        </p>
      )}
    </div>
  );
}
