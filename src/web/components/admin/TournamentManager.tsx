"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/features/shared/client/api";
import { adminRoutePrefix } from "@/features/admin/navigation";
import { ConfirmDialog } from "@/web/components/ui/ConfirmDialog";

interface TournamentRow { id: number; name: string; code: string; status: string; deadline: string; playerCount: number; }
const STATUS_MAP: Record<string, string> = { recruiting: "招募中", locked: "已锁定", completed: "已完成", finished: "已结束" };

export function TournamentManager() {
  const prefix = adminRoutePrefix(usePathname());
  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmation, setConfirmation] = useState<TournamentRow | null>(null);
  const [busy, setBusy] = useState(false);
  const actionPending = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    void apiRequest<{ tournaments?: TournamentRow[]; total?: number }>(`/api/admin/tournaments?page=${page}`, { signal: controller.signal })
      .then(({ ok, data }) => { if (!controller.signal.aborted) { if (!ok) throw new Error("房间列表加载失败"); setTournaments(data.tournaments ?? []); setTotal(data.total ?? 0); } })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "房间列表加载失败"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, revision]);
  async function deleteRoom() {
    if (!confirmation || actionPending.current) return;
    actionPending.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const result = await apiRequest<{ error?: string }>(`/api/tournaments/${confirmation.id}`, { method: "DELETE" });
      if (!result.ok) throw new Error(result.data.error || "删除房间失败");
      setNotice(`已删除房间「${confirmation.name}」`); setConfirmation(null);
      if (tournaments.length === 1 && page > 1) setPage(value => value - 1);
      else setRevision(value => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "删除房间失败，请重试"); }
    finally { actionPending.current = false; setBusy(false); }
  }
  const totalPages = Math.max(1, Math.ceil(total / 20));
  return <div className="admin-page">
    <header className="admin-page-heading"><div><p className="feature-kicker">TOURNAMENTS</p><h1>房间管理</h1><p>共 {total} 个房间 · 查看报名、队伍和比赛记录</p></div><button className="btn-subtle" disabled={loading || busy} onClick={() => setRevision(value => value + 1)}>{loading ? "正在刷新…" : "刷新房间"}</button></header>
    {error && !confirmation && <p role="alert" className="admin-error">{error}</p>}{notice && <p role="status" className="admin-notice">{notice}</p>}
    {loading ? <p role="status" className="admin-empty">正在加载房间…</p> : !tournaments.length ? <div className="admin-empty"><p>{error ? "暂时无法读取房间记录。" : "暂无房间"}</p>{error && <button className="btn-subtle" onClick={() => setRevision(value => value + 1)}>重新加载</button>}</div> : <div className="admin-table-wrap admin-card-table-wrap" role="region" aria-label="房间管理表格" tabIndex={0}>
      <table className="admin-table admin-card-table" role="table"><caption>点击房间查看完整记录；删除操作需要再次确认。</caption><thead><tr role="row">{["名称", "邀请码", "状态", "人数", "截止时间", "操作"].map(title => <th key={title} scope="col" role="columnheader">{title}</th>)}</tr></thead><tbody>{tournaments.map(room => <tr key={room.id} role="row">
        <td className="admin-name admin-card-title" data-label="房间名称" role="cell"><Link href={`${prefix}/tournaments/${room.id}`}><strong>{room.name}</strong></Link></td><td data-label="邀请码" role="cell"><code>{room.code}</code></td><td data-label="房间状态" role="cell"><span className="admin-state" data-state={room.status}>{STATUS_MAP[room.status] || STATUS_MAP.finished}</span></td><td data-label="报名人数" role="cell">{room.playerCount} 人</td><td data-label="报名截止" role="cell">{new Date(room.deadline).toLocaleDateString("zh-CN")}</td><td className="admin-card-actions" data-label="管理操作" role="cell"><div className="admin-row-actions"><Link className="btn-subtle" href={`${prefix}/tournaments/${room.id}`}>查看房间</Link><button className="btn-subtle admin-danger" disabled={busy} onClick={() => { setError(""); setConfirmation(room); }}>删除</button></div></td>
      </tr>)}</tbody></table>
    </div>}
    {totalPages > 1 && <nav className="admin-pagination" aria-label="房间分页"><button className="btn-subtle" disabled={loading || page <= 1} onClick={() => setPage(value => value - 1)}>上一页</button><span>第 {page} / {totalPages} 页</span><button className="btn-subtle" disabled={loading || page >= totalPages} onClick={() => setPage(value => value + 1)}>下一页</button></nav>}
    <ConfirmDialog open={!!confirmation} title={`删除房间「${confirmation?.name}」？`} description={error || "删除后无法恢复。请先查看房间，确认无需保留报名与比赛记录。"} confirmLabel="确认删除房间" busy={busy} onClose={() => { setConfirmation(null); setError(""); }} onConfirm={() => void deleteRoom()} />
  </div>;
}
