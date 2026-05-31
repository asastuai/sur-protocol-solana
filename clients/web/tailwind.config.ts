import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Legacy SUR raw tokens (keep for existing components: bg-sur-*, etc.)
        sur: {
          bg: "var(--sur-bg)",
          surface: "var(--sur-surface)",
          "surface-2": "var(--sur-surface-2)",
          elevated: "var(--sur-elevated)",
          border: "var(--sur-border)",
          text: "var(--sur-text)",
          muted: "var(--sur-muted)",
          accent: "var(--sur-accent)",
          green: "var(--sur-green)",
          red: "var(--sur-red)",
          yellow: "var(--sur-yellow)",
        },
        // shadcn-style semantic tokens (used by ported FRONT components)
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--popover) / <alpha-value>)",
          foreground: "hsl(var(--popover-foreground) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        ring: "hsl(var(--ring) / <alpha-value>)",
        // Trading direction colors
        long: {
          DEFAULT: "hsl(var(--long) / <alpha-value>)",
          foreground: "hsl(var(--long-foreground) / <alpha-value>)",
        },
        short: {
          DEFAULT: "hsl(var(--short) / <alpha-value>)",
          foreground: "hsl(var(--short-foreground) / <alpha-value>)",
        },
        // Glass tokens (used by .glass-panel and custom utilities)
        glass: {
          DEFAULT: "var(--glass)",
          border: "var(--glass-border)",
        },
      },
      backgroundImage: {
        "sur-gradient": "var(--sur-gradient)",
        "sol-gradient": "var(--sol-gradient)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        "glow-primary": "none",
        "glow-long": "none",
        "glow-short": "none",
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
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
        "slide-up": "slide-up 0.3s ease-out",
        "pulse-dot": "pulse-dot 2s ease-in-out infinite",
        "flash-bid": "flash-bid 600ms ease-out",
        "flash-ask": "flash-ask 600ms ease-out",
        "flash-bid-increase": "flash-bid-increase 600ms ease-out",
        "flash-ask-increase": "flash-ask-increase 600ms ease-out",
        "flash-new-trade": "flash-new-trade 700ms ease-out",
        "pulse-size": "pulse-size 600ms ease-out",
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
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
        "flash-bid": {
          "0%": { backgroundColor: "rgba(14, 203, 129, 0.2)" },
          "100%": { backgroundColor: "transparent" },
        },
        "flash-ask": {
          "0%": { backgroundColor: "rgba(246, 70, 93, 0.2)" },
          "100%": { backgroundColor: "transparent" },
        },
        "flash-bid-increase": {
          "0%, 40%": { backgroundColor: "rgba(14, 203, 129, 0.25)" },
          "100%": { backgroundColor: "transparent" },
        },
        "flash-ask-increase": {
          "0%, 40%": { backgroundColor: "rgba(246, 70, 93, 0.25)" },
          "100%": { backgroundColor: "transparent" },
        },
        "flash-new-trade": {
          "0%": { opacity: "1" },
          "10%": { backgroundColor: "rgba(30, 128, 255, 0.15)" },
          "100%": { backgroundColor: "transparent" },
        },
        "pulse-size": {
          "0%, 20%": { transform: "scale(1.05)", filter: "brightness(1.3)" },
          "100%": { transform: "scale(1)", filter: "brightness(1)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
