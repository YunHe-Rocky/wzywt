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

async function compileStyles() {
  const globalsPath = path.resolve(repoRoot, "src/app/globals.css");
  let globals = await readFile(globalsPath, "utf8");
  const imports = [];
  globals = globals.replace(/^@import\s+["']([^"']+)["'];?\s*$/gm, (_match, relativePath) => {
    imports.push(path.resolve(path.dirname(globalsPath), relativePath));
    return "";
  });
  const rootStyles = [
    path.resolve(repoRoot, "src/web/styles/yanwu-tokens.css"),
    ...imports,
  ];
  const layoutStyles = [
    path.resolve(repoRoot, "src/web/styles/arena.css"),
    path.resolve(repoRoot, "src/web/styles/arena-motion.css"),
    path.resolve(repoRoot, "src/web/styles/arena-glass.css"),
  ];
  let styles = "";
  for (const file of rootStyles) styles += `${await readFile(file, "utf8")}\n`;
  styles += globals;
  for (const file of layoutStyles) styles += `\n${await readFile(file, "utf8")}`;
  return (await postcss([tailwindcss]).process(styles, { from: globalsPath })).css;
}

export async function startYanwuHost({ entry, aliases = {}, apiHandlers, output: _output } = {}) {
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
        builder.onLoad({ filter: /.*/ }, args => {
          const normalized = args.path.replaceAll("\\", "/");
          const forbidden = /\/src\/lib\//.test(normalized)
            || /\/src\/app\/api\//.test(normalized)
            || /\/src\/app\/(?:.*\/)?layout\.tsx$/.test(normalized)
            || (/\/src\/features\//.test(normalized) && /\/server(?:\/|\.(?:ts|tsx|js|mjs)$)/.test(normalized));
          if (forbidden) return { errors: [{ text: `Yanwu component host forbids server import: ${path.relative(repoRoot, args.path)}` }] };
          return null;
        });
      },
    }],
  });
  const css = await compileStyles();
  const html = '<!doctype html><html lang="zh-CN" data-theme="yanwu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>';
  const apiRequests = [];
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
        return response.end(typeof handled.body === "string" ? handled.body : JSON.stringify(handled.body ?? {}));
      }
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
    close: async () => {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    },
  };
}
