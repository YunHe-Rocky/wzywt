"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useToast } from "@/web/components/ui/Toast";
import { copyText } from "@/web/components/ui/clipboard";
import { MarkdownContent } from "@/web/components/content/MarkdownContent";
import { usePageResources } from "@/features/resource-scheduler/client";
import { ArenaIcon } from "@/web/components/arena/ArenaIcon";

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
      <img className="arena-hero-art" src="/art/arena.webp" alt="" width="1984" height="793" fetchPriority="high" />
      <div className="arena-hero-shade" />
      <div className="arena-hero-sparks" aria-hidden="true">{Array.from({ length: 8 }, (_, i) => <i key={i} />)}</div>
      <div className="arena-hero-content">
        <div className="arena-eyebrow"><span />王者荣耀 · 好友内战</div>
        <h1 id="arena-title">今晚，<span>峡谷见。</span></h1>
        <p>平时并肩上分，今晚分个高下。<br />约上朋友，来一场刚刚好的较量。</p>
        <div className="arena-hero-actions">
          <Link href={href("/tournaments")} className="btn-primary arena-main-cta"><ArenaIcon name="swords" />进入赛事大厅<ArenaIcon name="arrow" /></Link>
          <Link href={href("/tournaments#join-room")} className="arena-secondary-cta">房间号加入<ArenaIcon name="chevron" width="15" height="15" /></Link>
        </div>
        <div className="arena-hero-promises"><span><ArenaIcon name="shield" />按实力分队</span><span><ArenaIcon name="users" />照顾分路偏好</span></div>
      </div>
      <div className="arena-hero-bottom"><span>熟悉的朋友，也可以是好对手。</span><span><i />5V5 好友局</span></div>
    </section>

    <div className="arena-principles" aria-label="内战流程">
      <div><span className="arena-step-number">01</span><ArenaIcon name="users" /><div><strong>喊朋友来</strong><span>发个房间号，人齐就出发</span></div></div>
      <div><span className="arena-step-number">02</span><ArenaIcon name="shield" /><div><strong>分个好队</strong><span>参考战力和分路，尽量打得有来有回</span></div></div>
      <div><span className="arena-step-number">03</span><ArenaIcon name="swords" /><div><strong>痛快打一场</strong><span>赛后看看战绩，下局再来</span></div></div>
    </div>

    <section className="arena-section" aria-labelledby="rooms-title">
      <div className="arena-section-heading"><div><h2 id="rooms-title">一起开一局<span className="arena-live-tag"><i />公开房间</span></h2></div><Link href={href("/tournaments")} className="arena-text-link">全部赛事<ArenaIcon name="arrow" /></Link></div>
      {error ? <LoadFailure message={error} onRetry={retry} /> : loading ? <LoadingCards /> : rooms.length === 0 ? <div className="arena-empty-room"><div className="arena-empty-emblem"><ArenaIcon name="swords" /></div><div><h3>第一局，你来组</h3><p>暂时没有公开房间。开一间，把房间号发给朋友。</p></div><Link href={href("/tournaments#create-room")} className="btn-ghost"><ArenaIcon name="plus" />创建房间</Link></div> : <div className="arena-room-grid">{rooms.slice(0, 6).map(room => {
        const full = room._count.players >= 10;
        const closed = new Date(room.deadline).getTime() <= Date.now();
        return <article className="arena-room" key={room.id}>
          <div className="arena-room-top"><span className={`arena-room-state ${full || closed ? "is-closed" : ""}`}><i />{full ? "人齐了" : closed ? "报名截止" : "等你入队"}</span><button type="button" onClick={() => void copyCode(room.code)} className="arena-copy" aria-label={`复制房间号 ${room.code}`}>#{room.code}<ArenaIcon name="copy" width="13" height="13" /></button></div>
          <Link className="arena-room-link" href={href(`/tournaments/${room.id}`)}><h3>{room.name}</h3><p>{room.announcement || "房间已开，进来看看还有哪个位置。"}</p><div className="arena-player-slots" aria-label={`已报名 ${room._count.players} 人，最多 10 人`}>{Array.from({ length: 10 }, (_, i) => <span key={i} className={i < room._count.players ? "is-filled" : ""}><ArenaIcon name="user" width="13" height="13" /></span>)}</div><div className="arena-room-footer"><span><b>{room._count.players}</b> / 10 召唤师</span><span>查看房间<ArenaIcon name="arrow" width="16" height="16" /></span></div></Link>
        </article>;
      })}</div>}
    </section>

    <section className="arena-preparation" aria-labelledby="prepare-title">
      <div className="arena-preparation-intro"><div className="arena-eyebrow">等人时，随手看看</div><h2 id="prepare-title">这局，<br /><span>想玩点什么？</span></h2><p>翻翻英雄技能，看看装备搭配。<br />等朋友的这会儿，也不无聊。</p></div>
      <Link className="arena-catalog-card arena-catalog-heroes" href={href("/heroes")}><span className="arena-catalog-index">01 / HEROES</span><div className="arena-catalog-art" aria-hidden="true"><ArenaIcon name="crest" /></div><div className="arena-catalog-copy"><h3>挑个拿手的</h3><p>技能与命格，一起看明白</p><span>探索英雄<ArenaIcon name="arrow" /></span></div></Link>
      <Link className="arena-catalog-card arena-catalog-equipment" href={href("/equipment")}><span className="arena-catalog-index">02 / EQUIPMENT</span><div className="arena-catalog-art" aria-hidden="true"><ArenaIcon name="swords" /></div><div className="arena-catalog-copy"><h3>琢磨下出装</h3><p>属性、价格、合成，一眼找到</p><span>查看装备<ArenaIcon name="arrow" /></span></div></Link>
    </section>

    <div className="arena-intel-grid">
      <section className="arena-intel" aria-labelledby="announcements-title"><div className="arena-section-heading"><h2 id="announcements-title"><ArenaIcon name="news" />演武公告</h2><Link className="arena-text-link" href={href("/changelog")}>更新记录<ArenaIcon name="arrow" width="16" height="16" /></Link></div>
        {error ? <LoadFailure message={error} onRetry={retry} /> : loading ? <div className="skeleton arena-news-skeleton" /> : announcements.length === 0 ? <p className="arena-muted-message">暂时没有新公告，有更新会放在这里。</p> : announcements.map(a => <div className="arena-announcement" key={a.slug}><button type="button" aria-expanded={activeSlug === a.slug} aria-controls={`announcement-${a.slug}`} onClick={() => setActiveSlug(activeSlug === a.slug ? null : a.slug)}><span><small>{a.version || "公告"}</small><strong>{a.title}</strong><p>{a.brief}</p></span><ArenaIcon name="chevron" className={activeSlug === a.slug ? "is-expanded" : ""} /></button>{activeSlug === a.slug && <div id={`announcement-${a.slug}`} className="arena-announcement-content"><time>{a.date}</time><MarkdownContent content={a.content || a.brief} compact /></div>}</div>)}
      </section>
      <section className="arena-intel" aria-labelledby="news-title"><div className="arena-section-heading"><h2 id="news-title"><ArenaIcon name="spark" />峡谷情报</h2><span className="arena-intel-label">王者官方资讯</span></div>{newsError || error ? <LoadFailure message={newsError || error || "资讯暂时无法加载"} onRetry={() => error ? retry() : setNewsAttempt(v => v + 1)} /> : !newsLoaded ? <div className="skeleton arena-news-skeleton" /> : news.length === 0 ? <p className="arena-muted-message">暂无官方资讯</p> : news.slice(0, 4).map((item, i) => <a className="arena-news-row" key={`${item.title}-${i}`} href={newsHref(item.url)} target="_blank" rel="noopener noreferrer"><time>{item.date}</time><span>{item.title}</span><ArenaIcon name="arrow" width="16" height="16" /></a>)}</section>
    </div>
  </div>;
}
