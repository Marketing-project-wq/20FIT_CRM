import type { Config } from "tailwindcss";

/**
 * Tailwind maps design-system tokens (defined in app/globals.css) to utility
 * classes so components reference `bg-red` / `text-ink` / `rounded-card`
 * instead of hex. All colour values resolve to CSS variables, so a single
 * `[data-theme="dark"]` switch re-tints the whole surface.
 */
const config: Config = {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: [
    "./app/**/*.{ts,tsx,mdx}",
    "./components/**/*.{ts,tsx,mdx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        red: "var(--red)",
        blue: "var(--blue)",
        amber: "var(--amber)",
        green: "var(--green)",
        ink: {
          DEFAULT: "var(--ink)",
          soft: "var(--ink-soft)",
          faint: "var(--ink-faint)",
        },
        glass: {
          DEFAULT: "var(--glass)",
          strong: "var(--glass-strong)",
          border: "var(--glass-border)",
        },
        "bg-from": "var(--bg-from)",
        "bg-to": "var(--bg-to)",
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        // 14px = --radius-sm (inputs, small buttons, table container)
        sm: "var(--radius-sm)",
        DEFAULT: "var(--radius-sm)",
        md: "var(--radius-sm)",
        // 22px = --radius (cards, panels, modals)
        lg: "var(--radius)",
        xl: "var(--radius)",
        "2xl": "var(--radius)",
        card: "var(--radius)",
      },
      boxShadow: {
        glass: "var(--shadow-glass)",
        "glass-lg": "var(--shadow-glass-lg)",
      },
      backdropBlur: {
        glass: "var(--blur)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
