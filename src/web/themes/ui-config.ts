export interface UIConfig {
  name: string;
  headerNav: "full" | "compact";
  mobileNav: "hamburger" | "dock";
  dock: boolean;
  headerHeight: number;
}

export const UI_CONFIG: Record<string, UIConfig> = {
  yanwu: {
    name: "演武 · 峡谷之夜",
    headerNav: "full",
    mobileNav: "dock",
    dock: true,
    headerHeight: 80,
  },
};

export function getUIConfig(_theme?: string): UIConfig {
  return UI_CONFIG.yanwu;
}
