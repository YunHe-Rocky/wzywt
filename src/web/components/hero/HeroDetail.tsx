"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useHero } from "@/features/heroes/client";
import { createHeroImageCandidates } from "@/features/heroes/model";

interface Skill {
  name: string;
  cd: string;
  cost: string;
  desc: string;
  skillIndex?: number;
  damageType?: string | null;
}

interface HeroSkin {
  name: string;
  index: number;
  imageUrls?: string[];
}

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
  minggeRelatedId?: number | null;
}

import { ROLE_LABELS, HERO_STAT_PROFILES, calcFinalStats, STAT_LONG_LABELS } from "@/core/game";
import { getHero } from "@/features/heroes/client/api";

function getSkinCandidates(hero: Hero, skin: HeroSkin): string[] {
  const heroId = hero.heroId;
  const high = `https://game.gtimg.cn/images/yxzj/img201606/skin/hero-info/${heroId}/${heroId}-bigskin-${skin.index}.jpg`;
  return createHeroImageCandidates({
    heroId,
    skinIndex: skin.index,
    remoteImageUrl: hero.imageUrl,
    remoteSkinUrls: skin.imageUrls ?? [
      high,
      high.replace("-bigskin-", "-mobileskin-"),
    ],
  });
}

function SkinThumbnail({ hero, skin }: { hero: Hero; skin: HeroSkin }) {
  const candidates = getSkinCandidates(hero, skin);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setCandidateIndex(0);
    setFailed(false);
  }, [hero.heroId, skin.index]);

  if (failed) return null;
  return (
    <img
      src={candidates[candidateIndex]}
      alt={skin.name}
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
      onError={() => {
        if (candidateIndex + 1 < candidates.length) {
          setCandidateIndex((current) => current + 1);
        } else {
          setFailed(true);
        }
      }}
    />
  );
}

