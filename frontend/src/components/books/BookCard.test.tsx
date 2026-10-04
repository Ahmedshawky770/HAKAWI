/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

import { AnchorLink } from "@/test-utils/navigation-mock";
import { renderWithProviders } from "@/test-utils/render";
import { BOOK } from "@/test-utils/fixtures";
import {
  BookCard,
  BookCardSkeleton,
  BookGridSkeleton,
  formatBookPrice,
} from "@/components/books/BookCard";

vi.mock("next/link", () => ({
  __esModule: true,
  default: AnchorLink,
}));

describe("BookCard", () => {
  it("names the book and its author", () => {
    renderWithProviders(<BookCard book={BOOK} />);

    expect(screen.getByRole("heading", { name: BOOK.title })).toBeInTheDocument();
    expect(screen.getByText(`بواسطة ${BOOK.author}`)).toBeInTheDocument();
  });

  it("makes the whole card one link to the book", () => {
    renderWithProviders(<BookCard book={BOOK} />);

    expect(screen.getByRole("link")).toHaveAttribute("href", `/books/${BOOK.id}`);
  });

  it("quotes the price in the currency the product charges in", () => {
    renderWithProviders(<BookCard book={BOOK} />);

    expect(screen.getByText("25.00 ج.م")).toBeInTheDocument();
  });

  it("sets the price in numeric figures so it stays in reading order", () => {
    renderWithProviders(<BookCard book={BOOK} />);

    expect(screen.getByText("25.00 ج.م")).toHaveClass("hk-numeric");
  });

  it("prints no price at all for a book that has none", () => {
    renderWithProviders(<BookCard book={{ ...BOOK, price: null }} />);

    expect(screen.queryByText(/ج\.م/)).not.toBeInTheDocument();
  });

  it("prints no price for a free book rather than a zero", () => {
    renderWithProviders(<BookCard book={{ ...BOOK, price: 0 }} />);

    expect(screen.queryByText(/ج\.م/)).not.toBeInTheDocument();
  });

  it("shows the cover image when the book has one", () => {
    const { container } = renderWithProviders(
      <BookCard book={{ ...BOOK, coverImage: "https://example.test/cover.jpg" }} />,
    );

    const image = container.querySelector("img");
    expect(image).toHaveAttribute("src", "https://example.test/cover.jpg");
    expect(image).toHaveAttribute("alt", "");
  });

  it("keeps the cover box when the book has no cover, so the grid does not jump", () => {
    const { container } = renderWithProviders(<BookCard book={{ ...BOOK, coverImage: null }} />);

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[class*='aspect-']")).not.toBeNull();
  });

  it("uses design system tokens rather than a stock palette", () => {
    const { container } = renderWithProviders(<BookCard book={BOOK} />);

    expect(container.innerHTML).not.toMatch(/bg-white|text-gray-|bg-blue-/);
  });
});

describe("BookCardSkeleton", () => {
  it("holds a cover placeholder the height of the real cover", () => {
    const { container } = renderWithProviders(<BookCardSkeleton />);

    expect(container.querySelector("[class*='aspect-']")).not.toBeNull();
  });

  it("hides its placeholders from the accessibility tree, because Loading owns the announcement", () => {
    const { container } = renderWithProviders(<BookCardSkeleton />);

    expect(container.querySelectorAll(".hk-skeleton").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("[aria-hidden='true']")).toHaveLength(
      container.querySelectorAll(".hk-skeleton").length,
    );
  });
});

describe("BookGridSkeleton", () => {
  it("renders one placeholder per requested card", () => {
    const { container } = renderWithProviders(<BookGridSkeleton count={4} />);

    expect(container.querySelectorAll("[class*='aspect-']")).toHaveLength(4);
  });

  it("hides the whole grid from assistive technology", () => {
    const { container } = renderWithProviders(<BookGridSkeleton />);

    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});

describe("formatBookPrice", () => {
  it("keeps two decimals and the Egyptian pound", () => {
    expect(formatBookPrice(25)).toBe("25.00 ج.م");
    expect(formatBookPrice(9.5)).toBe("9.50 ج.م");
  });
});
