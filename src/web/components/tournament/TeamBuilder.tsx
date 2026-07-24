"use client";

import { useEffect, useState, useMemo } from "react";
import { ROLE_LABELS, ROLE_COLORS, HERO_STAT_PROFILES, calcFinalStats, calcSkillDamage } from "@/core/game";
import { HeroSelect } from "@/web/components/hero/HeroSelect";
import { EquipSelect } from "@/web/components/hero/EquipSelect";
import { getEquipment } from "@/features/equipment/client/api";
import { getHero } from "@/features/heroes/client/api";
import {
  getTournamentPicks,
  updateTournamentPick,
} from "@/features/tournaments/client/api";

interface SkillEffect { skillIndex: number; skillName: string; type: string; base: number[]; bonuses: { stat: string; ratio: number }[]; }
interface HeroDetail { id: number; name: string; meta: { imageUrl: string; title: string; heroType?: number }; effects: SkillEffect[]; }

export function TeamBuilder({
  tournamentId, teamRed, teamBlue, players, currentUserId, isOwner,
}: {
  tournamentId: number; teamRed: { userId: number; roleType: string }[]; teamBlue: { userId: number; roleType: string }[];
  players: { userId: number; username: string; isTemp?: boolean }[]; currentUserId: number; isOwner: boolean;
}) {
  const [picks, setPicks] = useState<Record<number, { heroId: number; heroName: string; equipIds: number[] }>>({});
  const [details, setDetails] = useState<Record<number, HeroDetail>>({});
  const [equipData, setEquipData] = useState<Record<number, { stats: { stat: string; value: number }[] }>>({});
  const [targets, setTargets] = useState<Record<number, { def: number; mdef: number }>>({});
  const getTarget = (uid: number) => targets[uid] || { def: 400, mdef: 200 };
  const setTarget = (uid: number, def: number, mdef: number) => setTargets(prev => ({ ...prev, [uid]: { def, mdef } }));

  const playerMap = useMemo(() => new Map(players.map(p => [p.userId, p])), [players]);
  const myTeam = useMemo(() => { if (teamRed.some(p => p.userId === currentUserId)) return "red"; if (teamBlue.some(p => p.userId === currentUserId)) return "blue"; return null; }, [teamRed, teamBlue, currentUserId]);

  useEffect(() => {
    getEquipment().then(({ data: items }) => {
      const map: typeof equipData = {};
      for (const item of items) map[item.id] = { stats: item.stats };
      setEquipData(map);
    });
  }, []);

  useEffect(() => {
    getTournamentPicks(tournamentId).then(({ data }) => {
      if (!data.picks?.length) return;
      const map: typeof picks = {};
      for (const pick of data.picks) {
        map[pick.userId] = {
          heroId: pick.heroId,
          heroName: pick.heroName,
          equipIds: pick.equipJson || [],
        };
        if (pick.heroId > 0) {
          getHero<HeroDetail>(pick.heroId).then(({ data: hero }) => {
            if (!hero.error) setDetails((prev) => ({ ...prev, [pick.userId]: hero }));
          });
        }
      }
      setPicks(map);
    });
  }, [tournamentId]);

  const save = (uid: number, data: { heroId?: number; heroName?: string; equipIds?: number[] }) => {
    const m = { ...(picks[uid] || { heroId: 0, heroName: "", equipIds: [] }), ...data };
    setPicks(prev => ({ ...prev, [uid]: m }));
    updateTournamentPick(tournamentId, {
      targetUserId: uid,
      heroId: m.heroId,
      heroName: m.heroName,
      equipIds: m.equipIds,
    }).catch(() => {});
  };

  const onHero = async (uid: number, heroId: string, heroName: string) => {
    save(uid, { heroId: parseInt(heroId), heroName });
    const { data } = await getHero<HeroDetail>(heroId);
    setDetails((prev) => ({ ...prev, [uid]: data }));
  };

  const StatsRow = ({ label, value, bonus, unit }: { label: string; value: number; bonus: number; unit: string }) => (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, lineHeight: 1.7 }}>
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span><b>{Math.round(value)}{unit}</b>{bonus > 0 && <span style={{ color: "#44aacc", fontSize: 10 }}> +{bonus}</span>}</span>
    </div>
  );

  const renderTeam = (members: { userId: number; roleType: string }[], teamName: string, color: string) => (
    <div key={teamName} style={{ flex: 1, minWidth: 300 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, color, margin: "0 0 4px", textAlign: "center" }}>{teamName === "red" ? "🔴 红队" : "🔵 蓝队"}</h3>
      {members.map(p => {
        const player = playerMap.get(p.userId); const pick = picks[p.userId];
        const canEdit = (p.userId === currentUserId) || (isOwner && myTeam === teamName && player?.isTemp);
        const detail = details[p.userId];
        return (
          <div key={p.userId} className="card" style={{ padding: 12, marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: ROLE_COLORS[p.roleType] + "18", color: ROLE_COLORS[p.roleType] }}>{ROLE_LABELS[p.roleType]}</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{player?.username || "?"}</span>
              {player?.isTemp && <span style={{ fontSize: 10, color: "var(--text-muted)", background: "var(--bg-hover)", padding: "1px 5px", borderRadius: 3 }}>补位</span>}
              {pick?.heroId > 0 && <span style={{ fontSize: 13, fontWeight: 700, color: "var(--gold)", marginLeft: "auto" }}>{pick.heroName}</span>}
              {pick?.equipIds && pick.equipIds.length > 0 && <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 4 }}>{pick.equipIds.length}件{pick.equipIds.length > 6 ? "(24格)" : ""}</span>}
            </div>
            {canEdit && <div style={{ marginBottom: 8 }}><HeroSelect roleType={p.roleType} value={String(pick?.heroId || "")} onChange={(id, name) => onHero(p.userId, id, name)} /></div>}
            {canEdit && <EquipSelect value={pick?.equipIds || []} onChange={ids => save(p.userId, { equipIds: ids })} />}
            {/* 展示队友的出装 */}
            {!canEdit && pick?.equipIds && pick.equipIds.length > 0 && (
              <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                {pick.equipIds.map(eid => {
                  const e = equipData[eid];
                  return e ? <img key={eid} alt="" title={e.stats?.map(s => `${s.stat}:${s.value}`).join(",") || ""}
                    src={`/equipment/images/${eid}.png`} style={{ width: 28, height: 28, borderRadius: 4, border: "1px solid var(--border)" }}
                    onError={t => { (t.target as HTMLImageElement).style.display = "none"; }} /> : null;
                })}
              </div>
            )}

            {pick?.heroId > 0 && detail && (() => {
              // 优先读 DB 的 baseJson，没有则用默认模板
              const baseJson = (detail as any).baseJson;
              const profile = baseJson
                ? { base: baseJson, growth: { hpPerLv: baseJson.hpPerLv || 0, mpPerLv: baseJson.mpPerLv || 0, atkPerLv: baseJson.atkPerLv || 0, apPerLv: baseJson.apPerLv || 0, defPerLv: baseJson.defPerLv || 0, mdefPerLv: baseJson.mdefPerLv || 0, atkSpeedPerLv: baseJson.atkSpeedPerLv || 0 } }
                : HERO_STAT_PROFILES[detail.meta?.heroType || 1];
              if (!profile) return null;
              const equips: { stat: string; value: number }[] = [];
              for (const eid of (pick?.equipIds || [])) { const ed = equipData[eid]; if (ed) for (const s of ed.stats) equips.push(s); }
              const S = calcFinalStats(profile.base, profile.growth, 15, equips);
              const S0 = calcFinalStats(profile.base, profile.growth, 15, []);
              const T = { ...getTarget(p.userId), hp: 6000 };
              const sumDmg = (list: SkillEffect[]) => { const m = new Map<string, number>(); for (const e of list) { const d = calcSkillDamage({ skill: { ...e, skillName: e.skillName } as any, stats: S, target: T }); m.set(e.skillName, (m.get(e.skillName) || 0) + d.afterReduction); } return Array.from(m.entries()); };
              const phys = (detail.effects || []).filter(e => e.type === "physical");
              const mag = (detail.effects || []).filter(e => e.type === "magic");

              return (
                <div style={{ marginTop: 8, padding: "10px 14px", background: "var(--bg-hover)", borderRadius: 8, fontSize: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1px 24px", marginBottom: 8 }}>
                    <StatsRow label="物理攻击" value={S.atk} bonus={Math.round(S.atk - S0.atk)} unit="" />
                    <StatsRow label="法术攻击" value={S.ap} bonus={Math.round(S.ap - S0.ap)} unit="" />
                    <StatsRow label="最大生命" value={S.hp} bonus={Math.round(S.hp - S0.hp)} unit="" />
                    <StatsRow label="最大法力" value={S.mp} bonus={Math.round(S.mp - S0.mp)} unit="" />
                    <StatsRow label="物理防御" value={S.def} bonus={Math.round(S.def - S0.def)} unit="" />
                    <StatsRow label="法术防御" value={S.mdef} bonus={Math.round(S.mdef - S0.mdef)} unit="" />
                    <StatsRow label="冷却缩减" value={S.cdReduce} bonus={0} unit="%" />
                    <StatsRow label="攻击速度" value={S.atkSpeed} bonus={0} unit="%" />
                    <StatsRow label="暴击率" value={S.critRate} bonus={0} unit="%" />
                    <StatsRow label="物理吸血" value={S.lifesteal} bonus={0} unit="%" />
                    <StatsRow label="移动速度" value={S.moveSpeed} bonus={0} unit="" />
                  </div>

                  {(phys.length > 0 || mag.length > 0) && (
                    <div style={{ display: "flex", gap: 16, marginBottom: 4 }}>
                      {phys.length > 0 && <div style={{ flex: 1, padding: "6px 10px", borderRadius: 6, background: "rgba(224,85,85,0.04)", border: "1px solid rgba(224,85,85,0.1)" }}><div style={{ fontSize: 10, color: "#e05555", fontWeight: 600, marginBottom: 3 }}>物理</div>{sumDmg(phys).map(([n, d]) => <div key={n} style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}><span style={{ color: "var(--text-secondary)" }}>{n}</span><b style={{ color: "#e05555" }}>{d}</b></div>)}</div>}
                      {mag.length > 0 && <div style={{ flex: 1, padding: "6px 10px", borderRadius: 6, background: "rgba(68,136,240,0.04)", border: "1px solid rgba(68,136,240,0.1)" }}><div style={{ fontSize: 10, color: "#5588cc", fontWeight: 600, marginBottom: 3 }}>法术</div>{sumDmg(mag).map(([n, d]) => <div key={n} style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}><span style={{ color: "var(--text-secondary)" }}>{n}</span><b style={{ color: "#5588cc" }}>{d}</b></div>)}</div>}
                    </div>
                  )}

                  {pick?.heroId > 0 && (
                    <div style={{ display: "flex", gap: 8, marginTop: 6, fontSize: 10 }}>
                      {([["物", "#e05555", getTarget(p.userId).def, (v: number) => setTarget(p.userId, v, getTarget(p.userId).mdef)], ["法", "#5588cc", getTarget(p.userId).mdef, (v: number) => setTarget(p.userId, getTarget(p.userId).def, v)]] as [string, string, number, (v: number) => void][]).map(([l, c, val, fn]) => (
                        <span key={l}>
                          <span style={{ color: c, fontWeight: 600 }}>{l}防</span>
                          {[{ n: 100 }, { n: 200 }, { n: 400 }, { n: 600 }, { n: 800 }].map(({ n }) => (
                            <button key={n} onClick={() => fn(n)}
                              style={{ padding: "0 3px", borderRadius: 2, fontSize: 9, cursor: "pointer", marginLeft: 2, border: val === n ? `1px solid ${c}` : "1px solid var(--border)", background: val === n ? `${c}18` : "transparent", color: val === n ? c : "var(--text-muted)" }}>{n}</button>
                          ))}
                        </span>
                      ))}
                    </div>
                  )}

                </div>
              );
            })()}
          </div>
        );
      })}
    </div>
  );

  return <div style={{ marginTop: 24 }}><div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>{myTeam === "red" && renderTeam(teamRed, "red", "#e05555")}{myTeam === "blue" && renderTeam(teamBlue, "blue", "#4488f0")}</div></div>;
}
