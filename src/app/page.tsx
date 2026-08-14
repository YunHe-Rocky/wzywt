"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAnnouncements } from "@/features/announcements/client";
import { useToast } from "@/web/components/ui/Toast";
import { MarkdownContent } from "@/web/components/content/MarkdownContent";
import { apiRequest } from "@/features/shared/client/api";

interface OfficialNews { title: string; date: string; url: string; }
interface PublicTournament { id: number; name: string; code: string; announcement: string | null; _count: { players: number }; deadline: string; }
interface User { userId: number; username: string; }
interface Announcement { date: string; title: string; version: string | null; brief: string; slug: string; content?: string; }

function AnnouncementContent({ a }: { a: Announcement }) {
  return (
    <div className="px-5 pb-4 animate-slide-up">
      <MarkdownContent content={`## ${a.title}\n\n*${a.date}*\n\n${a.content || ""}`} compact />
    </div>
  );
}

function SkeletonLines({ count }: { count: number }) {
  const widths = [92, 78, 86, 72];
  return <div className="flex flex-col gap-2.5">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="skeleton rounded h-3.5" style={{ width: `${widths[i % widths.length]}%` }} />
    ))}
  </div>;
}

export default function Home() {
  const brandAnim = "entry-brand-alternate 0.6s ease-out 0.1s both";
  const cardAnim = (delay: number) =>
    `entry-card-alternate 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) ${delay}s both`;

  const [user, setUser] = useState<User | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [news, setNews] = useState<OfficialNews[]>([]);
  const [rooms, setRooms] = useState<PublicTournament[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const { announcements, loaded: announcementsLoaded } = useAnnouncements(true);
  const { success } = useToast();

  function copyCode(e: React.MouseEvent, code: string) {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(code).then(() => success("房间号已复制: " + code));
  }

  useEffect(() => {
    const controller = new AbortController();
    void apiRequest<{ user?: User | null }>("/api/auth/me", { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setUser(data.user ?? null); })
      .catch(() => undefined)
      .finally(() => { if (!controller.signal.aborted) setAuthLoaded(true); });
    void Promise.all([
      apiRequest<OfficialNews[]>("/api/official-news", { signal: controller.signal })
        .then(({ data }) => { if (!controller.signal.aborted && Array.isArray(data)) setNews(data); }),
      apiRequest<{ tournaments?: PublicTournament[] }>("/api/tournaments/public", { signal: controller.signal })
        .then(({ data }) => { if (!controller.signal.aborted && data.tournaments) setRooms(data.tournaments); }),
    ]).catch(() => undefined).finally(() => {
      if (!controller.signal.aborted) setLoaded(true);
    });
    return () => controller.abort();
  }, []);

  return (
    <div className="page-shell page-shell--wide">
      {/* Brand */}
      <div className="mb-5 text-center text-left" style={{ animation: brandAnim }}>
        <h1 className="text-2xl font-extrabold text-gold-light tracking-wider mb-1">王者演武堂</h1>
        <p className="text-sm text-text-secondary">5V5 内战分队 · 公平竞技</p>
      </div>

      {/* Main content */}
      <div className="flex flex-col gap-4">
          {/* Announcements */}
          <div className="card p-0 rounded-md overflow-hidden" style={{ animation: cardAnim(0.2) }}>
            <div className="px-5 py-3 border-b border-border-light">
              <div className="text-sm font-semibold text-gold-light">📢 系统公告</div>
            </div>
            {!loaded || !announcementsLoaded ? <div className="px-5 py-6"><SkeletonLines count={3} /></div>
              : announcements.length === 0 ? <p className="text-center text-text-muted text-sm py-6">暂无系统公告</p>
                : announcements.map(a => (
                  <div key={a.slug} className="border-b border-border-light last:border-b-0">
                    <button onClick={() => setActiveSlug(activeSlug === a.slug ? null : a.slug)}
                      className="w-full text-left px-5 py-3 hover:bg-hover/50 transition-colors flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {a.version && <span className="text-[9px] font-bold text-gold/70 bg-gold/5 border border-gold/10 rounded px-1.5 leading-4 shrink-0">{a.version}</span>}
                          <span className={`text-sm font-semibold truncate ${activeSlug === a.slug ? "text-gold-light" : "text-text"}`}>{a.title}</span>
                        </div>
                        <div className="text-xs text-text-muted truncate mt-0.5">{a.brief}</div>
                        <div className="text-[10px] text-text-muted/60 mt-1">{a.date}</div>
                      </div>
                      <span className={`text-text-muted text-xs mt-1 shrink-0 transition-transform ${activeSlug === a.slug ? "rotate-90" : ""}`}>&#9654;</span>
                    </button>
                    {activeSlug === a.slug && <AnnouncementContent a={a} />}
                  </div>
                ))}
          </div>

          {/* Public Rooms */}
          <div className="card p-0 rounded-md overflow-hidden" style={{ animation: cardAnim(0.4) }}>
            <div className="px-5 py-3 border-b border-border-light">
              <div className="text-sm font-semibold text-gold-light">🏠 公开房间</div>
            </div>
            {!loaded ? <div className="px-5 py-6"><SkeletonLines count={2} /></div>
              : rooms.length === 0 ? <p className="text-center text-text-muted text-sm py-6">暂无公开房间</p>
                : <div className="grid grid-cols-1 sm:grid-cols-2 gap-0">
                  {rooms.map((room, i) => (
                    <Link key={room.id} href={`/tournaments/${room.id}`}
                      className="flex flex-col gap-1.5 px-5 py-3.5 no-underline hover:bg-hover/50 transition-colors border-b border-border-light border-r-0 last:border-b-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-text truncate hover:text-gold-light transition-colors">{room.name}</span>
                        <button onClick={(e) => copyCode(e, room.code)} title="点击复制房间号" className="text-[10px] font-mono font-semibold text-gold/80 shrink-0 bg-none border-0 cursor-pointer hover:text-gold hover:underline px-0 py-0 rounded-none">#{room.code}</button>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-text-muted truncate">
                          {room.announcement ? (room.announcement.length > 30 ? room.announcement.slice(0, 30) + "..." : room.announcement) : "暂无公告"}
                        </span>
                        <span className={`text-xs font-semibold shrink-0 ${new Date(room.deadline) < new Date() ? "text-red/70" : "text-text-muted"}`}>
                          {room._count.players}/10
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>}
          </div>

          {/* Official News */}
          <div className="card p-0 rounded-md overflow-hidden" style={{ animation: cardAnim(0.6) }}>
            <div className="px-5 py-3 border-b border-border-light">
              <div className="text-sm font-semibold text-text-secondary">王者官方公告</div>
            </div>
            {!loaded ? <div className="px-5 py-4"><SkeletonLines count={2} /></div>
              : news.length === 0 ? <p className="text-center text-text-muted text-sm py-4">暂无公告</p>
                : news.slice(0, 5).map((item, i) => (
                  <div key={i}
                    className="flex items-center gap-3 px-5 py-2.5 border-b border-border-light last:border-b-0">
                    <span className="text-[10px] text-text-muted shrink-0 w-14">{item.date}</span>
                    <span className="text-xs text-text-secondary truncate">{item.title}</span>
                  </div>
                ))}
          </div>
      </div>
    </div>
  );
}
