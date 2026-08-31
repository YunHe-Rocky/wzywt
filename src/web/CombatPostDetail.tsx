"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { addCombatPostComment, getCombatPost, moderateCombatPost, removeCombatPostComment, setCombatPostLike } from "@/features/combat-posts/client/api";
import { getCurrentUser } from "@/features/auth/client/api";
import { useToast } from "@/web/components/ui/Toast";
import { ConfirmDialog } from "@/web/components/ui/ConfirmDialog";

interface Comment { id: number; content: string; createdAt: string; authorId: number; author: { username: string } }
interface PostData { post: { id: number; title: string; content: string; status: string; createdAt: string; authorId: number; author: { username: string }; likedByMe: boolean; videoUrl: string; comments: Comment[]; _count: { likes: number; comments: number } }; access: { canModerate: boolean } }
type Confirmation = { kind: "post" } | { kind: "comment"; id: number } | null;
const POST_STATUS_LABELS: Record<string, string> = { published: "已发布", hidden: "已隐藏", deleted: "已删除" };

export function CombatPostDetail() {
  const { postId } = useParams<{ postId: string }>();
  const routePrefix = usePathname().startsWith("/m/") ? "/m" : "";
  const router = useRouter();
  const [data, setData] = useState<PostData | null>(null);
  const [userId, setUserId] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const { success, error } = useToast();
  const load = useCallback(async () => {
    try {
      const result = await getCombatPost<PostData & { error?: string }>(postId);
      if (!result.ok) return error(result.data.error || "动态加载失败，请确认登录状态后重试");
      setData(result.data);
    } catch (cause) {
      error(cause instanceof Error ? cause.message : "动态加载失败，请检查网络后重试");
    }
  }, [error, postId]);
  useEffect(() => { void load(); getCurrentUser().then(({ data: current }) => setUserId(current.user?.userId ?? null)).catch(() => setUserId(null)); }, [load]);

  async function toggleLike() {
    if (!data) return;
    setBusy("like");
    try {
      const result = await setCombatPostLike<{ error?: string }>(postId, !data.post.likedByMe);
      if (!result.ok) return error(result.data.error || "点赞操作失败，请稍后重试");
      await load();
    } catch (cause) {
      error(cause instanceof Error ? cause.message : "点赞操作失败，请检查网络后重试");
    } finally { setBusy(null); }
  }
  async function comment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); setBusy("comment");
    try {
      const result = await addCombatPostComment<{ error?: string }>(postId, String(form.get("content") || ""));
      if (!result.ok) return error(result.data.error || "评论失败，请检查内容后重试");
      formElement.reset(); success("评论已发布"); await load();
    } catch (cause) {
      error(cause instanceof Error ? cause.message : "评论失败，请检查网络后重试");
    } finally { setBusy(null); }
  }
  async function removeComment(id: number) {
    setBusy(`comment-${id}`);
    try {
      const result = await removeCombatPostComment<{ error?: string }>(postId, id);
      if (!result.ok) return error(result.data.error || "删除评论失败，请稍后重试");
      setConfirmation(null); success("评论已删除"); await load();
    } catch (cause) {
      error(cause instanceof Error ? cause.message : "删除评论失败，请检查网络后重试");
    } finally { setBusy(null); }
  }
  async function moderate(action: "HIDE" | "RESTORE" | "DELETE") {
    setBusy(`moderate-${action}`);
    try {
      const result = await moderateCombatPost<{ error?: string }>(postId, action);
      if (!result.ok) return error(result.data.error || "管理操作失败，请稍后重试");
      if (action === "DELETE") { setConfirmation(null); router.replace(`${routePrefix}/combat`); return; }
      success("动态状态已更新"); await load();
    } catch (cause) {
      error(cause instanceof Error ? cause.message : "管理操作失败，请检查网络后重试");
    } finally { setBusy(null); }
  }
  if (!data) return <main className="page-shell page-shell--medium"><div className="feature-empty">正在读取复盘…</div></main>;
  const { post } = data;
  return <main className="page-shell page-shell--medium combat-detail">
    <nav className="feature-breadcrumb"><Link href={`${routePrefix}/combat`}>演武动态</Link><span>/</span><span>#{post.id}</span></nav>
    <header className="feature-hero"><div><p className="feature-kicker">COMBAT REVIEW</p><h1>{post.title}</h1><p>{post.author.username} · {new Date(post.createdAt).toLocaleString("zh-CN")}</p></div>{post.status !== "published" && <span className="feature-status">{POST_STATUS_LABELS[post.status] || post.status}</span>}</header>
    <section className="combat-player"><video controls preload="metadata" playsInline src={post.videoUrl}>浏览器不支持视频播放。</video></section>
    <article className="feature-section combat-article"><p>{post.content}</p><div className="feature-row-actions"><button className={post.likedByMe ? "btn-primary" : "btn-subtle"} aria-pressed={post.likedByMe} disabled={Boolean(busy)} onClick={toggleLike}>{busy === "like" ? "处理中…" : post.likedByMe ? "已赞" : "点赞"} · {post._count.likes}</button>{data.access.canModerate && <><button className="btn-subtle" disabled={Boolean(busy)} onClick={() => void moderate(post.status === "hidden" ? "RESTORE" : "HIDE")}>{busy?.startsWith("moderate-") ? "处理中…" : post.status === "hidden" ? "恢复" : "隐藏"}</button><button className="btn-danger" disabled={Boolean(busy)} onClick={() => setConfirmation({ kind: "post" })}>删除动态</button></>}</div></article>
    <section className="feature-section"><div className="feature-heading"><div><p className="feature-kicker">DISCUSSION</p><h2>评论 {post._count.comments}</h2></div></div><form className="comment-form" aria-busy={busy === "comment"} onSubmit={comment}><label>复盘意见<textarea name="content" rows={3} maxLength={1000} required placeholder="留下具体、有帮助的复盘意见" /></label><button className="btn-primary" disabled={Boolean(busy)}>{busy === "comment" ? "发送中…" : "发表评论"}</button></form><div className="comment-list">{post.comments.map((item) => <article key={item.id}><div className="feature-meta-row"><strong>{item.author.username}</strong><span>{new Date(item.createdAt).toLocaleString("zh-CN")}</span></div><p>{item.content}</p>{(item.authorId === userId || data.access.canModerate) && <button className="text-action" disabled={Boolean(busy)} onClick={() => setConfirmation({ kind: "comment", id: item.id })}>删除评论</button>}</article>)}</div></section>
    <ConfirmDialog open={confirmation?.kind === "post"} title="永久删除这条演武动态？" description="视频、点赞和评论都会一并删除，此操作无法撤销。" confirmLabel="永久删除动态" busy={busy === "moderate-DELETE"} onClose={() => setConfirmation(null)} onConfirm={() => void moderate("DELETE")} />
    <ConfirmDialog open={confirmation?.kind === "comment"} title="删除这条评论？" description="删除后评论内容将无法恢复。" confirmLabel="删除评论" busy={Boolean(confirmation?.kind === "comment" && busy === `comment-${confirmation.id}`)} onClose={() => setConfirmation(null)} onConfirm={() => { if (confirmation?.kind === "comment") void removeComment(confirmation.id); }} />
  </main>;
}
