"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageEntrance } from "@/web/components/layout/PageEntrance";
import {
  extractMarkdownHeadings,
  MarkdownContent,
} from "@/web/components/content/MarkdownContent";
import { apiRequest } from "@/features/shared/client/api";

export default function ChangelogPage() {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void apiRequest<{ content?: string }>("/api/changelog?type=features", { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setContent(data.content || ""); })
      .catch(() => undefined)
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const toc = useMemo(() => extractMarkdownHeadings(content, true), [content]);

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
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>面向选手与赛事组织者</p>
              <MarkdownContent content={content} skipFirstHeading skipLeadingMetadata />
            </article>
          )}
        </div>

        {toc.length > 0 && (
          <nav className="doc-sidebar">
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 8, letterSpacing: 2, textTransform: "uppercase" }}>目录</div>
            <div style={{ borderLeft: "2px solid var(--border)", paddingLeft: 12, display: "flex", flexDirection: "column", gap: 1 }}>
              {toc.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  style={{
                    fontSize: 12,
                    textDecoration: "none",
                    padding: "3px 0",
                    paddingLeft: item.level === 3 ? 12 : 0,
                    color: activeId === item.id ? "var(--gold)" : "var(--text-muted)",
                    fontWeight: activeId === item.id ? 600 : 400,
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
