"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { ThemeId } from "./types";

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "yanwu",
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children, initial = "yanwu" }: {
  children: ReactNode;
  initial?: ThemeId;
}) {
  const [theme, setTheme] = useState<ThemeId>(initial);

  useEffect(() => {
    const stored = localStorage.getItem("theme") as ThemeId | null;
    if (stored) setTheme(stored);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
