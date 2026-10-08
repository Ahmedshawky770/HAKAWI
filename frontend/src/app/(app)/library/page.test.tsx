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
import LibraryPage from "@/app/(app)/library/page";
import { LIBRARY_STATUS_LABELS } from "@/components/library/LibraryStatusBadge";
import type { LibraryItem } from "@/types/api";

vi.mock("next/link", () => ({
  __esModule: true,
  default: AnchorLink,
}));

const ITEM: LibraryItem = {
  id: "lib-1",
  userId: "user-1",
  bookId: BOOK.id,
  rentalId: null,
  status: "reading",
  addedAt: "2026-01-01T00:00:00.000Z",
  lastAccessedAt: "2026-01-09T00:00:00.000Z",
};

const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

function respondWith(items: LibraryItem[], overrides: (url: string) => Response | null = () => null) {
  return (input: string) => {
    const url = String(input);
    const override = overrides(url);
    if (override) return Promise.resolve(override);
    if (url.includes("/library")) {
      return Promise.resolve(jsonResponse({ items, total: items.length, page: 1, limit: 20 }));
    }
    return Promise.resolve(jsonResponse(BOOK));
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("library page", () => {
  it("announces a loading state while the shelf is in flight", () => {
    fetchMock.mockReturnValue(createDeferred<Response>().promise);

    renderWithProviders(<LibraryPage />);

    expect(screen.getByText("جارٍ تحميل المكتبة").closest("[role='status']")).not.toBeNull();
  });

  it("keeps one level one heading on the page", async () => {
    fetchMock.mockImplementation(respondWith([ITEM]));

    renderWithProviders(<LibraryPage />);

    expect(await screen.findByRole("heading", { level: 1, name: "مكتبتي" })).toBeInTheDocument();
  });

  it("renders the cover, the title, the author and the status of an entry", async () => {
    fetchMock.mockImplementation(respondWith([ITEM]));

    renderWithProviders(<LibraryPage />);

    expect(await screen.findByRole("heading", { name: BOOK.title })).toBeInTheDocument();
    expect(screen.getByText(BOOK.author)).toBeInTheDocument();
    expect(screen.getByText(LIBRARY_STATUS_LABELS[ITEM.status])).toBeInTheDocument();
  });

  it("offers the details as a link and the removal as a button", async () => {
    fetchMock.mockImplementation(respondWith([ITEM]));

    renderWithProviders(<LibraryPage />);

    expect(await screen.findByRole("link", { name: "عرض التفاصيل" })).toHaveAttribute(
      "href",
      `/library/${ITEM.id}`,
    );
    expect(screen.getByRole("button", { name: "إزالة" }).tagName).toBe("BUTTON");
  });

  it("drops an entry once its removal is confirmed", async () => {
    fetchMock.mockImplementation((input, init) => {
      if (init?.method === "DELETE") return Promise.resolve(new Response(null, { status: 200 }));
      return respondWith([ITEM])(input);
    });

    renderWithProviders(<LibraryPage />);
    await screen.findByRole("heading", { name: BOOK.title });

    await userEvent.click(screen.getByRole("button", { name: "إزالة" }));

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: BOOK.title })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: "مكتبتك فارغة" })).toBeInTheDocument();
  });

  it("says why a removal failed and keeps the entry where it was", async () => {
    fetchMock.mockImplementation((input, init) => {
      if (init?.method === "DELETE") {
        return Promise.resolve(jsonResponse({ message: "Library item not found" }, 404));
      }
      return respondWith([ITEM])(input);
    });

    renderWithProviders(<LibraryPage />);
    await screen.findByRole("heading", { name: BOOK.title });

    await userEvent.click(screen.getByRole("button", { name: "إزالة" }));

    expect(await screen.findByText("Library item not found")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: BOOK.title })).toBeInTheDocument();
  });

  it("renders an entry whose book could not be fetched", async () => {
    fetchMock.mockImplementation(
      respondWith([ITEM], (url) => (url.includes("/books/") ? jsonResponse({ message: "gone" }, 404) : null)),
    );

    renderWithProviders(<LibraryPage />);

    expect(await screen.findByRole("heading", { name: "كتاب" })).toBeInTheDocument();
    expect(screen.getByText(LIBRARY_STATUS_LABELS[ITEM.status])).toBeInTheDocument();
  });

  it("offers the catalogue to a reader with an empty library", async () => {
    fetchMock.mockImplementation(respondWith([]));

    renderWithProviders(<LibraryPage />);

    expect(await screen.findByRole("heading", { name: "مكتبتك فارغة" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "تصفح الكتب" })).toHaveAttribute("href", "/books");
  });

  it("reports a failed load and refetches on retry", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockImplementation(respondWith([ITEM]));

    renderWithProviders(<LibraryPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to fetch");

    await userEvent.click(screen.getByRole("button", { name: "أعد المحاولة" }));

    expect(await screen.findByRole("heading", { name: BOOK.title })).toBeInTheDocument();
  });

  it("does not reach for a stock palette", async () => {
    fetchMock.mockImplementation(respondWith([ITEM]));

    const { container } = renderWithProviders(<LibraryPage />);
    await screen.findByRole("heading", { name: BOOK.title });

    expect(container.innerHTML).not.toMatch(/text-gray-|bg-white|bg-blue-|bg-green-|bg-yellow-/);
  });
});
