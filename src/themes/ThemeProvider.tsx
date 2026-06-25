"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import type { ThemeId } from "./types";

const HASH_THEME_MAP: Record<string, ThemeId> = {
  "#1": "yanwu",
  "#2": "alternate",
};

interface ThemeContextValue {
  theme: ThemeId;
}

const ThemeContext = createContext<ThemeContextValue>({ theme: "yanwu" });

export function useTheme() {
  return useContext(ThemeContext);
}

function getThemeFromHash(): ThemeId {
  if (typeof window === "undefined") return "yanwu";
  return HASH_THEME_MAP[window.location.hash] || "yanwu";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeId>(getThemeFromHash);

  useLayoutEffect(() => {
    const t = getThemeFromHash();
    document.documentElement.setAttribute("data-theme", t);
    if (t !== theme) setTheme(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onHashChange() {
      setTheme(getThemeFromHash());
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme }}>
      {children}
    </ThemeContext.Provider>
  );
}
