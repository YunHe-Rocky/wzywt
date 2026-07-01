"use client";

import { createContext, useContext, useEffect, useLayoutEffect, type ReactNode } from "react";
import type { ThemeId } from "./types";

interface ThemeContextValue {
  theme: ThemeId;
}

const ThemeContext = createContext<ThemeContextValue>({ theme: "yanwu" });

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-theme", "yanwu");
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: "yanwu" }}>
      {children}
    </ThemeContext.Provider>
  );
}
