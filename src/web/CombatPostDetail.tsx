"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { addCombatPostComment, getCombatPost, moderateCombatPost, removeCombatPostComment, setCombatPostLike } from "@/features/combat-posts/client/api";
import { getCurrentUser } from "@/features/auth/client/api";
import { useToast } from "@/web/components/ui/Toast";

interface Comment { id: number; content: string; createdAt: string; authorId: number; author: { username: string } }
interface PostData { post: { id: number; title: string; content: string; status: string; createdAt: string; authorId: number; author: { username: string }; likedByMe: boolean; videoUrl: string; comments: Comment[]; _count: { likes: number; comments: number } }; access: { canModerate: boolean } }

export function CombatPostDetail() {
  const { postId } = useParams<{ postId: string }>();
  const routePrefix = usePathname().startsWith("/m/") ? "/m" : "";
  const router = useRouter();
  const [data, setData] = useState<PostData | null>(null);
  const [userId, setUserId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const { success, error } = useToast();
  const load = useCallback(async () => {
    const result = await getCombatPost<PostData & { error?: string }>(postId);
    if (!result.ok) return error(result.data.error || "动态加载失败");
    setData(result.data);
  }, [error, postId]);
  useEffect(() => { void load(); getCurrentUser().then(({ data: current }) => setUserId(current.user?.userId ?? null)); }, [load]);

  async function toggleLike() {
    if (!data) return;
    const result = await setCombatPostLike<{ error?: string }>(postId, !data.post.likedByMe);
    if (!result.ok) return error(result.data.error || "操作失败");
    await load();
  }
  async function comment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); setBusy(true);
    const result = await addCombatPostComment<{ error?: string }>(postId, String(form.get("content") || "")); setBusy(false);
    if (!result.ok) return error(result.data.error || "评论失败");
    formElement.reset(); await load();
  }
  async function removeComment(id: number) {
    const result = await removeCombatPostComment<{ error?: string }>(postId, id);
    if (!result.ok) return error(result.data.error || "删除评论失败"); success("评论已删除"); await load();
  }
  async function moderate(action: "HIDE" | "RESTORE" | "DELETE") {
    const result = await moderateCombatPost<{ error?: string }>(postId, action);
    if (!result.ok) return error(result.data.error || "管理操作失败");
    if (action === "DELETE") return router.replace(`${routePrefix}/combat`);
    success("动态状态已更新"); await load();
  }
  if (!data) return <main className="page-shell page-shell--medium"><div className="feature-empty">正在读取复盘…</div></main>;
  const { post } = data;
  return <main className="page-shell page-shell--medium combat-detail">
    <nav className="feature-breadcrumb"><Link href={`${routePrefix}/combat`}>演武动态</Link><span>/</span><span>#{post.id}</span></nav>
    <header className="feature-hero"><div><p className="feature-kicker">COMBAT REVIEW</p><h1>{post.title}</h1><p>{post.author.username} · {new Date(post.createdAt).toLocaleString("zh-CN")}</p></div>{post.status !== "published" && <span className="feature-status">{post.status}</span>}</header>
    <section className="combat-player"><video controls preload="metadata" playsInline src={post.videoUrl}>浏览器不支持视频播放。</video></section>
    <article className="feature-section combat-article"><p>{post.content}</p><div className="feature-row-actions"><button className={post.likedByMe ? "btn-primary" : "btn-subtle"} onClick={toggleLike}>{post.likedByMe ? "已赞" : "点赞"} · {post._count.likes}</button>{data.access.canModerate && <><button className="btn-subtle" onClick={() => moderate(post.status === "hidden" ? "RESTORE" : "HIDE")}>{post.status === "hidden" ? "恢复" : "隐藏"}</button><button className="btn-danger" onClick={() => moderate("DELETE")}>删除</button></>}</div></article>
    <section className="feature-section"><div className="feature-heading"><div><p className="feature-kicker">DISCUSSION</p><h2>评论 {post._count.comments}</h2></div></div><form className="comment-form" onSubmit={comment}><textarea name="content" rows={3} maxLength={1000} required placeholder="留下具体、有帮助的复盘意见" /><button className="btn-primary" disabled={busy}>{busy ? "发送中…" : "发表评论"}</button></form><div className="comment-list">{post.comments.map((item) => <article key={item.id}><div className="feature-meta-row"><strong>{item.author.username}</strong><span>{new Date(item.createdAt).toLocaleString("zh-CN")}</span></div><p>{item.content}</p>{(item.authorId === userId || data.access.canModerate) && <button className="text-action" onClick={() => removeComment(item.id)}>删除</button>}</article>)}</div></section>
  </main>;
}
