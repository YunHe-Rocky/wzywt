"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { getAdminPosts, type AdminPost, type AdminPostPage } from "@/features/admin/client/api";
import { adminRoutePrefix } from "@/features/admin/navigation";
import { moderateCombatPost } from "@/features/combat-posts/client/api";
import { ConfirmDialog } from "@/web/components/ui/ConfirmDialog";

export function CombatPostManager() {
  const prefix = adminRoutePrefix(usePathname());
  const [result, setResult] = useState<AdminPostPage | null>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [operationError, setOperationError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmation, setConfirmation] = useState<{ post: AdminPost; action: "HIDE" | "RESTORE" | "DELETE" } | null>(null);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("");
    void getAdminPosts(page, status, search, controller.signal).then(response => {
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(response.data.error || "动态加载失败");
      setResult(response.data);
      if (response.data.page !== page) setPage(response.data.page);
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "动态加载失败"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, status, search, revision]);
  function submit(event: FormEvent) { event.preventDefault(); setPage(1); setSearch(query.trim()); }
  function confirm(post: AdminPost, action: "HIDE" | "RESTORE" | "DELETE") {
    setOperationError(""); setConfirmation({ post, action });
  }
  async function moderate() {
    if (!confirmation || busy) return;
    setBusy(true); setOperationError(""); setNotice("");
    try {
      const response = await moderateCombatPost<{ error?: string }>(confirmation.post.id, confirmation.action);
      if (!response.ok) throw new Error(response.data.error || "操作失败");
      setNotice(confirmation.action === "DELETE" ? "动态已删除" : confirmation.action === "HIDE" ? "动态已隐藏" : "动态已恢复");
      setConfirmation(null); setRevision(value => value + 1);
    } catch (cause) { setOperationError(cause instanceof Error ? cause.message : "操作失败"); }
    finally { setBusy(false); }
  }
  return <div className="admin-page"><div className="admin-page-heading"><div><p className="feature-kicker">COMMUNITY</p><h1>动态管理</h1><p>查看视频复盘，管理动态及评论。</p></div><Link className="btn-primary" href={`${prefix}/combat`}>进入动态广场</Link></div>
    <form className="admin-filter-bar" onSubmit={submit}><label>搜索动态<input value={query} onChange={e => setQuery(e.target.value)} maxLength={128} placeholder="标题或作者" /></label><label>发布状态<select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">全部状态</option><option value="published">已发布</option><option value="hidden">已隐藏</option></select></label><button className="btn-primary" type="submit">搜索</button><button className="btn-subtle" type="button" disabled={loading} onClick={() => setRevision(v => v + 1)}>刷新</button></form>
    {error && <p role="alert" className="admin-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    <section className="admin-panel" aria-busy={loading} aria-label="动态列表">{loading ? <p className="feature-empty">正在加载动态…</p> : error ? <p className="feature-empty">未能加载，点击刷新重试。</p> : !result?.posts.length ? <p className="feature-empty">没有符合条件的动态。</p> : <div className="admin-post-list">{result.posts.map(post => <article key={post.id} className="admin-post-row"><div><span className="feature-status">{post.status === "hidden" ? "已隐藏" : "已发布"}</span><h2><Link href={`${prefix}/combat/${post.id}`}>{post.title}</Link></h2><p>{post.author.username} · {new Date(post.createdAt).toLocaleString("zh-CN")}</p><small>{(post.size / 1024 ** 2).toFixed(1)} MiB · {post._count.likes} 赞 · {post._count.comments} 条评论</small></div><div className="admin-row-actions"><Link className="btn-subtle" href={`${prefix}/combat/${post.id}`}>查看与评论管理</Link><button className="btn-subtle" disabled={busy} onClick={() => confirm(post, post.status === "hidden" ? "RESTORE" : "HIDE")}>{post.status === "hidden" ? "恢复发布" : "隐藏动态"}</button><button className="btn-subtle admin-danger" disabled={busy} onClick={() => confirm(post, "DELETE")}>永久删除</button></div></article>)}</div>}</section>
    <div className="pagination"><button className="btn-subtle" disabled={loading || page <= 1} onClick={() => setPage(v => v - 1)}>上一页</button><span>第 {page} / {result?.totalPages || 1} 页 · 共 {result?.total || 0} 条</span><button className="btn-subtle" disabled={loading || page >= (result?.totalPages || 1)} onClick={() => setPage(v => v + 1)}>下一页</button></div>
    <ConfirmDialog open={Boolean(confirmation)} title={confirmation?.action === "DELETE" ? "永久删除动态？" : confirmation?.action === "HIDE" ? "隐藏这条动态？" : "恢复发布这条动态？"} description={operationError || (confirmation?.action === "DELETE" ? "删除后无法恢复，视频将被清理。" : confirmation?.action === "HIDE" ? "隐藏后普通成员无法在动态广场看到它。" : "恢复后登录成员可以查看并参与互动。")} confirmLabel={confirmation?.action === "DELETE" ? "永久删除" : "确认"} danger={confirmation?.action === "DELETE"} busy={busy} onClose={() => setConfirmation(null)} onConfirm={() => void moderate()} />
  </div>;
}
