// 双 UI 系统独立配置 — 每个主题是一套完整的 UI 环境，互不干扰

export interface UIConfig {
  name: string;
  /** Header 导航：full=完整导航栏 | compact=简洁版 */
  headerNav: "full" | "compact";
  /** 手机端导航方式 */
  mobileNav: "hamburger" | "dock";
  /** 是否显示 Dock */
  dock: boolean;
  /** Header 高度 */
  headerHeight: number;
}

export const UI_CONFIG: Record<string, UIConfig> = {
  yanwu: {
    name: "演武",
    headerNav: "full",
    mobileNav: "hamburger",
    dock: false,
    headerHeight: 56,
  },
  alternate: {
    name: "厚玻璃",
    headerNav: "compact",
    mobileNav: "dock",
    dock: true,
    headerHeight: 34,
  },
};

export function getUIConfig(theme: string): UIConfig {
  return UI_CONFIG[theme] || UI_CONFIG.yanwu;
}
