export interface UIConfig {
  name: string;
  headerNav: "full" | "compact";
  mobileNav: "hamburger" | "dock";
  dock: boolean;
  headerHeight: number;
}

export const UI_CONFIG: Record<string, UIConfig> = {
  yanwu: {
    name: "厚玻璃",
    headerNav: "compact",
    mobileNav: "dock",
    dock: true,
    headerHeight: 34,
  },
};

export function getUIConfig(_theme?: string): UIConfig {
  return UI_CONFIG.yanwu;
}
