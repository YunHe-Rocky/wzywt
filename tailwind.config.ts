import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        root: "#06080f",
        nav: "#0a0e1a",
        card: "#0e1224",
        hover: "#161d3a",
        input: "#0c1020",
        border: { DEFAULT: "#1a2040", light: "#141a34", gold: "rgba(240,192,64,0.15)" },
        text: { DEFAULT: "#e8e8f0", secondary: "#9098b8", muted: "#5a6080" },
        gold: { DEFAULT: "#f0c040", light: "#f5d060", dim: "#c89820" },
        red: { DEFAULT: "#e05050", dim: "#b03030" },
        blue: { DEFAULT: "#5090d0", dim: "#3068a0" },
        green: { DEFAULT: "#50b050", dim: "#308030" },
      },
      borderRadius: {
        sm: "6px",
        DEFAULT: "8px",
        lg: "12px",
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
