/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AnchorLink } from "@/test-utils/navigation-mock";
import { renderWithProviders } from "@/test-utils/render";
import { BOOK } from "@/test-utils/fixtures";
import { LibraryCard, LibraryCardSkeleton, LibraryGridSkeleton } from "@/components/library/LibraryCard";
import { LIBRARY_STATUS_LABELS } from "@/components/library/LibraryStatusBadge";
import type { LibraryEntry } from "@/components/library/LibraryCard";
import type { LibraryItem } from "@/types/api";

vi.mock("next/link", () => ({
  __esModule: true,
  default: AnchorLink,
}));

function entry(status: LibraryItem["status"] = "owned"): LibraryEntry {
  return {
    id: "lib-1",
    userId: "user-1",
    bookId: BOOK.id,
    rentalId: null,
    status,
    addedAt: "2026-01-01T00:00:00.000Z",
    lastAccessedAt: null,
    book: BOOK,
  };
}

describe("LibraryCard", () => {
  it("names the book, its author and its price", () => {
    renderWithProviders(<LibraryCard item={entry()} onRemove={vi.fn()} />);

    expect(screen.getByRole("heading", { name: BOOK.title })).toBeInTheDocument();
    expect(screen.getByText(BOOK.author)).toBeInTheDocument();
    expect(screen.getByText("25.00 ج.م")).toHaveClass("hk-numeric");
  });

  it("links to the details page with a link that looks like a button", () => {
    renderWithProviders(<LibraryCard item={entry()} onRemove={vi.fn()} />);

    const link = screen.getByRole("link", { name: "عرض التفاصيل" });
    expect(link).toHaveAttribute("href", "/library/lib-1");
  });

  it("offers removal as a button, never as a link", () => {
    renderWithProviders(<LibraryCard item={entry()} onRemove={vi.fn()} />);

    const remove = screen.getByRole("button", { name: "إزالة" });
    expect(remove.tagName).toBe("BUTTON");
    expect(remove.className).toContain("bg-error-fill");
  });

  it("reports a removal when it is pressed", async () => {
    const onRemove = vi.fn();
    renderWithProviders(<LibraryCard item={entry()} onRemove={onRemove} />);

    await userEvent.click(screen.getByRole("button", { name: "إزالة" }));

    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("marks the card busy while the removal is in flight", () => {
    renderWithProviders(<LibraryCard item={entry()} removing onRemove={vi.fn()} />);

    expect(screen.getByRole("button", { name: /إزالة/ })).toBeDisabled();
  });

  it("names the status of every state in the library vocabulary", () => {
    for (const status of ["owned", "rented", "reading", "completed"] as const) {
      const { unmount } = renderWithProviders(<LibraryCard item={entry(status)} onRemove={vi.fn()} />);
      expect(screen.getByText(LIBRARY_STATUS_LABELS[status])).toBeInTheDocument();
      unmount();
    }
  });

  it("colours the status with the design system tone, not a stock palette", () => {
    renderWithProviders(<LibraryCard item={entry("reading")} onRemove={vi.fn()} />);

    const badge = screen.getByText(LIBRARY_STATUS_LABELS.reading);
    expect(badge.className).toContain("bg-warning-soft");
    expect(badge.className).not.toMatch(/yellow|green|blue|gray/);
  });

  it("still renders when the book behind the entry could not be fetched", () => {
    const withoutBook: LibraryEntry = { ...entry() };
    delete withoutBook.book;

    renderWithProviders(<LibraryCard item={withoutBook} onRemove={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "كتاب" })).toBeInTheDocument();
    expect(screen.getByText(LIBRARY_STATUS_LABELS.owned)).toBeInTheDocument();
  });
});

describe("LibraryCardSkeleton", () => {
  it("holds a cover placeholder so the grid does not jump", () => {
    const { container } = renderWithProviders(<LibraryCardSkeleton />);

    expect(container.querySelector("[class~='h-28']")).not.toBeNull();
  });
});

describe("LibraryGridSkeleton", () => {
  it("renders one placeholder per requested entry and hides them from readers of the page", () => {
    const { container } = renderWithProviders(<LibraryGridSkeleton count={3} />);

    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelectorAll("[class~='h-28']")).toHaveLength(3);
  });
});
