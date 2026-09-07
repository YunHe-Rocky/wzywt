"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArenaIcon, type ArenaIconName } from "@/web/components/arena/ArenaIcon";

const items: { path: string; label: string; icon: ArenaIconName }[] = [
  { path: "/", label: "首页", icon: "home" },
  { path: "/tournaments", label: "赛事", icon: "swords" },
  { path: "/me", label: "我的", icon: "user" },
];

export function Dock() {
  const pathname = usePathname();
  const prefix = /^\/m(?:\/|$)/.test(pathname) ? "/m" : "";
  const basePath = pathname.replace(/^\/m(?=\/|$)/, "") || "/";
  const [subOpen, setSubOpen] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLElement>(null);
  const active = (path: string) => path === "/" ? basePath === "/" : basePath.startsWith(path);
  useEffect(() => { setSubOpen(false); setPendingPath(null); }, [pathname]);
  useEffect(() => {
    if (!pendingPath) return;
    const timer = window.setTimeout(() => setPendingPath(null), 6000);
    return () => window.clearTimeout(timer);
  }, [pendingPath]);
  useEffect(() => {
    if (!subOpen) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setSubOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); setSubOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [subOpen]);
  const selectionPath = pendingPath || basePath;
  const selectedIndex = subOpen || /^\/(heroes|equipment)(\/|$)/.test(selectionPath) ? 2
    : selectionPath === "/" ? 0 : selectionPath.startsWith("/tournaments") ? 1 : selectionPath.startsWith("/me") ? 3 : -1;
  function navItem(item: typeof items[number]) {
    return <Link key={item.path} href={`${prefix}${item.path}`} prefetch={item.path === "/me" ? false : undefined} className={`arena-dock-item ${pendingPath === item.path ? "is-active" : ""}`} aria-current={active(item.path) ? "page" : undefined} onClick={() => { if (!active(item.path)) setPendingPath(item.path); setSubOpen(false); }}><ArenaIcon name={item.icon} /><span>{item.label}</span></Link>;
  }
  return <nav ref={root} className="dock-shell fixed bottom-0 left-0 right-0 flex-col items-center pointer-events-none" aria-label="底部导航" aria-busy={Boolean(pendingPath)}>
    {pendingPath && <div className="dock-route-progress" aria-hidden="true" />}
    {subOpen && <div id="dock-catalog-menu" className="arena-dock-catalog pointer-events-auto">{[{ path: "/heroes", label: "英雄", icon: "crest" as const }, { path: "/equipment", label: "装备", icon: "swords" as const }].map(item => <Link key={item.path} href={`${prefix}${item.path}`} aria-current={active(item.path) ? "page" : undefined} onClick={() => { if (!active(item.path)) setPendingPath(item.path); setSubOpen(false); }}><ArenaIcon name={item.icon} />{item.label}</Link>)}</div>}
    <div className="arena-dock-bar pointer-events-auto"><span className="arena-dock-selection" aria-hidden="true" data-index={selectedIndex} style={{ "--dock-index": Math.max(0, selectedIndex) } as CSSProperties} />{items.slice(0,2).map(navItem)}<button ref={trigger} type="button" className={`arena-dock-item ${active("/heroes") || active("/equipment") || subOpen ? "is-active" : ""}`} aria-label={subOpen ? "关闭图鉴菜单" : "打开图鉴菜单"} aria-expanded={subOpen} aria-controls={subOpen ? "dock-catalog-menu" : undefined} onClick={() => setSubOpen(value => !value)}><ArenaIcon name="book" /><span>图鉴</span></button>{navItem(items[2])}</div>
  </nav>;
}
