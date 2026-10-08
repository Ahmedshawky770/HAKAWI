/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/ui/Button", () => ({__esModule: true, default: {to: "/", className: ""}}));
vi.mock("@/components/ui/Card", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/EmptyState", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/ErrorMessage", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/Loading", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/Skeleton", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/Avatar", () => ({__esModule: true, default: "div"}));

import { AnchorLink } from "@/test-utils/navigation-mock";
import { renderWithProviders } from "@/test-utils/render";
import { createDeferred, jsonResponse } from "@/test-utils/support";
import { BOOK } from "@/test-utils/fixtures";
import BooksPage from "@/app/(app)/books/page";

vi.mock("next/link", () => ({
  __esModule: true,
  default: AnchorLink,
}));

const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

function booksResponse(books: unknown[]) {
  return jsonResponse({ books, total: books.length, page: 1, limit: 20 });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("books page", () => {
  it("announces a loading state while the catalogue is in flight", () => {
    fetchMock.mockReturnValue(createDeferred<Response>().promise);

    renderWithProviders(<BooksPage />);

    expect(screen.getByText("جارٍ تحميل الكتب")).toBeInTheDocument();
    expect(screen.getByText("جارٍ تحميل الكتب").closest("[role='status']")).not.toBeNull();
  });

  it("keeps one level one heading on the page", async () => {
    fetchMock.mockResolvedValue(booksResponse([BOOK]));

    renderWithProviders(<BooksPage />);

    expect(await screen.findByRole("heading", { level: 1, name: "الكتب" })).toBeInTheDocument();
  });

  it("requests the catalogue once", async () => {
    fetchMock.mockResolvedValue(booksResponse([BOOK]));

    renderWithProviders(<BooksPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/books");
  });

  it("renders a card per book, linked to its own page", async () => {
    fetchMock.mockResolvedValue(booksResponse([BOOK]));

    renderWithProviders(<BooksPage />);

    const link = await screen.findByRole("link", { name: new RegExp(BOOK.title) });
    expect(link).toHaveAttribute("href", `/books/${BOOK.id}`);
    expect(screen.getByText(`بواسطة ${BOOK.author}`)).toBeInTheDocument();
    expect(screen.getByText("25.00 ج.م")).toHaveClass("hk-numeric");
  });

  it("points an empty catalogue at the stories", async () => {
    fetchMock.mockResolvedValue(booksResponse([]));

    renderWithProviders(<BooksPage />);

    expect(await screen.findByRole("heading", { name: "لا توجد كتب بعد" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "تصفح القصص" })).toHaveAttribute("href", "/");
  });

  it("reports a failure and refetches when the retry is pressed", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue(booksResponse([BOOK]));

    renderWithProviders(<BooksPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to fetch");

    await userEvent.click(screen.getByRole("button", { name: "أعد المحاولة" }));

    expect(await screen.findByRole("heading", { name: BOOK.title })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops announcing the loading state once the books are rendered", async () => {
    fetchMock.mockResolvedValue(booksResponse([BOOK]));

    renderWithProviders(<BooksPage />);

    await screen.findByRole("heading", { name: BOOK.title });
    expect(screen.queryByText("جارٍ تحميل الكتب")).not.toBeInTheDocument();
  });

  it("does not reach for a stock palette", async () => {
    fetchMock.mockResolvedValue(booksResponse([BOOK]));

    const { container } = renderWithProviders(<BooksPage />);
    await screen.findByRole("heading", { name: BOOK.title });

    expect(container.innerHTML).not.toMatch(/text-gray-|bg-white|bg-blue-/);
  });
});
