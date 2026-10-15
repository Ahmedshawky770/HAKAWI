/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { DEFAULT_LOCALE } from "@/lib/preferences";
import { stringsFor } from "@/lib/i18n";
import { renderWithProviders } from "@/test-utils/render";
import { SkipLink } from "@/components/layout/SkipLink";

/**
 * The skip link reads its label from the locale provider, which is the one
 * component the root layout cannot wrap itself (it owns `<html>`). This suite is
 * the contract that it does: without `<LocaleProvider>` the anchor throws
 * `useLocale must be used inside <LocaleProvider>` instead of rendering, and the
 * link is invisible to a keyboard reader.
 */
describe("SkipLink", () => {
  it("renders a link to the main content landmark", () => {
    renderWithProviders(<SkipLink />);

    expect(screen.getByRole("link")).toHaveAttribute("href", "#main-content");
  });

  it("names the link with the skip label in the default locale", () => {
    renderWithProviders(<SkipLink />);

    expect(screen.getByRole("link", { name: stringsFor(DEFAULT_LOCALE).shell.skipToContent })).toBeInTheDocument();
  });

  it("throws when it is rendered outside the provider, naming the provider it needs", () => {
    // The root layout is the only place that renders it; if the layout ever
    // moves it back out of `<Providers>` this is the message the reader gets
    // instead of a skip link, so the contract is asserted directly here rather
    // than only through the layout suite.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(() => render(<SkipLink />)).toThrow(/useLocale must be used inside <LocaleProvider>/);

    consoleError.mockRestore();
  });

  it("carries the class the stylesheet reveals on keyboard focus", () => {
    renderWithProviders(<SkipLink />);

    expect(screen.getByRole("link").className).toContain("hk-skip-link");
  });

  it("paints nothing itself: the focused state is the stylesheet's job", () => {
    // The link carries only `hk-skip-link`; every colour and box property comes
    // from `.hk-skip-link:focus-visible` in globals.css. jsdom applies no
    // stylesheet, so the pairing (accent fill + on-accent text, the pair §4.6
    // tabulates at 8.70:1 and 5.18:1) is asserted where the CSS can be read:
    // `design-system.test.ts`, which would fail if this block painted a token no
    // theme defines — the bug that shipped `--hk-accent-strong`.
    renderWithProviders(<SkipLink />);

    const link = screen.getByRole("link");
    expect(link.getAttribute("style")).toBeNull();
    expect([...link.classList]).toEqual(["hk-skip-link"]);
  });
});
