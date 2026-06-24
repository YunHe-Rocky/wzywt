"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { HeroSelect } from "@/components/hero/HeroSelect";

const ROLE_LABELS: Record<string, string> = {
  top: "对抗路", jungle: "打野", mid: "中路", adc: "发育路", support: "游走",
};

const RANK_TIERS = [
  { label: "未设置", value: 0 },
  { label: "青铜", value: 1 },
  { label: "白银", value: 2 },
  { label: "黄金", value: 3 },
  { label: "铂金", value: 4 },
  { label: "钻石", value: 5 },
  { label: "星耀", value: 6 },
  { label: "王者", value: 7 },
  { label: "无双王者", value: 8 },
  { label: "荣耀王者", value: 9 },
];

const ROLES = ["top", "jungle", "mid", "adc", "support"] as const;

function RankBadge({ value, size = 48 }: { value: number; size?: number }) {
  const tier = RANK_TIERS.find(t => t.value === value) || RANK_TIERS[0];
  const s = size;
  const colors: Record<number, string> = {
    1: "#CD853F", 2: "#B0C4DE", 3: "#FFD700", 4: "#34C8E0",
    5: "#5B8DEE", 6: "#BB5BE0", 7: "#E8453C", 8: "#F0A030", 9: "#FF4444",
  };
  const color = colors[value] || "#666";
  return (
    <svg width={s} height={s} viewBox="0 0 48 48" className="shrink-0">
      <path d="M24 4 L38 14 L38 26 C38 34 31 40 24 44 C17 40 10 34 10 26 L10 14 Z" fill="none" stroke={color} strokeWidth={1.8} opacity={0.7} />
      <path d="M24 8 L34 15 L34 26 C34 32 28 37 24 40 C20 37 14 32 14 26 L14 15 Z" fill="none" stroke={color} strokeWidth={0.6} opacity={0.3} />
      {value >= 7 ? <path d="M16 22 L20 16 L24 20 L28 16 L32 22 L30 27 L18 27 Z" fill={color} opacity={0.8} />
        : value > 0 ? <text x={24} y={31} textAnchor="middle" fill={color} fontSize={value >= 6 ? 18 : 16} fontWeight={700} fontFamily="serif">{["", "III", "II", "I", "IV", "V", "VI"][value]}</text>
          : <text x={24} y={31} textAnchor="middle" fill="#555" fontSize={11} fontWeight={600}>?</text>}
    </svg>
  );
}

