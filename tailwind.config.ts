import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        root: "#161920",
        nav: "#1b1e27",
        card: "#242833",
        hover: "#2d3240",
        input: "#2a2f3b",
        border: { DEFAULT: "rgba(255,255,255,0.08)", light: "rgba(255,255,255,0.05)", gold: "rgba(168,144,104,0.12)" },
        text: { DEFAULT: "#e0e3ea", secondary: "#b0b4be", muted: "#777b88" },
        gold: { DEFAULT: "#a89068", light: "#c0b090", dim: "#807050" },
        red: { DEFAULT: "#cc6666", dim: "#994444" },
        blue: { DEFAULT: "#6898cc", dim: "#4a7099" },
        green: { DEFAULT: "#78b878", dim: "#508a50" },
      },
      borderRadius: {
        sm: "6px",
        DEFAULT: "6px",
        lg: "8px",
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
