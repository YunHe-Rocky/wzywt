"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

interface Skill {
  name: string;
  cd: string;
  cost: string;
  desc: string;
}

interface HeroSkin { name: string; index: number; }

interface Hero {
  id: number;
  heroId: number;
  name: string;
  title: string;
  roleType: string;
  imageUrl: string;
  skinsJson?: string;
  skills: Skill[];
  mingge?: boolean;
  minggeName?: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  top: "对抗路", jungle: "打野", mid: "中路", adc: "发育路", support: "游走",
};

function getSkinUrl(heroId: number, index: number) {
  return `https://game.gtimg.cn/images/yxzj/img201606/skin/hero-info/${heroId}/${heroId}-bigskin-${index}.jpg`;
}

export function HeroDetailView() {
  const params = useParams();
  const router = useRouter();
  const heroId = params.id as string;
  const [hero, setHero] = useState<Hero | null>(null);
  const [loading, setLoading] = useState(true);

  // Skin selection (localStorage keyed by heroId)
  const storageKey = `hero_skin_${heroId}`;
  const [selectedIndex, setSelectedIndex] = useState<number>(1);
  // Use DB imageUrl as default, only switch to bigskin URL for non-default skins
  const currentImageUrl = hero
    ? (selectedIndex === 1 ? hero.imageUrl : getSkinUrl(parseInt(heroId), selectedIndex))
    : "";
  const [imgFailed, setImgFailed] = useState(false);

  const handleImgError = () => {
    if (selectedIndex !== 1 && hero) {
      setSelectedIndex(1);
    } else {
      setImgFailed(true);
    }
  };

  useEffect(() => {
    setImgFailed(false);
    localStorage.setItem(storageKey, String(selectedIndex));
  }, [selectedIndex, storageKey]);

  const fetchHero = () => {
    fetch(`/api/heroes/${heroId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setHero(null);
        } else {
          setHero(data);
          try {
            const skins: HeroSkin[] = JSON.parse(data.skinsJson || "[]");
            const stored = parseInt(localStorage.getItem(storageKey) || "") || 1;
            if (skins.length > 0 && !skins.find((s) => s.index === stored)) {
              setSelectedIndex(skins[0].index);
            }
          } catch {}
        }
        setLoading(false);
      });
  };

  useEffect(() => { fetchHero(); }, [heroId]);

  // SSE: auto-refresh when hero data changes
  useEffect(() => {
    const es = new EventSource("/api/heroes/watch");
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "heroes-updated" && msg.changes?.some((c: { heroId: number }) => c.heroId === parseInt(heroId))) {
          fetchHero();
        }
      } catch {}
    };
    return () => es.close();
  }, [heroId]);

  if (loading) {
    return (
      <div className="hero-detail" style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px" }}>
        <div className="skeleton" style={{ height: 300 }} />
      </div>
    );
  }

  if (!hero) {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px", textAlign: "center" }}>
        <p style={{ color: "var(--text-secondary)", fontSize: 16 }}>英雄不存在</p>
        <button onClick={() => router.push("/heroes")} className="btn-ghost" style={{ marginTop: 16 }}>
          返回图鉴
        </button>
      </div>
    );
  }

  const skillLabels = ["被动", "一技能", "二技能", "三技能"];

  return (
    <div className="hero-detail" style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px" }}>
      {/* Back link */}
      <button
        onClick={() => router.push("/heroes")}
        className="btn-subtle"
        style={{ marginBottom: 24, fontSize: 13 }}
      >
        ← 返回图鉴
      </button>

      {/* Hero header */}
      <div className="hero-header" style={{ display: "flex", gap: 28, marginBottom: 32, alignItems: "flex-start" }}>
        {/* Image */}
        <div style={{ flexShrink: 0 }}>
          <div
            style={{
              width: 200,
              height: 280,
              borderRadius: "var(--radius)",
              overflow: "hidden",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
            }}
          >
            {imgFailed ? (
              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 14 }}>
                {hero.name[0]}
              </div>
            ) : (
              <img
                src={currentImageUrl}
                alt={hero.name}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                onError={handleImgError}
              />
            )}
        </div>

        {/* Skin selector */}
        {(() => {
          try {
            const skins: HeroSkin[] = JSON.parse(hero.skinsJson || "[]");
            if (skins.length <= 1) return null;
            return (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>皮肤</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", maxWidth: 200 }}>
                  {skins.map((s) => (
                    <button
                      key={s.index}
                      onClick={() => setSelectedIndex(s.index)}
                      title={s.name}
                      style={{
                        width: 36, height: 48, borderRadius: 4, overflow: "hidden", cursor: "pointer",
                        border: selectedIndex === s.index ? "2px solid var(--gold)" : "2px solid var(--border)",
                        background: "var(--bg-hover)", padding: 0, transition: "border-color 0.15s",
                      }}
                    >
                      <img
                        src={getSkinUrl(parseInt(heroId), s.index)}
                        alt={s.name}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0"; }}
                      />
                    </button>
                  ))}
                </div>
              </div>
            );
          } catch { return null; }
        })()}
      </div>

        {/* Info */}
        <div style={{ flex: 1, paddingTop: 4 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text)", margin: "0 0 4px" }}>
            {hero.name}
          </h1>
          <p style={{ fontSize: 15, color: "var(--text-secondary)", margin: "0 0 12px" }}>
            {hero.title}
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span
              className="badge badge-gold"
              style={{ fontSize: 13, padding: "4px 12px" }}
            >
              {ROLE_LABELS[hero.roleType] || hero.roleType}
            </span>
            {hero.mingge && (
              <span style={{
                display: "inline-flex", alignItems: "center", padding: "4px 12px", borderRadius: "var(--radius-sm)",
                fontSize: 13, fontWeight: 700,
                background: "linear-gradient(135deg, rgba(232,170,60,0.15), rgba(232,170,60,0.05))",
                color: "#e8aa3c",
                border: "1px solid rgba(232,170,60,0.25)",
              }}>
                {hero.minggeName ? `命格 · ${hero.minggeName}` : "命格"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Skills */}
      <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text)", margin: "0 0 16px" }}>
        技能介绍
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {hero.skills.map((skill, i) => (
          <div
            key={i}
            className="card"
            style={{ padding: "16px 20px", borderLeft: "3px solid var(--gold)" }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--gold)" }}>
                {skillLabels[i] || skill.name}
              </span>
              <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>
                {skill.name}
              </span>
              {(skill.cd || skill.cost) && (
                <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: "auto" }}>
                  {skill.cd && `CD: ${skill.cd}`}
                  {skill.cd && skill.cost && " · "}
                  {skill.cost && `消耗: ${skill.cost}`}
                </span>
              )}
            </div>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, lineHeight: 1.6 }}>
              {skill.desc}
            </p>
          </div>
        ))}
      </div>

      <style jsx>{`
        @media (max-width: 480px) {
          .hero-detail {
            padding: 24px 16px !important;
          }
          .hero-header {
            flex-direction: column !important;
            gap: 16px !important;
            align-items: center !important;
          }
        }
      `}</style>
    </div>
  );
}
