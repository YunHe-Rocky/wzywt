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

const MATCH_STATUS_LABELS: Record<string, string> = {
  DRAFT: "待上传数据",
  WAITING_CONFIRMATION: "等待人工确认",
  CONFIRMED: "待正式提交",
  SUBMITTED: "已正式提交",
};
const CONSISTENCY_LABELS: Record<string, string> = { PASS: "通过", WARNING: "待核查", FAIL: "未通过" };

export function MatchArchivePanel({ tournamentId, canManage }: { tournamentId: number; canManage: boolean }) {
  const routePrefix = usePathname().startsWith("/m/") ? "/m" : "";
  const [matches, setMatches] = useState<MatchListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const { success, error } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listMatches<{ matches: MatchListItem[]; error?: string }>(tournamentId);
      if (!result.ok) return error(result.data.error || "比赛档案加载失败，请确认登录状态后重试");
      setMatches(result.data.matches);
    } catch (cause) {
      error(cause instanceof Error ? cause.message : "比赛档案加载失败，请检查网络后重试");
    } finally {
      setLoading(false);
    }
  }, [error, tournamentId]);

  useEffect(() => { void load(); }, [load]);

  async function createDraft() {
    setCreating(true);
    try {
      const result = await createMatch<{ match: { id: number }; error?: string }>(tournamentId);
      if (!result.ok) return error(result.data.error || "比赛档案创建失败，请稍后重试");
      success("比赛档案已创建");
      await load();
    } catch (cause) {
      error(cause instanceof Error ? cause.message : "比赛档案创建失败，请检查网络后重试");
    } finally {
      setCreating(false);
    }
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
            {creating ? "创建中…" : matches.length ? "新建下一场档案" : "创建比赛档案"}
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
                  <span className="feature-status">{MATCH_STATUS_LABELS[match.status] || match.status}</span>
                  <span>{new Date(match.playedAt).toLocaleString("zh-CN")}</span>
                </div>
                <div className="match-scoreline">
                  <span>红方 {match.redTotalKills ?? "—"}</span><b>:</b><span>{match.blueTotalKills ?? "—"} 蓝方</span>
                </div>
                <small>原图 {match._count.screenshots}/6 · 选手 {match._count.players}/10 · 动态 {match._count.combatPosts} · 一致性 {CONSISTENCY_LABELS[match.consistencyStatus] || match.consistencyStatus}</small>
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