function LaneIcon({ role, size = 20 }: { role: string; size?: number }) {
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
  const [activeTab, setActiveTab] = useState<string>("top");
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
  function setPeakScore(role: string, s: number) { setPrefs(prev => prev.map(p => (p.roleType === role ? { ...p, peakScore: s } : p))); }
  function setPeakRank(role: string, r: number) { setPrefs(prev => prev.map(p => (p.roleType === role ? { ...p, peakRank: r } : p))); }

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

  const activePref = prefs.find(p => p.roleType === activeTab);
  const activeHeroes = heroesByRole[activeTab] || [];
  const isFull = activeHeroes.length >= 3;

  return (
    <>
      {/* Rank Card */}
      <div className="card animate-slide-up">
        <div className="section-title">当前段位</div>
        <div className="flex items-center gap-4 p-3">
          <RankBadge value={sharedRank} size={60} />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-semibold text-text-muted mb-1.5 tracking-wider uppercase">王者荣耀段位</div>
            <select value={sharedRank} onChange={e => setSharedRankAndSync(parseInt(e.target.value))}
              className="text-sm font-bold px-3 py-2 rounded-md bg-input border border-border text-text focus:border-gold/30 transition-colors w-full max-w-[180px]">
              {RANK_TIERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Lane Tabs + Config */}
      <div className="card animate-slide-up" style={{ animationDelay: "0.05s", animationFillMode: "both" }}>
        <div className="section-title">分路配置 & 英雄战力</div>

        {/* Priority config */}
        <div className="flex flex-col gap-1.5 mb-4 p-3 rounded-md bg-input/50 border border-border/50">
          <div className="text-[10px] font-semibold text-text-muted tracking-wider mb-0.5">分路优先级排序</div>
          {prefs.map((p, i) => (
            <div key={p.roleType} className="flex items-center gap-2">
              <span className="text-gold-light font-bold text-xs w-4 shrink-0">{p.preferenceRank}</span>
              <button
                onClick={() => setActiveTab(p.roleType)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-semibold shrink-0 transition-colors flex-1
                  ${activeTab === p.roleType
                    ? "bg-card text-gold-light border border-gold/15"
                    : "bg-card/50 text-text-secondary border border-border/50 hover:border-gold/10"}`}>
                <LaneIcon role={p.roleType} size={16} />
                <span>{ROLE_LABELS[p.roleType]}</span>
                <span className="text-[10px] opacity-50 ml-auto">
                  {heroesByRole[p.roleType]?.length || 0}/3
                </span>
              </button>
              <div className="flex gap-0.5 shrink-0">
                <button className="w-5 h-5 flex items-center justify-center rounded bg-card border border-border/50 text-text-muted hover:text-gold-light hover:border-gold/20 text-[11px] disabled:opacity-30 disabled:cursor-default"
                  onClick={() => moveUp(i)} disabled={i === 0}>▲</button>
                <button className="w-5 h-5 flex items-center justify-center rounded bg-card border border-border/50 text-text-muted hover:text-gold-light hover:border-gold/20 text-[11px] disabled:opacity-30 disabled:cursor-default"
                  onClick={() => moveDown(i)} disabled={i === 4}>▼</button>
              </div>
            </div>
          ))}
        </div>

        {/* Active tab content */}
        {activePref && (
          <div className="animate-slide-up">
            {/* Lane header */}
            <div className="flex items-center gap-2 mb-3">
              <LaneIcon role={activePref.roleType} size={22} />
              <span className="text-sm font-bold text-text">{ROLE_LABELS[activePref.roleType]}</span>
              <span className="text-[10px] text-text-muted">优先度 {activePref.preferenceRank}</span>
            </div>

            {/* Heroes list */}
            {activeHeroes.map(h => (
              <div key={h.id} className="flex items-center gap-3 py-2.5 px-3 mb-1.5 rounded-md bg-input/50 border border-border/50">
                <span className="flex-1 text-sm font-medium text-text truncate">{h.heroName}</span>
                <span className="text-[13px] font-bold text-gold-light min-w-[50px] text-right tabular-nums">{h.powerScore}</span>
                <button onClick={() => removeHero(h.id, activeTab)}
                  className="bg-transparent border-none text-text-muted hover:text-red cursor-pointer text-sm p-0.5 shrink-0">✕</button>
              </div>
            ))}

            {/* Add hero form */}
            {!isFull ? (
              <div className="mt-3 flex gap-2">
                <div className="flex-1 min-w-0">
                  <HeroSelect roleType={activeTab} value={selHero}
                    onChange={(hid, hn) => { setSelHero(hid); setSelHeroName(hn); }} />
                </div>
                <input type="number" placeholder="战力" value={selPower}
                  onChange={e => setSelPower(e.target.value)}
                  className="w-[68px] text-[13px] px-2 rounded-md bg-input border border-border text-text shrink-0 h-10" />
                <button className="btn-primary !px-3 !text-[13px] shrink-0 h-10"
                  onClick={() => addHero(activeTab)}>添加</button>
              </div>
            ) : (
              <div className="mt-3 px-3 py-2 rounded-md bg-input/30 border border-border text-center text-xs text-text-muted">
                已满 3 个英雄，删除后可继续添加
              </div>
            )}

            {/* Extra stats */}
            <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-border-light">
              <div>
                <label className="text-[10px] font-semibold text-text-muted mb-1 block">巅峰赛分数</label>
                <input type="number" placeholder="未设置" value={activePref.peakScore || ""}
                  onChange={e => setPeakScore(activeTab, parseInt(e.target.value) || 0)}
                  className="w-full text-sm px-3 py-2 rounded-md bg-input border border-border text-text" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-text-muted mb-1 block">历史最高段位</label>
                <select value={activePref.peakRank}
                  onChange={e => setPeakRank(activeTab, parseInt(e.target.value))}
                  className="w-full text-sm px-3 py-2 rounded-md bg-input border border-border text-text">
                  {RANK_TIERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <button className="btn-primary text-sm font-semibold px-8 py-2.5" onClick={savePrefs} disabled={saving}>
          {saving ? "保存中..." : "保存配置"}
        </button>
      </div>
    </>
  );
}
