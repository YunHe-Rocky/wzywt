"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/features/shared/client/api";

interface TournamentRow {
  id: number;
  name: string;
  code: string;
  status: string;
  deadline: string;
  playerCount: number;
  createdAt: string;
}

const STATUS_MAP: Record<string, string> = { recruiting: "招募中", locked: "已锁定", completed: "已完成", finished: "已结束" };

export default function AdminTournamentsPage() {
  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void apiRequest<{ tournaments?: TournamentRow[]; total?: number }>(`/api/admin/tournaments?page=${page}`, { signal: controller.signal })
      .then(({ ok, data }) => {
        if (controller.signal.aborted) return;
        if (!ok) {
          setError("房间列表加载失败");
          return;
        }
        setTournaments(data.tournaments ?? []);
        setTotal(data.total ?? 0);
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : "房间列表加载失败");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page]);

  async function deleteRoom(id: number, name: string) {
    if (!confirm(`确定删除房间「${name}」？此操作不可撤销。`)) return;
    setError("");
    try {
      const res = await apiRequest<{ error?: string }>(`/api/tournaments/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setError(res.data.error || "删除房间失败");
        return;
      }
      setTournaments((prev) => prev.filter((t) => t.id !== id));
      setTotal((t) => t - 1);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "删除房间失败");
    }
  }

  const totalPages = Math.ceil(total / 20);

  return <div className="admin-page">
    <header className="admin-page-heading"><div><p className="feature-kicker">TOURNAMENTS</p><h1>房间管理</h1><p>共 {total} 个房间 · 查看报名状态与房间记录</p></div></header>
    {error && <p role="alert" className="admin-error">{error}</p>}
    {loading ? <p role="status" className="admin-empty">正在加载房间…</p> : tournaments.length === 0 ? <p className="admin-empty">暂无房间</p> : (
      <div className="admin-table-wrap" role="region" aria-label="房间管理表格" tabIndex={0}><table className="admin-table">
        <caption>房间信息与管理操作 · 窄屏可在表格内横向滚动</caption><thead><tr>{["名称","邀请码","状态","人数","截止时间","操作"].map(title => <th key={title} scope="col">{title}</th>)}</tr></thead>
        <tbody>{tournaments.map(t => <tr key={t.id}><td className="admin-name"><strong>{t.name}</strong></td><td>{t.code}</td><td><span className="admin-state" data-state={t.status}>{STATUS_MAP[t.status] || STATUS_MAP.finished}</span></td><td>{t.playerCount} 人</td><td>{new Date(t.deadline).toLocaleDateString("zh-CN")}</td><td><button className="btn-subtle admin-danger" onClick={() => void deleteRoom(t.id,t.name)}>删除</button></td></tr>)}</tbody>
      </table></div>
    )}
    {totalPages > 1 && <nav className="admin-pagination" aria-label="房间分页"><button className="btn-subtle" disabled={page <= 1} onClick={() => setPage(p => p-1)}>上一页</button><span>{page} / {totalPages}</span><button className="btn-subtle" disabled={page >= totalPages} onClick={() => setPage(p => p+1)}>下一页</button></nav>}
  </div>;
}
