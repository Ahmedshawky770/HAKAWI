/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AnchorLink } from "@/test-utils/navigation-mock";
import { renderWithProviders } from "@/test-utils/render";
import { createDeferred, jsonResponse } from "@/test-utils/support";
import { BOOK } from "@/test-utils/fixtures";
import LibraryPage from "@/app/(app)/library/page";
import { AR as AR_LIBRARY, EN as EN_LIBRARY } from "@/lib/i18n/library";
import { AR as AR_ERRORS } from "@/lib/i18n/errors";
import { AR as AR_COMMON } from "@/lib/i18n/common";
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

/**
 * A shelf that behaves like a server.
 *
 * The entry a reader removes is gone from the next answer, because the page
 * invalidates the list after the write: the server's answer is the one that must
 * win, and a mock that kept handing the removed entry back would be testing a
 * server that never forgets.
 */
function shelfServer(initial: LibraryItem[], overrides: (url: string) => Response | null = () => null) {
  const items = [...initial];

  return (input: string, init?: RequestInit) => {
    const url = String(input);
    const override = overrides(url);
    if (override) return Promise.resolve(override);

    if (init?.method === "DELETE") {
      const id = url.slice(url.lastIndexOf("/library/") + "/library/".length);
      const index = items.findIndex((item) => item.id === id);
      if (index >= 0) items.splice(index, 1);
      return Promise.resolve(new Response(null, { status: 200 }));
    }

    if (url.includes("/library")) {
      return Promise.resolve(jsonResponse({ items, total: items.length, page: 1, limit: 20 }));
    }

    return Promise.resolve(jsonResponse(BOOK));
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  // The locale lives on the document, so every suite starts from the default.
  document.documentElement.setAttribute("lang", "ar");
});

describe("library page", () => {
  it("announces a loading state while the shelf is in flight", () => {
    fetchMock.mockReturnValue(createDeferred<Response>().promise);

    renderWithProviders(<LibraryPage />);

    expect(screen.getByText(AR_LIBRARY.loadingLabel).closest("[role='status']")).not.toBeNull();
  });

  it("keeps one level one heading on the page", async () => {
    fetchMock.mockImplementation(shelfServer([ITEM]));

    renderWithProviders(<LibraryPage />);

    expect(await screen.findByRole("heading", { level: 1, name: AR_LIBRARY.pageTitle })).toBeInTheDocument();
  });

  it("renders the cover, the title, the author and the status of an entry", async () => {
    fetchMock.mockImplementation(shelfServer([ITEM]));

    renderWithProviders(<LibraryPage />);

    expect(await screen.findByRole("heading", { name: BOOK.title })).toBeInTheDocument();
    expect(screen.getByText(BOOK.author)).toBeInTheDocument();
    expect(screen.getByText(AR_LIBRARY.statusLabels[ITEM.status])).toBeInTheDocument();
  });

  it("offers the details as a link and the removal as a button", async () => {
    fetchMock.mockImplementation(shelfServer([ITEM]));

    renderWithProviders(<LibraryPage />);

    expect(await screen.findByRole("link", { name: AR_LIBRARY.detailsAction })).toHaveAttribute(
      "href",
      `/library/${ITEM.id}`,
    );
    expect(screen.getByRole("button", { name: AR_LIBRARY.removeAction }).tagName).toBe("BUTTON");
  });

  it("drops an entry once its removal is confirmed", async () => {
    fetchMock.mockImplementation(shelfServer([ITEM]));

    renderWithProviders(<LibraryPage />);
    await screen.findByRole("heading", { name: BOOK.title });

    await userEvent.click(screen.getByRole("button", { name: AR_LIBRARY.removeAction }));

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: BOOK.title })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: AR_LIBRARY.emptyTitle })).toBeInTheDocument();
  });

  it("says why a removal failed and keeps the entry where it was", async () => {
    fetchMock.mockImplementation(
      shelfServer([ITEM], (url) =>
        url.includes("/library/") && url.endsWith(ITEM.id)
          ? jsonResponse({ message: "Library item not found" }, 404)
          : null,
      ),
    );

    renderWithProviders(<LibraryPage />);
    await screen.findByRole("heading", { name: BOOK.title });

    await userEvent.click(screen.getByRole("button", { name: AR_LIBRARY.removeAction }));

    // The failure is classified and then said in the reader's language — the
    // server's own English wording never reaches the screen.
    expect(await screen.findByText(AR_ERRORS.notFound)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: BOOK.title })).toBeInTheDocument();
  });

  it("renders an entry whose book could not be fetched", async () => {
    fetchMock.mockImplementation(
      shelfServer([ITEM], (url) => (url.includes("/books/") ? jsonResponse({ message: "gone" }, 404) : null)),
    );

    renderWithProviders(<LibraryPage />);

    expect(await screen.findByRole("heading", { name: AR_LIBRARY.unknownBookTitle })).toBeInTheDocument();
    expect(screen.getByText(AR_LIBRARY.statusLabels[ITEM.status])).toBeInTheDocument();
  });

  it("offers the catalogue to a reader with an empty library", async () => {
    fetchMock.mockImplementation(shelfServer([]));

    renderWithProviders(<LibraryPage />);

    expect(await screen.findByRole("heading", { name: AR_LIBRARY.emptyTitle })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: AR_LIBRARY.browseBooks })).toHaveAttribute("href", "/books");
  });

  it("reports a failed load and refetches on retry", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockImplementation(shelfServer([ITEM]));

    renderWithProviders(<LibraryPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(AR_ERRORS.network);

    await userEvent.click(screen.getByRole("button", { name: AR_COMMON.retry }));

    expect(await screen.findByRole("heading", { name: BOOK.title })).toBeInTheDocument();
  });

  it("does not reach for a stock palette", async () => {
    fetchMock.mockImplementation(shelfServer([ITEM]));

    const { container } = renderWithProviders(<LibraryPage />);
    await screen.findByRole("heading", { name: BOOK.title });

    expect(container.innerHTML).not.toMatch(/text-gray-|bg-white|bg-blue-|bg-green-|bg-yellow-/);
  });

  it("speaks the reader's language", async () => {
    // The locale is read from the document, so setting it is how the product
    // switches. Every word on this surface comes from the dictionary, so the
    // English shelf is the English shelf — not an Arabic one with a few labels.
    document.documentElement.setAttribute("lang", "en");

    fetchMock.mockImplementation(shelfServer([ITEM]));

    renderWithProviders(<LibraryPage />);

    expect(await screen.findByRole("heading", { level: 1, name: EN_LIBRARY.pageTitle })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: EN_LIBRARY.removeAction })).toBeInTheDocument();
    expect(screen.getByText(EN_LIBRARY.statusLabels[ITEM.status])).toBeInTheDocument();
  });
});
