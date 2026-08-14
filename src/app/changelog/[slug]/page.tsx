"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  extractMarkdownHeadings,
  MarkdownContent,
} from "@/web/components/content/MarkdownContent";
import { apiRequest } from "@/features/shared/client/api";

export default function ChangelogDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [mdContent, setMdContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void apiRequest<{ content?: string; error?: string }>(`/api/changelog?slug=${encodeURIComponent(slug)}`, { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setMdContent(data.error ? "" : data.content || ""); })
      .catch(() => { if (!controller.signal.aborted) setMdContent(""); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [slug]);

  const toc = useMemo(() => extractMarkdownHeadings(mdContent, true), [mdContent]);
  const title = mdContent.match(/^#\s+(.+)$/m)?.[1] || slug;
  const date = mdContent.match(/\*\*日期\*\*[：:]\s*(.+)/)?.[1] || "";

  useEffect(() => {
    if (toc.length === 0) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) setActiveId(entry.target.id);
      }
    }, { rootMargin: "-80px 0px -60% 0px" });
    toc.forEach(({ id }) => {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    });
    return () => observer.disconnect();
  }, [toc]);

  return (
    <div className="page-shell page-shell--medium doc-layout">
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
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text)", margin: "0 0 6px" }}>{title}</h1>
            {date && <span className="badge badge-muted">{date}</span>}
            <div style={{ marginTop: 20 }}>
              <MarkdownContent content={mdContent} skipFirstHeading skipLeadingMetadata />
            </div>
          </article>
        )}
      </div>

      {toc.length > 0 && (
        <nav className="doc-sidebar">
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 10, letterSpacing: 1 }}>目录</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, borderLeft: "2px solid var(--border)", paddingLeft: 12 }}>
            {toc.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                style={{
                  fontSize: 12,
                  textDecoration: "none",
                  padding: "3px 0",
                  paddingLeft: item.level === 3 ? 8 : 0,
                  color: activeId === item.id ? "var(--gold)" : "var(--text-muted)",
                  fontWeight: activeId === item.id ? 600 : 400,
                  transition: "color 0.15s",
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
