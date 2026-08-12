import React, { Fragment, type ReactNode } from "react";

export interface MarkdownHeading {
  id: string;
  text: string;
  level: 1 | 2 | 3;
}

interface MarkdownContentProps {
  content: string;
  skipFirstHeading?: boolean;
  skipLeadingMetadata?: boolean;
  compact?: boolean;
}

function normalizeContent(content: string): string[] {
  return content.replace(/\\n/g, "\n").split(/\r?\n/);
}

function safeUrl(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function renderInline(text: string): ReactNode {
  const tokens = text.split(/(!?\[[^\]]*\]\([^)]+\)|\*\*.*?\*\*|`[^`]*`|\*[^*]+\*)/g);
  return tokens.map((token, index) => {
    const image = token.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (image) {
      const src = safeUrl(image[2]);
      return src ? <img key={index} src={src} alt={image[1]} loading="lazy" style={{ maxWidth: "100%" }} /> : image[1];
    }
    const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const href = safeUrl(link[2]);
      return href
        ? <a key={index} href={href} target={href.startsWith("/") ? undefined : "_blank"} rel="noreferrer">{link[1]}</a>
        : link[1];
    }
    if (token.startsWith("**") && token.endsWith("**")) {
      return <strong key={index} style={{ color: "var(--text)", fontWeight: 700 }}>{token.slice(2, -2)}</strong>;
    }
    if (token.startsWith("`") && token.endsWith("`")) {
      return <code key={index} style={{ padding: "1px 6px", borderRadius: 4, background: "var(--bg-input)", color: "var(--gold)", fontSize: "0.92em" }}>{token.slice(1, -1)}</code>;
    }
    if (token.startsWith("*") && token.endsWith("*")) return <em key={index}>{token.slice(1, -1)}</em>;
    return token;
  });
}

export function extractMarkdownHeadings(content: string, skipFirstHeading = false): MarkdownHeading[] {
  let headingIndex = 0;
  let firstHeadingSkipped = false;
  const headings: MarkdownHeading[] = [];
  for (const rawLine of normalizeContent(content)) {
    const match = rawLine.trim().match(/^(#{1,3})\s+(.+)$/);
    if (!match) continue;
    const currentIndex = headingIndex++;
    if (skipFirstHeading && !firstHeadingSkipped && match[1].length === 1) {
      firstHeadingSkipped = true;
      continue;
    }
    headings.push({
      id: `md-heading-${currentIndex}`,
      text: match[2],
      level: match[1].length as 1 | 2 | 3,
    });
  }
  return headings;
}

export function MarkdownContent({
  content,
  skipFirstHeading = false,
  skipLeadingMetadata = false,
  compact = false,
}: MarkdownContentProps) {
  const lines = normalizeContent(content);
  const nodes: ReactNode[] = [];
  let index = 0;
  let key = 0;
  let headingIndex = 0;
  let firstHeadingSkipped = false;
  let atLeadingMetadata = skipLeadingMetadata;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index++;
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const currentHeadingIndex = headingIndex++;
      if (skipFirstHeading && !firstHeadingSkipped && heading[1].length === 1) {
        firstHeadingSkipped = true;
        index++;
        continue;
      }
      atLeadingMetadata = false;
      const level = heading[1].length as 1 | 2 | 3;
      const id = `md-heading-${currentHeadingIndex}`;
      const common = { id, style: { scrollMarginTop: 80 } };
      nodes.push(level === 1
        ? <h1 key={key++} {...common} className={compact ? "text-base font-bold mt-4 mb-1" : undefined}>{renderInline(heading[2])}</h1>
        : level === 2
          ? <h2 key={key++} {...common} className={compact ? "text-sm font-bold text-gold-light mt-3 mb-1" : undefined}>{renderInline(heading[2])}</h2>
          : <h3 key={key++} {...common} className={compact ? "text-xs font-semibold mt-2 mb-1" : undefined}>{renderInline(heading[2])}</h3>);
      index++;
      continue;
    }

    if (atLeadingMetadata && (/^\*\*(日期|概述)\*\*[：:]/.test(line) || /^>\s?/.test(line) || /^(---|\*\*\*)$/.test(line))) {
      index++;
      continue;
    }
    atLeadingMetadata = false;

    if (/^(---|\*\*\*)$/.test(line)) {
      nodes.push(<hr key={key++} style={{ border: 0, borderTop: "1px solid var(--border)", margin: compact ? "8px 0" : "18px 0" }} />);
      index++;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quote.push(lines[index].trim().replace(/^>\s?/, ""));
        index++;
      }
      nodes.push(<blockquote key={key++} style={{ margin: "10px 0", padding: "8px 12px", borderLeft: "3px solid var(--gold)", background: "var(--bg-input)", color: "var(--text-secondary)" }}>
        {quote.map((item, quoteIndex) => <Fragment key={quoteIndex}>{quoteIndex > 0 && <br />}{renderInline(item)}</Fragment>)}
      </blockquote>);
      continue;
    }

    if (/^(?:[-*+]\s+|\d+\.\s+)/.test(line)) {
      const ordered = /^\d+\.\s+/.test(line);
      const items: string[] = [];
      const pattern = ordered ? /^\d+\.\s+/ : /^[-*+]\s+/;
      while (index < lines.length && pattern.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(pattern, ""));
        index++;
      }
      const children = items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>);
      nodes.push(ordered
        ? <ol key={key++} style={{ paddingLeft: 22, color: "var(--text-secondary)" }}>{children}</ol>
        : <ul key={key++} style={{ paddingLeft: 22, color: "var(--text-secondary)" }}>{children}</ul>);
      continue;
    }

    if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (index < lines.length && lines[index].trim().startsWith("|")) {
        rows.push(lines[index].trim().slice(1, -1).split("|").map((cell) => cell.trim()));
        index++;
      }
      const hasSeparator = rows.length > 1 && rows[1].every((cell) => /^:?-{3,}:?$/.test(cell));
      if (hasSeparator) {
        nodes.push(<div key={key++} style={{ overflowX: "auto" }}><table><thead><tr>
          {rows[0].map((cell, cellIndex) => <th key={cellIndex}>{renderInline(cell)}</th>)}
        </tr></thead><tbody>
          {rows.slice(2).map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{renderInline(cell)}</td>)}</tr>)}
        </tbody></table></div>);
        continue;
      }
      nodes.push(<p key={key++}>{renderInline(rows.flat().join(" | "))}</p>);
      continue;
    }

    const paragraph = [line];
    index++;
    while (
      index < lines.length
      && lines[index].trim()
      && !/^(#{1,3})\s+/.test(lines[index].trim())
      && !/^(?:[-*+]\s+|\d+\.\s+)/.test(lines[index].trim())
      && !/^>\s?/.test(lines[index].trim())
      && !/^(---|\*\*\*)$/.test(lines[index].trim())
      && !lines[index].trim().startsWith("|")
    ) {
      paragraph.push(lines[index].trim());
      index++;
    }
    nodes.push(<p key={key++} style={{ margin: compact ? "2px 0" : "6px 0", color: "var(--text-secondary)", fontSize: compact ? 12 : 14, lineHeight: compact ? 1.65 : 1.75 }}>
      {paragraph.map((item, paragraphIndex) => <Fragment key={paragraphIndex}>{paragraphIndex > 0 && <br />}{renderInline(item)}</Fragment>)}
    </p>);
  }

  return nodes.length > 0
    ? <div>{nodes}</div>
    : <p style={{ color: "var(--text-muted)", fontSize: 13 }}>正文预览将在这里显示</p>;
}
