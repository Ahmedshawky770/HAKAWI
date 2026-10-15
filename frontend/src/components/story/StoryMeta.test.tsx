/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test-utils/render";
import { AnchorLink } from "@/test-utils/navigation-mock";
import { StoryByline, StoryCategory } from "@/components/story/StoryMeta";
import { useLocale } from "@/components/providers/LocaleProvider";
import { stringsFor } from "@/lib/i18n";
import { storyCategoryLabel } from "@/lib/i18n/story";
import { DEFAULT_LOCALE } from "@/lib/preferences";

vi.mock("next/link", () => ({
  __esModule: true,
  default: AnchorLink,
}));

/**
 * Flips the document locale the way a reader's language switch does, through
 * the real provider — the pattern `TitleMirror.test.tsx` and
 * `LocaleProvider.test.tsx` use. Every other assertion in this file reads the
 * Arabic column of the dictionary; this one exists for the English one, which
 * is the copy that was never asserted anywhere in the repo.
 */
function LocaleFlip() {
  const { setLocale } = useLocale();
  return (
    <button type="button" onClick={() => setLocale("en")}>
      to english
    </button>
  );
}

const UNCATEGORIZED = stringsFor(DEFAULT_LOCALE).story.uncategorized;
const AUTHOR_PROFILE_LABEL = stringsFor(DEFAULT_LOCALE).story.authorProfile;
// Derived from the dictionary rather than literals: the byline is the one copy
// the i18n contract owns, and a drifting literal here is how a missing name
// check stops testing what the reader actually sees.
const AUTHOR_BYLINE = stringsFor(DEFAULT_LOCALE).story.authorByline("أحمد محمد");
const DANGLING_BYLINE = stringsFor(DEFAULT_LOCALE).story.authorByline("");
// The same rule for the category labels: they live in one table per locale, so
// the suite reads them through the function every component reads them through.
// A literal here would fail on a dictionary edit nobody made in this file —
// the drift `frontend/e2e/copy.ts` exists to eliminate.
const FICTION_LABEL = storyCategoryLabel("fiction", DEFAULT_LOCALE);
const POETRY_LABEL = storyCategoryLabel("poetry", DEFAULT_LOCALE);

const KNOWN_AUTHOR = { id: "user-1", name: "أحمد محمد" };
const UNKNOWN_AUTHOR = { id: "user-2", name: "" };
const BLANK_AUTHOR = { id: "user-3", name: "   " };
const NULL_AUTHOR = { id: "user-4", name: null };

describe("StoryByline", () => {
  it("names the author when the name is known", () => {
    renderWithProviders(<StoryByline author={KNOWN_AUTHOR} className="text-sm" />);
    expect(screen.getByText(AUTHOR_BYLINE)).toHaveClass("text-sm");
  });

  it("renders nothing at all when the author name is missing", () => {
    const { container } = renderWithProviders(<StoryByline author={UNKNOWN_AUTHOR} />);
    // A byline is only ever a link or a paragraph, and the provider stack owns
    // the rest of the container.
    expect(container.querySelector("a, p")).toBeNull();
  });

  it("renders nothing at all when the author name is only whitespace", () => {
    const { container } = renderWithProviders(<StoryByline author={BLANK_AUTHOR} />);
    expect(container.querySelector("a, p")).toBeNull();
  });

  it("never leaves a dangling byline label behind", () => {
    renderWithProviders(<StoryByline author={UNKNOWN_AUTHOR} />);
    expect(screen.queryByText(DANGLING_BYLINE)).not.toBeInTheDocument();
  });

  it("links to the author profile when the profile link is requested", () => {
    renderWithProviders(<StoryByline author={KNOWN_AUTHOR} linkToProfile />);
    expect(screen.getByRole("link", { name: AUTHOR_BYLINE })).toHaveAttribute("href", "/users/user-1");
  });

  it("keeps the author profile reachable when the name is missing", () => {
    renderWithProviders(<StoryByline author={UNKNOWN_AUTHOR} linkToProfile />);
    expect(screen.getByRole("link", { name: AUTHOR_PROFILE_LABEL })).toHaveAttribute("href", "/users/user-2");
  });

  it("gives the fallback link an accessible name rather than empty content", () => {
    renderWithProviders(<StoryByline author={NULL_AUTHOR} linkToProfile />);
    const link = screen.getByRole("link", { name: AUTHOR_PROFILE_LABEL });
    expect(link).toHaveTextContent(AUTHOR_PROFILE_LABEL);
    expect(link).toHaveAttribute("href", "/users/user-4");
  });
});

