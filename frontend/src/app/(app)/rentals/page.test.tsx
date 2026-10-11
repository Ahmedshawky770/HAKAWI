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
import { RENTAL_STATUS_LABELS } from "@/components/rental/RentalStatusBadge";
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

function respondWith(rentals: Rental[]) {
  return (input: string) => {
    const url = String(input);
    if (url.includes("/rentals/my")) {
      return Promise.resolve(jsonResponse({ rentals, total: rentals.length, page: 1, limit: 50 }));
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

describe("rentals page", () => {
  it("announces a loading state while the rentals are in flight", () => {
    fetchMock.mockReturnValue(createDeferred<Response>().promise);

    renderWithProviders(<RentalsPage />);

    expect(screen.getByText("جارٍ تحميل الإيجارات").closest("[role='status']")).not.toBeNull();
  });

  it("keeps one level one heading on the page", async () => {
    fetchMock.mockImplementation(respondWith([RENTAL]));

    renderWithProviders(<RentalsPage />);

    expect(await screen.findByRole("heading", { level: 1, name: "إيجاراتي" })).toBeInTheDocument();
  });

  it("renders the book, the status, the dates and the extensions of a rental", async () => {
    fetchMock.mockImplementation(respondWith([RENTAL]));

    const { container } = renderWithProviders(<RentalsPage />);
    await screen.findByRole("heading", { name: BOOK.title });

    expect(screen.getByText(RENTAL_STATUS_LABELS.active)).toBeInTheDocument();
    expect(screen.getByText("تاريخ البدء:")).toBeInTheDocument();
    expect(screen.getByText("تاريخ الانتهاء:")).toBeInTheDocument();
    expect(screen.getByText("0 / 3")).toHaveClass("hk-numeric");
    expect(container.querySelectorAll(".hk-numeric").length).toBeGreaterThanOrEqual(3);
  });

  it("links the title to the book and the row to its own page", async () => {
    fetchMock.mockImplementation(respondWith([RENTAL]));

    renderWithProviders(<RentalsPage />);
    await screen.findByRole("heading", { name: BOOK.title });

    expect(screen.getByRole("link", { name: BOOK.title })).toHaveAttribute("href", `/books/${BOOK.id}`);
    expect(screen.getByRole("link", { name: "عرض التفاصيل" })).toHaveAttribute("href", "/rentals/rental-1");
  });

  it("extends by the chosen length and writes the server's answer back into the row", async () => {
    const extended: Rental = { ...RENTAL, endDate: "2026-01-22T00:00:00.000Z", extendedCount: 1 };
    fetchMock.mockImplementation((input, init) => {
      const url = String(input);
      if (init?.method === "POST" && url.includes("/extend")) return Promise.resolve(jsonResponse(extended));
      return respondWith([RENTAL])(url);
    });

    renderWithProviders(<RentalsPage />);
    await screen.findByRole("heading", { name: BOOK.title });

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "مدة التمديد" }), "7");
    await userEvent.click(screen.getByRole("button", { name: "تمديد" }));

    await waitFor(() => {
      expect(screen.getByText("1 / 3")).toBeInTheDocument();
    });
    const extendCall = fetchMock.mock.calls.find(([url]) => String(url).includes("/extend"));
    expect(String(extendCall?.[1]?.body)).toContain('"extensionDays":7');
  });

  it("says why an extension failed and keeps the rental as it was", async () => {
    fetchMock.mockImplementation((input, init) => {
      const url = String(input);
      if (init?.method === "POST" && url.includes("/extend")) {
        return Promise.resolve(jsonResponse({ message: "Maximum extensions reached" }, 403));
      }
      return respondWith([RENTAL])(url);
    });

    renderWithProviders(<RentalsPage />);
    await screen.findByRole("heading", { name: BOOK.title });

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "مدة التمديد" }), "7");
    await userEvent.click(screen.getByRole("button", { name: "تمديد" }));

    expect(await screen.findByText("Maximum extensions reached")).toBeInTheDocument();
    expect(screen.getByText("0 / 3")).toBeInTheDocument();
  });

  it("returns a rental and shows the returned state", async () => {
    fetchMock.mockImplementation((input, init) => {
      const url = String(input);
      if (init?.method === "POST" && url.includes("/return")) {
        return Promise.resolve(jsonResponse({ ...RENTAL, status: "returned" }));
      }
      return respondWith([RENTAL])(url);
    });

    renderWithProviders(<RentalsPage />);
    await screen.findByRole("heading", { name: BOOK.title });

    await userEvent.click(screen.getByRole("button", { name: "إرجاع" }));

    await waitFor(() => {
      expect(screen.getByText(RENTAL_STATUS_LABELS.returned)).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "تمديد" })).not.toBeInTheDocument();
  });

  it("hides the extension control when every extension is used up", async () => {
    fetchMock.mockImplementation(respondWith([{ ...RENTAL, extendedCount: 3, maxExtensions: 3 }]));

    renderWithProviders(<RentalsPage />);
    await screen.findByRole("heading", { name: BOOK.title });

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "إرجاع" })).toBeInTheDocument();
  });

  it("offers no actions on a rental that is already returned", async () => {
    fetchMock.mockImplementation(
      respondWith([{ ...RENTAL, status: "returned", returnedAt: "2026-01-20T00:00:00.000Z" }]),
    );

    renderWithProviders(<RentalsPage />);
    await screen.findByRole("heading", { name: BOOK.title });

    expect(screen.queryByRole("button", { name: "إرجاع" })).not.toBeInTheDocument();
    expect(screen.getByText("تاريخ الإرجاع:")).toBeInTheDocument();
  });

  it("renders a rental whose book could not be fetched", async () => {
    fetchMock.mockImplementation((input) =>
      String(input).includes("/books/")
        ? Promise.resolve(jsonResponse({ message: "gone" }, 404))
        : respondWith([RENTAL])(input),
    );

    renderWithProviders(<RentalsPage />);

    expect(await screen.findByRole("link", { name: "كتاب" })).toBeInTheDocument();
  });

  it("offers the catalogue to a reader with no rentals", async () => {
    fetchMock.mockImplementation(respondWith([]));

    renderWithProviders(<RentalsPage />);

    expect(await screen.findByRole("heading", { name: "لا توجد إيجارات" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "تصفح الكتب" })).toHaveAttribute("href", "/books");
  });

  it("reports a failed load and refetches on retry", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockImplementation(respondWith([RENTAL]));

    renderWithProviders(<RentalsPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to fetch");

    await userEvent.click(screen.getByRole("button", { name: "أعد المحاولة" }));

    expect(await screen.findByRole("heading", { name: BOOK.title })).toBeInTheDocument();
  });

  it("does not reach for a stock palette", async () => {
    fetchMock.mockImplementation(respondWith([RENTAL]));

    const { container } = renderWithProviders(<RentalsPage />);
    await screen.findByRole("heading", { name: BOOK.title });

    expect(container.innerHTML).not.toMatch(/text-gray-|bg-white|bg-blue-|bg-green-|bg-red-/);
  });
});
