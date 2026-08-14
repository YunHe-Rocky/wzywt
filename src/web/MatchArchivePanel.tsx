"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createMatch, listMatches } from "@/features/matches/client/api";
import { useToast } from "@/web/components/ui/Toast";

interface MatchListItem {
  id: number;
  playedAt: string;
  status: string;
  winnerSide: "red" | "blue" | null;
  redTotalKills: number | null;
  blueTotalKills: number | null;
  consistencyStatus: string;
  _count: { screenshots: number; players: number; combatPosts: number };
}

export function MatchArchivePanel({ tournamentId, canManage }: { tournamentId: number; canManage: boolean }) {
  const routePrefix = usePathname().startsWith("/m/") ? "/m" : "";
  const [matches, setMatches] = useState<MatchListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const { success, error } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const result = await listMatches<{ matches: MatchListItem[]; error?: string }>(tournamentId);
    setLoading(false);
    if (!result.ok) return error(result.data.error || "比赛档案加载失败");
    setMatches(result.data.matches);
  }, [error, tournamentId]);

  useEffect(() => { void load(); }, [load]);

  async function createDraft() {
    setCreating(true);
    const result = await createMatch<{ match: { id: number }; error?: string }>(tournamentId);
    setCreating(false);
    if (!result.ok) return error(result.data.error || "比赛档案创建失败");
    success("比赛档案已创建");
    await load();
  }

  return (
    <section className="match-archive" aria-labelledby="match-archive-title">
      <div className="feature-heading">
        <div>
          <p className="feature-kicker">MATCH ARCHIVE</p>
          <h3 id="match-archive-title">永久比赛档案</h3>
          <p>六类原图、人工复核与战术室共同固化为一场比赛。</p>
        </div>
        {canManage && (
          <button className="btn-primary feature-action" disabled={creating} onClick={createDraft}>
            {creating ? "创建中…" : matches.length ? "重开档案" : "创建比赛档案"}
          </button>
        )}
      </div>
      {loading ? <div className="feature-empty">正在读取档案…</div> : matches.length === 0 ? (
        <div className="feature-empty">尚无比赛档案。完成分队后由赛事管理员创建。</div>
      ) : (
        <div className="match-archive-list">
          {matches.map((match) => (
            <article className="match-archive-row" key={match.id}>
              <div className={`match-side-mark match-side-mark--${match.winnerSide || "pending"}`} aria-hidden="true" />
              <div className="match-archive-main">
                <div className="feature-meta-row">
                  <strong>第 {match.id} 场</strong>
                  <span className="feature-status">{match.status}</span>
                  <span>{new Date(match.playedAt).toLocaleString("zh-CN")}</span>
                </div>
                <div className="match-scoreline">
                  <span>红方 {match.redTotalKills ?? "—"}</span><b>:</b><span>{match.blueTotalKills ?? "—"} 蓝方</span>
                </div>
                <small>原图 {match._count.screenshots}/6 · 选手 {match._count.players}/10 · 动态 {match._count.combatPosts} · 一致性 {match.consistencyStatus}</small>
              </div>
              <div className="feature-row-actions">
                <Link className="btn-subtle" href={`${routePrefix}/tournaments/${tournamentId}/matches/${match.id}`}>查看档案</Link>
                <Link className="btn-subtle" href={`${routePrefix}/tournaments/${tournamentId}/matches/${match.id}/tactics/red`}>红方战术</Link>
                <Link className="btn-subtle" href={`${routePrefix}/tournaments/${tournamentId}/matches/${match.id}/tactics/blue`}>蓝方战术</Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
