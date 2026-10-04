/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AnchorLink } from "@/test-utils/navigation-mock";
import { renderWithProviders } from "@/test-utils/render";
import { createDeferred, jsonResponse } from "@/test-utils/support";
import { BOOK } from "@/test-utils/fixtures";
import RentalDetailPage from "@/app/(app)/rentals/[id]/page";
import { RENTAL_STATUS_LABELS } from "@/components/rental/RentalStatusBadge";
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

function respondWith(options: { rental?: Rental; progress?: ReadingProgress[] } = {}) {
  return (input: string) => {
    const url = String(input);
    if (url.includes("/reading-progress")) {
      const progress = options.progress ?? [];
      return Promise.resolve(jsonResponse({ progress, total: progress.length, page: 1, limit: 20 }));
    }
    if (url.includes("/rentals/rental-1")) return Promise.resolve(jsonResponse(options.rental ?? RENTAL));
    return Promise.resolve(jsonResponse(BOOK));
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("rental detail page", () => {
  it("announces a loading state while the rental is in flight", () => {
    fetchMock.mockReturnValue(createDeferred<Response>().promise);

    renderWithProviders(<RentalDetailPage />);

    expect(screen.getByText("جارٍ التحميل…")).toBeInTheDocument();
  });

  it("renders the book as the one level one heading, with the rental status", async () => {
    fetchMock.mockImplementation(respondWith({ progress: [] }));

    renderWithProviders(<RentalDetailPage />);

    expect(await screen.findByRole("heading", { level: 1, name: BOOK.title })).toBeInTheDocument();
    expect(screen.getByText(RENTAL_STATUS_LABELS.active)).toBeInTheDocument();
    expect(screen.getByText(`بواسطة ${BOOK.author}`)).toBeInTheDocument();
  });

  it("states the dates and the extension count in numeric figures", async () => {
    fetchMock.mockImplementation(respondWith({ progress: [] }));

    renderWithProviders(<RentalDetailPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    expect(screen.getByText("تاريخ البدء:")).toBeInTheDocument();
    expect(screen.getByText("تاريخ الانتهاء:")).toBeInTheDocument();
    expect(screen.getByText("0 / 3")).toHaveClass("hk-numeric");
  });

  it("shows reading progress when there is some", async () => {
    fetchMock.mockImplementation(respondWith({ progress: [PROGRESS] }));

    renderWithProviders(<RentalDetailPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    expect(screen.getByRole("progressbar", { name: "تقدم القراءة" })).toHaveAttribute("aria-valuenow", "15");
    expect(screen.getByRole("link", { name: "تحديث القراءة من مكتبتي" })).toHaveAttribute("href", "/library");
  });

  it("omits the progress card entirely when the reader has not started", async () => {
    fetchMock.mockImplementation(respondWith({ progress: [] }));

    renderWithProviders(<RentalDetailPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "تحديث القراءة من مكتبتي" })).not.toBeInTheDocument();
  });

  it("extends by the chosen length", async () => {
    fetchMock.mockImplementation((input, init) => {
      const url = String(input);
      if (init?.method === "POST" && url.includes("/extend")) {
        return Promise.resolve(jsonResponse({ ...RENTAL, extendedCount: 1, endDate: "2026-01-22T00:00:00.000Z" }));
      }
      return respondWith({ progress: [] })(url);
    });

    renderWithProviders(<RentalDetailPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "مدة التمديد" }), "14");
    await userEvent.click(screen.getByRole("button", { name: "تمديد الإيجار" }));

    await waitFor(() => {
      expect(screen.getByText("1 / 3")).toBeInTheDocument();
    });
    const extendCall = fetchMock.mock.calls.find(([url]) => String(url).includes("/extend"));
    expect(String(extendCall?.[1]?.body)).toContain('"extensionDays":14');
  });

  it("will not extend until a length is chosen", async () => {
    fetchMock.mockImplementation(respondWith({ progress: [] }));

    renderWithProviders(<RentalDetailPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    expect(screen.getByRole("button", { name: "تمديد الإيجار" })).toBeDisabled();
  });

  it("says why a refused extension failed", async () => {
    fetchMock.mockImplementation((input, init) => {
      const url = String(input);
      if (init?.method === "POST" && url.includes("/extend")) {
        return Promise.resolve(jsonResponse({ message: "Invalid extension duration" }, 400));
      }
      return respondWith({ progress: [] })(url);
    });

    renderWithProviders(<RentalDetailPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "مدة التمديد" }), "14");
    await userEvent.click(screen.getByRole("button", { name: "تمديد الإيجار" }));

    expect(await screen.findByText("Invalid extension duration")).toBeInTheDocument();
  });

  it("returns the rental and stops offering the actions", async () => {
    fetchMock.mockImplementation((input, init) => {
      const url = String(input);
      if (init?.method === "POST" && url.includes("/return")) {
        return Promise.resolve(jsonResponse({ ...RENTAL, status: "returned" }));
      }
      return respondWith({ progress: [] })(url);
    });

    renderWithProviders(<RentalDetailPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    await userEvent.click(screen.getByRole("button", { name: "إرجاع الكتاب" }));

    await waitFor(() => {
      expect(screen.getByText(RENTAL_STATUS_LABELS.returned)).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "إرجاع الكتاب" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "إجراءات" })).not.toBeInTheDocument();
  });

  it("hides the extension control once the cap is reached", async () => {
    fetchMock.mockImplementation(respondWith({ rental: { ...RENTAL, extendedCount: 3 }, progress: [] }));

    renderWithProviders(<RentalDetailPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "إرجاع الكتاب" })).toBeInTheDocument();
  });

  it("reports a failed load with a retry", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ message: "Rental not found" }, 404))
      .mockImplementation(respondWith({ progress: [] }));

    renderWithProviders(<RentalDetailPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Rental not found");

    await userEvent.click(screen.getByRole("button", { name: "أعد المحاولة" }));

    expect(await screen.findByRole("heading", { level: 1, name: BOOK.title })).toBeInTheDocument();
  });

  it("does not reach for a stock palette", async () => {
    fetchMock.mockImplementation(respondWith({ progress: [PROGRESS] }));

    const { container } = renderWithProviders(<RentalDetailPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    expect(container.innerHTML).not.toMatch(/text-gray-|bg-white|bg-blue-|bg-green-\d|bg-gray-200/);
  });
});
