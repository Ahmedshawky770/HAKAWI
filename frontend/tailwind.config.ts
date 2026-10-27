/**
 * HAKAWI — Tailwind CSS theme extension.
 *
 * NOTE: This project runs Tailwind v4 in CSS-first mode. The authoritative
 * token source is `frontend/src/app/globals.css` (`@theme inline` block),
 * not this file. This `tailwind.config.ts` exists as a documented extension
 * point and a single source of truth for the theme values; it mirrors the
 * CSS custom properties in `globals.css` so the two cannot silently drift.
 *
 * If Tailwind v4 ever reads this file, the values here must match
 * `globals.css` exactly. The design-system test (`design-system.test.ts`)
 * enforces that the document and the stylesheet agree.
 */

import type { Config } from "tailwindcss";

const config: Config = {
  theme: {
    extend: {
      colors: {
        /* --- Surfaces (60/30 of 60-30-10) --- */
        canvas: "#140a1f", // Deep Eggplant Velvet — page background (dark)
        surface: "#1f122b", // Elevated Velvet Purple — cards, panels (dark)
        "surface-raised": "#2b1a40", // one step up (dark)
        line: "#3a2e4e", // Velvet Divider (dark)
        "line-strong": "#4a3e5e", // emphasised edges (dark)
        "control-line": "#8a7a9a", // form control boundary, 3:1+ (dark)

        /* --- Ink (text) --- */
        ink: "#f5f5f0", // Soft Cream White — body text (dark)
        "ink-muted": "#c9b8d6", // Muted Lilac — metadata (dark)
        "ink-faint": "#9a8aa8", // decorative ink (dark)

        /* --- Accents --- */
        accent: "#d4af37", // Warm Matte Gold — headings, marks (dark)
        "accent-ink": "#f0e6d2", // text-safe gold on dark (dark)
        "accent-fill": "#1a5e63", // Deep Teal — primary button fill (dark)
        "on-accent": "#ffffff", // white on teal (dark)
        "accent-hover": "#2a7e83",
        "accent-soft": "rgb(212 175 55 / 12%)",

        /* --- Chrome (navigation/UI) --- */
        chrome: "#1a5e63", // Deep Teal — navigation (dark)
        "chrome-ink": "#ffffff", // navigation text (dark)
        "chrome-hover": "#2a7e83",
        "chrome-soft": "rgb(26 94 99 / 10%)",

        /* --- Semantic states --- */
        success: "#10b981",
        "success-ink": "#34d399",
        warning: "#f59e0b",
        "warning-ink": "#fbbf24",
        error: "#ef4444",
        "error-fill": "#dc2626",
        "on-error": "#ffffff",
        "error-ink": "#f87171",
        info: "#3b82f6",
        "info-ink": "#7dabff",
      } as const,
    },
  },
  plugins: [],
};

export default config;
