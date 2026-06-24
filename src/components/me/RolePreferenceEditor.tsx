"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { HeroSelect } from "@/components/hero/HeroSelect";

const ROLE_LABELS: Record<string, string> = {
  top: "对抗路", jungle: "打野", mid: "中路", adc: "发育路", support: "游走",
};

const RANK_TIERS = [
  { label: "未设置", value: 0, color: "#666", bg: "#222" },
  { label: "青铜", value: 1, color: "#CD853F", bg: "#2a1a0a" },
  { label: "白银", value: 2, color: "#B0C4DE", bg: "#1a2230" },
  { label: "黄金", value: 3, color: "#FFD700", bg: "#2a2408" },
  { label: "铂金", value: 4, color: "#34C8E0", bg: "#0a1c24" },
  { label: "钻石", value: 5, color: "#5B8DEE", bg: "#0a1030" },
  { label: "星耀", value: 6, color: "#BB5BE0", bg: "#180828" },
  { label: "王者", value: 7, color: "#E8453C", bg: "#280808" },
  { label: "无双王者", value: 8, color: "#F0A030", bg: "#281808" },
  { label: "荣耀王者", value: 9, color: "#FF4444", bg: "#280404" },
];

const ROLES = ["top", "jungle", "mid", "adc", "support"];

function RankBadge({ value, size = 48 }: { value: number; size?: number }) {
  const tier = RANK_TIERS.find(t => t.value === value) || RANK_TIERS[0];
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 48 48" className="shrink-0">
      <circle cx={24} cy={24} r={22} fill="none" stroke={tier.color} strokeWidth={1.5} opacity={0.3} />
      <path d="M24 4 L38 14 L38 26 C38 34 31 40 24 44 C17 40 10 34 10 26 L10 14 Z" fill={tier.bg} stroke={tier.color} strokeWidth={1.8} />
      <path d="M24 8 L34 15 L34 26 C34 32 28 37 24 40 C20 37 14 32 14 26 L14 15 Z" fill="none" stroke={tier.color} strokeWidth={0.6} opacity={0.4} />
      {value >= 7 ? <path d="M16 22 L20 16 L24 20 L28 16 L32 22 L30 27 L18 27 Z" fill={tier.color} opacity={0.9} />
        : value > 0 ? <text x={24} y={31} textAnchor="middle" fill={tier.color} fontSize={value >= 6 ? 18 : 16} fontWeight={700} fontFamily="serif">{["", "III", "II", "I", "IV", "V", "VI"][value]}</text>
          : <text x={24} y={31} textAnchor="middle" fill="#555" fontSize={11} fontWeight={600}>?</text>}
    </svg>
  );
}

function LaneIcon({ role, size = 24 }: { role: string; size?: number }) {
  const s = size;
  const c: Record<string, string> = { top: "#D4A574", jungle: "#7EC87B", mid: "#C08ED8", adc: "#E8A040", support: "#6BB5D8" };
  const color = c[role] || "#888";
  if (role === "top") return <svg width={s} height={s} viewBox="0 0 24 24" className="shrink-0"><path d="M8 2 L16 2 L16 18 L8 18 Z" fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" /><line x1={12} y1={4} x2={12} y2={16} stroke={color} strokeWidth={1} opacity={0.5} /></svg>;
  if (role === "jungle") return <svg width={s} height={s} viewBox="0 0 24 24" className="shrink-0"><path d="M12 2 L22 10 L19 16 L15 16 L17 22 L7 22 L9 16 L5 16 L2 10 Z" fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" /><circle cx={12} cy={10} r={3} fill="none" stroke={color} strokeWidth={1} opacity={0.5} /></svg>;
  if (role === "mid") return <svg width={s} height={s} viewBox="0 0 24 24" className="shrink-0"><circle cx={12} cy={12} r={9} fill="none" stroke={color} strokeWidth={2} /><circle cx={12} cy={12} r={3} fill={color} opacity={0.6} /><path d="M8 8 L16 16 M16 8 L8 16" stroke={color} strokeWidth={1} opacity={0.4} /></svg>;
  if (role === "adc") return <svg width={s} height={s} viewBox="0 0 24 24" className="shrink-0"><path d="M5 20 L12 3 L19 20" fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" /><line x1={8} y1={14} x2={16} y2={14} stroke={color} strokeWidth={1} opacity={0.5} /></svg>;
  return <svg width={s} height={s} viewBox="0 0 24 24" className="shrink-0"><path d="M12 2 C5 7 3 14 4 19 C5 21 8 22 12 22 C16 22 19 21 20 19 C21 14 19 7 12 2 Z" fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" /><circle cx={12} cy={13} r={4} fill="none" stroke={color} strokeWidth={1} opacity={0.5} /></svg>;
}

interface Pref { roleType: string; preferenceRank: number; roleRank: number; peakScore: number; peakRank: number; }
interface HeroEntry { id: number; heroId: number; heroName: string; powerScore: number; }

