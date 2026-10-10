/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";

import { AnchorLink } from "@/test-utils/navigation-mock";
import { renderWithProviders } from "@/test-utils/render";
import { SearchResultCard, SearchResultsSkeleton } from "@/components/social/SearchResultCard";
import type { SearchResult } from "@/types/api";

vi.mock("next/link", () => ({
  __esModule: true,
  default: AnchorLink,
}));

const RESULT: SearchResult = {
  id: "story-1",
  title: "ليلة في الحارة",
  slug: "layla-fi-lharra",
  excerpt: "مقتطف من القصة",
  status: "published",
  category: "غموض",
  tags: ["غموض"],
  author: { id: "user-1", name: "أحمد محمد" },
  views: 1500,
  reactions: 42,
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("SearchResultCard", () => {
  it("links the row to the story", () => {
    renderWithProviders(<SearchResultCard result={RESULT} />);

    const link = screen.getByRole("link", { name: new RegExp(RESULT.title) });
    expect(link).toHaveAttribute("href", "/stories/story-1");
  });

  it("renders the title, the excerpt and the author", () => {
    renderWithProviders(<SearchResultCard result={RESULT} />);

    expect(screen.getByRole("heading", { name: RESULT.title })).toBeInTheDocument();
    expect(screen.getByText(RESULT.excerpt as string)).toBeInTheDocument();
    expect(screen.getByText("أحمد محمد")).toBeInTheDocument();
  });

  it("isolates the counts and labels what they count", () => {
    const { container } = renderWithProviders(<SearchResultCard result={RESULT} />);

    const numbers = Array.from(container.querySelectorAll(".hk-numeric"));
    expect(numbers.map((node) => node.textContent)).toContain("1500");
    expect(numbers.map((node) => node.textContent)).toContain("42");
    expect(screen.getByText("مشاهدة")).toHaveClass("sr-only");
    expect(screen.getByText("تفاعل")).toHaveClass("sr-only");
  });

  it("labels a published result and a draft differently", () => {
    const { unmount } = renderWithProviders(<SearchResultCard result={RESULT} />);
    expect(screen.getByText("منشورة")).toBeInTheDocument();
    unmount();

    renderWithProviders(<SearchResultCard result={{ ...RESULT, status: "draft" }} />);
    expect(screen.getByText("غير منشورة")).toBeInTheDocument();
  });

  it("falls back to a named author and no excerpt block", () => {
    const { container } = renderWithProviders(
      <SearchResultCard result={{ ...RESULT, excerpt: null, author: { id: "user-2", name: null } }} />,
    );

    expect(screen.getByText("مؤلف مجهول")).toBeInTheDocument();
    expect(container.querySelector(".line-clamp-2")).toBeNull();
  });
});

describe("SearchResultsSkeleton", () => {
  it("hides the placeholders from assistive technology", () => {
    const { container } = renderWithProviders(<SearchResultsSkeleton count={4} />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelectorAll(".hk-skeleton").length).toBeGreaterThanOrEqual(16);
  });
});