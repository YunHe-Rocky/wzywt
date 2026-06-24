import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        root: "#0a0a10",
        nav: "#111118",
        card: "#181824",
        hover: "#202030",
        border: "#282836",
        text: { DEFAULT: "#e4e4ec", secondary: "#828296", muted: "#56566a" },
        gold: { DEFAULT: "#c8a95a", light: "#dcc07a", dim: "#a08840" },
        red: { DEFAULT: "#e05050", dim: "#b03030" },
        blue: { DEFAULT: "#5090d0", dim: "#3068a0" },
        green: { DEFAULT: "#50b050", dim: "#308030" },
      },
      fontFamily: {
        sans: ['"PingFang SC"', '"Microsoft YaHei"', 'sans-serif'],
      },
      animation: {
        "fade-in": "fade-in 0.3s ease-out",
        "slide-up": "slide-up 0.35s ease-out",
        shimmer: "shimmer 1.5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
