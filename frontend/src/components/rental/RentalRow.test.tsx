/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AnchorLink } from "@/test-utils/navigation-mock";
import { renderWithProviders } from "@/test-utils/render";
import { BOOK } from "@/test-utils/fixtures";
import {
  EXTENSION_DURATION_OPTIONS,
  RentalListSkeleton,
  RentalRow,
  RentalRowSkeleton,
  type RentalWithBook,
} from "@/components/rental/RentalRow";
import { RENTAL_STATUSES } from "@hakawi/shared-types";
import { RENTAL_STATUS_LABELS } from "@/components/rental/RentalStatusBadge";
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

describe("RentalRow", () => {
  it("names the book and links to it", () => {
    renderRow(rental());

    expect(screen.getByRole("link", { name: BOOK.title })).toHaveAttribute("href", `/books/${BOOK.id}`);
    expect(screen.getByText(BOOK.author)).toBeInTheDocument();
  });

  it("offers the details link to the rental", () => {
    renderRow(rental());

    expect(screen.getByRole("link", { name: "عرض التفاصيل" })).toHaveAttribute("href", "/rentals/rental-1");
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
      expect(screen.getByText(RENTAL_STATUS_LABELS[status])).toBeInTheDocument();
      unmount();
    }
  });

  it("marks an expired rental with the error tone rather than a stock red", () => {
    renderRow(rental({ status: "expired" }));

    const badge = screen.getByText(RENTAL_STATUS_LABELS.expired);
    expect(badge.className).toContain("bg-error-soft");
    expect(badge.className).not.toMatch(/red-\d/);
  });

  it("offers the extension lengths the shared rental vocabulary allows", () => {
    renderRow(rental());

    const select = screen.getByRole("combobox", { name: "مدة التمديد" });
    const values = Array.from(select.querySelectorAll("option")).map((option) => option.value);
    expect(values).toEqual(["", "7", "14", "30"]);
  });

  it("will not extend until a length is chosen", async () => {
    const onExtend = vi.fn();
    const onExtendDaysChange = vi.fn();
    const { rerender } = renderRow(rental(), { onExtend, onExtendDaysChange });

    expect(screen.getByRole("button", { name: "تمديد" })).toBeDisabled();

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "مدة التمديد" }), "14");
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

    await userEvent.click(screen.getByRole("button", { name: "تمديد" }));
    expect(onExtend).toHaveBeenCalledTimes(1);
  });

  it("reports the chosen length", async () => {
    const onExtendDaysChange = vi.fn();
    renderRow(rental(), { onExtendDaysChange });

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "مدة التمديد" }), "30");

    expect(onExtendDaysChange).toHaveBeenCalledWith(30);
  });

  it("hides the extension control once every extension is used", () => {
    renderRow(rental({ extendedCount: 3, maxExtensions: 3 }));

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "تمديد" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "إرجاع" })).toBeInTheDocument();
  });

  it("offers no actions at all once the rental is returned", () => {
    renderRow(rental({ status: "returned", returnedAt: "2026-01-20T00:00:00.000Z" }));

    expect(screen.queryByRole("button", { name: "تمديد" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "إرجاع" })).not.toBeInTheDocument();
  });

  it("states the return date once the book is back", () => {
    renderRow(rental({ status: "returned", returnedAt: "2026-01-20T00:00:00.000Z" }));

    expect(screen.getByText("تاريخ الإرجاع:")).toBeInTheDocument();
  });

  it("reports a return when the return button is pressed", async () => {
    const onReturn = vi.fn();
    renderRow(rental(), { onReturn });

    await userEvent.click(screen.getByRole("button", { name: "إرجاع" }));

    expect(onReturn).toHaveBeenCalledTimes(1);
  });

  it("keeps rendering when the book behind the rental could not be fetched", () => {
    const withoutBook: RentalWithBook = { ...rental() };
    delete withoutBook.book;

    renderRow(withoutBook);

    expect(screen.getByRole("link", { name: "كتاب" })).toBeInTheDocument();
  });

  it("uses design system tokens rather than a stock palette", () => {
    const { container } = renderRow(rental());

    expect(container.innerHTML).not.toMatch(/bg-white|text-gray-|bg-blue-|red-\d/);
  });
});

describe("EXTENSION_DURATION_OPTIONS", () => {
  it("offers a placeholder and the three extension lengths the API accepts", () => {
    expect(EXTENSION_DURATION_OPTIONS).toEqual([
      { value: "", label: "مدة التمديد" },
      { value: "7", label: "أسبوع واحد" },
      { value: "14", label: "أسبوعان" },
      { value: "30", label: "شهر واحد" },
    ]);
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
