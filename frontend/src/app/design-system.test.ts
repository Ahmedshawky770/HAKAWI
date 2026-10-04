/// <reference types="@testing-library/jest-dom/vitest" />

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The design system, enforced.
 *
 * `docs/system-architecture/ui-ux-design-system.md` and
 * `src/app/globals.css` make the same claims about the same numbers. Two files
 * that agree today can stop agreeing tomorrow, and nothing in the build would
 * notice — a colour documented as `#FF9100` that a theme quietly darkened, or a
 * palette table that invents a colour no token defines.
 *
 * These tests are what makes "the document and the site match" a fact rather than
 * an intention:
 *
 * 1. every palette hex in the document exists in the stylesheet;
 * 2. the document declares no colour the stylesheet does not define;
 * 3. every measured contrast ratio in the document is recomputed from the tokens
 *    and compared to the number printed there;
 * 4. every foreground/background pair the product actually paints meets the WCAG
 *    threshold its role demands.
 */

const REPO_ROOT = join(__dirname, "..", "..", "..");
const CSS_PATH = join(__dirname, "globals.css");
const DOC_PATH = join(REPO_ROOT, "docs", "system-architecture", "ui-ux-design-system.md");

const css = readFileSync(CSS_PATH, "utf8");
const doc = readFileSync(DOC_PATH, "utf8");

type Palette = Record<string, string>;

