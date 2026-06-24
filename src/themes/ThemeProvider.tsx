"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
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
  const [theme, setTheme] = useState<ThemeId>("yanwu");

  useEffect(() => {
    setTheme(getThemeFromHash());

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
