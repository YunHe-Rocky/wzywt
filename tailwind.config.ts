import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        root: "#10131c",
        nav: "#161922",
        card: "#1e2230",
        hover: "#282e3a",
        input: "#242836",
        border: { DEFAULT: "rgba(255,255,255,0.1)", light: "rgba(255,255,255,0.06)", gold: "rgba(200,170,120,0.15)" },
        text: { DEFAULT: "#e4e6f0", secondary: "#b8bcc8", muted: "#808598" },
        gold: { DEFAULT: "#b89868", light: "#ccb890", dim: "#907848" },
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
