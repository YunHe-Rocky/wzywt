"use client";

import { useToast } from "@/components/ui/Toast";
import { HeroSelect } from "@/components/hero/HeroSelect";
import { useRolePreferences } from "@/hooks/useRolePreferences";

const ROLE_LABELS: Record<string, string> = {
  top: "对抗路", jungle: "打野", mid: "中路", adc: "发育路", support: "游走",
};

const RANK_TIERS = [
  { label: "未设置", value: 0 },
  { label: "倔强青铜", value: 1 },
  { label: "秩序白银", value: 2 },
  { label: "荣耀黄金", value: 3 },
  { label: "尊贵铂金", value: 4 },
  { label: "永恒钻石", value: 5 },
  { label: "至尊星耀", value: 6 },
  { label: "最强王者", value: 7 },
  { label: "无双王者", value: 8 },
  { label: "荣耀王者", value: 9 },
  { label: "传奇王者", value: 10 },
];

const ROLES = ["top", "jungle", "mid", "adc", "support"] as const;

function RankBadge({ value, size = 48 }: { value: number; size?: number }) {
  const tier = RANK_TIERS.find(t => t.value === value) || RANK_TIERS[0];
  const s = size;
  const colors: Record<number, string> = {
    1: "#CD853F", 2: "#B0C4DE", 3: "#FFD700", 4: "#34C8E0",
    5: "#5B8DEE", 6: "#BB5BE0", 7: "#E8453C", 8: "#F0A030", 9: "#FF4444", 10: "#FF2222",
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
  const {
    prefs, heroesByRole, sharedRank, activeTab, selHero, selHeroName, selPower, saving,
    setActiveTab, setSelHero, setSelHeroName, setSelPower,
    moveUp, moveDown, setSharedRankAndSync, setPeakScore, setPeakRank, savePrefs, addHero, removeHero,
  } = useRolePreferences();
  const { success, error } = useToast();

  const activePref = prefs.find(p => p.roleType === activeTab);
  const activeHeroes = heroesByRole[activeTab] || [];
  const isFull = activeHeroes.length >= 3;

  return (
    <div className="card animate-slide-up">

      {/* ── 段位信息 ── */}
      <div className="section-title">段位信息</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex items-center gap-4 p-4 rounded-lg bg-input/50 border border-border/50">
          <RankBadge value={sharedRank} size={52} />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-text-muted mb-1.5 tracking-wider uppercase">当前段位</div>
            <select value={sharedRank} onChange={e => setSharedRankAndSync(parseInt(e.target.value))}
              className="text-base font-bold px-3 py-2.5 rounded-md bg-input border border-border text-text focus:border-gold/30 transition-colors w-full">
              {RANK_TIERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-4 p-4 rounded-lg bg-input/50 border border-border/50">
          <RankBadge value={prefs[0]?.peakRank || 0} size={52} />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-text-muted mb-1.5 tracking-wider uppercase">历史最高段位</div>
            <select value={prefs[0]?.peakRank || 0}
              onChange={e => { const v = parseInt(e.target.value); setPeakRank("all", v); }}
              className="text-base font-bold px-3 py-2.5 rounded-md bg-input border border-border text-text focus:border-gold/30 transition-colors w-full">
              {RANK_TIERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── 分隔线 ── */}
      <div className="my-6 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

      {/* ── 分路配置 & 英雄战力 ── */}
      <div className="section-title">分路配置 & 英雄战力</div>

      {/* 分路优先级排序 — 参考 #1 结构风格 */}
      <div className="mb-5">
        <div className="text-xs font-semibold text-text-muted tracking-wider uppercase mb-3">分路优先级排序</div>
        <div className="flex flex-col gap-1.5">
          {prefs.map((p, i) => (
            <div key={p.roleType} className="flex items-center gap-2">
              <span className="text-gold-light font-bold text-sm w-5 shrink-0 text-right">{p.preferenceRank}</span>
              <button
                onClick={() => setActiveTab(p.roleType)}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-semibold shrink-0 transition-all flex-1 border
                  ${activeTab === p.roleType
                    ? "bg-card text-gold-light border-gold/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                    : "text-text-secondary border-transparent hover:bg-hover hover:border-border"}`}>
                <LaneIcon role={p.roleType} size={18} />
                <span>{ROLE_LABELS[p.roleType]}</span>
                <span className={`text-xs ml-auto ${activeTab === p.roleType ? "opacity-70" : "opacity-40"}`}>
                  {heroesByRole[p.roleType]?.length || 0}/3
                </span>
              </button>
              <div className="flex gap-0.5 shrink-0">
                <button className="w-6 h-6 flex items-center justify-center rounded bg-card border border-border/50 text-text-muted hover:text-gold-light hover:border-gold/20 text-xs disabled:opacity-20 disabled:cursor-default transition-colors"
                  onClick={() => moveUp(i)} disabled={i === 0}>▲</button>
                <button className="w-6 h-6 flex items-center justify-center rounded bg-card border border-border/50 text-text-muted hover:text-gold-light hover:border-gold/20 text-xs disabled:opacity-20 disabled:cursor-default transition-colors"
                  onClick={() => moveDown(i)} disabled={i === 4}>▼</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Active tab content */}
      {activePref && (
        <div className="animate-slide-up">
          <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-border-light">
            <LaneIcon role={activePref.roleType} size={24} />
            <span className="text-base font-bold text-text">{ROLE_LABELS[activePref.roleType]}</span>
            <span className="badge badge-gold text-[11px] px-2 py-0.5">P{activePref.preferenceRank}</span>
          </div>

          {/* 英雄战力 — 参考 #2 卡片风格 */}
          {activeHeroes.length > 0 ? (
            <div className="flex flex-col gap-2 mb-4">
              {activeHeroes.map(h => (
                <div key={h.id} className="card !p-3 !rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-text truncate">{h.heroName}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-base font-bold text-gold-light tabular-nums">{h.powerScore}</span>
                      <button onClick={() => removeHero(h.id, activeTab, () => success("已删除"))}
                        className="w-6 h-6 flex items-center justify-center rounded-full bg-transparent border-none text-text-muted hover:text-red hover:bg-red/5 cursor-pointer text-sm shrink-0 transition-colors">✕</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mb-4 px-4 py-3 rounded-lg bg-input/30 border border-border text-center text-sm text-text-muted">
              尚未添加英雄，在下方搜索并添加
            </div>
          )}

          {isFull ? (
            <div className="px-4 py-3 rounded-lg bg-input/30 border border-border text-center text-sm text-text-muted">
              已满 3 个英雄，删除后可继续添加
            </div>
          ) : (
            <div className="flex gap-2.5">
              <div className="flex-1 min-w-0">
                <HeroSelect roleType={activeTab} value={selHero}
                  onChange={(hid, hn) => { setSelHero(hid); setSelHeroName(hn); }} />
              </div>
              <input type="number" placeholder="战力" value={selPower}
                onChange={e => setSelPower(e.target.value)}
                className="w-[80px] text-sm px-3 rounded-md bg-input border border-border text-text shrink-0 h-11" />
              <button className="btn-primary !px-4 !text-sm shrink-0 h-11"
                onClick={() => addHero(activeTab, () => success("英雄已添加"), (msg) => error(msg))}>添加</button>
            </div>
          )}
        </div>
      )}

      {/* ── Footer: 巅峰分数 + 保存 ── */}
      <div className="mt-6 pt-5 border-t border-border-light flex items-end gap-4">
        <div className="flex-1">
          <label className="text-xs font-semibold text-text-muted tracking-wider uppercase block mb-1.5">巅峰分数</label>
          <input type="number" placeholder="未设置" value={activePref?.peakScore || ""}
            onChange={e => setPeakScore(activeTab, parseInt(e.target.value) || 0)}
            className="w-full text-base font-bold px-4 py-2.5 rounded-md bg-input border border-border text-text" />
        </div>
        <button className="btn-primary shrink-0 text-base font-semibold py-3 px-10" onClick={() => savePrefs(() => success("已保存"), (msg) => error(msg))} disabled={saving}>
          {saving ? "保存中..." : "保存配置"}
        </button>
      </div>
    </div>
  );
}