export function HeroDetailView() {
  const params = useParams();
  const router = useRouter();
  const heroId = params.id as string;
  const [minggeHero, setMinggeHero] = useState<Hero | null>(null);
  const [activeForm, setActiveForm] = useState<"base" | "mingge">("base");
  const { hero, loading, refetch } = useHero(heroId);

  // Skin selection (localStorage keyed by heroId)
  const storageKey = `hero_skin_${heroId}`;
  const [selectedIndex, setSelectedIndex] = useState<number>(1);
  // 命格：当前展示的英雄
  const displayHero = activeForm === "mingge" && minggeHero ? minggeHero : hero;
  const displayStorageKey = displayHero ? `hero_skin_${(displayHero as Hero).heroId}` : storageKey;

  const displaySkins = (() => {
    try {
      return JSON.parse((displayHero as Hero | null)?.skinsJson || "[]") as HeroSkin[];
    } catch {
      return [];
    }
  })();
  const selectedSkin = displaySkins.find((skin) => skin.index === selectedIndex)
    ?? { name: displayHero?.name ?? "", index: selectedIndex };
  const displayHeroId = (displayHero as Hero | null)?.heroId;
  const imageCandidates = displayHero
    ? getSkinCandidates(displayHero as Hero, selectedSkin)
    : [];
  const [imageCandidateIndex, setImageCandidateIndex] = useState(0);
  const currentImageUrl = imageCandidates[imageCandidateIndex] ?? "";
  const [imgFailed, setImgFailed] = useState(false);

  const handleImgError = () => {
    if (imageCandidateIndex + 1 < imageCandidates.length) {
      setImageCandidateIndex((current) => current + 1);
      return;
    }
    setImgFailed(true);
  };

  useEffect(() => {
    setImageCandidateIndex(0);
    setImgFailed(false);
    localStorage.setItem(displayStorageKey, String(selectedIndex));
  }, [selectedIndex, displayStorageKey, displayHeroId]);

  // 切换命格形态时重置皮肤
  useEffect(() => {
    setSelectedIndex(1);
    setImgFailed(false);
  }, [activeForm]);

  // Load mingge related hero and initial skin
  useEffect(() => {
    if (!hero) return;
    setActiveForm("base");
    if (hero.meta?.mingge?.relatedId) {
      getHero<Hero>(hero.meta.mingge.relatedId)
        .then(({ data }) => { if (!data.error) setMinggeHero(data); })
        .catch(() => {});
    }
    try {
      const skins: HeroSkin[] = JSON.parse(hero.meta?.skinsJson || "[]");
      const stored = parseInt(localStorage.getItem(storageKey) || "") || 1;
      if (skins.length > 0 && !skins.find((s) => s.index === stored)) {
        setSelectedIndex(skins[0].index);
      }
    } catch {}
  }, [hero, storageKey]);

  // SSE: auto-refresh when hero data changes
  useEffect(() => {
    const es = new EventSource("/api/heroes/watch");
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "heroes-updated" && msg.changes?.some((c: { heroId: number }) => c.heroId === parseInt(heroId))) {
          refetch();
        }
      } catch {}
    };
    return () => es.close();
  }, [heroId, refetch]);

  if (loading) {
    return (
      <div className="hero-detail page-shell page-shell--narrow">
        <div className="skeleton" style={{ height: 300 }} />
      </div>
    );
  }

  if (!hero) {
    return (
      <div className="page-shell page-shell--narrow" style={{ textAlign: "center" }}>
        <p style={{ color: "var(--text-secondary)", fontSize: 16 }}>英雄不存在</p>
        <button onClick={() => router.push("/heroes")} className="btn-ghost" style={{ marginTop: 16 }}>
          返回图鉴
        </button>
      </div>
    );
  }

  const skillLabels = ["被动", "一技能", "二技能", "三技能"];

  return (
    <div className="hero-detail page-shell page-shell--narrow">
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
            const skins: HeroSkin[] = JSON.parse((displayHero as any)?.skinsJson || (hero as any)?.skinsJson || "[]");
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
                      <SkinThumbnail hero={displayHero as Hero} skin={s} />
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
          {/* 命格切换标签 */}
          {(hero as any)?.mingge && (hero as any).minggeRelatedId && (
            <div style={{ display: "flex", gap: 0, marginBottom: 12 }}>
              <button onClick={() => setActiveForm("base")} style={{
                padding: "6px 16px", fontSize: 13, fontWeight: activeForm === "base" ? 700 : 500,
                border: activeForm === "base" ? "2px solid var(--gold)" : "2px solid var(--border)",
                borderRight: "none", borderRadius: "var(--radius-sm) 0 0 var(--radius-sm)",
                background: activeForm === "base" ? "var(--gold-alpha-08)" : "var(--bg-input)",
                color: activeForm === "base" ? "var(--gold)" : "var(--text-muted)",
                cursor: "pointer", transition: "all 0.15s",
              }}>本命 · {hero.name}</button>
              <button onClick={() => setActiveForm("mingge")} style={{
                padding: "6px 16px", fontSize: 13, fontWeight: activeForm === "mingge" ? 700 : 500,
                border: activeForm === "mingge" ? "2px solid var(--gold)" : "2px solid var(--border)",
                borderRadius: "0 var(--radius-sm) var(--radius-sm) 0",
                background: activeForm === "mingge" ? "var(--gold-alpha-08)" : "var(--bg-input)",
                color: activeForm === "mingge" ? "var(--gold)" : "var(--text-muted)",
                cursor: "pointer", transition: "all 0.15s",
              }}>命格 · {minggeHero?.name || (hero as any).minggeName || "?"}</button>
            </div>
          )}
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text)", margin: "0 0 4px" }}>
            {displayHero?.name}
          </h1>
          <p style={{ fontSize: 15, color: "var(--text-secondary)", margin: "0 0 12px" }}>
            {(displayHero as any)?.title}
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span
              className="badge badge-gold"
              style={{ fontSize: 13, padding: "4px 12px" }}
            >
              {ROLE_LABELS[(displayHero as any)?.roleType || ""] || (displayHero as any)?.roleType}
            </span>
            {(hero as any)?.mingge && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 12px", borderRadius: "var(--radius-sm)",
                fontSize: 13, fontWeight: 700,
                background: "linear-gradient(135deg, rgba(232,170,60,0.15), rgba(232,170,60,0.05))",
                color: "#e8aa3c",
                border: "1px solid rgba(232,170,60,0.25)",
              }}>
                {activeForm === "mingge" ? "命格形态" : "拥有命格"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Base Stats */}
      {(() => {
        const baseJson = (displayHero || hero as any)?.baseJson;
        const profile = baseJson
          ? { base: baseJson, growth: { hpPerLv: baseJson.hpPerLv || 0, mpPerLv: baseJson.mpPerLv || 0, atkPerLv: baseJson.atkPerLv || 0, apPerLv: baseJson.apPerLv || 0, defPerLv: baseJson.defPerLv || 0, mdefPerLv: baseJson.mdefPerLv || 0, atkSpeedPerLv: baseJson.atkSpeedPerLv || 0 } }
          : HERO_STAT_PROFILES[(displayHero as any)?.heroType || (hero as any)?.heroType || 1];
        if (!profile) return null;
        const lv1 = calcFinalStats(profile.base, profile.growth, 1, []);
        const lv15 = calcFinalStats(profile.base, profile.growth, 15, []);
        const stats: [string, number, number, string, string][] = [
          ["最大生命", Math.round(lv1.hp), Math.round(lv15.hp), "#44cc88", "生命值"],
          ["最大法力", Math.round(lv1.mp), Math.round(lv15.mp), "#4488cc", "法力值"],
          ["物理攻击", Math.round(lv1.atk), Math.round(lv15.atk), "#e05555", "攻击力"],
          ["法术攻击", Math.round(lv1.ap), Math.round(lv15.ap), "#aa55cc", "法术强度"],
          ["物理防御", Math.round(lv1.def), Math.round(lv15.def), "#ddaa33", "护甲"],
          ["法术防御", Math.round(lv1.mdef), Math.round(lv15.mdef), "#5588cc", "魔抗"],
          ["攻击速度", Math.round(lv1.atkSpeed * 10) / 10, Math.round(lv15.atkSpeed * 10) / 10, "#cc8833", "%"],
          ["移动速度", lv1.moveSpeed, lv15.moveSpeed, "#66aacc", ""],
        ];
        return (
          <>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text)", margin: "0 0 16px" }}>
              基础属性
            </h2>
            <div className="card" style={{ padding: "16px 20px", marginBottom: 28 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 24px" }}>
                {stats.map(([label, v1, v15, color, unit]) => {
                  const rawGrowth = (v15 - v1) / 14;
                  const growth = rawGrowth % 1 === 0 ? Math.round(rawGrowth) : Math.round(rawGrowth * 10) / 10;
                  return (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "4px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                      <span style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{label}</span>
                      <span>
                        <span style={{ color, fontWeight: 600 }}>{v1}{unit}</span>
                        <span style={{ color: "var(--text-muted)", fontSize: 10, margin: "0 3px" }}>→</span>
                        <span style={{ color: "var(--gold)", fontWeight: 700 }}>{v15}{unit}</span>
                        <span style={{ color: "var(--text-muted)", fontSize: 10, marginLeft: 6 }}>+{growth}/级</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        );
      })()}

      {/* Skills */}
      <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text)", margin: "0 0 16px" }}>
        技能介绍
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {(displayHero || hero)?.skills.map((skill) => (
          <div
            key={skill.skillIndex ?? skill.name}
            className="card"
            style={{ padding: "16px 20px", borderLeft: "3px solid var(--gold)" }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--gold)" }}>
                {skillLabels[skill.skillIndex ?? 0] || skill.name}
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
