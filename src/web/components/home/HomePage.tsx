"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useToast } from "@/web/components/ui/Toast";
import { copyText } from "@/web/components/ui/clipboard";
import { MarkdownContent } from "@/web/components/content/MarkdownContent";
import { usePageResources } from "@/features/resource-scheduler/client";
import { ArenaIcon } from "@/web/components/arena/ArenaIcon";
import { ActiveThemeCard } from "@/web/components/history-theme/ActiveThemeCard";

interface OfficialNews { title: string; date: string; url: string }
interface PublicTournament { id: number; name: string; code: string; announcement: string | null; _count: { players: number }; deadline: string }
interface Announcement { date: string; title: string; version: string | null; brief: string; slug: string; content?: string }

function LoadFailure({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="arena-empty" role="alert"><ArenaIcon name="news" /><p>{message}</p><button type="button" className="btn-ghost" onClick={onRetry}>重新加载</button></div>;
}

function LoadingCards() {
  return <div className="arena-room-grid" role="status" aria-label="正在加载房间">{[0, 1, 2].map(i => <div key={i} className="skeleton arena-room-skeleton" />)}</div>;
}

function newsHref(url: string): string | undefined {
  try { const parsed = new URL(url); return ["https:", "http:"].includes(parsed.protocol) ? parsed.href : undefined; } catch { return undefined; }
}

export function HomePage() {
  const pathname = usePathname();
  const prefix = /^\/m(?:\/|$)/.test(pathname) ? "/m" : "";
  const href = (path: string) => `${prefix}${path}`;
  const { immediate, loading, error, leaseId, loadResource, retry } = usePageResources("home");
  const announcements = (immediate["home.announcements"]?.data as Announcement[] | undefined) ?? [];
  const rooms = (immediate["home.public-tournaments"]?.data as PublicTournament[] | undefined) ?? [];
  const [news, setNews] = useState<OfficialNews[]>([]);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [newsLoaded, setNewsLoaded] = useState(false);
  const [newsAttempt, setNewsAttempt] = useState(0);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const { success, error: toastError } = useToast();

  useEffect(() => {
    if (!leaseId) return;
    const controller = new AbortController();
    setNewsError(null);
    setNewsLoaded(false);
    void loadResource<OfficialNews[]>("home.official-news", newsAttempt > 0, controller.signal)
      .then(items => { if (!controller.signal.aborted) setNews(items); })
      .catch(cause => { if (!controller.signal.aborted) setNewsError(cause instanceof Error ? cause.message : "官方资讯暂时无法加载"); })
      .finally(() => { if (!controller.signal.aborted) setNewsLoaded(true); });
    return () => controller.abort();
  }, [leaseId, loadResource, newsAttempt]);

  async function copyCode(code: string) {
    try { await copyText(code); success(`房间号已复制：${code}`); }
    catch { toastError(`复制失败，请手动复制房间号：${code}`); }
  }

  return <div className="page-shell page-shell--wide arena-home">
    <section className="arena-hero" aria-labelledby="arena-title">
      <img className="arena-hero-art" src="/art/yanwu-ink.webp" alt="" width="1440" height="960" fetchPriority="high" />
      <div className="arena-hero-content">
        <div className="arena-eyebrow"><span />王者荣耀 · 好友内战</div>
        <h1 id="arena-title">以武会友，<span>于此相逢。</span></h1>
        <p>把熟悉的朋友，分成势均力敌的对手。<br />约一场好局，留下下一次相聚的约定。</p>
        <div className="arena-hero-actions">
          <Link href={href("/tournaments")} className="btn-primary arena-main-cta"><ArenaIcon name="swords" />进入赛事大厅<ArenaIcon name="arrow" /></Link>
          <Link href={href("/tournaments#join-room")} className="arena-secondary-cta">房间号加入<ArenaIcon name="chevron" width="15" height="15" /></Link>
        </div>
        <div className="arena-hero-promises"><span><ArenaIcon name="shield" />按实力分队</span><span><ArenaIcon name="users" />照顾分路偏好</span></div>
      </div>
    </section>

    <ActiveThemeCard />

    <section className="arena-section" aria-labelledby="rooms-title">
      <div className="arena-section-heading"><div><p className="arena-eyebrow">01 / 好友相聚</p><h2 id="rooms-title">三五好友，正好一局。</h2><p className="yanwu-section-note">公开房间 · 寻一席好对手</p></div><Link href={href("/tournaments")} className="arena-text-link">全部赛事<ArenaIcon name="arrow" /></Link></div>
      {error ? <LoadFailure message={error} onRetry={retry} /> : loading ? <LoadingCards /> : rooms.length === 0 ? <div className="arena-empty-room"><div className="arena-empty-emblem"><ArenaIcon name="swords" /></div><div><h3>第一局，你来组</h3><p>暂时没有公开房间。开一间，把房间号发给朋友。</p></div><Link href={href("/tournaments#create-room")} className="btn-ghost"><ArenaIcon name="plus" />创建房间</Link></div> : <div className="arena-room-grid yanwu-open-rooms">{rooms.slice(0, 6).map(room => {
        const full = room._count.players >= 10;
        const closed = new Date(room.deadline).getTime() <= Date.now();
        return <article className="arena-room" key={room.id}>
          <div className="arena-room-top"><span className={`arena-room-state ${full || closed ? "is-closed" : ""}`}><i />{full ? "人齐了" : closed ? "报名截止" : "等你入队"}</span><button type="button" onClick={() => void copyCode(room.code)} className="arena-copy" aria-label={`复制房间号 ${room.code}`}>#{room.code}<ArenaIcon name="copy" width="13" height="13" /></button></div>
          <Link className="arena-room-link" href={href(`/tournaments/${room.id}`)}><h3>{room.name}</h3><p>{room.announcement || "房间已开，进来看看还有哪个位置。"}</p><div className="arena-room-footer"><span><b>{room._count.players}</b> / 10 召唤师</span><span>查看房间<ArenaIcon name="arrow" width="16" height="16" /></span></div></Link>
        </article>;
      })}</div>}
    </section>

    <section className="arena-preparation" aria-label="英雄与装备图鉴">
      <Link className="arena-catalog-card" href={href("/heroes")}><ArenaIcon name="news" /><div><h2>知英雄，选所长。</h2><p>英雄图鉴 · 技能、命格与分路</p></div><ArenaIcon name="arrow" /></Link>
      <Link className="arena-catalog-card" href={href("/equipment")}><ArenaIcon name="swords" /><div><h2>识兵器，善其事。</h2><p>装备图鉴 · 属性、价格与合成</p></div><ArenaIcon name="arrow" /></Link>
    </section>

    <div className="arena-intel-grid">
      <section className="arena-intel" aria-labelledby="announcements-title"><div className="arena-section-heading"><h2 id="announcements-title"><ArenaIcon name="news" />演武公告</h2><Link className="arena-text-link" href={href("/changelog")}>更新记录<ArenaIcon name="arrow" width="16" height="16" /></Link></div>
        {error ? <LoadFailure message={error} onRetry={retry} /> : loading ? <div className="skeleton arena-news-skeleton" /> : announcements.length === 0 ? <p className="arena-muted-message">暂时没有新公告，有更新会放在这里。</p> : announcements.map(a => <div className="arena-announcement" key={a.slug}><button type="button" aria-expanded={activeSlug === a.slug} aria-controls={`announcement-${a.slug}`} onClick={() => setActiveSlug(activeSlug === a.slug ? null : a.slug)}><span><small>{a.version || "公告"}</small><strong>{a.title}</strong><p>{a.brief}</p></span><ArenaIcon name="chevron" className={activeSlug === a.slug ? "is-expanded" : ""} /></button>{activeSlug === a.slug && <div id={`announcement-${a.slug}`} className="arena-announcement-content"><time>{a.date}</time><MarkdownContent content={a.content || a.brief} compact /></div>}</div>)}
      </section>
      <section className="arena-intel" aria-labelledby="news-title"><div className="arena-section-heading"><h2 id="news-title"><ArenaIcon name="spark" />峡谷情报</h2><span className="arena-intel-label">王者官方资讯</span></div>{newsError || error ? <LoadFailure message={newsError || error || "资讯暂时无法加载"} onRetry={() => error ? retry() : setNewsAttempt(v => v + 1)} /> : !newsLoaded ? <div className="skeleton arena-news-skeleton" /> : news.length === 0 ? <p className="arena-muted-message">暂无官方资讯</p> : news.slice(0, 4).map((item, i) => <a className="arena-news-row" key={`${item.title}-${i}`} href={newsHref(item.url)} target="_blank" rel="noopener noreferrer"><time>{item.date}</time><span>{item.title}</span><ArenaIcon name="arrow" width="16" height="16" /></a>)}</section>
    </div>
  </div>;
}