export function RolePreferenceEditor() {
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [heroesByRole, setHeroesByRole] = useState<Record<string, HeroEntry[]>>({});
  const [sharedRank, setSharedRank] = useState(0);
  const [expandedRole, setExpandedRole] = useState<string | null>(null);
  const [selHero, setSelHero] = useState("");
  const [selHeroName, setSelHeroName] = useState("");
  const [selPower, setSelPower] = useState("");
  const [saving, setSaving] = useState(false);
  const { success, error } = useToast();

  useEffect(() => {
    fetch("/api/users/me/roles").then(r => r.json()).then(d => {
      if (d.preferences?.length) {
        const s = d.preferences.sort((a: Pref, b: Pref) => a.preferenceRank - b.preferenceRank);
        setPrefs(s); setSharedRank(s[0]?.roleRank || 0);
      } else setPrefs(ROLES.map((r, i) => ({ roleType: r, preferenceRank: i + 1, roleRank: 0, peakScore: 0, peakRank: 0 })));
    });
    fetch("/api/users/me/heroes").then(r => r.json()).then(d => {
      if (d.heroPowers) { const g: Record<string, HeroEntry[]> = {}; ROLES.forEach(r => g[r] = d.heroPowers[r] || []); setHeroesByRole(g); }
    });
  }, []);

  function moveUp(i: number) { if (i === 0) return; const n = [...prefs]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setPrefs(n.map((p, j) => ({ ...p, preferenceRank: j + 1 }))); }
  function moveDown(i: number) { if (i === 4) return; const n = [...prefs]; [n[i], n[i + 1]] = [n[i + 1], n[i]]; setPrefs(n.map((p, j) => ({ ...p, preferenceRank: j + 1 }))); }
  function setSharedRankAndSync(r: number) { setSharedRank(r); setPrefs(prev => prev.map(p => ({ ...p, roleRank: r }))); }
  function setPeakScore(i: number, s: number) { setPrefs(prev => prev.map((p, j) => (j === i ? { ...p, peakScore: s } : p))); }
  function setPeakRank(i: number, r: number) { setPrefs(prev => prev.map((p, j) => (j === i ? { ...p, peakRank: r } : p))); }

  async function savePrefs() {
    setSaving(true);
    const res = await fetch("/api/users/me/roles", { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferences: prefs.map(p => ({ role_type: p.roleType, preference_rank: p.preferenceRank, role_rank: p.roleRank, peak_score: p.peakScore, peak_rank: p.peakRank })) }) });
    setSaving(false); res.ok ? success("已保存") : error("保存失败");
  }

  async function addHero(role: string) {
    if (!selHero || !selHeroName || !selPower) return;
    const res = await fetch("/api/users/me/heroes", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roleType: role, heroId: parseInt(selHero), heroName: selHeroName, powerScore: parseInt(selPower) }) });
    if (res.ok) { const c = await res.json(); setHeroesByRole(p => ({ ...p, [role]: [...(p[role] || []), c] })); setSelHero(""); setSelHeroName(""); setSelPower(""); success("英雄已添加"); }
    else { const e = await res.json(); error(e.error || "添加失败"); }
  }

  async function removeHero(id: number, role: string) {
    await fetch(`/api/users/me/heroes?id=${id}`, { method: "DELETE" });
    setHeroesByRole(p => ({ ...p, [role]: p[role].filter(h => h.id !== id) })); success("已删除");
  }

  const activeTier = RANK_TIERS.find(t => t.value === sharedRank) || RANK_TIERS[0];

  return (
    <>
      {/* 当前段位 */}
      <div className="card animate-slide-up">
        <div className="section-title">当前段位</div>
        <div className="flex items-center gap-4 p-4 sm:p-5 mt-3 rounded-lg border" style={{ background: `linear-gradient(135deg, ${activeTier.bg}66 0%, rgba(255,255,255,0.02) 100%)`, borderColor: `${activeTier.color}33` }}>
          <RankBadge value={sharedRank} size={72} />
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold text-text-muted mb-2 tracking-wider uppercase">王者荣耀段位</div>
            <select value={sharedRank} onChange={e => setSharedRankAndSync(parseInt(e.target.value))}
              className="w-full max-w-[200px] text-base font-bold px-3 py-2.5 rounded-md bg-card border border-border text-gold focus:border-gold/40 transition-colors"
              style={{ color: sharedRank > 0 ? activeTier.color : undefined }}>
              {RANK_TIERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* 分路配置 */}
      <div className="card animate-slide-up" style={{ animationDelay: "0.05s", animationFillMode: "both" }}>
        <div className="section-title">分路配置 & 英雄战力</div>
        <p className="text-xs text-text-secondary mb-4 leading-relaxed">排序分路偏好，添加英雄战力，设置巅峰赛历史最高分与历史最高段位</p>

        <div className="flex flex-col gap-2">
          {prefs.map((p, i) => {
            const heroes = heroesByRole[p.roleType] || [];
            const expanded = expandedRole === p.roleType;
            const avgPower = heroes.length > 0 ? Math.round(heroes.reduce((s, h) => s + h.powerScore, 0) / heroes.length) : 0;
            const isFull = heroes.length >= 3;

            return (
              <div key={p.roleType} className={`rounded-md transition-colors bg-card border ${expanded ? "border-gold/20 overflow-visible" : "border-border overflow-hidden"}`}>
                <div className="flex items-center gap-2 sm:gap-2.5 px-3 sm:px-3.5 py-2.5 cursor-pointer hover:bg-hover transition-colors flex-wrap sm:flex-nowrap" onClick={() => setExpandedRole(expanded ? null : p.roleType)}>
                  <span className="text-gold font-bold text-[15px] w-[22px] text-center shrink-0">{i + 1}</span>
                  <LaneIcon role={p.roleType} size={26} />
                  <span className="text-[13px] sm:text-sm font-semibold text-text truncate" style={{ flex: "1 1 0%", minWidth: 0 }}>{ROLE_LABELS[p.roleType]}</span>

                  <button type="button" className={`flex items-center gap-1 shrink-0 px-2.5 py-1 rounded-full border text-[11px] sm:text-xs font-semibold transition-colors ${expanded ? "bg-gold/10 border-gold/30 text-gold" : avgPower > 0 ? "border-border text-gold" : "border-border text-text-muted"}`}>
                    {avgPower > 0 ? `${heroes.length}英雄 ${avgPower}` : "+ 英雄"}
                    <span className="text-[10px] opacity-50">{expanded ? "▾" : "▸"}</span>
                  </button>

                  <input type="number" placeholder="巅峰" value={p.peakScore || ""} onChange={e => { e.stopPropagation(); setPeakScore(i, parseInt(e.target.value) || 0); }}
                    className="w-[52px] sm:w-[62px] text-xs px-1 py-1.5 rounded-md bg-card border border-border text-gold font-semibold shrink-0 focus:border-gold/40" />

                  <div className="flex items-center gap-1 shrink-0">
                    <RankBadge value={p.peakRank} size={18} />
                    <select value={p.peakRank} onChange={e => { e.stopPropagation(); setPeakRank(i, parseInt(e.target.value)); }}
                      className="w-[72px] sm:w-[88px] text-[11px] sm:text-xs px-0.5 sm:px-1 py-1.5 rounded-md bg-card border border-border font-semibold"
                      style={{ color: p.peakRank > 0 ? "var(--gold)" : undefined }}>
                      {RANK_TIERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>

                  <div className="flex gap-0.5 shrink-0">
                    <button className="btn-subtle !p-1 !text-xs !min-w-[26px]" onClick={e => { e.stopPropagation(); moveUp(i); }} disabled={i === 0}>↑</button>
                    <button className="btn-subtle !p-1 !text-xs !min-w-[26px]" onClick={e => { e.stopPropagation(); moveDown(i); }} disabled={i === 4}>↓</button>
                  </div>
                </div>

                {expanded && (
                  <div className="px-3.5 pb-3.5 border-t border-gold/15 animate-slide-up">
                    {heroes.map(h => (
                      <div key={h.id} className="flex items-center gap-3 py-2 border-b border-white/5">
                        <span className="flex-1 text-sm font-medium text-text">{h.heroName}</span>
                        <span className="text-[13px] font-semibold text-gold min-w-[60px] text-right">{h.powerScore}</span>
                        <button onClick={() => removeHero(h.id, p.roleType)} className="bg-transparent border-none text-text-muted hover:text-red cursor-pointer text-sm p-0.5">✕</button>
                      </div>
                    ))}
                    {heroes.length === 0 && (
                      <p className="text-xs text-text-muted py-2.5">尚未添加该分路的英雄，点击下方搜索并添加</p>
                    )}
                    {!isFull ? (
                      <div className="mt-2.5 flex gap-2 items-end flex-wrap sm:flex-nowrap">
                        <div className="flex-1 min-w-0"><HeroSelect roleType={p.roleType} value={selHero} onChange={(hid, hn) => { setSelHero(hid); setSelHeroName(hn); }} /></div>
                        <input type="number" placeholder="战力" value={selPower} onChange={e => setSelPower(e.target.value)}
                          className="w-[70px] text-[13px] px-1.5 py-2 rounded-md bg-card border border-border text-text" />
                        <button className="btn-primary !py-2 !px-4 !text-[13px] shrink-0" onClick={() => addHero(p.roleType)}>添加</button>
                      </div>
                    ) : (
                      <div className="mt-2.5 px-3.5 py-2 rounded-md bg-white/3 border border-border text-center text-xs text-text-muted">已满 3/3，删除后继续添加</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex justify-end mt-5">
          <button className="btn-primary text-sm font-semibold px-7 py-2.5" onClick={savePrefs} disabled={saving}>{saving ? "保存中..." : "保存配置"}</button>
        </div>
      </div>
    </>
  );
}
