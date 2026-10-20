"use client";

import { useEffect, useRef, useState } from "react";
import { apiRequest, jsonRequest } from "@/features/shared/client/api";
import { ConfirmDialog } from "@/web/components/ui/ConfirmDialog";

interface UserRow { id: number; username: string; role: string; banned: boolean; createdAt: string; _count: { tournamentPlayers: number }; }

export function UserManager() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmation, setConfirmation] = useState<{ user: UserRow; action: "ban" | "delete" } | null>(null);
  const [busy, setBusy] = useState(false);
  const actionPending = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    void apiRequest<{ users?: UserRow[]; total?: number }>(`/api/admin/users?page=${page}`, { signal: controller.signal })
      .then(({ ok, data }) => {
        if (controller.signal.aborted) return;
        if (!ok) throw new Error("用户列表加载失败");
        setUsers(data.users ?? []); setTotal(data.total ?? 0);
      }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "用户列表加载失败"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, revision]);

  async function applyAction() {
    if (!confirmation || actionPending.current) return;
    actionPending.current = true; setBusy(true); setError(""); setNotice("");
    const { user, action } = confirmation;
    try {
      const result = action === "delete"
        ? await apiRequest<{ error?: string }>(`/api/admin/users/${user.id}`, { method: "DELETE" })
        : await jsonRequest<{ error?: string }>(`/api/admin/users/${user.id}`, "PATCH", { banned: !user.banned });
      if (!result.ok) throw new Error(result.data.error || "更新用户失败");
      setNotice(action === "delete" ? `已删除用户「${user.username}」` : `「${user.username}」已${user.banned ? "解除封禁" : "封禁"}`);
      setConfirmation(null);
      if (action === "delete" && users.length === 1 && page > 1) setPage(value => value - 1);
      else setRevision(value => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "更新用户失败，请重试"); }
    finally { actionPending.current = false; setBusy(false); }
  }

  const totalPages = Math.max(1, Math.ceil(total / 20));
  return <div className="admin-page">
    <header className="admin-page-heading"><div><p className="feature-kicker">MEMBERS</p><h1>用户管理</h1><p>共 {total} 位成员 · 查看参与记录与账号状态</p></div><button className="btn-subtle" disabled={loading || busy} onClick={() => setRevision(value => value + 1)}>{loading ? "正在刷新…" : "刷新成员"}</button></header>
    {error && !confirmation && <p role="alert" className="admin-error">{error}</p>}{notice && <p role="status" className="admin-notice">{notice}</p>}
    {loading ? <p role="status" className="admin-empty">正在加载用户…</p> : error && !users.length ? <div className="admin-empty"><p>暂时无法读取成员记录。</p><button className="btn-subtle" onClick={() => setRevision(value => value + 1)}>重新加载</button></div> : !users.length ? <p className="admin-empty">暂无用户</p> : <div className="admin-table-wrap admin-card-table-wrap" role="region" aria-label="用户管理表格" tabIndex={0}>
      <table className="admin-table admin-card-table" role="table"><caption>先确认成员身份与状态，再进行账号操作。</caption><thead><tr role="row">{["ID", "用户名", "角色", "状态", "赛事", "注册时间", "操作"].map(title => <th scope="col" key={title} role="columnheader">{title}</th>)}</tr></thead><tbody>{users.map(user => <tr key={user.id} role="row">
        <td data-label="成员编号" role="cell">#{user.id}</td><td className="admin-name admin-card-title" data-label="用户名" role="cell"><strong>{user.username}</strong></td><td data-label="角色" role="cell"><span className="admin-state">{user.role === "admin" ? "管理员" : "用户"}</span></td>
        <td data-label="账号状态" role="cell"><span className="admin-state" data-state={user.banned ? "banned" : "normal"}>{user.banned ? "已封禁" : "正常"}</span></td><td data-label="参与赛事" role="cell">{user._count.tournamentPlayers} 场</td><td data-label="注册时间" role="cell">{new Date(user.createdAt).toLocaleDateString("zh-CN")}</td>
        <td data-label="管理操作" className="admin-card-actions" role="cell">{user.role === "admin" ? <span className="settings-help">管理员账号受保护</span> : <div className="admin-row-actions"><button className="btn-subtle" disabled={busy} onClick={() => { setError(""); setConfirmation({ user, action: "ban" }); }}>{user.banned ? "解封" : "封禁"}</button><button className="btn-subtle admin-danger" disabled={busy} onClick={() => { setError(""); setConfirmation({ user, action: "delete" }); }}>删除</button></div>}</td>
      </tr>)}</tbody></table>
    </div>}
    {totalPages > 1 && <nav className="admin-pagination" aria-label="用户分页"><button className="btn-subtle" disabled={loading || page <= 1} onClick={() => setPage(value => value - 1)}>上一页</button><span>第 {page} / {totalPages} 页</span><button className="btn-subtle" disabled={loading || page >= totalPages} onClick={() => setPage(value => value + 1)}>下一页</button></nav>}
    <ConfirmDialog open={!!confirmation} title={confirmation?.action === "delete" ? `删除「${confirmation.user.username}」？` : `${confirmation?.user.banned ? "解封" : "封禁"}「${confirmation?.user.username}」？`} description={error || (confirmation?.action === "delete" ? "账号删除后无法恢复，请确认成员身份。" : confirmation?.user.banned ? "解封后，该成员可以重新登录并参与演武。" : "封禁后，该成员将无法登录。需要恢复时可在此解封。")} confirmLabel={confirmation?.action === "delete" ? "确认删除" : confirmation?.user.banned ? "确认解封" : "确认封禁"} danger={confirmation?.action === "delete" || !confirmation?.user.banned} busy={busy} onClose={() => { setConfirmation(null); setError(""); }} onConfirm={() => void applyAction()} />
  </div>;
}
