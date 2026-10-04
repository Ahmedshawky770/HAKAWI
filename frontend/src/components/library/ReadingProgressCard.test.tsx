/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

import { AnchorLink } from "@/test-utils/navigation-mock";
import { renderWithProviders } from "@/test-utils/render";
import { ReadingProgressCard } from "@/components/library/ReadingProgressCard";
import type { ReadingProgress } from "@/types/api";

vi.mock("next/link", () => ({
  __esModule: true,
  default: AnchorLink,
}));

const PROGRESS: ReadingProgress = {
  id: "progress-1",
  bookId: "book-1",
  currentPage: 120,
  totalPages: 300,
  progressPercentage: 40,
  lastReadAt: "2026-01-05T00:00:00.000Z",
  completedAt: null,
};

describe("ReadingProgressCard", () => {
  it("exposes the progress as a labelled progressbar rather than a coloured bar", () => {
    renderWithProviders(<ReadingProgressCard progress={PROGRESS} />);

    const bar = screen.getByRole("progressbar", { name: "تقدم القراءة" });
    expect(bar).toHaveAttribute("aria-valuenow", "40");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
  });

  it("states the page position and the percentage as text, in numeric figures", () => {
    renderWithProviders(<ReadingProgressCard progress={PROGRESS} />);

    expect(screen.getByText(/الصفحة 120/)).toHaveClass("hk-numeric");
    expect(screen.getByText("40.0%")).toHaveClass("hk-numeric");
  });

  it("omits the total when the book does not report one", () => {
    renderWithProviders(<ReadingProgressCard progress={{ ...PROGRESS, totalPages: null }} />);

    expect(screen.getByText(/^الصفحة 120$/)).toBeInTheDocument();
  });

  it("says nothing about completion while the book is unfinished", () => {
    renderWithProviders(<ReadingProgressCard progress={PROGRESS} />);

    expect(screen.queryByText(/اكتملت القراءة/)).not.toBeInTheDocument();
  });

  it("announces completion in the success tokens, with its date", () => {
    renderWithProviders(
      <ReadingProgressCard progress={{ ...PROGRESS, progressPercentage: 100, completedAt: "2026-02-01T00:00:00.000Z" }} />,
    );

    const note = screen.getByText(/اكتملت القراءة/);
    expect(note).toHaveClass("text-success-ink");
    expect(note.textContent).toMatch(/[0-9٠-٩]/);
  });

  it("clamps a percentage above a hundred, which the API can report", () => {
    renderWithProviders(<ReadingProgressCard progress={{ ...PROGRESS, progressPercentage: 140 }} />);

    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });

  it("renders the action it is given, and nothing when it is given none", async () => {
    // Imported here rather than at the top: `vi.mock` is hoisted above the imports, so the module
    // under mock cannot be resolved until the navigation mock itself has been initialised.
    const { default: Link } = await import("next/link");

    const { rerender } = renderWithProviders(<ReadingProgressCard progress={PROGRESS} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();

    rerender(
      <ReadingProgressCard
        progress={PROGRESS}
        action={<Link href="/library">تحديث القراءة من مكتبتي</Link>}
      />,
    );
    expect(screen.getByRole("link", { name: "تحديث القراءة من مكتبتي" })).toHaveAttribute("href", "/library");
  });

  it("uses design system tokens rather than a stock palette", () => {
    const { container } = renderWithProviders(<ReadingProgressCard progress={PROGRESS} />);

    expect(container.innerHTML).not.toMatch(/bg-blue-|bg-gray-|text-green-6/);
  });
});
