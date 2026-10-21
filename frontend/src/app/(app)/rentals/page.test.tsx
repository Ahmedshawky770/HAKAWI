/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AnchorLink } from "@/test-utils/navigation-mock";
import { renderWithProviders } from "@/test-utils/render";
import { createDeferred, jsonResponse } from "@/test-utils/support";
import { BOOK } from "@/test-utils/fixtures";
import RentalsPage from "@/app/(app)/rentals/page";
import { AR as AR_RENTALS, EN as EN_RENTALS } from "@/lib/i18n/rentals";
import { AR as AR_ERRORS } from "@/lib/i18n/errors";
import { AR as AR_COMMON } from "@/lib/i18n/common";
import type { Rental } from "@/types/api";

vi.mock("next/link", () => ({
  __esModule: true,
  default: AnchorLink,
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

const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

/**
 * A list of rentals that behaves like a server.
 *
 * A returned rental comes back returned, and an extended rental comes back with
 * the extension the reader asked for. The page writes the server's answer into
 * its cache and then invalidates the list, so a mock that answered with the
 * original rental would be testing a server that ignores the reader.
 */
function rentalServer(initial: Rental[], overrides: (url: string, init?: RequestInit) => Response | null = () => null) {
  const rentals = [...initial];

  return (input: string, init?: RequestInit) => {
    const url = String(input);
    const override = overrides(url, init);
    if (override) return Promise.resolve(override);

    if (init?.method === "POST" && url.includes("/return")) {
      const returned: Rental = {
        ...rentals[0],
        status: "returned",
        returnedAt: "2026-01-20T00:00:00.000Z",
      };
      rentals[0] = returned;
      return Promise.resolve(jsonResponse(returned));
    }

    if (init?.method === "POST" && url.includes("/extend")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { extensionDays?: number };
      const days = body.extensionDays ?? 0;
      const current = rentals[0];
      const extended: Rental = {
        ...current,
        extendedCount: current.extendedCount + 1,
        endDate: new Date(Date.parse(current.endDate) + days * 24 * 60 * 60 * 1000).toISOString(),
      };
      rentals[0] = extended;
      return Promise.resolve(jsonResponse(extended));
    }

    if (url.includes("/rentals/my")) {
      return Promise.resolve(jsonResponse({ rentals, total: rentals.length, page: 1, limit: 50 }));
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

describe("rentals page", () => {
  it("announces a loading state while the rentals are in flight", () => {
    fetchMock.mockReturnValue(createDeferred<Response>().promise);

    renderWithProviders(<RentalsPage />);

    expect(screen.getByText(AR_RENTALS.loadingLabel).closest("[role='status']")).not.toBeNull();
  });

  it("keeps one level one heading on the page", async () => {
    fetchMock.mockImplementation(rentalServer([RENTAL]));

    renderWithProviders(<RentalsPage />);

    expect(await screen.findByRole("heading", { level: 1, name: AR_RENTALS.pageTitle })).toBeInTheDocument();
  });

  it("renders the book, the status, the dates and the extensions of a rental", async () => {
    fetchMock.mockImplementation(rentalServer([RENTAL]));

    const { container } = renderWithProviders(<RentalsPage />);
    await screen.findByRole("heading", { name: BOOK.title });

    expect(screen.getByText(AR_RENTALS.statusLabels.active)).toBeInTheDocument();
    expect(screen.getByText(AR_RENTALS.startDateLabel)).toBeInTheDocument();
    expect(screen.getByText(AR_RENTALS.endDateLabel)).toBeInTheDocument();
    expect(screen.getByText("0 / 3")).toHaveClass("hk-numeric");
    expect(container.querySelectorAll(".hk-numeric").length).toBeGreaterThanOrEqual(3);
  });

  it("links the title to the book and the row to its own page", async () => {
    fetchMock.mockImplementation(rentalServer([RENTAL]));

    renderWithProviders(<RentalsPage />);
    await screen.findByRole("heading", { name: BOOK.title });

    expect(screen.getByRole("link", { name: BOOK.title })).toHaveAttribute("href", `/books/${BOOK.id}`);
    expect(screen.getByRole("link", { name: AR_RENTALS.detailsAction })).toHaveAttribute(
      "href",
      "/rentals/rental-1",
    );
  });

  it("extends by the chosen length and writes the server's answer back into the row", async () => {
    fetchMock.mockImplementation(rentalServer([RENTAL]));

    renderWithProviders(<RentalsPage />);
    await screen.findByRole("heading", { name: BOOK.title });

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: AR_RENTALS.extensionDurationLabel }),
      "7",
    );
    await userEvent.click(screen.getByRole("button", { name: AR_RENTALS.extendAction }));

    await waitFor(() => {
      expect(screen.getByText("1 / 3")).toBeInTheDocument();
    });
    const extendCall = fetchMock.mock.calls.find(([url]) => String(url).includes("/extend"));
    expect(String(extendCall?.[1]?.body)).toContain('"extensionDays":7');
  });

  it("says why an extension failed and keeps the rental as it was", async () => {
    fetchMock.mockImplementation(
      rentalServer([RENTAL], (url, init) =>
        init?.method === "POST" && url.includes("/extend")
          ? jsonResponse({ message: "Maximum extensions reached" }, 403)
          : null,
      ),
    );

    renderWithProviders(<RentalsPage />);
    await screen.findByRole("heading", { name: BOOK.title });

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: AR_RENTALS.extensionDurationLabel }),
      "7",
    );
    await userEvent.click(screen.getByRole("button", { name: AR_RENTALS.extendAction }));

    // The client now classifies by the STATUS as well as by the wording, so a
    // 403 is "forbidden" and the reader is told their role is the problem
    // instead of being told that something went wrong.
    expect(await screen.findByText(AR_ERRORS.forbidden)).toBeInTheDocument();
    expect(screen.getByText("0 / 3")).toBeInTheDocument();
  });

  it("returns a rental and shows the returned state", async () => {
    fetchMock.mockImplementation(rentalServer([RENTAL]));

    renderWithProviders(<RentalsPage />);
    await screen.findByRole("heading", { name: BOOK.title });

    await userEvent.click(screen.getByRole("button", { name: AR_RENTALS.returnAction }));

    await waitFor(() => {
      expect(screen.getByText(AR_RENTALS.statusLabels.returned)).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: AR_RENTALS.extendAction })).not.toBeInTheDocument();
  });

  it("hides the extension control when every extension is used up", async () => {
    fetchMock.mockImplementation(rentalServer([{ ...RENTAL, extendedCount: 3, maxExtensions: 3 }]));

    renderWithProviders(<RentalsPage />);
    await screen.findByRole("heading", { name: BOOK.title });

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: AR_RENTALS.returnAction })).toBeInTheDocument();
  });

  it("offers no actions on a rental that is already returned", async () => {
    fetchMock.mockImplementation(
      rentalServer([{ ...RENTAL, status: "returned", returnedAt: "2026-01-20T00:00:00.000Z" }]),
    );

    renderWithProviders(<RentalsPage />);
    await screen.findByRole("heading", { name: BOOK.title });

    expect(screen.queryByRole("button", { name: AR_RENTALS.returnAction })).not.toBeInTheDocument();
    expect(screen.getByText(AR_RENTALS.returnedAtLabel)).toBeInTheDocument();
  });

  it("renders a rental whose book could not be fetched", async () => {
    fetchMock.mockImplementation((input, init) =>
      String(input).includes("/books/")
        ? Promise.resolve(jsonResponse({ message: "gone" }, 404))
        : rentalServer([RENTAL])(input, init),
    );

    renderWithProviders(<RentalsPage />);

    expect(await screen.findByRole("link", { name: AR_RENTALS.unknownBookTitle })).toBeInTheDocument();
  });

  it("offers the catalogue to a reader with no rentals", async () => {
    fetchMock.mockImplementation(rentalServer([]));

    renderWithProviders(<RentalsPage />);

    expect(await screen.findByRole("heading", { name: AR_RENTALS.emptyTitle })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: AR_RENTALS.browseBooks })).toHaveAttribute("href", "/books");
  });

  it("reports a failed load and refetches on retry", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockImplementation(rentalServer([RENTAL]));

    renderWithProviders(<RentalsPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(AR_ERRORS.network);

    await userEvent.click(screen.getByRole("button", { name: AR_COMMON.retry }));

    expect(await screen.findByRole("heading", { name: BOOK.title })).toBeInTheDocument();
  });

  it("does not reach for a stock palette", async () => {
    fetchMock.mockImplementation(rentalServer([RENTAL]));

    const { container } = renderWithProviders(<RentalsPage />);
    await screen.findByRole("heading", { name: BOOK.title });

    expect(container.innerHTML).not.toMatch(/text-gray-|bg-white|bg-blue-|bg-green-|bg-red-/);
  });

  it("speaks the reader's language", async () => {
    // The locale is read from the document, so setting it is how the product
    // switches. Every word on this surface comes from the dictionary, so the
    // English list is the English list — not an Arabic one with a few labels.
    document.documentElement.setAttribute("lang", "en");

    fetchMock.mockImplementation(rentalServer([RENTAL]));

    renderWithProviders(<RentalsPage />);

    expect(await screen.findByRole("heading", { level: 1, name: EN_RENTALS.pageTitle })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: EN_RENTALS.returnAction })).toBeInTheDocument();
    expect(screen.getByText(EN_RENTALS.statusLabels.active)).toBeInTheDocument();
  });
});
