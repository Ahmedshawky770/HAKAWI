/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AnchorLink } from "@/test-utils/navigation-mock";
import { renderWithProviders } from "@/test-utils/render";
import { BOOK } from "@/test-utils/fixtures";
import {
  extensionDurationOptions,
  RentalListSkeleton,
  RentalRow,
  RentalRowSkeleton,
  type RentalWithBook,
} from "@/components/rental/RentalRow";
import { RENTAL_DURATION_DAYS, RENTAL_STATUSES } from "@hakawi/shared-types";
import { AR as AR_RENTALS } from "@/lib/i18n/rentals";
import type { Rental } from "@/types/api";

vi.mock("next/link", () => ({
  __esModule: true,
  default: AnchorLink,
}));

function rental(overrides: Partial<Rental> = {}): RentalWithBook {
  return {
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
    book: BOOK,
    ...overrides,
  };
}

function renderRow(row: RentalWithBook, handlers: Partial<Parameters<typeof RentalRow>[0]> = {}) {
  return renderWithProviders(
    <RentalRow
      rental={row}
      extendDays=""
      onExtendDaysChange={vi.fn()}
      onExtend={vi.fn()}
      onReturn={vi.fn()}
      {...handlers}
    />,
  );
}

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

describe("RentalRow", () => {
  it("names the book and links to it", () => {
    renderRow(rental());

    expect(screen.getByRole("link", { name: BOOK.title })).toHaveAttribute("href", `/books/${BOOK.id}`);
    expect(screen.getByText(BOOK.author)).toBeInTheDocument();
  });

  it("offers the details link to the rental", () => {
    renderRow(rental());

    expect(screen.getByRole("link", { name: AR_RENTALS.detailsAction })).toHaveAttribute("href", "/rentals/rental-1");
  });

  it("states both dates and the extension count in numeric figures", () => {
    const { container } = renderRow(rental());

    const numerics = Array.from(container.querySelectorAll(".hk-numeric"));
    expect(numerics).toHaveLength(3);
    expect(numerics.some((node) => node.textContent?.includes("/ 3"))).toBe(true);
  });

  it("labels each rental state in Arabic and colours it from the design system", () => {
    for (const status of RENTAL_STATUSES) {
      const { unmount } = renderRow(rental({ status }));
      expect(screen.getByText(AR_RENTALS.statusLabels[status])).toBeInTheDocument();
      unmount();
    }
  });

  it("marks an expired rental with the error tone rather than a stock red", () => {
    renderRow(rental({ status: "expired" }));

    const badge = screen.getByText(AR_RENTALS.statusLabels.expired);
    expect(badge.className).toContain("bg-error-soft");
    expect(badge.className).not.toMatch(/red-\d/);
  });

  it("offers the extension lengths the shared rental vocabulary allows", () => {
    renderRow(rental());

    const select = screen.getByRole("combobox", { name: AR_RENTALS.extensionDurationLabel });
    const values = Array.from(select.querySelectorAll("option")).map((option) => option.value);
    expect(values).toEqual(["", "7", "14", "30"]);
  });

  it("will not extend until a length is chosen", async () => {
    const onExtend = vi.fn();
    const onExtendDaysChange = vi.fn();
    const { rerender } = renderRow(rental(), { onExtend, onExtendDaysChange });

    expect(screen.getByRole("button", { name: AR_RENTALS.extendAction })).toBeDisabled();

    await userEvent.selectOptions(screen.getByRole("combobox", { name: AR_RENTALS.extensionDurationLabel }), "14");
    expect(onExtendDaysChange).toHaveBeenCalledWith(14);
    expect(onExtend).not.toHaveBeenCalled();

    rerender(
      <RentalRow
        rental={rental()}
        extendDays={14}
        onExtendDaysChange={onExtendDaysChange}
        onExtend={onExtend}
        onReturn={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: AR_RENTALS.extendAction }));
    expect(onExtend).toHaveBeenCalledTimes(1);
  });

  it("reports the chosen length", async () => {
    const onExtendDaysChange = vi.fn();
    renderRow(rental(), { onExtendDaysChange });

    await userEvent.selectOptions(screen.getByRole("combobox", { name: AR_RENTALS.extensionDurationLabel }), "30");

    expect(onExtendDaysChange).toHaveBeenCalledWith(30);
  });

  it("hides the extension control once every extension is used", () => {
    renderRow(rental({ extendedCount: 3, maxExtensions: 3 }));

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: AR_RENTALS.extendAction })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: AR_RENTALS.returnAction })).toBeInTheDocument();
  });

  it("offers no actions at all once the rental is returned", () => {
    renderRow(rental({ status: "returned", returnedAt: "2026-01-20T00:00:00.000Z" }));

    expect(screen.queryByRole("button", { name: AR_RENTALS.extendAction })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: AR_RENTALS.returnAction })).not.toBeInTheDocument();
  });

  it("states the return date once the book is back", () => {
    renderRow(rental({ status: "returned", returnedAt: "2026-01-20T00:00:00.000Z" }));

    expect(screen.getByText(AR_RENTALS.returnedAtLabel)).toBeInTheDocument();
  });

  it("reports a return when the return button is pressed", async () => {
    const onReturn = vi.fn();
    renderRow(rental(), { onReturn });

    await userEvent.click(screen.getByRole("button", { name: AR_RENTALS.returnAction }));

    expect(onReturn).toHaveBeenCalledTimes(1);
  });

  it("keeps rendering when the book behind the rental could not be fetched", () => {
    const withoutBook: RentalWithBook = { ...rental() };
    delete withoutBook.book;

    renderRow(withoutBook);

    expect(screen.getByRole("link", { name: AR_RENTALS.unknownBookTitle })).toBeInTheDocument();
  });

  it("uses design system tokens rather than a stock palette", () => {
    const { container } = renderRow(rental());

    expect(container.innerHTML).not.toMatch(/bg-white|text-gray-|bg-blue-|red-\d/);
  });
});

describe("extensionDurationOptions", () => {
  it("offers a placeholder and the three extension lengths the API accepts", () => {
    expect(extensionDurationOptions(AR_RENTALS)).toEqual([
      { value: "", label: AR_RENTALS.extensionDurationLabel },
      { value: "7", label: AR_RENTALS.extensionOptions["7"] },
      { value: "14", label: AR_RENTALS.extensionOptions["14"] },
      { value: "30", label: AR_RENTALS.extensionOptions["30"] },
    ]);
  });

  it("offers only lengths the shared rental vocabulary allows", () => {
    const values = extensionDurationOptions(AR_RENTALS)
      .map((option) => Number(option.value))
      .filter((days) => days > 0);

    for (const days of values) {
      expect(RENTAL_DURATION_DAYS).toContain(days);
    }
  });
});

describe("RentalRowSkeleton", () => {
  it("holds a cover placeholder so the list does not jump", () => {
    const { container } = renderWithProviders(<RentalRowSkeleton />);

    expect(container.querySelector("[class~='w-24']")).not.toBeNull();
  });
});

describe("RentalListSkeleton", () => {
  it("renders one placeholder per requested rental and hides them from readers of the page", () => {
    const { container } = renderWithProviders(<RentalListSkeleton count={2} />);

    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelectorAll("[class~='w-24']")).toHaveLength(2);
  });
});
