"use client";

import { useEffect, useState } from "react";
import { ROLE_LABELS, ROLE_COLORS } from "@/core/game";
import { getHero, getHeroes } from "@/features/heroes/client/api";
import {
  getTournamentPicks,
  updateTournamentPick,
} from "@/features/tournaments/client/api";

interface Player {
  userId: number; username: string; roleType: string;
}
interface PickData {
  userId: number; heroId: number; heroName: string;
  team: string; roleType: string; equipJson?: number[];
}

interface Hero {
  heroId: number; name: string; roleType: string; imageUrl: string;
}

const ROLE_HEROES_CACHE: Record<string, Hero[]> = {};

export function HeroPickPanel({
  tournamentId, splitResult, players, isOwner,
}: {
  tournamentId: number;
  splitResult: { teamRed: { userId: number; roleType: string }[]; teamBlue: { userId: number; roleType: string }[] };
  players: Player[];
  isOwner: boolean;
}) {
  const [picks, setPicks] = useState<PickData[]>([]);
  const [expandedHero, setExpandedHero] = useState<number | null>(null);
  const [selectedHero, setSelectedHero] = useState<{ userId: number; heroId: number } | null>(null);
  const [roleHeroes, setRoleHeroes] = useState<Record<string, Hero[]>>({});
  const playerMap = new Map(players.map(p => [p.userId, p]));

  // Load picks
  useEffect(() => {
    getTournamentPicks(tournamentId)
      .then(({ data }) => setPicks(data.picks || []));
  }, [tournamentId]);

  // Load heroes by role
  useEffect(() => {
    const roles = Array.from(new Set([...splitResult.teamRed, ...splitResult.teamBlue].map(p => p.roleType)));
    const toLoad = roles.filter(r => !ROLE_HEROES_CACHE[r]);
    if (toLoad.length === 0) return;
    Promise.all(toLoad.map((roleType) =>
      getHeroes<Hero>({ roleType }).then(({ data }) => data)
    )).then(results => {
      results.forEach((heroes, i) => { ROLE_HEROES_CACHE[toLoad[i]] = heroes; });
      setRoleHeroes({ ...ROLE_HEROES_CACHE });
    });
  }, [splitResult]);

  const savePick = async (userId: number, heroId: number, team: string, roleType: string) => {
    const { ok } = await updateTournamentPick(tournamentId, {
      targetUserId: userId,
      heroId,
      team,
      roleType,
    });
    if (ok) {
      setPicks(prev => {
        const existing = prev.findIndex(p => p.userId === userId);
        const h = roleHeroes[roleType]?.find(h => h.heroId === heroId);
        const newPick = { userId, heroId, heroName: h?.name || "?", team, roleType };
        if (existing >= 0) {
          const copy = [...prev]; copy[existing] = newPick; return copy;
        }
        return [...prev, newPick];
      });
      setSelectedHero(null);
    }
  };

  const getPick = (userId: number) => picks.find(p => p.userId === userId);

  const renderTeam = (team: { userId: number; roleType: string }[], teamName: string, color: string) => (
    <div style={{ flex: 1, minWidth: 280 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, color, marginBottom: 12, textAlign: "center" }}>{teamName}</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {team.map((p) => {
          const player = playerMap.get(p.userId);
          const pick = getPick(p.userId);
          const heroes = roleHeroes[p.roleType] || [];
          const isSelecting = selectedHero?.userId === p.userId;

          return (
            <div key={p.userId} className="card" style={{ padding: "10px 14px" }}>
              {/* Player info row */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                  background: ROLE_COLORS[p.roleType] + "18", color: ROLE_COLORS[p.roleType],
                }}>
                  {ROLE_LABELS[p.roleType]}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                  {player?.username || "?"}
                </span>
                <span style={{ flex: 1 }} />
                {pick ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <img src={pick.heroId ? `/heroes/images/${pick.heroId}.jpg` : ""}
                      alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: "cover", background: "var(--bg-hover)" }}
                      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    <span
                      onClick={() => setExpandedHero(expandedHero === pick.heroId ? null : pick.heroId)}
                      style={{ fontSize: 13, fontWeight: 600, color: "var(--gold)", cursor: "pointer" }}>
                      {pick.heroName}
                    </span>
                    {isOwner && (
                      <button onClick={() => setSelectedHero({ userId: p.userId, heroId: pick.heroId })}
                        className="btn-subtle" style={{ fontSize: 10, padding: "2px 6px" }}>换</button>
                    )}
                  </div>
                ) : (
                  isOwner && (
                    <button onClick={() => setSelectedHero({ userId: p.userId, heroId: 0 })}
                      className="btn-ghost" style={{ fontSize: 12, padding: "4px 12px" }}>
                      + 选英雄
                    </button>
                  )
                )}
              </div>

              {/* Hero selector dropdown */}
              {isSelecting && isOwner && (
                <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4, maxHeight: 120, overflowY: "auto" }}>
                  {heroes.map(h => (
                    <button key={h.heroId}
                      onClick={() => savePick(p.userId, h.heroId, teamName === "🔴 红队" ? "red" : "blue", p.roleType)}
                      style={{
                        padding: "3px 8px", borderRadius: 6, fontSize: 11, cursor: "pointer",
                        border: "1px solid var(--border)", background: pick?.heroId === h.heroId ? "var(--gold-alpha-08)" : "var(--bg-card)",
                        color: pick?.heroId === h.heroId ? "var(--gold)" : "var(--text-secondary)",
                      }}>
                      <img src={h.imageUrl || `/heroes/images/${h.heroId}.jpg`}
                        alt={h.name}
                        style={{ width: 24, height: 24, borderRadius: 4, verticalAlign: "middle", marginRight: 4 }}
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      {h.name}
                    </button>
                  ))}
                </div>
              )}

              {/* Expanded hero detail */}
              {expandedHero && pick?.heroId === expandedHero && (
                <div style={{ marginTop: 8, padding: "10px 14px", background: "var(--bg-hover)", borderRadius: 8, fontSize: 12 }}>
                  <HeroMiniDetail heroId={pick.heroId} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  if (!splitResult) return null;

  return (
    <div style={{ marginTop: 32 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--text)", marginBottom: 16 }}>英雄选人</h2>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        {renderTeam(splitResult.teamRed, "🔴 红队", "#e05555")}
        {renderTeam(splitResult.teamBlue, "🔵 蓝队", "#4488f0")}
      </div>
    </div>
  );
}

function HeroMiniDetail({ heroId }: { heroId: number }) {
  const [hero, setHero] = useState<any>(null);
  useEffect(() => {
    getHero(heroId).then(({ data }) => setHero(data));
  }, [heroId]);
  if (!hero) return null;

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
        <img src={hero.meta?.imageUrl || `/heroes/images/${heroId}.jpg`}
          alt={hero.name}
          style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover" }} />
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{hero.name}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{hero.meta?.title}</div>
        </div>
      </div>
      {hero.effects?.map((e: any, i: number) => (
        <div key={i} style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
          <b>{e.skillName}</b>: {e.type} {e.base?.[0]} {e.bonuses?.map((b: any) => `+${(b.ratio * 100).toFixed(0)}% ${b.stat}`).join(" ")}
        </div>
      ))}
    </div>
  );
}
