import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import postcss from "postcss";
import tailwindcss from "tailwindcss";

const repoRoot = process.cwd();
const publicRoot = path.resolve(repoRoot, "public");
const defaultAliases = {
  "next/link": path.resolve(repoRoot, "tests/e2e/yanwu/routing-shim.tsx"),
  "next/navigation": path.resolve(repoRoot, "tests/e2e/yanwu/routing-shim.tsx"),
  "@/features/auth/client": path.resolve(repoRoot, "tests/e2e/yanwu/auth-shim.tsx"),
  "@/features/auth/client/api": path.resolve(repoRoot, "tests/e2e/yanwu/auth-shim.tsx"),
};

function contentType(file) {
  if (file.endsWith(".webp")) return "image/webp";
  if (file.endsWith(".svg")) return "image/svg+xml";
  if (file.endsWith(".png")) return "image/png";
  return "application/octet-stream";
}

function resolveStyleImport(specifier, importer) {
  if (specifier.startsWith("@/")) return path.resolve(repoRoot, "src", specifier.slice(2));
  if (specifier.startsWith(".")) return path.resolve(path.dirname(importer), specifier);
  throw new Error(`Yanwu host cannot resolve stylesheet import ${JSON.stringify(specifier)} from ${path.relative(repoRoot, importer)}`);
}

async function expandStyleImports(file, ancestors = []) {
  const resolved = path.resolve(file);
  if (ancestors.includes(resolved)) {
    const cycle = [...ancestors, resolved].map(item => path.relative(repoRoot, item)).join(" -> ");
    throw new Error(`Yanwu host stylesheet import cycle: ${cycle}`);
  }
  const source = await readFile(resolved, "utf8");
  const importPattern = /^@import\s+["']([^"']+\.css)["'];?\s*$/gm;
  let styles = "";
  let cursor = 0;
  for (const match of source.matchAll(importPattern)) {
    styles += source.slice(cursor, match.index);
    styles += await expandStyleImports(resolveStyleImport(match[1], resolved), [...ancestors, resolved]);
    cursor = match.index + match[0].length;
  }
  return styles + source.slice(cursor);
}

async function compileStyles(layoutPath) {
  const layoutSource = await readFile(layoutPath, "utf8");
  const styleImports = [...layoutSource.matchAll(/\bimport\s+["']([^"']+\.css)["'];?/g)];
  if (!styleImports.length) throw new Error(`Yanwu host found no root styles in ${path.relative(repoRoot, layoutPath)}`);
  let styles = "";
  for (const match of styleImports) styles += `${await expandStyleImports(resolveStyleImport(match[1], layoutPath))}\n`;
  return (await postcss([tailwindcss]).process(styles, { from: resolveStyleImport(styleImports[0][1], layoutPath) })).css;
}

export async function startYanwuHost({ entry, layout = "src/app/layout.tsx", aliases = {}, apiHandlers, output: _output } = {}) {
  if (!entry) throw new Error("startYanwuHost requires an entry TSX path");
  const suppliedAliases = Object.fromEntries(Object.entries(aliases).map(([specifier, file]) => [specifier, path.resolve(repoRoot, file)]));
  const aliasMap = { ...defaultAliases, ...suppliedAliases };
  const bundle = await build({
    entryPoints: [path.resolve(repoRoot, entry)],
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": JSON.stringify("development") },
    plugins: [{
      name: "yanwu-isolated-host",
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, args => aliasMap[args.path] ? { path: aliasMap[args.path] } : null);
        builder.onLoad({ filter: /.*/ }, async args => {
          const normalized = args.path.replaceAll("\\", "/");
          const forbidden = /\/src\/lib\//.test(normalized)
            || /\/src\/app\/api\//.test(normalized)
            || /\/src\/app\/(?:.*\/)?layout\.tsx$/.test(normalized)
            || (/\/src\/features\//.test(normalized) && /\/server(?:\/|\.(?:ts|tsx|js|mjs)$)/.test(normalized));
          if (forbidden) return { errors: [{ text: `Yanwu component host forbids server import: ${path.relative(repoRoot, args.path)}` }] };
          // esbuild does not run Next's styled-jsx transform. This one real
          // component contains a static media rule; retain its CSS and logic.
          if (args.path === path.resolve(repoRoot, "src/web/components/ui/Toast.tsx")) {
            const source = await readFile(args.path, "utf8");
            return { contents: source.replace("<style jsx>", "<style>"), loader: "tsx" };
          }
          return null;
        });
      },
    }],
  });
  const css = await compileStyles(path.resolve(repoRoot, layout));
  const html = '<!doctype html><html lang="zh-CN" data-theme="yanwu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>';
  const apiRequests = [];
  const violations = [];
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname === "/bundle.js") {
      response.writeHead(200, { "Content-Type": "text/javascript" });
      return response.end(bundle.outputFiles[0].contents);
    }
    if (url.pathname === "/style.css") {
      response.writeHead(200, { "Content-Type": "text/css" });
      return response.end(css);
    }
    if (url.pathname.startsWith("/api/")) {
      const record = `${request.method} ${url.pathname}${url.search}`;
      apiRequests.push(record);
      const handled = apiHandlers ? await apiHandlers({ request, url, record }) : null;
      if (handled) {
        response.writeHead(handled.status ?? 200, { "Content-Type": handled.contentType ?? "application/json", ...(handled.headers ?? {}) });
        // Explicit SSE fixtures stay open until the browser releases the connection.
        if (handled.keepOpen && handled.contentType === "text/event-stream") return response.write(typeof handled.body === "string" ? handled.body : JSON.stringify(handled.body));
        return response.end(typeof handled.body === "string" ? handled.body : JSON.stringify(handled.body ?? {}));
      }
      violations.push({
        type: "undeclared-api",
        method: request.method,
        pathname: url.pathname,
        search: url.search,
        record,
      });
      response.writeHead(503, { "Content-Type": "text/plain" });
      return response.end("Undeclared Yanwu test API");
    }
    const candidate = path.resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
    if (candidate.startsWith(`${publicRoot}${path.sep}`)) {
      try {
        const asset = await readFile(candidate);
        response.writeHead(200, { "Content-Type": contentType(candidate) });
        return response.end(asset);
      } catch { /* HTML fallback below. */ }
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(html);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Yanwu host did not bind a TCP port");
  const baseURL = `http://127.0.0.1:${address.port}`;
  return {
    baseURL,
    html,
    apiRequests,
    violations,
    close: async () => {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    },
  };
}
