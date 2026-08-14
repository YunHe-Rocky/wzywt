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

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  recruiting: { label: "招募中", color: "#44cc88", bg: "#44cc8812" },
  locked:    { label: "已锁定", color: "#e8a23c", bg: "#e8a23c12" },
  completed: { label: "已完成", color: "#4488f0", bg: "#4488f012" },
  finished:  { label: "已结束", color: "#999",    bg: "#99999912" },
};

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

  return (
    <div className="px-6 py-8">
      <h1 className="text-xl font-bold mb-1">房间管理</h1>
      <p className="text-[12px] text-text-muted mb-5">共 {total} 个房间</p>
      {error && <p role="alert" className="mb-4 text-[12px] text-red">{error}</p>}

      {loading ? (
        <div className="skeleton h-80 rounded-xl" />
      ) : tournaments.length === 0 ? (
        <div className="text-center py-16 text-text-muted text-sm">暂无房间</div>
      ) : (
        <div className="card !p-0 overflow-hidden">
          <div style={{ overflowX: "auto" }}>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border-light bg-black/[0.015]">
                  <th className="py-3 px-5 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wider">名称</th>
                  <th className="py-3 px-5 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wider">邀请码</th>
                  <th className="py-3 px-5 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wider">状态</th>
                  <th className="py-3 px-5 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wider">人数</th>
                  <th className="py-3 px-5 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wider">截止时间</th>
                  <th className="py-3 px-5 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody>
                {tournaments.map((t) => {
                  const s = STATUS_MAP[t.status] || STATUS_MAP.finished;
                  return (
                    <tr key={t.id} className="border-b border-border-light transition-colors hover:bg-black/[0.02]">
                      <td className="py-3 px-5">
                        <span className="font-semibold text-text">{t.name}</span>
                      </td>
                      <td className="py-3 px-5">
                        <span className="text-[12px] font-mono text-text-muted tracking-wider">{t.code}</span>
                      </td>
                      <td className="py-3 px-5">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full px-2.5 py-1"
                          style={{ background: s.bg, color: s.color }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
                          {s.label}
                        </span>
                      </td>
                      <td className="py-3 px-5 text-[12px] text-text-muted">{t.playerCount} 人</td>
                      <td className="py-3 px-5 text-[12px] text-text-muted">
                        {new Date(t.deadline).toLocaleDateString("zh-CN")}
                      </td>
                      <td className="py-3 px-5">
                        <button onClick={() => deleteRoom(t.id, t.name)}
                          className="text-[11px] font-medium rounded-md px-2.5 py-1 bg-red/8 text-red hover:bg-red/15 transition-colors">
                          删除
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-5">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
            className="px-3.5 py-1.5 text-[12px] font-medium rounded-lg bg-card border border-border-light hover:bg-hover disabled:opacity-30 transition-all">
            上一页
          </button>
          <span className="text-[12px] text-text-muted tabular-nums">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
            className="px-3.5 py-1.5 text-[12px] font-medium rounded-lg bg-card border border-border-light hover:bg-hover disabled:opacity-30 transition-all">
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
