/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";

import { StoryCard, StoryCardCompact, formatCompact } from "@/components/story/StoryCard";
import { renderWithProviders } from "@/test-utils/render";
import { STORY } from "@/test-utils/fixtures";

const COVER = "https://cdn.example.com/cover.webp";

describe("StoryCard", () => {
  it("makes the whole card one link target, so a phone tap does not have to aim", () => {
    renderWithProviders(<StoryCard story={STORY} />);

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", `/stories/${STORY.id}`);
    expect(link).toHaveTextContent(STORY.title);
  });

  it("uses the design system's card and type tokens", () => {
    const { container } = renderWithProviders(<StoryCard story={STORY} />);

    expect(container.querySelector("article")?.className).toContain("border-line");
    expect(screen.getByRole("heading", { level: 3 })).toHaveClass("text-xl");
    expect(screen.getByRole("heading", { level: 3 }).className).toContain("text-ink");
  });

  it("bounds the excerpt to four lines", () => {
    const { container } = renderWithProviders(<StoryCard story={STORY} />);
    expect(container.querySelector("p")?.className).toContain("line-clamp-4");
  });

  it("shows the cover only when there is one", () => {
    const { container, rerender } = renderWithProviders(<StoryCard story={STORY} />);
    expect(container.querySelector("img")).toBeNull();

    rerender(<StoryCard story={{ ...STORY, coverImage: COVER }} />);
    const image = container.querySelector("img");
    expect(image).toHaveAttribute("src", COVER);
    // Decorative: the title beside it already says what the story is.
    expect(image).toHaveAttribute("alt", "");
    expect(image).toHaveAttribute("loading", "lazy");
    expect(image).toHaveAttribute("decoding", "async");
  });

  it("can be asked for no cover at all", () => {
    const { container } = renderWithProviders(<StoryCard story={{ ...STORY, coverImage: COVER }} showCover={false} />);
    expect(container.querySelector("img")).toBeNull();
  });

  it("names the category beside the byline", () => {
    renderWithProviders(<StoryCard story={{ ...STORY, category: "غموض" }} />);
    expect(screen.getByText("بواسطة أحمد محمد")).toBeInTheDocument();
    expect(screen.getByText("غموض")).toBeInTheDocument();
  });

  it("keeps the reaction and view counts legible as figures", () => {
    const { container } = renderWithProviders(<StoryCard story={STORY} />);
    const figures = Array.from(container.querySelectorAll(".hk-numeric")).map((node) => node.textContent);
    expect(figures).toContain("42");
    expect(figures).toContain(formatCompact(STORY.views));
  });

  it("gives the counts a name, so a screen reader does not hear two bare numbers", () => {
    renderWithProviders(<StoryCard story={STORY} />);
    // The names are visually hidden: a card shows an icon and a number, and a
    // reader hears "تفاعل 42" rather than "42".
    expect(screen.getByText("تفاعل")).toHaveClass("sr-only");
    expect(screen.getByText("مشاهدة")).toHaveClass("sr-only");
  });
});

describe("StoryCardCompact", () => {
  it("never renders a cover, so a grid of six is not six hero images", () => {
    const { container } = renderWithProviders(<StoryCardCompact story={{ ...STORY, coverImage: COVER }} />);
    expect(container.querySelector("img")).toBeNull();
  });

  it("bounds its excerpt to three lines and titles at one step down", () => {
    const { container } = renderWithProviders(<StoryCardCompact story={STORY} />);
    expect(container.querySelector("p")?.className).toContain("line-clamp-3");
    expect(screen.getByRole("heading", { level: 3 }).className).toContain("text-lg");
  });
});

describe("formatCompact", () => {
  it("leaves small numbers exact", () => {
    expect(formatCompact(0)).toBe("0");
    expect(formatCompact(42)).toBe("42");
    expect(formatCompact(999)).toBe("999");
  });

  it("rounds thousands, because a view count is a magnitude", () => {
    expect(formatCompact(1000)).toBe("1 ألف");
    expect(formatCompact(1204)).toBe("1.2 ألف");
    expect(formatCompact(1500)).toBe("1.5 ألف");
    expect(formatCompact(12_000)).toBe("12 ألف");
  });

  it("rounds millions the same way", () => {
    expect(formatCompact(1_000_000)).toBe("1 مليون");
    expect(formatCompact(2_450_000)).toBe("2.5 مليون");
    expect(formatCompact(24_000_000)).toBe("24 مليون");
  });

  it("keeps one decimal only while it carries information", () => {
    expect(formatCompact(10_400)).toBe("10 ألف");
    expect(formatCompact(10_900)).toBe("11 ألف");
  });
});