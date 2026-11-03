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
        ink: "#ddd0e9", // Soft Cream White — body text (dark)
        "ink-muted": "#b5a3c0", // Muted Lilac — metadata (dark)
        "ink-faint": "#9a8aa8", // decorative ink (dark)

        /* --- Accents --- */
        accent: "#d4af37", // Warm Matte Gold — headings, marks (dark)
        "accent-ink": "#f0e6d2", // text-safe gold on dark (dark)
        "primary-fill": "#1a5e63", // Deep Teal — primary button fill (dark)
        "on-primary": "#ffffff", // white on teal (dark)
        "primary-hover": "#2a7e83",
        "accent-soft": "rgb(212 175 55 / 12%)",

        /* --- Chrome (navigation/UI) --- */
        chrome: "#1a5e63", // Deep Teal — navigation (dark)
        "chrome-ink": "#ffffff", // navigation text (dark)
        "chrome-hover": "#2a7e83",
        "chrome-soft": "rgb(26 94 99 / 10%)",

        /* --- Semantic states --- */
        success: "#2a8f6f",
        "success-ink": "#5fd4a8",
        warning: "#d98a0a",
        "warning-ink": "#f2b84b",
        error: "#d94444",
        "error-fill": "#c0392b",
        "on-error": "#ffffff",
        "error-ink": "#f07070",
        info: "#4a6fa5",
        "info-ink": "#8fb3e8",
      } as const,
    },
  },
  plugins: [],
};

export default config;
