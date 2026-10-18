"use client";

import { useEffect, useState } from "react";
import { apiRequest, jsonRequest } from "@/features/shared/client/api";

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
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void apiRequest<{ users?: UserRow[]; total?: number }>(`/api/admin/users?page=${page}`, { signal: controller.signal })
      .then(({ ok, data }) => {
        if (controller.signal.aborted) return;
        if (!ok) {
          setError("用户列表加载失败");
          return;
        }
        setUsers(data.users ?? []);
        setTotal(data.total ?? 0);
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : "用户列表加载失败");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page]);

  async function toggleBan(id: number, current: boolean) {
    setError("");
    try {
      const result = await jsonRequest<{ error?: string }>(`/api/admin/users/${id}`, "PATCH", { banned: !current });
      if (!result.ok) {
        setError(result.data.error || "更新用户状态失败");
        return;
      }
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, banned: !current } : u)));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "更新用户状态失败");
    }
  }

  async function deleteUser(id: number) {
    if (!confirm("确定删除该用户？此操作不可撤销。")) return;
    setError("");
    try {
      const result = await apiRequest<{ error?: string }>(`/api/admin/users/${id}`, { method: "DELETE" });
      if (!result.ok) {
        setError(result.data.error || "删除用户失败");
        return;
      }
      setUsers((prev) => prev.filter((u) => u.id !== id));
      setTotal((t) => t - 1);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "删除用户失败");
    }
  }

  const totalPages = Math.ceil(total / 20);

  return <div className="admin-page">
    <header className="admin-page-heading"><div><p className="feature-kicker">MEMBERS</p><h1>用户管理</h1><p>共 {total} 个用户 · 管理成员状态与参与记录</p></div></header>
    {error && <p role="alert" className="admin-error">{error}</p>}
    {loading ? <p role="status" className="admin-empty">正在加载用户…</p> : users.length === 0 ? <p className="admin-empty">暂无用户</p> : (
      <div className="admin-table-wrap" role="region" aria-label="用户管理表格" tabIndex={0}>
        <table className="admin-table"><caption>成员信息与管理操作 · 窄屏可在表格内横向滚动</caption><thead><tr>
          {["ID","用户名","角色","状态","赛事","注册时间","操作"].map(title => <th key={title} scope="col">{title}</th>)}
        </tr></thead><tbody>{users.map(u => <tr key={u.id}>
          <td>{u.id}</td><td className="admin-name"><strong>{u.username}</strong></td><td><span className="admin-state">{u.role === "admin" ? "管理员" : "用户"}</span></td>
          <td><span className="admin-state" data-state={u.banned ? "banned" : "normal"}>{u.banned ? "已封禁" : "正常"}</span></td>
          <td>{u._count.tournamentPlayers}</td><td>{new Date(u.createdAt).toLocaleDateString("zh-CN")}</td>
          <td>{u.role === "admin" ? <span>—</span> : <div className="admin-row-actions"><button className="btn-subtle" onClick={() => void toggleBan(u.id,u.banned)}>{u.banned ? "解封" : "封禁"}</button><button className="btn-subtle admin-danger" onClick={() => void deleteUser(u.id)}>删除</button></div>}</td>
        </tr>)}</tbody></table>
      </div>
    )}
    {totalPages > 1 && <nav className="admin-pagination" aria-label="用户分页"><button className="btn-subtle" disabled={page <= 1} onClick={() => setPage(p => p-1)}>上一页</button><span>{page} / {totalPages}</span><button className="btn-subtle" disabled={page >= totalPages} onClick={() => setPage(p => p+1)}>下一页</button></nav>}
  </div>;
}
