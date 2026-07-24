import type { ReactNode } from "react";

function renderInline(text: string): ReactNode {
  const parts = text.split(/(\*\*.*?\*\*|`.*?`|\*[^*]+\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index} style={{ color: "var(--text)", fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={index} style={{ padding: "1px 6px", borderRadius: 4, background: "var(--bg-input)", color: "var(--gold)", fontSize: "0.92em" }}>
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

export function MarkdownContent({ content }: { content: string }) {
  const lines = content.split(/\r?\n/);
  const nodes: ReactNode[] = [];
  let index = 0;
  let key = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index++;
      continue;
    }
    if (/^#{2,3}\s+/.test(line)) {
      const level = line.startsWith("### ") ? 3 : 2;
      const text = line.replace(/^#{2,3}\s+/, "");
      nodes.push(level === 2
        ? <h2 key={key++} style={{ margin: "22px 0 8px", paddingBottom: 7, borderBottom: "1px solid var(--border-light)", color: "var(--text)", fontSize: 18, fontWeight: 700 }}>{text}</h2>
        : <h3 key={key++} style={{ margin: "16px 0 6px", color: "var(--text)", fontSize: 15, fontWeight: 700 }}>{text}</h3>);
      index++;
      continue;
    }
    if (/^[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*+]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*+]\s+/, ""));
        index++;
      }
      nodes.push(
        <ul key={key++} style={{ margin: "8px 0", paddingLeft: 20, color: "var(--text-secondary)" }}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex} style={{ marginBottom: 5, lineHeight: 1.7 }}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }
    if (line === "---" || line === "***") {
      nodes.push(<hr key={key++} style={{ border: 0, borderTop: "1px solid var(--border)", margin: "18px 0" }} />);
      index++;
      continue;
    }

    const paragraph = [line];
    index++;
    while (
      index < lines.length
      && lines[index].trim()
      && !/^#{2,3}\s+/.test(lines[index].trim())
      && !/^[-*+]\s+/.test(lines[index].trim())
      && !/^(---|\*\*\*)$/.test(lines[index].trim())
    ) {
      paragraph.push(lines[index].trim());
      index++;
    }
    nodes.push(
      <p key={key++} style={{ margin: "6px 0", color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.75 }}>
        {renderInline(paragraph.join(" "))}
      </p>,
    );
  }

  return nodes.length > 0
    ? <div>{nodes}</div>
    : <p style={{ color: "var(--text-muted)", fontSize: 13 }}>正文预览将在这里显示</p>;
}
