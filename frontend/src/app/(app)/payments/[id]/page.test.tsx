/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AnchorLink } from "@/test-utils/navigation-mock";
import { renderWithProviders } from "@/test-utils/render";
import { createDeferred, jsonResponse } from "@/test-utils/support";
import { PAYMENT } from "@/test-utils/fixtures";
import PaymentDetailPage from "@/app/(app)/payments/[id]/page";

vi.mock("next/link", () => ({
  __esModule: true,
  default: AnchorLink,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "payment-1" }),
}));

const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function lastCall(): { input: string; init?: RequestInit } | undefined {
  const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return call ? { input: call[0], init: call[1] } : undefined;
}

describe("payment detail page", () => {
  it("announces a loading state while the payment is in flight", () => {
    fetchMock.mockReturnValue(createDeferred<Response>().promise);

    renderWithProviders(<PaymentDetailPage />);

    expect(screen.getByText("جارٍ التحميل…")).toBeInTheDocument();
  });

  it("requests the payment of the route parameter", async () => {
    fetchMock.mockResolvedValue(jsonResponse(PAYMENT));

    renderWithProviders(<PaymentDetailPage />);

    await screen.findByText(PAYMENT.id);
    expect(lastCall()?.input).toContain("/payments/payment-1");
  });

  it("renders the amount and currency as the primary figure", async () => {
    fetchMock.mockResolvedValue(jsonResponse(PAYMENT));

    renderWithProviders(<PaymentDetailPage />);

    expect(await screen.findByText(`${PAYMENT.amount} ${PAYMENT.currency}`)).toBeInTheDocument();
  });

  it("renders the payment status badge", async () => {
    fetchMock.mockResolvedValue(jsonResponse(PAYMENT));

    renderWithProviders(<PaymentDetailPage />);

    expect(await screen.findByText("مكتملة")).toBeInTheDocument();
  });

  it("offers a way back to the payment history", async () => {
    fetchMock.mockResolvedValue(jsonResponse(PAYMENT));

    renderWithProviders(<PaymentDetailPage />);

    expect(await screen.findByRole("link", { name: /العودة للمدفوعات/ })).toHaveAttribute("href", "/payments");
  });

  it("reports a failed load with a retry", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ message: "Payment not found" }, 404))
      .mockResolvedValueOnce(jsonResponse(PAYMENT));

    renderWithProviders(<PaymentDetailPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Payment not found");

    await userEvent.click(screen.getByRole("button", { name: "أعد المحاولة" }));

    expect(await screen.findByText(PAYMENT.id)).toBeInTheDocument();
  });

  it("does not reach for a stock palette", async () => {
    fetchMock.mockResolvedValue(jsonResponse(PAYMENT));

    const { container } = renderWithProviders(<PaymentDetailPage />);
    await screen.findByText(PAYMENT.id);

    expect(container.innerHTML).not.toMatch(/text-gray-|bg-white|bg-blue-|text-red-6/);
  });
});