describe("StoryCategory", () => {
  it("localizes a known category for the reader's locale", () => {
    renderWithProviders(<StoryCategory category="fiction" />);
    expect(screen.getByText(FICTION_LABEL)).toBeInTheDocument();
  });

  it("treats a blank category as missing", () => {
    renderWithProviders(<StoryCategory category="   " />);
    expect(screen.getByText(UNCATEGORIZED)).toBeInTheDocument();
  });

  it("falls back to the uncategorized affordance for a null category", () => {
    renderWithProviders(<StoryCategory category={null} />);
    expect(screen.getByText(UNCATEGORIZED)).toBeInTheDocument();
  });

  it("passes an unknown category through as its raw wire value", () => {
    renderWithProviders(<StoryCategory category="unknown-wire-value" />);
    expect(screen.getByText("unknown-wire-value")).toBeInTheDocument();
    expect(screen.queryByText(UNCATEGORIZED)).not.toBeInTheDocument();
  });

  it("marks the uncategorized affordance apart from a real category", () => {
    const { rerender } = renderWithProviders(<StoryCategory category={null} />);
    expect(screen.getByText(UNCATEGORIZED).className).toContain("border-dashed");

    rerender(<StoryCategory category="fiction" />);
    expect(screen.getByText(FICTION_LABEL).className).not.toContain("border-dashed");
  });

  it("renders the uncategorized label inline when that variant is requested", () => {
    renderWithProviders(<StoryCategory category={null} variant="inline" />);
    expect(screen.getByText(UNCATEGORIZED)).toBeInTheDocument();
    expect(screen.getByText(UNCATEGORIZED)).not.toHaveTextContent(FICTION_LABEL);
  });

  it("renders a known category inline without a fallback label", () => {
    renderWithProviders(<StoryCategory category="poetry" variant="inline" />);
    expect(screen.getByText(POETRY_LABEL)).toBeInTheDocument();
    expect(screen.queryByText(UNCATEGORIZED)).not.toBeInTheDocument();
  });

  it("renders the English label verbatim from the dictionary", async () => {
    // The regression this closes: the chip used to carry a `capitalize` class,
    // and `text-transform: capitalize` uppercases the first letter of EVERY
    // word — so the authored "Non-fiction" was shown to an English reader as
    // "Non-Fiction", disagreeing with the one place the copy lives. Casing is
    // the dictionary's job, and this asserts the label is the dictionary's
    // string and nothing else: the element's own text, with no transform on it.
    const user = userEvent.setup();

    renderWithProviders(
      <>
        <StoryCategory category="non-fiction" />
        <LocaleFlip />
      </>,
    );

    // Arabic is the default locale, so the Arabic label is what renders first.
    expect(screen.getByText(storyCategoryLabel("non-fiction", DEFAULT_LOCALE))).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "to english" }));

    const label = screen.getByText(storyCategoryLabel("non-fiction", "en"));
    expect(label.textContent).toBe(storyCategoryLabel("non-fiction", "en"));
    expect(label.textContent).toBe("Non-fiction");
    // What a casing transform — CSS or code — would have produced instead.
    expect(screen.queryByText("Non-Fiction")).not.toBeInTheDocument();
  });
});
