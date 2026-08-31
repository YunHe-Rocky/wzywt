"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { listCombatPosts, publishCombatPost } from "@/features/combat-posts/client/api";
import { useToast } from "@/web/components/ui/Toast";

interface PostSummary {
  id: number; title: string; content: string; status: string; matchId: number | null; tournamentId: number | null;
  createdAt: string; author: { username: string; avatar: string | null }; likedByMe: boolean;
  _count: { likes: number; comments: number };
}

const POST_STATUS_LABELS: Record<string, string> = { published: "已发布", hidden: "已隐藏", deleted: "已删除" };

export function CombatWall() {
  const routePrefix = usePathname().startsWith("/m/") ? "/m" : "";
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const { success, error } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listCombatPosts<{ posts: PostSummary[]; totalPages: number; error?: string }>(page);
      if (!result.ok) return error(result.data.error || "演武动态加载失败，请确认登录状态后重试");
      setPosts(result.data.posts); setTotalPages(Math.max(1, result.data.totalPages));
    } catch (cause) {
      error(cause instanceof Error ? cause.message : "演武动态加载失败，请检查网络后重试");
    } finally {
      setLoading(false);
    }
  }, [error, page]);
  useEffect(() => { void load(); }, [load]);

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const video = form.get("video");
    if (!(video instanceof File) || video.size === 0) return error("请选择 MP4 或 WebM 视频");
    setPublishing(true);
    try {
      const result = await publishCombatPost<{ error?: string }>({
        title: String(form.get("title") || ""), content: String(form.get("content") || ""), video,
        matchId: String(form.get("matchId") || "") || undefined, tournamentId: String(form.get("tournamentId") || "") || undefined,
      });
      if (!result.ok) return error(result.data.error || "发布失败，请检查内容后重试");
      formElement.reset(); success("演武动态已发布"); setPage(1); await load();
    } catch (cause) {
      error(cause instanceof Error ? cause.message : "发布失败，请检查网络后重试");
    } finally {
      setPublishing(false);
    }
  }

  return <main className="page-shell page-shell--wide combat-wall">
    <header className="feature-hero"><div><p className="feature-kicker">COMBAT FEED</p><h1>演武动态</h1><p>登录成员可见的视频复盘与赛后交流；列表不自动加载视频流。</p></div></header>
    <section className="feature-section combat-publisher" aria-labelledby="publish-title">
      <div><p className="feature-kicker">PUBLISH</p><h2 id="publish-title">发布复盘</h2></div>
      <form onSubmit={publish} aria-busy={publishing}>
        <label>标题<input name="title" minLength={2} maxLength={128} required placeholder="这场团战为什么能赢" /></label>
        <label className="combat-content-field">正文<textarea name="content" minLength={2} maxLength={10000} rows={4} required placeholder="记录关键节点、决策依据和可复用经验" /></label>
        <label>关联赛事 ID（可选）<input name="tournamentId" type="number" min="1" inputMode="numeric" /></label>
        <label>关联比赛 ID（可选）<input name="matchId" type="number" min="1" inputMode="numeric" /></label>
        <label className="combat-video-field">复盘视频<input name="video" type="file" accept="video/mp4,video/webm" required /></label>
        <button className="btn-primary" disabled={publishing}>{publishing ? "上传发布中…" : "发布动态"}</button>
      </form>
    </section>
    <section aria-labelledby="feed-title"><div className="feature-heading"><div><p className="feature-kicker">LATEST</p><h2 id="feed-title">最新动态</h2></div></div>
      {loading ? <div className="feature-empty">正在读取动态…</div> : posts.length === 0 ? <div className="feature-empty">还没有人发布复盘。</div> : <div className="combat-grid">{posts.map((post) => <article className="combat-card" key={post.id}>
        <div className="combat-card-cover" aria-hidden="true"><span>▶</span><small>进入详情后播放</small></div>
        <div className="combat-card-body"><div className="feature-meta-row"><strong>{post.author.username}</strong><span>{new Date(post.createdAt).toLocaleString("zh-CN")}</span>{post.status !== "published" && <span className="feature-status">{POST_STATUS_LABELS[post.status] || post.status}</span>}</div><h3>{post.title}</h3><p>{post.content}</p><footer><span>赞 {post._count.likes} · 评论 {post._count.comments}</span><Link className="btn-subtle" href={`${routePrefix}/combat/${post.id}`}>查看复盘</Link></footer></div>
      </article>)}</div>}
      <div className="pagination" aria-label="动态分页"><button className="btn-subtle" disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)}>上一页</button><span aria-live="polite">第 {page} / {totalPages} 页</span><button className="btn-subtle" disabled={loading || page >= totalPages} onClick={() => setPage((value) => value + 1)}>下一页</button></div>
    </section>
  </main>;
}