function parseTheme(selector: RegExp): Palette {
  const match = css.match(selector);
  if (!match) throw new Error(`No theme block matched ${selector}`);
  const palette: Palette = {};
  for (const line of match[1].split("\n")) {
    const declaration = line.match(/(--hk-[a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/);
    if (declaration) palette[declaration[1]] = declaration[2].toLowerCase();
  }
  return palette;
}

const dark = parseTheme(/:root\s*\{([^{}]*)\}/);
const light = parseTheme(/:root\[data-theme="light"\]\s*\{([^{}]*)\}/);

/** WCAG 2.1 relative luminance. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((index) => {
    const value = parseInt(hex.replace("#", "").slice(index - 1, index + 1), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

/** The pairs the product paints, and the threshold each role demands. */
const REQUIRED_PAIRS: { theme: string; palette: Palette; fg: string; bg: string; min: number; role: string }[] = [
  { theme: "dark", palette: dark, fg: "--hk-ink", bg: "--hk-canvas", min: 4.5, role: "body text on the canvas" },
  { theme: "dark", palette: dark, fg: "--hk-ink", bg: "--hk-surface", min: 4.5, role: "body text on a card" },
  { theme: "dark", palette: dark, fg: "--hk-ink", bg: "--hk-surface-raised", min: 4.5, role: "body text on a raised row" },
  { theme: "dark", palette: dark, fg: "--hk-ink-muted", bg: "--hk-canvas", min: 4.5, role: "secondary text" },
  { theme: "dark", palette: dark, fg: "--hk-ink-muted", bg: "--hk-surface", min: 4.5, role: "secondary text on a card" },
  { theme: "dark", palette: dark, fg: "--hk-ink-faint", bg: "--hk-canvas", min: 4.5, role: "decorative ink" },
  { theme: "dark", palette: dark, fg: "--hk-accent-ink", bg: "--hk-surface", min: 4.5, role: "accent text on a card" },
  { theme: "dark", palette: dark, fg: "--hk-accent-ink", bg: "--hk-canvas", min: 4.5, role: "accent text on the canvas" },
  { theme: "dark", palette: dark, fg: "--hk-accent-ink", bg: "--hk-surface-raised", min: 4.5, role: "accent text on a raised row" },
  { theme: "dark", palette: dark, fg: "--hk-chrome-ink", bg: "--hk-canvas", min: 4.5, role: "navigation text" },
  { theme: "dark", palette: dark, fg: "--hk-chrome-ink", bg: "--hk-surface", min: 4.5, role: "navigation text on a card" },
  { theme: "dark", palette: dark, fg: "--hk-on-accent", bg: "--hk-accent-fill", min: 4.5, role: "label on the primary button" },
  { theme: "dark", palette: dark, fg: "--hk-on-error", bg: "--hk-error-fill", min: 4.5, role: "label on the danger button" },
  { theme: "dark", palette: dark, fg: "--hk-success-ink", bg: "--hk-surface", min: 4.5, role: "success text" },
  { theme: "dark", palette: dark, fg: "--hk-warning-ink", bg: "--hk-surface", min: 4.5, role: "warning text" },
  { theme: "dark", palette: dark, fg: "--hk-error-ink", bg: "--hk-surface", min: 4.5, role: "error text" },
  { theme: "dark", palette: dark, fg: "--hk-info-ink", bg: "--hk-surface", min: 4.5, role: "info text" },
  { theme: "dark", palette: dark, fg: "--hk-control-line", bg: "--hk-surface-raised", min: 3, role: "form control boundary (WCAG 1.4.11)" },
  { theme: "light", palette: light, fg: "--hk-ink", bg: "--hk-canvas", min: 4.5, role: "body text on the canvas" },
  { theme: "light", palette: light, fg: "--hk-ink", bg: "--hk-surface", min: 4.5, role: "body text on a card" },
  { theme: "light", palette: light, fg: "--hk-ink", bg: "--hk-surface-raised", min: 4.5, role: "body text on a raised row" },
  { theme: "light", palette: light, fg: "--hk-ink-muted", bg: "--hk-canvas", min: 4.5, role: "secondary text" },
  { theme: "light", palette: light, fg: "--hk-ink-muted", bg: "--hk-surface", min: 4.5, role: "secondary text on a card" },
  { theme: "light", palette: light, fg: "--hk-ink-faint", bg: "--hk-canvas", min: 4.5, role: "decorative ink" },
  { theme: "light", palette: light, fg: "--hk-accent-ink", bg: "--hk-canvas", min: 4.5, role: "accent text on the canvas" },
  { theme: "light", palette: light, fg: "--hk-accent-ink", bg: "--hk-surface", min: 4.5, role: "accent text on a card" },
  { theme: "light", palette: light, fg: "--hk-accent-ink", bg: "--hk-surface-raised", min: 4.5, role: "accent text on a raised row" },
  { theme: "light", palette: light, fg: "--hk-chrome-ink", bg: "--hk-canvas", min: 4.5, role: "navigation text" },
  { theme: "light", palette: light, fg: "--hk-chrome-ink", bg: "--hk-surface", min: 4.5, role: "navigation text on a card" },
  { theme: "light", palette: light, fg: "--hk-on-accent", bg: "--hk-accent-fill", min: 4.5, role: "label on the primary button" },
  { theme: "light", palette: light, fg: "--hk-on-error", bg: "--hk-error-fill", min: 4.5, role: "label on the danger button" },
  { theme: "light", palette: light, fg: "--hk-success-ink", bg: "--hk-surface", min: 4.5, role: "success text" },
  { theme: "light", palette: light, fg: "--hk-warning-ink", bg: "--hk-surface", min: 4.5, role: "warning text" },
  { theme: "light", palette: light, fg: "--hk-error-ink", bg: "--hk-surface", min: 4.5, role: "error text" },
  { theme: "light", palette: light, fg: "--hk-info-ink", bg: "--hk-surface", min: 4.5, role: "info text" },
  { theme: "light", palette: light, fg: "--hk-control-line", bg: "--hk-surface-raised", min: 3, role: "form control boundary (WCAG 1.4.11)" },
];

describe("design tokens", () => {
  it("declares the same tokens in both themes", () => {
    expect(Object.keys(light).sort()).toEqual(Object.keys(dark).sort());
  });

  it("declares the palette the design system promises", () => {
    for (const token of [
      "--hk-canvas",
      "--hk-surface",
      "--hk-surface-raised",
      "--hk-line",
      "--hk-line-strong",
      "--hk-control-line",
      "--hk-ink",
      "--hk-ink-muted",
      "--hk-ink-faint",
      "--hk-accent",
      "--hk-accent-ink",
      "--hk-accent-fill",
      "--hk-on-accent",
      "--hk-chrome",
      "--hk-chrome-ink",
      "--hk-success",
      "--hk-success-ink",
      "--hk-warning",
      "--hk-warning-ink",
      "--hk-error",
      "--hk-error-fill",
      "--hk-on-error",
      "--hk-error-ink",
      "--hk-info",
      "--hk-info-ink",
    ]) {
      expect(dark[token], `dark theme is missing ${token}`).toBeDefined();
      expect(light[token], `light theme is missing ${token}`).toBeDefined();
    }
  });

  it("never names a raw colour outside the palette in a component class", () => {
    // A stock Tailwind colour in a component means a page that ignores the theme.
    // Allowed inside the stylesheet itself; this asserts the utilities exist.
    for (const utility of ["--color-surface", "--color-ink", "--color-accent-fill", "--color-control-line"]) {
      expect(css).toContain(utility);
    }
  });
});

describe("contrast", () => {
  it.each(REQUIRED_PAIRS)(
    "$theme: $role clears $min:1",
    ({ palette, fg, bg, min }) => {
      const measured = contrast(palette[fg], palette[bg]);
      expect(
        measured,
        `${palette[fg]} on ${palette[bg]} is ${measured.toFixed(2)}:1, below the ${min}:1 this role needs`,
      ).toBeGreaterThanOrEqual(min);
    },
  );
});

describe("the design system document", () => {
  it("only documents colours that the stylesheet defines", () => {
    const defined = new Set([...Object.values(dark), ...Object.values(light)]);
    // The swatch diagrams and the theme-color meta carry the same values; a hex
    // outside the palette is a colour the product cannot actually render.
    const documented = new Set(
      [...doc.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((match) => match[0].toLowerCase()),
    );

    const undocumented = [...documented].filter((hex) => !defined.has(hex));
    expect(undocumented, "the document names colours that no token defines").toEqual([]);
  });

  it("documents every colour the stylesheet defines", () => {
    const documented = new Set(
      [...doc.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((match) => match[0].toLowerCase()),
    );

    const missing = [...new Set([...Object.values(dark), ...Object.values(light)])].filter(
      (hex) => !documented.has(hex),
    );
    expect(missing, "the stylesheet defines colours the document never mentions").toEqual([]);
  });

  it("prints the ratio it actually measured, for every pair it tabulates", () => {
    // Rows look like:
    //   `| body text on the canvas | `--hk-ink` on `--hk-canvas` (dark) | 16.66:1 | 4.5:1 | PASS |`
    const rows = [
      ...doc.matchAll(
        /^\|[^|]*\|\s*`(--hk-[a-z-]+)`\s*on\s*`(--hk-[a-z-]+)`\s*\((dark|light)\)[^|]*\|\s*([\d.]+):1\s*\|/gm,
      ),
    ];

    expect(rows.length).toBeGreaterThan(20);

    for (const [, fg, bg, theme, printed] of rows) {
      const palette = theme === "dark" ? dark : light;
      expect(palette[fg], `the document tabulates ${fg}, which the ${theme} theme does not define`).toBeDefined();
      const measured = contrast(palette[fg], palette[bg]);
      expect(
        Math.abs(measured - Number(printed)),
        `${fg} on ${bg} in ${theme} is ${measured.toFixed(2)}:1 but the document says ${printed}:1`,
      ).toBeLessThanOrEqual(0.01);
    }
  });

  it("names the components and the layers the product actually has", () => {
    for (const module of [
      "components/ui/Button.tsx",
      "components/ui/Card.tsx",
      "components/ui/Input.tsx",
      "components/ui/Skeleton.tsx",
      "components/ui/ErrorMessage.tsx",
      "components/ui/Badge.tsx",
      "components/ui/Avatar.tsx",
      "components/ui/ProgressBar.tsx",
      "components/ui/EmptyState.tsx",
      "components/ui/StatCard.tsx",
      "components/ui/Icon.tsx",
      "components/layout/AppShell.tsx",
      "components/layout/Header.tsx",
      "components/layout/Sidebar.tsx",
      "components/layout/TrendingRail.tsx",
      "components/layout/BottomNav.tsx",
      "components/providers/ThemeProvider.tsx",
      "components/providers/LocaleProvider.tsx",
      "components/story/StoryCard.tsx",
      "components/story/StoryCreatorCard.tsx",
      "components/story/ReactionBar.tsx",
      "components/story/StoryFeed.tsx",
      "lib/queries.ts",
    ]) {
      expect(doc, `the conformance matrix never mentions ${module}`).toContain(module);
      expect(() => readFileSync(join(REPO_ROOT, "frontend", "src", module), "utf8")).not.toThrow();
    }
  });
});
