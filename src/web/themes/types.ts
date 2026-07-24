export type ThemeId = "yanwu" | string;

export interface ThemeColors {
  bgRoot: string;
  bgNav: string;
  bgCard: string;
  bgHover: string;
  bgInput: string;
  border: string;
  borderLight: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  gold: string;
  goldLight: string;
  goldDim: string;
  red: string;
  redDim: string;
  blue: string;
  blueDim: string;
  green: string;
  greenDim: string;
}

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  colors: ThemeColors;
  cssPath: string;
}
