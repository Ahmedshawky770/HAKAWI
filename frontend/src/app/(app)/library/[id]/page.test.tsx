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
import { LIBRARY_STATUS_LABELS } from "@/components/library/LibraryStatusBadge";
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

function respondWith(options: { items?: LibraryItem[]; progress?: ReadingProgress[] } = {}) {
  return (input: string, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "DELETE") return Promise.resolve(new Response(null, { status: 200 }));
    if (url.includes("/reading-progress")) {
      return Promise.resolve(
        jsonResponse({
          progress: options.progress ?? [],
          total: (options.progress ?? []).length,
          page: 1,
          limit: 20,
        }),
      );
    }
    if (url.includes("/library")) {
      const items = options.items ?? [ITEM];
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

    expect(screen.getByText("جارٍ التحميل…")).toBeInTheDocument();
  });

  it("renders the book as the one level one heading, with its status", async () => {
    fetchMock.mockImplementation(respondWith({ progress: [PROGRESS] }));

    renderWithProviders(<LibraryItemPage />);

    expect(await screen.findByRole("heading", { level: 1, name: BOOK.title })).toBeInTheDocument();
    expect(screen.getByText(LIBRARY_STATUS_LABELS[ITEM.status])).toBeInTheDocument();
    expect(screen.getByText(`بواسطة ${BOOK.author}`)).toBeInTheDocument();
  });

  it("states the page count and the last read date", async () => {
    fetchMock.mockImplementation(respondWith({ progress: [PROGRESS] }));

    renderWithProviders(<LibraryItemPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    expect(screen.getByText(BOOK.pageCount as number)).toHaveClass("hk-numeric");
    expect(screen.getAllByText(/آخر قراءة:/).length).toBeGreaterThan(0);
  });

  it("shows reading progress in a labelled progressbar with the page position", async () => {
    fetchMock.mockImplementation(respondWith({ progress: [PROGRESS] }));

    renderWithProviders(<LibraryItemPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    expect(screen.getByRole("progressbar", { name: "تقدم القراءة" })).toHaveAttribute("aria-valuenow", "30");
    expect(screen.getByText(/الصفحة 90/)).toHaveClass("hk-numeric");
    expect(screen.queryByText(/اكتملت القراءة/)).not.toBeInTheDocument();
  });

  it("announces a finished book in the success tokens", async () => {
    fetchMock.mockImplementation(
      respondWith({
        items: [{ ...ITEM, status: "completed" }],
        progress: [{ ...PROGRESS, progressPercentage: 100, completedAt: "2026-02-01T00:00:00.000Z" }],
      }),
    );

    renderWithProviders(<LibraryItemPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    expect(screen.getByText(/اكتملت القراءة/)).toHaveClass("text-success-ink");
  });

  it("omits the progress card when the reader has not opened the book", async () => {
    fetchMock.mockImplementation(respondWith({ progress: [] }));

    renderWithProviders(<LibraryItemPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("labels the access button by the state it moves the entry to", async () => {
    fetchMock.mockImplementation(respondWith({ progress: [] }));

    renderWithProviders(<LibraryItemPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    expect(screen.getByRole("button", { name: "تحديث القراءة" })).toBeInTheDocument();

    fetchMock.mockImplementation((input, init) =>
      init?.method === "POST" ? Promise.resolve(jsonResponse({ ...ITEM, status: "owned" })) : respondWith()(input, init),
    );

    await userEvent.click(screen.getByRole("button", { name: "تحديث القراءة" }));

    await waitFor(() => {
      expect(screen.getByText(LIBRARY_STATUS_LABELS.owned)).toBeInTheDocument();
    });
  });

  it("returns to the shelf once the removal is confirmed", async () => {
    fetchMock.mockImplementation(respondWith({ progress: [] }));

    renderWithProviders(<LibraryItemPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    await userEvent.click(screen.getByRole("button", { name: "إزالة من المكتبة" }));

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith("/library");
    });
  });

  it("says why a refused removal failed and stays on the entry", async () => {
    fetchMock.mockImplementation((input, init) => {
      if (init?.method === "DELETE") {
        return Promise.resolve(jsonResponse({ message: "Library item not found" }, 404));
      }
      return respondWith({ progress: [] })(input, init);
    });

    renderWithProviders(<LibraryItemPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    await userEvent.click(screen.getByRole("button", { name: "إزالة من المكتبة" }));

    expect(await screen.findByText("Library item not found")).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("says when the entry is not in this library", async () => {
    fetchMock.mockImplementation(respondWith({ items: [] }));

    renderWithProviders(<LibraryItemPage />);

    expect(
      await screen.findByRole("heading", { name: "الكتاب غير موجود في مكتبتك" }),
    ).toBeInTheDocument();
  });

  it("reports a failed load with a retry", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ message: "Unauthorized" }, 401))
      .mockImplementation(respondWith({ progress: [] }));

    renderWithProviders(<LibraryItemPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Unauthorized");

    await userEvent.click(screen.getByRole("button", { name: "أعد المحاولة" }));

    expect(await screen.findByRole("heading", { level: 1, name: BOOK.title })).toBeInTheDocument();
  });

  it("does not reach for a stock palette", async () => {
    fetchMock.mockImplementation(respondWith({ progress: [PROGRESS] }));

    const { container } = renderWithProviders(<LibraryItemPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    expect(container.innerHTML).not.toMatch(/text-gray-|bg-white|bg-blue-|bg-green-\d|bg-gray-200/);
  });
});
