/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AnchorLink, router } from "@/test-utils/navigation-mock";
import { renderWithProviders } from "@/test-utils/render";
import { createDeferred, jsonResponse } from "@/test-utils/support";
import { BOOK } from "@/test-utils/fixtures";
import LibraryItemPage from "@/app/(app)/library/[id]/page";
import { AR as AR_LIBRARY } from "@/lib/i18n/library";
import { AR as AR_ERRORS } from "@/lib/i18n/errors";
import { AR as AR_COMMON } from "@/lib/i18n/common";
import type { LibraryItem, ReadingProgress } from "@/types/api";

vi.mock("next/link", () => ({
  __esModule: true,
  default: AnchorLink,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "lib-1" }),
  useRouter: () => router,
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

const PROGRESS: ReadingProgress = {
  id: "progress-1",
  bookId: BOOK.id,
  currentPage: 90,
  totalPages: 300,
  progressPercentage: 30,
  lastReadAt: "2026-01-09T00:00:00.000Z",
  completedAt: null,
};

const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

/**
 * A shelf that behaves like a server: an accessed entry comes back with the
 * state the API gave it, and a removed entry is gone from the next answer. The
 * page invalidates the shelf after every write, so a mock that always answered
 * with the original entry would be testing a server that ignores the reader.
 */
function shelfServer(options: { items?: LibraryItem[]; progress?: ReadingProgress[] } = {}) {
  const items = [...(options.items ?? [ITEM])];

  return (input: string, init?: RequestInit) => {
    const url = String(input);

    if (url.includes("/reading-progress")) {
      const progress = options.progress ?? [];
      return Promise.resolve(jsonResponse({ progress, total: progress.length, page: 1, limit: 20 }));
    }

    if (init?.method === "DELETE") {
      const id = url.slice(url.lastIndexOf("/library/") + "/library/".length);
      const index = items.findIndex((item) => item.id === id);
      if (index >= 0) items.splice(index, 1);
      return Promise.resolve(new Response(null, { status: 200 }));
    }

    if (init?.method === "POST" && url.includes("/access")) {
      const accessed: LibraryItem = { ...items[0], status: "owned" };
      items[0] = accessed;
      return Promise.resolve(jsonResponse(accessed));
    }

    if (url.includes("/library")) {
      return Promise.resolve(jsonResponse({ items, total: items.length, page: 1, limit: 20 }));
    }

    return Promise.resolve(jsonResponse(BOOK));
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  router.push.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("library detail page", () => {
  it("announces a loading state while the entry is in flight", () => {
    fetchMock.mockReturnValue(createDeferred<Response>().promise);

    renderWithProviders(<LibraryItemPage />);

    expect(screen.getByText(AR_COMMON.loading)).toBeInTheDocument();
  });

  it("renders the book as the one level one heading, with its status", async () => {
    fetchMock.mockImplementation(shelfServer({ progress: [PROGRESS] }));

    renderWithProviders(<LibraryItemPage />);

    expect(await screen.findByRole("heading", { level: 1, name: BOOK.title })).toBeInTheDocument();
    expect(screen.getByText(AR_LIBRARY.statusLabels[ITEM.status])).toBeInTheDocument();
    expect(screen.getByText(AR_LIBRARY.authorByline(BOOK.author))).toBeInTheDocument();
  });

  it("states the page count and the last read date", async () => {
    fetchMock.mockImplementation(shelfServer({ progress: [PROGRESS] }));

    renderWithProviders(<LibraryItemPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    expect(screen.getByText(BOOK.pageCount as number)).toHaveClass("hk-numeric");
    expect(screen.getAllByText(new RegExp(AR_LIBRARY.lastReadLabel)).length).toBeGreaterThan(0);
  });

  it("shows reading progress in a labelled progressbar with the page position", async () => {
    fetchMock.mockImplementation(shelfServer({ progress: [PROGRESS] }));

    renderWithProviders(<LibraryItemPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    expect(screen.getByRole("progressbar", { name: AR_LIBRARY.progressLabel })).toHaveAttribute(
      "aria-valuenow",
      "30",
    );
    expect(screen.getByText(AR_LIBRARY.progressPage(90, 300))).toHaveClass("hk-numeric");
    expect(screen.queryByText(new RegExp(AR_LIBRARY.progressCompletedLabel))).not.toBeInTheDocument();
  });

  it("announces a finished book in the success tokens", async () => {
    fetchMock.mockImplementation(
      shelfServer({
        items: [{ ...ITEM, status: "completed" }],
        progress: [{ ...PROGRESS, progressPercentage: 100, completedAt: "2026-02-01T00:00:00.000Z" }],
      }),
    );

    renderWithProviders(<LibraryItemPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    expect(screen.getByText(new RegExp(AR_LIBRARY.progressCompletedLabel))).toHaveClass("text-success-ink");
  });

  it("omits the progress card when the reader has not opened the book", async () => {
    fetchMock.mockImplementation(shelfServer({ progress: [] }));

    renderWithProviders(<LibraryItemPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("labels the access button by the state it moves the entry to", async () => {
    fetchMock.mockImplementation(shelfServer({ progress: [] }));

    renderWithProviders(<LibraryItemPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    expect(screen.getByRole("button", { name: AR_LIBRARY.updateReading })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: AR_LIBRARY.updateReading }));

    await waitFor(() => {
      expect(screen.getByText(AR_LIBRARY.statusLabels.owned)).toBeInTheDocument();
    });
  });

  it("returns to the shelf once the removal is confirmed", async () => {
    fetchMock.mockImplementation(shelfServer({ progress: [] }));

    renderWithProviders(<LibraryItemPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    await userEvent.click(screen.getByRole("button", { name: AR_LIBRARY.removeFromLibrary }));

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith("/library");
    });
  });

  it("says why a refused removal failed and stays on the entry", async () => {
    fetchMock.mockImplementation((input, init) => {
      if (init?.method === "DELETE") {
        return Promise.resolve(jsonResponse({ message: "Library item not found" }, 404));
      }
      return shelfServer({ progress: [] })(input, init);
    });

    renderWithProviders(<LibraryItemPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    await userEvent.click(screen.getByRole("button", { name: AR_LIBRARY.removeFromLibrary }));

    expect(await screen.findByText(AR_ERRORS.notFound)).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("says when the entry is not in this library", async () => {
    fetchMock.mockImplementation(shelfServer({ items: [] }));

    renderWithProviders(<LibraryItemPage />);

    expect(
      await screen.findByRole("heading", { name: AR_LIBRARY.notFoundTitle }),
    ).toBeInTheDocument();
  });

  it("reports a failed load with a retry", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ message: "Unauthorized" }, 401))
      .mockImplementation(shelfServer({ progress: [] }));

    renderWithProviders(<LibraryItemPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(AR_ERRORS.sessionExpired);

    await userEvent.click(screen.getByRole("button", { name: AR_COMMON.retry }));

    expect(await screen.findByRole("heading", { level: 1, name: BOOK.title })).toBeInTheDocument();
  });

  it("does not reach for a stock palette", async () => {
    fetchMock.mockImplementation(shelfServer({ progress: [PROGRESS] }));

    const { container } = renderWithProviders(<LibraryItemPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    expect(container.innerHTML).not.toMatch(/text-gray-|bg-white|bg-blue-|bg-green-\d|bg-gray-200/);
  });
});
