import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownContent } from "@/web/components/content/MarkdownContent";

const markdown = [
  "# 标题",
  "",
  "**粗体** *斜体* `code` [安全链接](https://example.com)",
  "",
  "- 列表项",
  "",
  "> 引用",
  "",
  "---",
  "",
  "<script>globalThis.pwned = true</script>",
  "[危险链接](javascript:alert(1))",
].join("\n");

const html = renderToStaticMarkup(createElement(MarkdownContent, { content: markdown }));
assert.match(html, /<h1/);
assert.match(html, /<strong/);
assert.match(html, /<em/);
assert.match(html, /<code/);
assert.match(html, /<ul/);
assert.match(html, /<blockquote/);
assert.match(html, /<hr/);
assert.match(html, /href="https:\/\/example\.com\/"/);
assert.match(html, /&lt;script&gt;/);
assert.doesNotMatch(html, /<script>/);
assert.doesNotMatch(html, /href="javascript:/);

console.log("Markdown renderer security and formatting tests passed.");
