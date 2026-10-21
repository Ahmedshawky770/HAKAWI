/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AnchorLink } from "@/test-utils/navigation-mock";
import { renderWithProviders } from "@/test-utils/render";
import { createDeferred, jsonResponse } from "@/test-utils/support";
import { BOOK } from "@/test-utils/fixtures";
import RentalDetailPage from "@/app/(app)/rentals/[id]/page";
import { AR as AR_RENTALS } from "@/lib/i18n/rentals";
import { AR as AR_LIBRARY } from "@/lib/i18n/library";
import { AR as AR_ERRORS } from "@/lib/i18n/errors";
import { AR as AR_COMMON } from "@/lib/i18n/common";
import type { ReadingProgress, Rental } from "@/types/api";

vi.mock("next/link", () => ({
  __esModule: true,
  default: AnchorLink,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "rental-1" }),
  useRouter: () => ({ push: vi.fn() }),
}));

const RENTAL: Rental = {
  id: "rental-1",
  userId: "user-1",
  bookId: BOOK.id,
  status: "active",
  startDate: "2026-01-01T00:00:00.000Z",
  endDate: "2026-01-15T00:00:00.000Z",
  extendedCount: 0,
  maxExtensions: 3,
  returnedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const PROGRESS: ReadingProgress = {
  id: "progress-1",
  bookId: BOOK.id,
  currentPage: 45,
  totalPages: 300,
  progressPercentage: 15,
  lastReadAt: "2026-01-09T00:00:00.000Z",
  completedAt: null,
};

const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

/**
 * A rental that behaves like a server: it is returned, extended and quoted the
 * way the endpoints say it is, so the page's cache ends up holding the server's
 * answer rather than the reader's guess.
 */
function rentalServer(options: { rental?: Rental; progress?: ReadingProgress[] } = {}) {
  let rental = options.rental ?? RENTAL;

  return (input: string, init?: RequestInit) => {
    const url = String(input);

    if (url.includes("/reading-progress")) {
      const progress = options.progress ?? [];
      return Promise.resolve(jsonResponse({ progress, total: progress.length, page: 1, limit: 20 }));
    }

    if (url.includes("/extend/quote")) {
      const days = Number(new URL(url, "http://localhost").searchParams.get("days") ?? "0");
      return Promise.resolve(
        jsonResponse({
          rentalId: rental.id,
          bookId: rental.bookId,
          extensionDays: days,
          amount: days * 1000,
          currency: "EGP",
        }),
      );
    }

    if (init?.method === "POST" && url.includes("/return")) {
      rental = { ...rental, status: "returned", returnedAt: "2026-01-20T00:00:00.000Z" };
      return Promise.resolve(jsonResponse(rental));
    }

    if (init?.method === "POST" && url.includes("/extend")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { extensionDays?: number };
      const days = body.extensionDays ?? 0;
      rental = {
        ...rental,
        extendedCount: rental.extendedCount + 1,
        endDate: new Date(Date.parse(rental.endDate) + days * 24 * 60 * 60 * 1000).toISOString(),
      };
      return Promise.resolve(jsonResponse(rental));
    }

    if (url.includes("/rentals/rental-1")) {
      return Promise.resolve(jsonResponse(rental));
    }

    return Promise.resolve(jsonResponse(BOOK));
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

/**
 * The clock is pinned. This component derives "overdue" from `endDate` against the
 * current time, so a suite that left the real calendar in place would change its
 * verdict on the day it ran — a test that fails because it is October is a test
 * that hides a real bug behind a date.
 */
const NOW = new Date("2026-01-10T08:00:00.000Z");

beforeEach(() => {
  // `shouldAdvanceTime` keeps `waitFor` and `userEvent` working: they schedule real
  // timers, and a fully frozen clock never fires them. The starting instant is
  // still pinned, which is what the overdue verdict depends on.
  vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("rental detail page", () => {
  it("announces a loading state while the rental is in flight", () => {
    fetchMock.mockReturnValue(createDeferred<Response>().promise);

    renderWithProviders(<RentalDetailPage />);

    expect(screen.getByText(AR_COMMON.loading)).toBeInTheDocument();
  });

  it("renders the book as the one level one heading, with the rental status", async () => {
    fetchMock.mockImplementation(rentalServer({ progress: [] }));

    renderWithProviders(<RentalDetailPage />);

    expect(await screen.findByRole("heading", { level: 1, name: BOOK.title })).toBeInTheDocument();
    expect(screen.getByText(AR_RENTALS.statusLabels.active)).toBeInTheDocument();
    expect(screen.getByText(AR_RENTALS.authorByline(BOOK.author))).toBeInTheDocument();
  });

  it("states the dates and the extension count in numeric figures", async () => {
    fetchMock.mockImplementation(rentalServer({ progress: [] }));

    renderWithProviders(<RentalDetailPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    expect(screen.getByText(AR_RENTALS.startDateLabel)).toBeInTheDocument();
    expect(screen.getByText(AR_RENTALS.endDateLabel)).toBeInTheDocument();
    expect(screen.getByText("0 / 3")).toHaveClass("hk-numeric");
  });

  it("shows reading progress when there is some", async () => {
    fetchMock.mockImplementation(rentalServer({ progress: [PROGRESS] }));

    renderWithProviders(<RentalDetailPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    // The progress card is the library surface's, so its words are the library
    // namespace's — the rental page borrows the card, not its copy.
    expect(screen.getByRole("progressbar", { name: AR_LIBRARY.progressLabel })).toHaveAttribute(
      "aria-valuenow",
      "15",
    );
    expect(screen.getByRole("link", { name: AR_RENTALS.updateFromLibrary })).toHaveAttribute("href", "/library");
  });

  it("omits the progress card entirely when the reader has not started", async () => {
    fetchMock.mockImplementation(rentalServer({ progress: [] }));

    renderWithProviders(<RentalDetailPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: AR_RENTALS.updateFromLibrary })).not.toBeInTheDocument();
  });

  it("quotes the price of an extension before the reader commits to it", async () => {
    fetchMock.mockImplementation(rentalServer({ progress: [] }));

    renderWithProviders(<RentalDetailPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: AR_RENTALS.extensionDurationLabel }),
      "14",
    );

    // 14 days at 1000 piastres a day is 14000 piastres: 140.00 EGP.
    expect(await screen.findByText("140.00 ج.م")).toHaveClass("hk-numeric");
  });

  it("extends by the chosen length", async () => {
    fetchMock.mockImplementation(rentalServer({ progress: [] }));

    renderWithProviders(<RentalDetailPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: AR_RENTALS.extensionDurationLabel }),
      "14",
    );
    await userEvent.click(screen.getByRole("button", { name: AR_RENTALS.extendRentalAction }));

    await waitFor(() => {
      expect(screen.getByText("1 / 3")).toBeInTheDocument();
    });
    // The quote is a read and the extension is the write; only the write carries
    // the length the reader chose.
    const extendCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url).includes("/extend") && !String(url).includes("/quote") && init?.method === "POST",
    );
    expect(String(extendCall?.[1]?.body)).toContain('"extensionDays":14');
  });

  it("will not extend until a length is chosen", async () => {
    fetchMock.mockImplementation(rentalServer({ progress: [] }));

    renderWithProviders(<RentalDetailPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    expect(screen.getByRole("button", { name: AR_RENTALS.extendRentalAction })).toBeDisabled();
  });

  it("says why a refused extension failed", async () => {
    fetchMock.mockImplementation((input, init) => {
      const url = String(input);
      if (init?.method === "POST" && url.includes("/extend")) {
        return Promise.resolve(jsonResponse({ message: "Invalid extension duration" }, 400));
      }
      return rentalServer({ progress: [] })(input, init);
    });

    renderWithProviders(<RentalDetailPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: AR_RENTALS.extensionDurationLabel }),
      "14",
    );
    await userEvent.click(screen.getByRole("button", { name: AR_RENTALS.extendRentalAction }));

    // The client now classifies by the STATUS as well as by the wording, so a
    // 400 is "validation" and the reader is told to check what they sent
    // instead of being told that something went wrong.
    expect(await screen.findByText(AR_ERRORS.validation)).toBeInTheDocument();
  });

  it("returns the rental and stops offering the actions", async () => {
    fetchMock.mockImplementation(rentalServer({ progress: [] }));

    renderWithProviders(<RentalDetailPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    await userEvent.click(screen.getByRole("button", { name: AR_RENTALS.returnBookAction }));

    await waitFor(() => {
      expect(screen.getByText(AR_RENTALS.statusLabels.returned)).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: AR_RENTALS.returnBookAction })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: AR_RENTALS.actionsHeading })).not.toBeInTheDocument();
  });

  it("hides the extension control once the cap is reached", async () => {
    fetchMock.mockImplementation(rentalServer({ rental: { ...RENTAL, extendedCount: 3 }, progress: [] }));

    renderWithProviders(<RentalDetailPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: AR_RENTALS.returnBookAction })).toBeInTheDocument();
  });

  it("reports a failed load with a retry", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ message: "Rental not found" }, 404))
      .mockImplementation(rentalServer({ progress: [] }));

    renderWithProviders(<RentalDetailPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(AR_ERRORS.notFound);

    await userEvent.click(screen.getByRole("button", { name: AR_COMMON.retry }));

    expect(await screen.findByRole("heading", { level: 1, name: BOOK.title })).toBeInTheDocument();
  });

  it("does not reach for a stock palette", async () => {
    fetchMock.mockImplementation(rentalServer({ progress: [PROGRESS] }));

    const { container } = renderWithProviders(<RentalDetailPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    expect(container.innerHTML).not.toMatch(/text-gray-|bg-white|bg-blue-|bg-green-\d|bg-gray-200/);
  });
});
