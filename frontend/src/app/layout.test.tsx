/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { stringsFor } from "@/lib/i18n";
import RootLayout from "./layout";

// `next/font/google` resolves typefaces through the Next build context, which a
// unit test does not have; the class string is the only thing the layout does
// with it.
vi.mock("./fonts", () => ({ designFonts: "design-fonts" }));

/**
 * `TitleMirror` is asserted through a stand-in rather than through its effect:
 * it renders nothing, so the only observable proof that the layout wired it is
 * that the layout rendered it at all. What it DOOES has its own suite
 * (`TitleMirror.test.tsx`, including the regression it closes: the Arabic root
 * title reappearing in the tab after an English reader navigates). Where it
 * SITS — inside the provider tree, because it reads `LocaleContext` — has this
 * one.
 */
vi.mock("@/components/providers/TitleMirror", () => ({
  TitleMirror: () => <div data-testid="title-mirror" />,
}));

/**
 * The root layout is where the skip Link stops being a component and becomes a
 * wiring decision.
 *
 * `SkipLink` reads `LocaleContext`, so it must render INSIDE `<Providers>` —
 * the provider that mounts `LocaleProvider` is also what makes the anchor
 * legal at all. As a sibling of `<Providers>` the anchor throws
 * `useLocale must be used inside <LocaleProvider>` on every route of the app,
 * and no component-level test renders the layout, so this suite is the only
 * thing standing between that mistake and a white screen. It is also the one
 * place the English label is asserted through the real provider tree rather
 * than through a probe.
 */
describe("RootLayout", () => {
  // `params` is the App Router's route-param promise; the root layout has none
  // to resolve, and the type still demands the prop.
  const noParams = Promise.resolve({});

  it("renders the skip Link inside the providers, named in the default locale", () => {
    render(
      <RootLayout params={noParams}>
        <div>page content</div>
      </RootLayout>,
    );

    const link = screen.getByRole("link", { name: stringsFor("ar").shell.skipToContent });
    expect(link).toHaveAttribute("href", "#main-content");

    // The providers wrapped the page rather than throwing: the children rendered.
    expect(screen.getByText("page content")).toBeInTheDocument();
  });

  it("renders the skip Link as the first focusable element of the body", () => {
    render(
      <RootLayout params={noParams}>
        <a href="/elsewhere">a page link</a>
      </RootLayout>,
    );

    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "#main-content");
  });

  it("wires the title mirror inside the providers, not beside them", () => {
    render(
      <RootLayout params={noParams}>
        <div>page content</div>
      </RootLayout>,
    );

    // As a sibling of `<Providers>` the mirror's `useLocale()` throws and every
    // route of the app loses its title in the reader's language — the same
    // wiring mistake the skip link's assertion above guards against.
    expect(screen.getByTestId("title-mirror")).toBeInTheDocument();
    // And it is placed before the children, so its effect runs after the route's
    // metadata is on the document — which is the premise its ownership test
    // rests on.
    expect(screen.getByTestId("title-mirror").compareDocumentPosition(screen.getByText("page content"))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
});
