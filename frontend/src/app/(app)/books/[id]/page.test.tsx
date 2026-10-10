/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import BookDetailPage from "@/app/(app)/books/[id]/page";

vi.mock("next/link", () => ({
  __esModule: true,
  default: AnchorLink,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "book-1" }),
}));

const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();
const assign = vi.fn();
const originalLocation = Object.getOwnPropertyDescriptor(window, "location");

const CHECKOUT = {
  paymentId: "payment-1",
  orderId: "order-1",
  checkoutUrl: "https://paymob.test/checkout/abc",
  acceptUrl: "https://accept.paymob.test/abc",
  status: "pending",
};

beforeEach(() => {
  fetchMock.mockReset();
  assign.mockReset();
  Object.defineProperty(window, "location", { configurable: true, writable: true, value: { assign } });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  if (originalLocation) Object.defineProperty(window, "location", originalLocation);
});

function lastCall(): { input: string; init?: RequestInit } | undefined {
  const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return call ? { input: call[0], init: call[1] } : undefined;
}

describe("book detail page", () => {
  it("announces a loading state while the book is in flight", () => {
    fetchMock.mockReturnValue(createDeferred<Response>().promise);

    renderWithProviders(<BookDetailPage />);

    expect(screen.getByText("جارٍ التحميل…")).toBeInTheDocument();
  });

  it("requests the book of the route parameter", async () => {
    fetchMock.mockResolvedValue(jsonResponse(BOOK));

    renderWithProviders(<BookDetailPage />);

    await screen.findByRole("heading", { level: 1, name: BOOK.title });
    expect(lastCall()?.input).toContain("/books/book-1");
  });

  it("renders the title as the one level one heading, with the author and the price", async () => {
    fetchMock.mockResolvedValue(jsonResponse(BOOK));

    renderWithProviders(<BookDetailPage />);

    expect(await screen.findByRole("heading", { level: 1, name: BOOK.title })).toBeInTheDocument();
    expect(screen.getByText(`بواسطة ${BOOK.author}`)).toBeInTheDocument();
    expect(screen.getByText("25.00 ج.م")).toHaveClass("hk-numeric");
  });

  it("offers a way back to the catalogue", async () => {
    fetchMock.mockResolvedValue(jsonResponse(BOOK));

    renderWithProviders(<BookDetailPage />);

    expect(await screen.findByRole("link", { name: /العودة للكتب/ })).toHaveAttribute("href", "/books");
  });

  it("quotes the default rental length from the shared daily rate", async () => {
    fetchMock.mockResolvedValue(jsonResponse(BOOK));

    renderWithProviders(<BookDetailPage />);

    await screen.findByRole("heading", { level: 1, name: BOOK.title });
    expect(screen.getByText(/ج\.م \/ 14 يوم/)).toBeInTheDocument();
  });

  it("re-quotes the rental when another length is chosen", async () => {
    fetchMock.mockResolvedValue(jsonResponse(BOOK));

    renderWithProviders(<BookDetailPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "مدة الإيجار" }), "30");

    expect(screen.getByText(/ج\.م \/ 30 يوم/)).toBeInTheDocument();
  });

  it("offers every rental length the shared vocabulary allows", async () => {
    fetchMock.mockResolvedValue(jsonResponse(BOOK));

    renderWithProviders(<BookDetailPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    const values = Array.from(
      screen.getByRole("combobox", { name: "مدة الإيجار" }).querySelectorAll("option"),
    ).map((option) => option.value);
    expect(values).toEqual(["1", "3", "7", "14", "30", "90"]);
  });

  it("refuses to charge without a payment method and says so inline", async () => {
    fetchMock.mockResolvedValue(jsonResponse(BOOK));

    renderWithProviders(<BookDetailPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    await userEvent.click(screen.getByRole("button", { name: "شراء الكتاب" }));

    expect(await screen.findAllByText("الرجاء إدخال معرّف طريقة الدفع")).not.toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends the reader to the gateway with the checkout it was given", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(BOOK)).mockResolvedValueOnce(jsonResponse(CHECKOUT));

    renderWithProviders(<BookDetailPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    await userEvent.type(screen.getByLabelText("معرّف طريقة الدفع"), "pm_123456");
    await userEvent.click(screen.getByRole("button", { name: "شراء الكتاب" }));

    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith(CHECKOUT.checkoutUrl);
    });
    expect(lastCall()?.init?.body).toContain("pm_123456");
  });

  it("rents with the chosen length and the same gateway contract", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(BOOK)).mockResolvedValueOnce(jsonResponse(CHECKOUT));

    renderWithProviders(<BookDetailPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "مدة الإيجار" }), "7");
    await userEvent.type(screen.getByLabelText("معرّف طريقة الدفع"), "pm_123456");
    await userEvent.click(screen.getByRole("button", { name: "استئجار الكتاب" }));

    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith(CHECKOUT.checkoutUrl);
    });
    expect(lastCall()?.init?.body).toContain('"durationDays":7');
  });

  it("surfaces a refused purchase inline and in a toast, never in an alert dialog", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(BOOK))
      .mockResolvedValueOnce(jsonResponse({ message: "Payment method declined" }, 402));

    renderWithProviders(<BookDetailPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    await userEvent.type(screen.getByLabelText("معرّف طريقة الدفع"), "pm_123456");
    await userEvent.click(screen.getByRole("button", { name: "شراء الكتاب" }));

    const alerts = await screen.findAllByRole("alert");
    expect(alerts.some((alert) => alert.textContent?.includes("Payment method declined"))).toBe(true);
    expect(assign).not.toHaveBeenCalled();
  });

  it("reports a failed load with a retry", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ message: "Book not found" }, 404))
      .mockResolvedValueOnce(jsonResponse(BOOK));

    renderWithProviders(<BookDetailPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Book not found");

    await userEvent.click(screen.getByRole("button", { name: "أعد المحاولة" }));

    expect(await screen.findByRole("heading", { level: 1, name: BOOK.title })).toBeInTheDocument();
  });

  it("does not reach for a stock palette", async () => {
    fetchMock.mockResolvedValue(jsonResponse(BOOK));

    const { container } = renderWithProviders(<BookDetailPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    expect(container.innerHTML).not.toMatch(/text-gray-|bg-white|bg-blue-|text-red-6/);
  });
});
