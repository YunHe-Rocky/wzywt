"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAnnouncements } from "@/hooks/useAnnouncements";

interface OfficialNews { title: string; date: string; url: string; }
interface PublicTournament { id: number; name: string; code: string; announcement: string | null; _count: { players: number }; deadline: string; }
interface User { userId: number; username: string; }
interface TocItem { id: string; text: string; level: number }
interface Announcement { date: string; title: string; version: string | null; brief: string; slug: string; content?: string; }

function AnnouncementContent({ a }: { a: Announcement }) {
  const { nodes } = useMD(`## ${a.title}\n\n*${a.date}*\n\n${a.content || ""}`);
  return <div className="px-5 pb-4 animate-slide-up">{nodes}</div>;
}

function SkeletonLines({ count }: { count: number }) {
  return <div className="flex flex-col gap-2.5">
    {Array.from({ length: count }).map((_, i) => <div key={i} className="skeleton rounded h-3.5" style={{ width: `${70 + Math.random() * 30}%` }} />)}
  </div>;
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
      if (line.trim() === "---") { nodes.push(<div key={key++} className="divider my-2" />); i++; continue; }
      if (line.startsWith("## ")) {
        const text = line.replace("## ", "");
        toc.push({ id: "s-" + toc.length, text, level: 2 });
        nodes.push(<h3 key={key++} className="text-[14px] font-bold text-gold-light mt-3 mb-1 scroll-mt-4">{text}</h3>);
        i++; continue;
      }
      if (line.startsWith("### ")) {
        const text = line.replace("### ", "");
        toc.push({ id: "s-" + toc.length, text, level: 3 });
        nodes.push(<h4 key={key++} className="text-[12px] font-semibold text-text mt-2 mb-0.5 scroll-mt-4">{text}</h4>);
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
        nodes.push(<div key={key++} className={`my-1 px-3 py-2 rounded-md border text-xs text-text-secondary leading-relaxed ${bg}`}>
          <Inline text={line.replace(/^>\s*/, "")} />
        </div>);
        i++; continue;
      }
      if (line.startsWith("|")) {
        const rows: string[][] = [];
        while (i < lines.length && lines[i].startsWith("|")) { rows.push(lines[i].split("|").filter(c => c.trim())); i++; }
        if (rows.length >= 2) {
          nodes.push(<div key={key++} className="overflow-x-auto my-1">
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

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => { setUser(d.user); setAuthLoaded(true); });
    Promise.all([
      fetch("/api/official-news").then(r => r.json()).then(d => { if (Array.isArray(d)) setNews(d); }).catch(() => {}),
      fetch("/api/tournaments/public").then(r => r.json()).then(d => { if (d.tournaments) setRooms(d.tournaments); }).catch(() => {}),
    ]).finally(() => setLoaded(true));
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 px-6 py-6 py-8">
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
                        <span className="text-[10px] font-mono font-semibold text-gold/80 shrink-0">#{room.code}</span>
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
