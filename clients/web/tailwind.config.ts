import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        sur: {
          bg: "var(--sur-bg)",
          surface: "var(--sur-surface)",
          border: "var(--sur-border)",
          text: "var(--sur-text)",
          muted: "var(--sur-muted)",
          accent: "var(--sur-accent)",
          green: "var(--sur-green)",
          red: "var(--sur-red)",
          yellow: "var(--sur-yellow)",
        },
        sol: {
          purple: "var(--sol-purple)",
          purpleDeep: "var(--sol-purple-deep)",
          green: "var(--sol-green)",
        },
        ink: "var(--ink)",
        smoke: "var(--smoke)",
        ash: "var(--ash)",
        bone: "var(--bone)",
        gold: "var(--gold)",
        rust: "var(--rust)",
      },
      fontFamily: {
        sans: [
          "Inter",
          "DM Sans",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "SF Mono", "Fira Code", "monospace"],
        display: ["Georgia", "ui-serif", "Cambria", "serif"],
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
        "slide-up": "slide-up 0.3s ease-out",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(-8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
