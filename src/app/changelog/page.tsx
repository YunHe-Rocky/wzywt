"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageEntrance } from "@/web/components/layout/PageEntrance";

interface TocItem { id: string; text: string; level: number }

function renderDoc(md: string): { html: React.ReactNode[]; toc: TocItem[] } {
  const toc: TocItem[] = [];
  const lines = md.split("\n");
  const nodes: React.ReactNode[] = [];
  let key = 0;
  let i = 0;

  // Skip metadata header lines
  while (i < lines.length && (lines[i].startsWith("# ") || lines[i].startsWith("> ") || lines[i].trim() === "" || lines[i].startsWith("---"))) {
    i++;
  }

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.trim() === "---") { nodes.push(<div key={key++} className="divider" style={{ margin: "20px 0" }} />); i++; continue; }

    // ## heading
    if (line.startsWith("## ")) {
      const text = line.replace("## ", "");
      const id = "h-" + key;
      toc.push({ id, text, level: 2 });
      nodes.push(<h2 key={key++} id={id} style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", margin: "28px 0 10px", scrollMarginTop: 80, paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>{text}</h2>);
      i++; continue;
    }
    // ### heading
    if (line.startsWith("### ")) {
      const text = line.replace("### ", "");
      const id = "h-" + key;
      toc.push({ id, text, level: 3 });
      nodes.push(<h3 key={key++} id={id} style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", margin: "18px 0 6px", scrollMarginTop: 80 }}>{text}</h3>);
      i++; continue;
    }
    // Table row
    if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        rows.push(lines[i].split("|").filter(c => c.trim()));
        i++;
      }
      if (rows.length >= 2) {
        const header = rows[0];
        const body = rows.slice(2); // skip separator row
        nodes.push(
          <div key={key++} style={{ overflowX: "auto", margin: "10px 0" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {header.map((h, j) => (
                    <th key={j} style={{ padding: "6px 12px", textAlign: "left", fontWeight: 600, color: "var(--text-muted)", fontSize: 12 }}>{h.trim()}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, ri) => (
                  <tr key={ri} style={{ borderBottom: "1px solid var(--border-light)" }}>
                    {row.map((cell, ci) => (
                      <td key={ci} style={{ padding: "6px 12px", color: "var(--text-secondary)" }}>{cell.trim()}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }
    // Bullet
    if (line.startsWith("- ") || line.startsWith("* ")) {
      const items: string[] = [];
      while (i < lines.length && (lines[i].startsWith("- ") || lines[i].startsWith("* "))) {
        items.push(lines[i].replace(/^[-*]\s+/, ""));
        i++;
      }
      nodes.push(
        <ul key={key++} style={{ margin: "6px 0", paddingLeft: 20 }}>
          {items.map((item, j) => (
            <li key={j} style={{ marginBottom: 3, fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8 }}>{parseInline(item)}</li>
          ))}
        </ul>
      );
      continue;
    }
    // Bold sub-heading
    if (line.startsWith("**") && line.includes("**") && line.length < 80) {
      const text = line.replace(/\*\*/g, "");
      nodes.push(<p key={key++} style={{ fontWeight: 700, fontSize: 14, color: "var(--text)", margin: "14px 0 4px" }}>{text}</p>);
      i++; continue;
    }
    // Paragraph
    let para = line;
    i++;
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith("#") && !lines[i].startsWith("|") && !lines[i].startsWith("- ") && !lines[i].startsWith("---") && !lines[i].startsWith("**")) {
      para += " " + lines[i];
      i++;
    }
    nodes.push(<p key={key++} style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, margin: "4px 0" }}>{parseInline(para)}</p>);
  }
  return { html: nodes, toc };
}

function parseInline(text: string): React.ReactNode {
  // Split on **bold**, *italic*, and `code`
  const parts = text.split(/(\*\*.*?\*\*|\*[^*].*?[^*]\*|`.*?`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i} style={{ color: "var(--text)" }}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2)
      return <em key={i} style={{ color: "var(--text-secondary)" }}>{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`"))
      return <code key={i} style={{ background: "var(--bg-input)", padding: "1px 6px", borderRadius: 4, fontSize: 13, fontFamily: "monospace", color: "var(--gold)" }}>{part.slice(1, -1)}</code>;
    return part;
  });
}

export default function ChangelogPage() {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState("");

  useEffect(() => {
    fetch("/api/changelog?type=features")
      .then((r) => r.json())
      .then((d) => { setContent(d.content || ""); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const { html, toc } = useMemo(() => renderDoc(content), [content]);

  // Track scroll
  useEffect(() => {
    if (toc.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => { for (const e of entries) if (e.isIntersecting) setActiveId(e.target.id); },
      { rootMargin: "-80px 0px -60% 0px" }
    );
    toc.forEach(({ id }) => { const el = document.getElementById(id); if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, [toc, content]);

  return (
    <PageEntrance>
    <div className="page-shell page-shell--medium doc-layout">
      <div style={{ flex: 1, minWidth: 0 }}>
        <Link href="/" style={{ fontSize: 13, color: "var(--text-muted)", textDecoration: "none", marginBottom: 24, display: "inline-block" }}>
          ← 返回首页
        </Link>

        {loading ? (
          <div className="card" style={{ padding: 24 }}>
            <div className="skeleton" style={{ height: 28, width: "40%", marginBottom: 12 }} />
            <div className="skeleton" style={{ height: 400 }} />
          </div>
        ) : (
          <article className="card" style={{ padding: "28px 36px" }}>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text)", margin: "0 0 6px" }}>
              王者演武堂 — 功能说明
            </h1>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>
              面向选手与赛事组织者
            </p>
            {html}
          </article>
        )}
      </div>

      {/* TOC sidebar */}
      {toc.length > 0 && (
        <nav className="doc-sidebar">
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 8, letterSpacing: 2, textTransform: "uppercase" }}>
            目录
          </div>
          <div style={{ borderLeft: "2px solid var(--border)", paddingLeft: 12, display: "flex", flexDirection: "column", gap: 1 }}>
            {toc.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                style={{
                  fontSize: 12, textDecoration: "none", padding: "3px 0",
                  paddingLeft: item.level === 3 ? 12 : 0,
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
    </PageEntrance>
  );
}
