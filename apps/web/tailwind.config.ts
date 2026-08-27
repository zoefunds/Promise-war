// "Obsidian Verdict" design system — ported from Documents/Promise-war/DESIGN.md
// Kept as the single source of truth for color/type/spacing tokens so every
// page shares the same "Glass-Terminal" cyberpunk-courtroom aesthetic.
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "#0A0C10",
        surface: "#161B22",
        "surface-container": "#1e2024",
        "surface-container-low": "#1a1c20",
        "surface-container-lowest": "#0c0e12",
        "surface-container-high": "#282a2e",
        "surface-container-highest": "#333539",
        "on-surface": "#F0F6FC",
        "on-surface-variant": "#8B949E",
        outline: "#849495",
        "outline-variant": "#3b494b",
        primary: "#00F0FF",
        "on-primary": "#00363a",
        "primary-fixed-dim": "#00dbe9",
        secondary: "#00FFAB",
        "on-secondary": "#003822",
        challenge: "#FF3B3B",
        error: "#ffb4ab",
        gold: "#FFD700",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      borderRadius: {
        DEFAULT: "0.25rem",
        lg: "0.5rem",
        xl: "0.75rem",
        full: "9999px",
      },
      spacing: {
        "margin-desktop": "48px",
        "margin-mobile": "16px",
        gutter: "24px",
        "container-max": "1440px",
      },
      boxShadow: {
        "glow-cyan": "0 0 15px rgba(0,240,255,0.4)",
        "glow-green": "0 0 12px rgba(0,255,171,0.25)",
        "glow-red": "0 0 12px rgba(255,59,59,0.25)",
      },
    },
  },
  plugins: [],
};
export default config;
