"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

interface OfficialNews { title: string; date: string; url: string; }
interface PublicTournament { id: number; name: string; code: string; announcement: string | null; _count: { players: number }; deadline: string; }
interface User { userId: number; username: string; }
interface TocItem { id: string; text: string; level: number }
interface Announcement { date: string; title: string; version: string | null; brief: string; slug: string; content?: string; }

function SkeletonLines({ count }: { count: number }) {
  return <div className="flex flex-col gap-2.5">
    {Array.from({ length: count }).map((_, i) => <div key={i} className="skeleton rounded h-3.5" style={{ width: `${70 + Math.random() * 30}%` }} />)}
  </div>;
}

function EmptyPlaceholder({ text }: { text: string }) {
  return <p className="text-center text-text-muted text-sm py-5">{text}</p>;
}

function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
  return <>{parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i} className="text-text">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`"))
      return <code key={i} className="bg-input px-1 rounded text-xs font-mono text-gold">{part.slice(1, -1)}</code>;
    return part;
  })}</>;
}

function useMD(md: string) {
  return useMemo(() => {
    const toc: TocItem[] = [];
    const lines = md.split("\n");
    const nodes: React.ReactNode[] = [];
    let key = 0, i = 0;
    while (i < lines.length && (lines[i].startsWith("# ") || lines[i].startsWith(">") || lines[i].trim() === "" || lines[i].startsWith("---"))) i++;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      if (line.trim() === "---") { nodes.push(<div key={key++} className="divider my-3" />); i++; continue; }

      if (line.startsWith("## ")) {
        const text = line.replace("## ", "");
        toc.push({ id: "s-" + toc.length, text, level: 2 });
        nodes.push(<h3 key={key++} className="text-[15px] font-bold text-gold mt-3.5 mb-1 scroll-mt-4">{text}</h3>);
        i++; continue;
      }
      if (line.startsWith("### ")) {
        const text = line.replace("### ", "");
        toc.push({ id: "s-" + toc.length, text, level: 3 });
        nodes.push(<h4 key={key++} className="text-[13px] font-semibold text-text mt-2 mb-0.5 scroll-mt-4">{text}</h4>);
        i++; continue;
      }
      if (line.startsWith("![")) {
        const imgMatch = line.match(/^!\[(.*?)\]\((.*?)\)/);
        if (imgMatch) {
          nodes.push(<div key={key++} className="my-2">{/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imgMatch[2]} alt={imgMatch[1]} className="max-w-full rounded-md border border-border" />
            {imgMatch[1] && <p className="text-[10px] text-text-muted text-center mt-1">{imgMatch[1]}</p>}
          </div>);
        }
        i++; continue;
      }
      if (line.startsWith("> ")) {
        const isW = line.includes("⚠️"), isT = line.includes("💡");
        const bg = isW ? "bg-red/5 border-red/15" : isT ? "bg-green/5 border-green/15" : "bg-gold/5 border-gold/15";
        nodes.push(<div key={key++} className={`my-1.5 px-3.5 py-2 rounded-md border text-xs text-text-secondary leading-relaxed ${bg}`}>
          <Inline text={line.replace(/^>\s*/, "")} />
        </div>);
        i++; continue;
      }
      if (line.startsWith("|")) {
        const rows: string[][] = [];
        while (i < lines.length && lines[i].startsWith("|")) { rows.push(lines[i].split("|").filter(c => c.trim())); i++; }
        if (rows.length >= 2) {
          nodes.push(<div key={key++} className="overflow-x-auto my-1.5">
            <table className="w-full border-collapse text-[11px]">
              <thead><tr className="border-b border-border">{rows[0].map((h, j) => <th key={j} className="px-2 py-1 text-left font-semibold text-text-muted text-[10px]">{h.trim()}</th>)}</tr></thead>
              <tbody>{rows.slice(2).map((row, ri) => <tr key={ri} className="border-b border-border-light">{row.map((cell, ci) => <td key={ci} className="px-2 py-1 text-text-secondary">{cell.trim()}</td>)}</tr>)}</tbody>
            </table>
          </div>);
        }
        continue;
      }
      if (line.startsWith("- ") || line.startsWith("* ")) {
        const items: string[] = [];
        while (i < lines.length && (lines[i].startsWith("- ") || lines[i].startsWith("* "))) { items.push(lines[i].replace(/^[-*]\s+/, "")); i++; }
        nodes.push(<ul key={key++} className="my-0.5 pl-4">{items.map((item, j) => <li key={j} className="mb-px text-xs text-text-secondary leading-relaxed"><Inline text={item} /></li>)}</ul>);
        continue;
      }
      let para = line; i++;
      while (i < lines.length && lines[i].trim() && !lines[i].startsWith("#") && !lines[i].startsWith("|") && !lines[i].startsWith("- ") && !lines[i].startsWith("---")) { para += " " + lines[i]; i++; }
      nodes.push(<p key={key++} className="text-xs text-text-secondary leading-relaxed my-0.5"><Inline text={para} /></p>);
    }
    return { nodes, toc };
  }, [md]);
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [news, setNews] = useState<OfficialNews[]>([]);
  const [rooms, setRooms] = useState<PublicTournament[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);

  function AnnouncementItem({ a, isActive, onToggle }: { a: Announcement; isActive: boolean; onToggle: () => void }) {
    const { nodes } = useMD(`## ${a.title}\n\n*${a.date}*\n\n${a.content || ""}`);
    return (
      <div className="border-b border-border-light">
        <button onClick={onToggle}
          className={`w-full text-left flex items-start justify-between gap-3 px-6 py-3 transition-colors ${isActive ? "bg-hover" : "hover:bg-hover"}`}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {a.version && <span className="text-[9px] font-bold tracking-wider text-gold/70 bg-gold/5 border border-gold/15 rounded px-1.5 leading-4 shrink-0">{a.version}</span>}
              <span className={`text-[13px] font-semibold truncate ${isActive ? "text-gold" : "text-text"}`}>{a.title}</span>
            </div>
            <div className="text-[11px] text-text-muted truncate">{a.brief}</div>
            <div className="text-[10px] text-text-muted/60 mt-1">{a.date}</div>
          </div>
          <span className={`text-text-muted text-xs mt-0.5 shrink-0 transition-transform ${isActive ? "rotate-90" : ""}`}>&#9654;</span>
        </button>
        {isActive && <div className="px-6 pb-5 animate-slide-up">{nodes}</div>}
      </div>
    );
  }

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => { setUser(d.user); setAuthLoaded(true); });
    Promise.all([
      fetch("/api/announcements?full=true").then(r => r.json()).then(d => { if (d.announcements) setAnnouncements(d.announcements); }).catch(() => {}),
      fetch("/api/official-news").then(r => r.json()).then(d => { if (Array.isArray(d)) setNews(d); }).catch(() => {}),
      fetch("/api/tournaments/public").then(r => r.json()).then(d => { if (d.tournaments) setRooms(d.tournaments); }).catch(() => {}),
    ]).finally(() => setLoaded(true));
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-5 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text tracking-wide mb-1">王者演武堂</h1>
        <p className="text-sm text-text-secondary">内战分队 · 公平竞技</p>
      </div>

      {/* System Announcements */}
      <div className="card !p-0 mb-5 overflow-hidden">
        <div className="px-6 py-4 border-b border-border-light">
          <div className="text-[15px] font-bold text-gold">系统公告</div>
        </div>
        {!loaded ? <div className="px-6 pb-6"><SkeletonLines count={3} /></div>
          : announcements.length === 0 ? <EmptyPlaceholder text="暂无系统公告" />
            : announcements.map(a => (
              <AnnouncementItem key={a.slug} a={a} isActive={activeSlug === a.slug} onToggle={() => setActiveSlug(activeSlug === a.slug ? null : a.slug)} />
            ))}
      </div>

      {/* Two-column */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Official News */}
        <div className="card !p-5">
          <h3 className="section-title !mt-0">王者官方公告</h3>
          {!loaded ? <SkeletonLines count={3} />
            : news.length === 0 ? <EmptyPlaceholder text="暂无公告" />
              : <ul className="list-none p-0 m-0">
                {news.map((item, i) => (
                  <li key={i} className={i > 0 ? "pt-2" : ""} style={{ borderBottom: i < news.length - 1 ? "1px solid var(--border)" : "none", paddingBottom: i < news.length - 1 ? 8 : 0 }}>
                    <a href={item.url} target="_blank" rel="noopener" className="no-underline flex items-center gap-2 group">
                      <span className="badge badge-muted text-[10px] shrink-0">{item.date}</span>
                      <span className="text-[13px] font-semibold text-text-secondary group-hover:text-gold transition-colors">{item.title}</span>
                    </a>
                  </li>
                ))}
              </ul>}
        </div>

        {/* Public Rooms */}
        <div className="card !p-5">
          <h3 className="section-title !mt-0">公开房间</h3>
          {!loaded ? <SkeletonLines count={3} />
            : rooms.length === 0 ? <EmptyPlaceholder text="暂无公开房间" />
              : <ul className="list-none p-0 m-0">
                {rooms.map((room, i) => (
                  <li key={room.id} style={{ padding: i > 0 ? "8px 0" : "0 0 8px 0", borderBottom: i < rooms.length - 1 ? "1px solid var(--border)" : "none" }}>
                    <Link href={`/tournaments/${room.id}`} className="no-underline flex items-center justify-between gap-2.5 group">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[13px] font-semibold text-text group-hover:text-gold transition-colors truncate">{room.name}</span>
                          <span className="badge badge-gold text-[10px] font-mono">#{room.code}</span>
                        </div>
                        <p className="text-xs text-text-muted truncate m-0">
                          {room.announcement ? (room.announcement.length > 60 ? room.announcement.slice(0, 60) + "..." : room.announcement) : "暂无公告"}
                        </p>
                      </div>
                      <span className="text-xs text-text-muted font-semibold shrink-0">{room._count.players}/10人</span>
                    </Link>
                  </li>
                ))}
              </ul>}
        </div>
      </div>

      {authLoaded && !user && (
        <p className="text-center text-sm text-text-muted mt-7">
          已有账号？<Link href="/login" className="text-gold font-semibold no-underline hover:underline">登录</Link>
        </p>
      )}
    </div>
  );
}
