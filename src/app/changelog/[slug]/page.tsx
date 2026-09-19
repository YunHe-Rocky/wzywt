"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import {
  extractMarkdownHeadings,
  MarkdownContent,
} from "@/web/components/content/MarkdownContent";
import { apiRequest } from "@/features/shared/client/api";
import { createAnnouncementDetailApiPath } from "@/features/announcements/client";

export default function ChangelogDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const pathname = usePathname();
  const prefix = pathname === "/m" || pathname.startsWith("/m/") ? "/m" : "";
  const [mdContent, setMdContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void apiRequest<{ content?: string; error?: string }>(createAnnouncementDetailApiPath(slug), { signal: controller.signal })
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
        <Link href={`${prefix}/changelog`} className="arena-text-link">
          ← 返回更新目录
        </Link>

        {loading ? (
          <div className="yanwu-feedback" role="status" aria-label="正在加载公告">
            <div className="skeleton" style={{ height: 24, width: "60%", marginBottom: 12 }} />
            <div className="skeleton" style={{ height: 14, width: "30%", marginBottom: 24 }} />
            <div className="skeleton" style={{ height: 300 }} />
          </div>
        ) : !mdContent ? <div className="yanwu-feedback" role="status"><h1>公告暂不可用</h1><p>暂时无法读取这篇公告，请返回目录选择其他内容。</p></div> : (
          <article className="yanwu-document">
            <h1>{title}</h1>
            {date && <span className="badge badge-muted">{date}</span>}
            <div style={{ marginTop: 20 }}>
              <MarkdownContent content={mdContent} skipFirstHeading skipLeadingMetadata />
            </div>
          </article>
        )}
      </div>

      {toc.length > 0 && (
        <nav className="doc-sidebar yanwu-toc" aria-label="文章目录">
          <div className="yanwu-toc-title">本篇目录</div>
          <div className="yanwu-toc-links">
            {toc.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                aria-current={activeId === item.id ? "location" : undefined}
                style={{ paddingLeft: item.level === 3 ? 12 : 0 }}
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
