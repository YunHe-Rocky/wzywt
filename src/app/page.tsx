"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

interface OfficialNews { title: string; date: string; url: string; }
interface PublicTournament { id: number; name: string; code: string; announcement: string | null; _count: { players: number }; deadline: string; }
interface User { userId: number; username: string; }
interface TocItem { id: string; text: string; level: number }
interface Announcement { date: string; title: string; version: string | null; brief: string; slug: string; content?: string; }

function SkeletonLines({ count }: { count: number }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    {Array.from({ length: count }).map((_, i) => <div key={i} className="skeleton" style={{ height: 14, width: `${70 + Math.random() * 30}%` }} />)}
  </div>;
}

function EmptyPlaceholder({ text }: { text: string }) {
  return <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: "20px 0" }}>{text}</p>;
}

function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
  return <>{parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i} style={{ color: "var(--text)" }}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`"))
      return <code key={i} style={{ background: "var(--bg-input)", padding: "1px 4px", borderRadius: 3, fontSize: 11, fontFamily: "monospace", color: "var(--gold)" }}>{part.slice(1, -1)}</code>;
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
      if (line.trim() === "---") { nodes.push(<div key={key++} className="divider" style={{ margin: "12px 0" }} />); i++; continue; }

      if (line.startsWith("## ")) {
        const text = line.replace("## ", "");
        const id = "s-" + toc.length;
        toc.push({ id, text, level: 2 });
        nodes.push(<h3 key={key++} id={id} style={{ fontSize: 15, fontWeight: 700, color: "var(--gold)", margin: "14px 0 4px", scrollMarginTop: 16 }}>{text}</h3>);
        i++; continue;
      }
      if (line.startsWith("### ")) {
        const text = line.replace("### ", "");
        const id = "s-" + toc.length;
        toc.push({ id, text, level: 3 });
        nodes.push(<h4 key={key++} id={id} style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", margin: "8px 0 2px", scrollMarginTop: 16 }}>{text}</h4>);
        i++; continue;
      }
      if (line.startsWith("|")) {
        const rows: string[][] = [];
        while (i < lines.length && lines[i].startsWith("|")) { rows.push(lines[i].split("|").filter(c => c.trim())); i++; }
        if (rows.length >= 2) {
          nodes.push(<div key={key++} style={{ overflowX: "auto", margin: "6px 0" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead><tr style={{ borderBottom: "1px solid var(--border)" }}>{rows[0].map((h, j) => <th key={j} style={{ padding: "3px 8px", textAlign: "left", fontWeight: 600, color: "var(--text-muted)", fontSize: 10 }}>{h.trim()}</th>)}</tr></thead>
              <tbody>{rows.slice(2).map((row, ri) => <tr key={ri} style={{ borderBottom: "1px solid var(--border-light)" }}>{row.map((cell, ci) => <td key={ci} style={{ padding: "3px 8px", color: "var(--text-secondary)" }}>{cell.trim()}</td>)}</tr>)}</tbody>
            </table>
          </div>);
        }
        continue;
      }
      if (line.startsWith("- ") || line.startsWith("* ")) {
        const items: string[] = [];
        while (i < lines.length && (lines[i].startsWith("- ") || lines[i].startsWith("* "))) { items.push(lines[i].replace(/^[-*]\s+/, "")); i++; }
        nodes.push(<ul key={key++} style={{ margin: "2px 0", paddingLeft: 16 }}>{items.map((item, j) => <li key={j} style={{ marginBottom: 1, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}><Inline text={item} /></li>)}</ul>);
        continue;
      }
      let para = line; i++;
      while (i < lines.length && lines[i].trim() && !lines[i].startsWith("#") && !lines[i].startsWith("|") && !lines[i].startsWith("- ") && !lines[i].startsWith("---")) { para += " " + lines[i]; i++; }
      nodes.push(<p key={key++} style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, margin: "2px 0" }}><Inline text={para} /></p>);
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
    const mdContent = `## ${a.title}\n\n*${a.date}*\n\n${a.content || ""}`;
    const { nodes: itemNodes } = useMD(mdContent);
    return (
      <div key={a.slug} style={{ borderBottom: "1px solid var(--border-light)" }}>
        <button
          onClick={onToggle}
          style={{
            width: "100%", background: isActive ? "var(--bg-hover)" : "transparent",
            border: "none", cursor: "pointer", padding: "12px 24px",
            textAlign: "left", display: "flex", alignItems: "flex-start",
            justifyContent: "space-between", gap: 12,
            transition: "background 0.15s",
          }}
          onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; }}
          onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
              {a.version && (
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: 1,
                  color: "rgba(192,168,74,0.7)", background: "rgba(192,168,74,0.06)",
                  border: "1px solid rgba(192,168,74,0.15)", borderRadius: 3,
                  padding: "0 5px", lineHeight: "17px", flexShrink: 0,
                }}>
                  {a.version}
                </span>
              )}
              <span style={{
                fontSize: 13, fontWeight: 600,
                color: isActive ? "var(--gold)" : "var(--text)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {a.title}
              </span>
            </div>
            <div style={{
              fontSize: 11, color: "var(--text-muted)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {a.brief}
            </div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3, opacity: 0.6 }}>{a.date}</div>
          </div>
          <span style={{
            color: "var(--text-muted)", fontSize: 12, flexShrink: 0, marginTop: 2,
            transition: "transform 0.2s",
            transform: isActive ? "rotate(90deg)" : "rotate(0deg)",
          }}>▶</span>
        </button>
        {isActive && (
          <div style={{ padding: "0 24px 20px", animation: "slide-up 0.15s ease-out" }}>
            {itemNodes}
          </div>
        )}
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
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 20px 48px" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: "var(--text)", margin: "0 0 4px", letterSpacing: 1 }}>王者演武堂</h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>内战分队 · 公平竞技</p>
      </div>

      {/* ── System Announcements ── */}
      <div className="card announcement-card" style={{ padding: 0, marginBottom: 20, overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border-light)" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--gold)" }}>📣 系统公告</div>
        </div>

        {!loaded ? (
          <div style={{ padding: "0 24px 24px" }}><SkeletonLines count={3} /></div>
        ) : announcements.length === 0 ? (
          <div style={{ padding: "20px 24px" }}><EmptyPlaceholder text="暂无系统公告" /></div>
        ) : (
          <div>
            {announcements.map((a) => (
              <AnnouncementItem key={a.slug} a={a} isActive={activeSlug === a.slug} onToggle={() => setActiveSlug(activeSlug === a.slug ? null : a.slug)} />
            ))}
          </div>
        )}
      </div>

      {/* ── Two-column info grid ── */}
      <div className="info-grid">
        {/* Official news */}
        <div className="card" style={{ padding: 20 }}>
          <h3 className="section-title" style={{ marginTop: 0 }}>📢 王者官方公告</h3>
          {!loaded ? <SkeletonLines count={3} /> :
           news.length === 0 ? <EmptyPlaceholder text="暂无公告" /> :
           <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {news.map((item, i) => (
              <li key={i} style={{ padding: i > 0 ? "8px 0" : "0 0 8px 0", borderBottom: i < news.length - 1 ? "1px solid var(--border)" : "none" }}>
                <a href={item.url} target="_blank" rel="noopener" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="badge badge-muted" style={{ fontSize: 10, flexShrink: 0 }}>{item.date}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "var(--gold)"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"}
                  >{item.title}</span>
                </a>
              </li>
            ))}
           </ul>
          }
        </div>

        {/* Public rooms */}
        <div className="card" style={{ padding: 20 }}>
          <h3 className="section-title" style={{ marginTop: 0 }}>🏠 公开房间</h3>
          {!loaded ? <SkeletonLines count={3} /> :
           rooms.length === 0 ? <EmptyPlaceholder text="暂无公开房间" /> :
           <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {rooms.map((room, i) => (
              <li key={room.id} style={{ padding: i > 0 ? "8px 0" : "0 0 8px 0", borderBottom: i < rooms.length - 1 ? "1px solid var(--border)" : "none" }}>
                <Link href={`/tournaments/${room.id}`} style={{ textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "var(--gold)"}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--text)"}
                      >{room.name}</span>
                      <span className="badge badge-gold" style={{ fontSize: 10, fontFamily: "monospace" }}>#{room.code}</span>
                    </div>
                    <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {room.announcement
                        ? (room.announcement.length > 60 ? room.announcement.slice(0, 60) + "..." : room.announcement)
                        : "暂无公告"}
                    </p>
                  </div>
                  <span style={{ fontSize: 12, color: "var(--text-muted)", flexShrink: 0, fontWeight: 600 }}>
                    {room._count.players}/10人
                  </span>
                </Link>
              </li>
            ))}
           </ul>
          }
        </div>
      </div>

      {authLoaded && !user && (
        <p style={{ textAlign: "center", fontSize: 13, color: "var(--text-muted)", marginTop: 28 }}>
          已有账号？<Link href="/login" style={{ color: "var(--gold)", fontWeight: 600, textDecoration: "none" }}>登录</Link>
        </p>
      )}

      <style jsx>{`
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        @media (max-width: 768px) {
          .info-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
