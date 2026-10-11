/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";

import { api } from "@/lib/api";
import { AnchorLink } from "@/test-utils/navigation-mock";
import { renderWithProviders } from "@/test-utils/render";

import PaymentsPage from "@/app/(app)/payments/page";

vi.mock("next/link", () => ({
  __esModule: true,
  default: AnchorLink,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getPayment: vi.fn(),
    getPaymentHistory: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);

const mockPayments = [
  {
    id: "pay-1",
    amount: 1000,
    status: "completed",
    createdAt: new Date().toISOString(),
    userId: "user-1",
    currency: "EGP",
    paymentMethod: "credit_card",
    paymobOrderId: "order-1",
    paymobPaymentId: "paymob-1",
    paymobTransactionId: "trans-1",
    description: "Book purchase",
    isRefunded: false,
    refundedAt: null,
    updatedAt: new Date().toISOString(),
  },
];

describe("Payments page", () => {
  beforeEach(() => {
    mockedApi.getPaymentHistory.mockResolvedValue({
      payments: mockPayments,
      total: 1,
      page: 1,
      limit: 20,
    });
  });

  it("renders the page title", async () => {
    renderWithProviders(<PaymentsPage />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "سجل المدفوعات" })).toBeInTheDocument();
    });
  });

  it("calls getPaymentHistory on mount", async () => {
    renderWithProviders(<PaymentsPage />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockedApi.getPaymentHistory).toHaveBeenCalled();
  });

  it("handles loading state", () => {
    renderWithProviders(<PaymentsPage />);
    expect(screen.getByRole("status")).toHaveTextContent("جارٍ التحميل…");
  });

  it("displays payments when available", async () => {
    renderWithProviders(<PaymentsPage />);
    expect(await screen.findByText("1000 EGP")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /pay-1/ })).toHaveAttribute("href", "/payments/pay-1");
  });
});