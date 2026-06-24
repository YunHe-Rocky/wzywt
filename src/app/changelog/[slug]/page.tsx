"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface TocItem { id: string; text: string }

// Simple MD → JSX renderer
function renderMD(md: string): { html: React.ReactNode[]; toc: TocItem[] } {
  const toc: TocItem[] = [];
  const lines = md.split("\n");

  // Skip the main title line (first #) and metadata
  let startIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("# ")) {
      startIdx = i + 1;
      while (startIdx < lines.length && (lines[startIdx].startsWith("**日期") || lines[startIdx].startsWith("**概述") || lines[startIdx].trim() === "")) {
        startIdx++;
      }
      break;
    }
  }

  const nodes: React.ReactNode[] = [];
  let i = startIdx;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Empty
    if (!line.trim()) { i++; continue; }

    // HR
    if (line.trim() === "---" || line.trim() === "***") {
      nodes.push(<div key={key++} className="divider" style={{ margin: "16px 0" }} />);
      i++; continue;
    }

    // ## heading
    if (line.startsWith("## ")) {
      const text = line.replace("## ", "");
      const id = "h-" + key;
      toc.push({ id, text });
      nodes.push(<h2 key={key++} id={id} style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", margin: "24px 0 8px", scrollMarginTop: 80 }}>{text}</h2>);
      i++; continue;
    }

    // ### heading
    if (line.startsWith("### ")) {
      const text = line.replace("### ", "");
      nodes.push(<h3 key={key++} style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", margin: "16px 0 6px" }}>{text}</h3>);
      i++; continue;
    }

    // Bullet list
    if (line.startsWith("- ") || line.startsWith("* ")) {
      const items: string[] = [];
      while (i < lines.length && (lines[i].startsWith("- ") || lines[i].startsWith("* "))) {
        items.push(lines[i].replace(/^[-*]\s+/, ""));
        i++;
      }
      nodes.push(
        <ul key={key++} style={{ margin: "8px 0", paddingLeft: 20 }}>
          {items.map((item, j) => (
            <li key={j} style={{ marginBottom: 4, fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8 }}>
              {parseInline(item)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Bold title line
    if (line.startsWith("**") && line.endsWith("**") && line.length < 80) {
      const text = line.replace(/\*\*/g, "");
      nodes.push(<p key={key++} style={{ fontWeight: 700, fontSize: 14, color: "var(--text)", margin: "16px 0 4px" }}>{text}</p>);
      i++; continue;
    }

    // Regular paragraph - collect until empty line or heading
    let para = line;
    i++;
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith("#") && !lines[i].startsWith("- ") && !lines[i].startsWith("* ") && !lines[i].startsWith("---") && !lines[i].startsWith("**")) {
      para += " " + lines[i];
      i++;
    }
    nodes.push(<p key={key++} style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, margin: "4px 0" }}>{parseInline(para)}</p>);
  }

  return { html: nodes, toc };
}

// Parse inline markdown: **bold** and `code`
function parseInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} style={{ color: "var(--text)" }}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={i} style={{
        background: "var(--bg-input)", padding: "1px 6px", borderRadius: 4,
        fontSize: 13, fontFamily: "monospace", color: "var(--gold)",
      }}>{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

export default function ChangelogDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [mdContent, setMdContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState("");

  useEffect(() => {
    fetch(`/api/changelog?slug=${slug}`)
      .then((r) => r.json())
      .then((d) => {
        setMdContent(d.error ? "" : d.content || "");
        setLoading(false);
      })
      .catch(() => {
        setMdContent("");
        setLoading(false);
      });
  }, [slug]);

  const { html, toc } = useMemo(() => {
    if (!mdContent) return { html: [<p key="0">暂无内容</p>] as React.ReactNode[], toc: [] as TocItem[] };
    return renderMD(mdContent);
  }, [mdContent]);

  // Extract title and date
  const titleMatch = mdContent.match(/^#\s+(.+)$/m);
  const title = titleMatch?.[1] || slug;
  const dateMatch = mdContent.match(/\*\*日期\*\*[：:]\s*(.+)/);
  const date = dateMatch?.[1] || "";

  // Track active heading on scroll
  useEffect(() => {
    if (toc.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px" }
    );
    toc.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [toc, mdContent]);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "40px 24px", display: "flex", gap: 32 }}>
      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <Link href="/" style={{ fontSize: 13, color: "var(--text-muted)", textDecoration: "none", display: "inline-block", marginBottom: 24 }}>
          ← 返回首页
        </Link>

        {loading ? (
          <div className="card" style={{ padding: 24 }}>
            <div className="skeleton" style={{ height: 24, width: "60%", marginBottom: 12 }} />
            <div className="skeleton" style={{ height: 14, width: "30%", marginBottom: 24 }} />
            <div className="skeleton" style={{ height: 300 }} />
          </div>
        ) : (
          <article className="card" style={{ padding: "28px 32px" }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text)", margin: "0 0 6px" }}>
              {title}
            </h1>
            {date && <span className="badge badge-muted">{date}</span>}
            <div style={{ marginTop: 20 }}>{html}</div>
          </article>
        )}
      </div>

      {/* Right TOC */}
      {toc.length > 0 && (
        <nav style={{
          width: 200, flexShrink: 0, position: "sticky", top: 80, alignSelf: "flex-start",
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 10, letterSpacing: 1 }}>
            目录
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, borderLeft: "2px solid var(--border)", paddingLeft: 12 }}>
            {toc.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                style={{
                  fontSize: 12, textDecoration: "none", padding: "3px 0",
                  color: activeId === item.id ? "var(--gold)" : "var(--text-muted)",
                  fontWeight: activeId === item.id ? 600 : 400,
                  transition: "color 0.15s",
                }}
                onMouseEnter={(e) => { (e.target as HTMLElement).style.color = "var(--gold-light)"; }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.color = activeId === item.id ? "var(--gold)" : "var(--text-muted)";
                }}
              >
                {item.text}
              </a>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
