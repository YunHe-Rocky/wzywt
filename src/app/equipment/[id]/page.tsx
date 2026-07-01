"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type NumericStat = "atk" | "ap" | "def" | "mdef" | "hp" | "mp" | "cdReduce" | "atkSpeed" | "moveSpeed" | "critRate" | "lifesteal";

interface Equipment {
  itemId: number;
  name: string;
  price: number;
  imageUrl: string;
  atk: number; ap: number; def: number; mdef: number;
  hp: number; mp: number; cdReduce: number; atkSpeed: number;
  moveSpeed: number; critRate: number; lifesteal: number;
  passiveJson: Array<{ name: string; desc: string; unique?: boolean }> | null;
  components: number[] | null;
}

const STATS: { key: NumericStat; label: string; suffix?: string }[] = [
  { key: "atk", label: "物理攻击" },
  { key: "ap", label: "法术攻击" },
  { key: "def", label: "物理防御" },
  { key: "mdef", label: "法术防御" },
  { key: "hp", label: "最大生命" },
  { key: "mp", label: "最大法力" },
  { key: "cdReduce", label: "冷却缩减", suffix: "%" },
  { key: "atkSpeed", label: "攻击速度", suffix: "%" },
  { key: "moveSpeed", label: "移动速度", suffix: "%" },
  { key: "critRate", label: "暴击率", suffix: "%" },
  { key: "lifesteal", label: "物理吸血", suffix: "%" },
];

export default function EquipmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const itemId = params.id as string;
  const [item, setItem] = useState<Equipment | null>(null);
  const [loading, setLoading] = useState(true);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    fetch(`/api/equipment/${itemId}`)
      .then((r) => r.json())
      .then((data) => { if (!data.error) setItem(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [itemId]);

  if (loading) {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "40px 24px" }}>
        <div className="skeleton" style={{ height: 300 }} />
      </div>
    );
  }

  if (!item) {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "40px 24px", textAlign: "center" }}>
        <p style={{ color: "var(--text-secondary)", fontSize: 16 }}>装备不存在</p>
        <button onClick={() => router.push("/equipment")} className="btn-ghost" style={{ marginTop: 16 }}>
          返回图鉴
        </button>
      </div>
    );
  }

  const activeStats = STATS.filter((s) => item[s.key] > 0);

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "40px 24px" }}>
      <button
        onClick={() => router.push("/equipment")}
        className="btn-subtle"
        style={{ marginBottom: 24, fontSize: 13 }}
      >
        ← 返回图鉴
      </button>

      <div style={{ display: "flex", gap: 24, marginBottom: 28, alignItems: "flex-start" }}>
        <div style={{
          width: 100, height: 100, borderRadius: 16, flexShrink: 0,
          overflow: "hidden", background: "var(--bg-card)",
          border: "1px solid var(--border)",
        }}>
          {imgError ? (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, color: "var(--text-muted)" }}>
              {item.name[0]}
            </div>
          ) : (
            <img
              src={item.imageUrl || `/equipment/images/${item.itemId}.png`}
              alt={item.name}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              onError={() => setImgError(true)}
            />
          )}
        </div>

        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text)", margin: "0 0 4px" }}>
            {item.name}
          </h1>
          <span style={{ fontSize: 16, fontWeight: 600, color: "var(--gold)" }}>
            {item.price}
          </span>
        </div>
      </div>

      {activeStats.length > 0 && (
        <>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text)", margin: "0 0 12px" }}>
            属性
          </h2>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 8, marginBottom: 24,
          }}>
            {activeStats.map((s) => (
              <div key={s.key} className="card" style={{
                padding: "10px 14px", display: "flex", justifyContent: "space-between",
                alignItems: "center",
              }}>
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{s.label}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--blue)" }}>
                  +{item[s.key]}{s.suffix || ""}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {item.passiveJson && item.passiveJson.length > 0 && (
        <>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text)", margin: "0 0 12px" }}>
            被动效果
          </h2>
          {item.passiveJson.map((p, i) => (
            <div key={i} className="card" style={{ padding: "14px 18px", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{p.name}</span>
                {p.unique && <span style={{ fontSize: 11, color: "var(--gold)", padding: "1px 6px", border: "1px solid var(--gold)", borderRadius: 4 }}>唯一</span>}
              </div>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, lineHeight: 1.6 }}>
                {p.desc}
              </p>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
