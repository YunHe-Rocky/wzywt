"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { getCurrentUser } from "@/features/auth/client/api";
import { HISTORY_PREVIEW_STORAGE_KEY, HISTORY_PREVIEW_STYLES, historyPreviewStyle, parseHistoryPreview, type HistoryPreviewSession } from "@/features/history-theme/preview";
import type { ThemeDetailView } from "@/features/history-theme/presentation";

interface PreviewContext {
  preview: HistoryPreviewSession | null;
  start: (ownerId: number, theme: ThemeDetailView) => Promise<void>;
  end: () => void;
}
const Context = createContext<PreviewContext>({ preview: null, start: async () => { throw new Error("预览暂不可用，请刷新页面"); }, end: () => undefined });
export const useHistoryThemeSession = () => useContext(Context);

export function HistoryThemeSessionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [preview, setPreview] = useState<HistoryPreviewSession | null>(null);
  const current = useRef<HistoryPreviewSession | null>(null);
  const generation = useRef(0);
  const validation = useRef<AbortController | null>(null);

  const cancelValidation = useCallback(() => {
    generation.current++;
    validation.current?.abort();
  }, []);

  const end = useCallback(() => {
    cancelValidation();
    current.current = null;
    setPreview(null);
    try { sessionStorage.removeItem(HISTORY_PREVIEW_STORAGE_KEY); } catch { /* Nothing durable was changed. */ }
  }, [cancelValidation]);

  const verify = useCallback(async (candidate: HistoryPreviewSession, persist: boolean) => {
    const version = ++generation.current;
    validation.current?.abort();
    const controller = new AbortController();
    validation.current = controller;
    try {
      const result = await getCurrentUser(controller.signal);
      if (controller.signal.aborted || version !== generation.current) return false;
      if (!result.ok || result.data.user?.role !== "admin" || result.data.user.userId !== candidate.ownerId) {
        end();
        return false;
      }
      if (persist) sessionStorage.setItem(HISTORY_PREVIEW_STORAGE_KEY, JSON.stringify(candidate));
      current.current = candidate;
      setPreview(candidate);
      return true;
    } catch {
      if (!controller.signal.aborted && version === generation.current) end();
      return false;
    }
  }, [end]);

  const start = useCallback(async (ownerId: number, theme: ThemeDetailView) => {
    const now = Date.now();
    const candidate = parseHistoryPreview(JSON.stringify({ ownerId, now, theme: {
      ...theme, reviewedAt: null,
      startsAt: new Date(now - 1000).toISOString(), endsAt: new Date(now + 7 * 86400_000).toISOString(),
    } }));
    if (!candidate) throw new Error("预览内容无效或过大，请检查后重试");
    if (!await verify(candidate, true)) throw new Error("无法开启预览，请确认超管登录状态及浏览器会话存储可用");
  }, [verify]);

  useEffect(() => {
    let retained: HistoryPreviewSession | null = null;
    try { retained = parseHistoryPreview(sessionStorage.getItem(HISTORY_PREVIEW_STORAGE_KEY)); } catch { /* Storage may be disabled. */ }
    if (retained) void verify(retained, false);
    else end();
    return cancelValidation;
  }, [cancelValidation, end, verify]);

  useEffect(() => {
    const recheck = () => { if (current.current) void verify(current.current, false); };
    const visible = () => { if (!document.hidden) recheck(); };
    window.addEventListener("wzywt:auth-identity-changed", end);
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", visible);
    recheck();
    return () => {
      window.removeEventListener("wzywt:auth-identity-changed", end);
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [end, pathname, verify]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (preview) {
      root.dataset.historyPreviewStyle = historyPreviewStyle(preview.theme);
      root.dataset.historyPreviewTone = preview.theme.tone;
    } else {
      delete root.dataset.historyPreviewStyle;
      delete root.dataset.historyPreviewTone;
    }
    return () => { delete root.dataset.historyPreviewStyle; delete root.dataset.historyPreviewTone; };
  }, [preview]);

  const prefix = /^\/m(?:\/|$)/.test(pathname) ? "/m" : "";
  return <Context.Provider value={{ preview, start, end }}>
    {preview && <aside className="history-session-bar" aria-label="临时主题预览">
      <div><strong>{HISTORY_PREVIEW_STYLES[historyPreviewStyle(preview.theme)].name} · 临时预览</strong><span>仅自己可见 · 关闭此标签页后结束</span></div>
      <nav aria-label="预览操作"><Link href={prefix || "/"}>查看首页</Link><Link href={`${prefix}/admin/history-themes`}>编辑主题</Link><button type="button" onClick={end}>结束预览</button></nav>
    </aside>}
    {children}
  </Context.Provider>;
}
