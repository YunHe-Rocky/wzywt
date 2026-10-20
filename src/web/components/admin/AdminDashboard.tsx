"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getAdminOverview, type AdminOverview } from "@/features/admin/client/api";
import { ADMIN_NAVIGATION, adminRoutePrefix } from "@/features/admin/navigation";

export function AdminDashboard() {
  const prefix = adminRoutePrefix(usePathname());
  const [stats, setStats] = useState<AdminOverview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    void getAdminOverview(controller.signal).then(result => {
      if (controller.signal.aborted) return;
      if (!result.ok) throw new Error(result.data.error || "概览加载失败");
      setStats(result.data);
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "概览加载失败"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [version]);
  const cards = [
    { label: "正式成员", value: stats?.userCount, href: "/admin/users" },
    { label: "进行中赛事", value: stats?.activeTournamentCount, href: "/admin/tournaments" },
    { label: "已发布动态", value: stats?.postCount, href: "/admin/combat" },
    { label: "已隐藏动态", value: stats?.hiddenPostCount, href: "/admin/combat" },
  ];
  return <div className="admin-page">
    <div className="admin-page-heading"><div><p className="feature-kicker">WORKSPACE</p><h1>运营工作台</h1><p>管理成员与赛事，维护社区内容。</p></div><button className="btn-subtle" disabled={loading} onClick={() => setVersion(v => v + 1)}>{loading ? "正在刷新…" : "刷新概览"}</button></div>
    {error && <p className="admin-error" role="alert">{error}，可点击刷新重试。</p>}
    <div className="admin-stat-grid" aria-busy={loading}>{cards.map(card => <Link className="admin-stat" key={card.label} href={`${prefix}${card.href}`}><span>{card.label}</span><strong>{loading || error ? "—" : card.value ?? 0}</strong><small>前往管理 →</small></Link>)}</div>
    <section className="admin-task-intro" aria-labelledby="admin-sync-task"><div><h2 id="admin-sync-task">需要更新英雄资料？</h2><p>前往系统设置启动同步，再到图鉴确认更新。日常保持官方默认来源即可。</p></div><Link className="btn-subtle" href={`${prefix}/admin/settings`}>前往同步英雄 →</Link></section>
    <div className="admin-overview-grid"><section className="admin-panel"><div className="feature-heading"><h2>常用管理</h2></div>{["运营管理", "内容管理", "系统管理"].map(group => <section className="admin-task-group" key={group} aria-label={group}><h3>{group}</h3><div className="admin-shortcuts">{ADMIN_NAVIGATION.filter(item => item.group === group).map(item => <Link href={`${prefix}${item.path}`} key={item.path}><strong>{item.label} <span aria-hidden="true">↗</span></strong><small>{item.description}</small></Link>)}</div></section>)}</section>
    <section className="admin-panel"><div className="feature-heading"><h2>最新动态</h2><Link href={`${prefix}/admin/combat`}>管理全部</Link></div>{!loading && !error && stats?.recentPosts.length === 0 && <p className="feature-empty">暂未发布动态</p>}{stats?.recentPosts.map(post => <Link className="admin-recent-post" key={post.id} href={`${prefix}/combat/${post.id}`}><strong>{post.title}</strong><small>{post.author.username} · {post.status === "hidden" ? "已隐藏" : "已发布"}</small></Link>)}
    {stats && !error && <p className="admin-storage-note">赛事 {stats.tournamentCount} 场 · 英雄 {stats.heroCount} 位<br />原始视频占用 {(stats.videoBytes / 1024 ** 2).toFixed(1)} MiB</p>}</section></div>
  </div>;
}
