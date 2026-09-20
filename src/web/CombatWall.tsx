"use client";

import "@/web/styles/yanwu-workspaces.css";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { getCombatVideoPolicy, listCombatPosts, publishCombatPost, readLocalVideoDuration } from "@/features/combat-posts/client/api";
import type { CombatVideoPolicy } from "@/features/combat-posts/video-policy";
import { useAuth } from "@/features/auth/client";
import { protectedPageLoginRedirect } from "@/features/auth/redirect";
import { useToast } from "@/web/components/ui/Toast";
import { ArenaIcon } from "@/web/components/arena/ArenaIcon";

interface PostSummary {
  id: number; title: string; content: string; status: string; createdAt: string;
  author: { username: string }; _count: { likes: number; comments: number };
}

export function CombatWall() {
  const pathname = usePathname();
  const prefix = pathname.startsWith("/m/") ? "/m" : "";
  const { user, loaded } = useAuth();
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const [policy, setPolicy] = useState<CombatVideoPolicy | null>(null);
  const [policyError, setPolicyError] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [composerOpen, setComposerOpen] = useState(false);
  const uploadRef = useRef<AbortController | null>(null);
  const { success, error } = useToast();
  useEffect(() => () => uploadRef.current?.abort(), []);
  useEffect(() => {
    if (!loaded || !user) return;
    const controller = new AbortController();
    setLoading(true); setLoadError("");
    void listCombatPosts<{ posts: PostSummary[]; totalPages: number; total: number; error?: string }>(page, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      if (!result.ok) throw new Error(result.data.error || "动态加载失败");
      setPosts(result.data.posts); setTotalPages(Math.max(1, result.data.totalPages)); setTotal(result.data.total);
      if (page > Math.max(1, result.data.totalPages)) setPage(Math.max(1, result.data.totalPages));
    }).catch(cause => { if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : "动态加载失败"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [loaded, user, page, revision]);
  useEffect(() => {
    if (!loaded || !user) return;
    const controller = new AbortController(); setPolicyError("");
    void getCombatVideoPolicy(controller.signal).then(result => {
      if (controller.signal.aborted) return;
      if (!result.ok) throw new Error(result.data.error || "上传配置加载失败");
      setPolicy(result.data);
    }).catch(cause => { if (!controller.signal.aborted) setPolicyError(cause instanceof Error ? cause.message : "上传配置加载失败"); });
    return () => controller.abort();
  }, [loaded, user, revision]);

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (uploadRef.current || !policy) return;
    const formElement = event.currentTarget; const form = new FormData(formElement);
    const video = form.get("video");
    if (!(video instanceof File) || video.size === 0) return error("请选择 MP4 或 WebM 视频");
    if (video.size > policy.maxBytes) return error(`文件不能超过 ${policy.maxBytes / 1024 ** 2} MiB`);
    const controller = new AbortController(); uploadRef.current = controller;
    setPublishing(true); setProgress(0);
    try {
      const seconds = await readLocalVideoDuration(video);
      if (controller.signal.aborted) return;
      if (seconds > policy.maxDurationSeconds) return error(`视频时长不能超过 ${policy.maxDurationSeconds} 秒`);
      const result = await publishCombatPost<{ error?: string }>({
        title: String(form.get("title") || ""), content: String(form.get("content") || ""), video,
        matchId: String(form.get("matchId") || "") || undefined, tournamentId: String(form.get("tournamentId") || "") || undefined,
      }, { signal: controller.signal, timeoutMs: policy.uploadTimeoutMs, onProgress: setProgress });
      if (!result.ok) return error(result.data.error || "发布失败，请检查内容后重试");
      formElement.reset(); success("演武动态已发布"); setPage(1); setRevision(v => v + 1); setComposerOpen(false);
    } catch (cause) { if (!controller.signal.aborted) error(cause instanceof Error ? cause.message : "发布失败，请稍后重试"); }
    finally { uploadRef.current = null; setPublishing(false); }
  }

  return <div className="page-shell page-shell--wide combat-wall">
    <header className="yanwu-workspace-hero combat-hub-hero"><div><p className="feature-kicker">COMBAT FEED</p><h1>演武动态</h1><p>分享高光时刻，复盘每一次团战。</p></div>{user && <button className="btn-primary" aria-expanded={composerOpen} aria-controls="combat-publisher" onClick={() => setComposerOpen(v => !v)} disabled={publishing}><ArenaIcon name="plus" width="16" height="16" />{composerOpen ? "收起发布" : "发布动态"}</button>}</header>
    {!loaded ? <div className="feature-empty" role="status">正在确认登录状态…</div> : !user ? <section className="feature-empty"><h2>和队友一起交流复盘</h2><p>登录后可以浏览视频、发布动态和参与评论。</p><Link className="btn-primary" prefetch={false} href={protectedPageLoginRedirect(pathname)}>登录查看动态</Link></section> : <>
    {composerOpen && <section id="combat-publisher" className="yanwu-workspace-section combat-publisher" aria-labelledby="publish-title">
      <div><p className="feature-kicker">SHARE YOUR PLAY</p><h2 id="publish-title">发布复盘</h2><p className="combat-upload-hint">{policy ? `支持 MP4 / WebM，最长 ${policy.maxDurationSeconds / 60} 分钟，最大 ${policy.maxBytes / 1024 ** 2} MiB。` : "正在读取上传限制…"}</p>{policyError && <p role="alert">{policyError} <button className="text-action" onClick={() => setRevision(v => v + 1)}>重试</button></p>}</div>
      <form onSubmit={publish} aria-busy={publishing}>
        <label>标题<input name="title" minLength={2} maxLength={128} required placeholder="这场团战为什么能赢" disabled={publishing} /></label>
        <label className="combat-content-field">正文<textarea name="content" minLength={2} maxLength={10000} rows={4} required placeholder="记录关键节点、决策依据和可复用经验" disabled={publishing} /></label>
        <label>关联赛事 ID（可选）<input name="tournamentId" type="number" min="1" inputMode="numeric" disabled={publishing} /></label>
        <label>关联比赛 ID（可选）<input name="matchId" type="number" min="1" inputMode="numeric" disabled={publishing} /></label>
        <label className="combat-video-field">复盘视频<input name="video" type="file" accept="video/mp4,video/webm" required disabled={publishing} /></label>
        <button className="btn-primary" disabled={publishing || !policy}>{publishing ? progress === 100 ? "正在完成发布…" : `上传中 ${progress}%` : "发布动态"}</button>
        {publishing && <div className="combat-upload-progress"><progress max={100} value={progress} aria-label="视频上传进度" /><span role="status">{progress === 100 ? "视频已上传，正在验证并保存" : `已上传 ${progress}%`}</span><button type="button" className="btn-subtle" onClick={() => uploadRef.current?.abort()}>取消上传</button></div>}
      </form>
    </section>}
    <section aria-labelledby="feed-title"><div className="feature-heading"><div><p className="feature-kicker">LATEST</p><h2 id="feed-title">最新动态 <small>{total} 条</small></h2></div><button className="btn-subtle" disabled={loading} onClick={() => setRevision(v => v + 1)}>刷新</button></div>
      {loading ? <div className="feature-empty" role="status">正在读取动态…</div> : loadError ? <div className="feature-empty" role="alert">{loadError}<button className="btn-subtle" onClick={() => setRevision(v => v + 1)}>重新加载</button></div> : posts.length === 0 ? <div className="feature-empty">还没有复盘，发布第一条动态吧。</div> : <div className="combat-grid">{posts.map(post => <article className="combat-card" key={post.id}>
        <Link className="combat-card-cover" href={`${prefix}/combat/${post.id}`} aria-label={`播放：${post.title}`}><span aria-hidden="true">▶</span><small>观看复盘</small></Link>
        <div className="combat-card-body"><div className="feature-meta-row"><strong>{post.author.username}</strong><span>{new Date(post.createdAt).toLocaleDateString("zh-CN")}</span>{post.status === "hidden" && <span className="feature-status">已隐藏</span>}</div><h3><Link href={`${prefix}/combat/${post.id}`}>{post.title}</Link></h3><p>{post.content}</p><footer><span>赞 {post._count.likes} · 评论 {post._count.comments}</span><Link className="btn-subtle" href={`${prefix}/combat/${post.id}`}>查看复盘</Link></footer></div>
      </article>)}</div>}
      <div className="pagination" aria-label="动态分页"><button className="btn-subtle" disabled={loading || page <= 1} onClick={() => setPage(v => v - 1)}>上一页</button><span aria-live="polite">第 {page} / {totalPages} 页</span><button className="btn-subtle" disabled={loading || page >= totalPages} onClick={() => setPage(v => v + 1)}>下一页</button></div>
    </section></>}
  </div>;
}
