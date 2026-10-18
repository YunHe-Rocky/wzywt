import React, { useEffect, useMemo, useState } from "react";

function navigate(href: string, replace = false) {
  if (replace) history.replaceState({}, "", href);
  else history.pushState({}, "", href);
  window.dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
}

export default function Link({ href, onClick, children, prefetch: _prefetch, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }) {
  return <a href={href} {...props} onClick={(event) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(href);
  }}>{children}</a>;
}

export function usePathname() {
  const [pathname, setPathname] = useState(() => location.pathname);
  useEffect(() => {
    const sync = () => setPathname(location.pathname);
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  return pathname;
}

export function useSearchParams() {
  const [search, setSearch] = useState(() => location.search);
  useEffect(() => {
    const sync = () => setSearch(location.search);
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  return useMemo(() => new URLSearchParams(search), [search]);
}

export function useParams() { return {}; }

export function useRouter() {
  return useMemo(() => ({
    push: (href: string) => navigate(href),
    replace: (href: string) => navigate(href, true),
    back: () => history.back(),
    refresh: () => window.dispatchEvent(new PopStateEvent("popstate", { state: history.state })),
    prefetch: (href: string) => {
      const state = globalThis as typeof globalThis & { __yanwuPrefetches?: string[] };
      state.__yanwuPrefetches ??= [];
      state.__yanwuPrefetches.push(href);
      return Promise.resolve();
    },
  }), []);
}
