"use client";

import { useEffect, useState } from "react";

interface UserRow {
  id: number;
  username: string;
  role: string;
  banned: boolean;
  avatar: string | null;
  createdAt: string;
  _count: { tournamentPlayers: number };
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/users?page=${page}`)
      .then((r) => r.json())
      .then((d) => { setUsers(d.users); setTotal(d.total); setLoading(false); });
  }, [page]);

  async function toggleBan(id: number, current: boolean) {
    await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ banned: !current }),
    });
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, banned: !current } : u)));
  }

  async function deleteUser(id: number) {
    if (!confirm("确定删除该用户？此操作不可撤销。")) return;
    await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    setUsers((prev) => prev.filter((u) => u.id !== id));
    setTotal((t) => t - 1);
  }

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="px-6 py-8">
      <h1 className="text-xl font-bold mb-1">用户管理</h1>
      <p className="text-[12px] text-text-muted mb-5">共 {total} 个用户</p>

      {loading ? (
        <div className="skeleton h-80 rounded-xl" />
      ) : users.length === 0 ? (
        <div className="text-center py-16 text-text-muted text-sm">暂无用户</div>
      ) : (
        <div className="card !p-0 overflow-hidden">
          <div style={{ overflowX: "auto" }}>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border-light bg-black/[0.015]">
                  <th className="py-3 px-5 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wider">ID</th>
                  <th className="py-3 px-5 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wider">用户名</th>
                  <th className="py-3 px-5 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wider">角色</th>
                  <th className="py-3 px-5 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wider">状态</th>
                  <th className="py-3 px-5 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wider">赛事</th>
                  <th className="py-3 px-5 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wider">注册时间</th>
                  <th className="py-3 px-5 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-border-light transition-colors hover:bg-black/[0.02]">
                    <td className="py-3 px-5 text-text-muted text-[12px] font-mono">{u.id}</td>
                    <td className="py-3 px-5">
                      <span className="font-semibold text-text">{u.username}</span>
                    </td>
                    <td className="py-3 px-5">
                      {u.role === "admin" ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gold">
                          <span className="w-1.5 h-1.5 rounded-full bg-gold" />
                          管理员
                        </span>
                      ) : (
                        <span className="text-[11px] text-text-muted">用户</span>
                      )}
                    </td>
                    <td className="py-3 px-5">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${u.banned ? "text-red" : "text-[#44cc88]"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${u.banned ? "bg-red" : "bg-[#44cc88]"}`} />
                        {u.banned ? "已封禁" : "正常"}
                      </span>
                    </td>
                    <td className="py-3 px-5 text-text-muted text-[12px]">{u._count.tournamentPlayers}</td>
                    <td className="py-3 px-5 text-text-muted text-[12px]">
                      {new Date(u.createdAt).toLocaleDateString("zh-CN")}
                    </td>
                    <td className="py-3 px-5">
                      {u.role === "admin" ? (
                        <span className="text-[11px] text-text-muted">—</span>
                      ) : (
                        <div className="flex gap-2">
                          <button onClick={() => toggleBan(u.id, u.banned)}
                            className={`text-[11px] font-medium rounded-md px-2.5 py-1 transition-colors ${
                              u.banned ? "bg-[#44cc88]/10 text-[#44cc88] hover:bg-[#44cc88]/20" : "bg-yellow/10 text-yellow hover:bg-yellow/20"
                            }`}>
                            {u.banned ? "解封" : "封禁"}
                          </button>
                          <button onClick={() => deleteUser(u.id)}
                            className="text-[11px] font-medium rounded-md px-2.5 py-1 bg-red/8 text-red hover:bg-red/15 transition-colors">
                            删除
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
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
