import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        root: "var(--bg-root)",
        nav: "var(--bg-nav)",
        card: "var(--bg-card)",
        hover: "var(--bg-hover)",
        input: "var(--bg-input)",
        border: {
          DEFAULT: "var(--border)",
          light: "var(--border-light)",
          gold: "var(--border-gold)",
        },
        text: {
          DEFAULT: "var(--text)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
        },
        gold: {
          DEFAULT: "var(--gold)",
          light: "var(--gold-light)",
          dim: "var(--gold-dim)",
        },
        red: { DEFAULT: "var(--red)", dim: "var(--red-dim)" },
        blue: { DEFAULT: "var(--blue)", dim: "var(--blue-dim)" },
        green: { DEFAULT: "var(--green)", dim: "var(--green-dim)" },
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
