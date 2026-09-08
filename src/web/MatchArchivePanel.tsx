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
  ownSide: "red" | "blue" | null;
  canViewArchive: boolean;
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

export function MatchArchivePanel({ tournamentId, canManage, mode = "archive" }: { tournamentId: number; canManage: boolean; mode?: "archive" | "tactics" }) {
  const routePrefix = usePathname().startsWith("/m/") ? "/m" : "";
  const [matches, setMatches] = useState<MatchListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [loadError, setLoadError] = useState("");
  const { success, error } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const result = await listMatches<{ matches: MatchListItem[]; error?: string }>(tournamentId);
      if (!result.ok) { setMatches([]); setLoadError(result.data.error || "比赛档案加载失败，请确认登录状态后重试"); return; }
      setMatches(result.data.matches);
    } catch (cause) {
      setMatches([]); setLoadError(cause instanceof Error ? cause.message : "比赛档案加载失败，请检查网络后重试");
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

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

  const visibleMatches = matches.filter(match => mode === "tactics" ? Boolean(match.ownSide) : match.canViewArchive);
  return (
    <section className="match-archive" aria-labelledby="match-archive-title">
      <div className="feature-heading">
        <div>
          <p className="feature-kicker">{mode === "tactics" ? "TEAM TACTICS" : "MATCH ARCHIVE"}</p>
          <h3 id="match-archive-title">{mode === "tactics" ? "本队战术" : "永久比赛档案"} {mode === "archive" && <span className="badge badge-gold" style={{ fontSize: 11, verticalAlign: "middle" }}>BETA 测试</span>}</h3>
          <p>{mode === "tactics" ? "只显示自己所在队伍；赛前独立标注，战绩提交后队内复盘。" : canManage ? "管理员可录入和审核双方数据，正式提交后成员才能查看本队档案。" : "比赛结束并正式提交后开放，仅展示本队比赛数据。"}</p>
        </div>
        {canManage && !loading && !loadError && matches.length === 0 && (
          <button className="btn-primary feature-action" disabled={creating} onClick={createDraft}>
            {creating ? "创建中…" : "建立比赛档案"}
          </button>
        )}
      </div>
      {loading ? <div className="feature-empty">正在读取…</div> : loadError ? (
        <div className="feature-empty" role="alert">{loadError} <button className="btn-subtle" onClick={() => void load()}>重试</button></div>
      ) : visibleMatches.length === 0 ? (
        <div className="feature-empty">{mode === "tactics" ? "暂未建立本队战术室，请联系房主建立比赛档案。" : canManage ? "还没有比赛档案。完成分队后，可由赛事管理员建立。" : "暂无已完成并正式提交的本队档案。"}</div>
      ) : (
        <div className="match-archive-list">
          {visibleMatches.map((match) => (
            <article className="match-archive-row" key={match.id}>
              <div className={`match-side-mark match-side-mark--${match.ownSide || match.winnerSide || "pending"}`} aria-hidden="true" />
              <div className="match-archive-main">
                <div className="feature-meta-row">
                  <strong>比赛 #{String(match.id).padStart(3, "0")}</strong>
                  <span className="feature-status">{mode === "tactics" ? `${match.ownSide === "red" ? "红队" : "蓝队"} · 我的队伍` : MATCH_STATUS_LABELS[match.status] || match.status}</span>
                  <span>{new Date(match.playedAt).toLocaleString("zh-CN")}</span>
                </div>
                {mode === "archive" && <div className="match-scoreline">
                  <span>红方 {match.redTotalKills ?? "—"}</span><b>:</b><span>{match.blueTotalKills ?? "—"} 蓝方</span>
                </div>}
                {mode === "archive" && canManage && <small>原图 {match._count.screenshots}/6 · 选手 {match._count.players}/10 · 动态 {match._count.combatPosts} · 一致性 {CONSISTENCY_LABELS[match.consistencyStatus] || match.consistencyStatus}</small>}
              </div>
              <div className="feature-row-actions">
                {mode === "archive" && <Link className="btn-subtle" href={`${routePrefix}/tournaments/${tournamentId}/matches/${match.id}`}>打开档案</Link>}
                {match.ownSide && <Link className="btn-subtle" href={`${routePrefix}/tournaments/${tournamentId}/matches/${match.id}/tactics/${match.ownSide}`}>进入本队战术室</Link>}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
