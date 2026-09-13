import type { Config } from "tailwindcss"

/**
 * Tailwind scans every Plasmo entry point and shared React module under `src`.
 * Class-based dark mode lets the settings store control theme choice across
 * isolated extension documents without relying on the host website.
 */
const config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      /**
       * CSS-variable colors keep reusable components independent from a
       * particular surface and allow accessible light/dark palettes later.
       */
      colors: {
        background: "rgb(var(--color-background) / <alpha-value>)",
        foreground: "rgb(var(--color-foreground) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        border: "rgb(var(--color-border) / <alpha-value>)",
        primary: {
          DEFAULT: "rgb(var(--color-primary) / <alpha-value>)",
          foreground: "rgb(var(--color-primary-foreground) / <alpha-value>)",
        },
        danger: {
          DEFAULT: "rgb(var(--color-danger) / <alpha-value>)",
          foreground: "rgb(var(--color-danger-foreground) / <alpha-value>)",
        },
      },
      /**
       * Shared shadows and motion durations make compact extension surfaces
       * visually consistent while respecting reduced-motion styles in CSS.
       */
      boxShadow: {
        panel: "0 16px 40px rgb(20 35 28 / 0.18)",
      },
      transitionDuration: {
        fast: "150ms",
      },
    },
  },
  plugins: [],
} satisfies Config

export default config
