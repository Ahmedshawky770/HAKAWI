/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";


vi.mock("@/components/ui/Button", () => ({__esModule: true, default: {to: "/", className: ""}}));
vi.mock("@/components/ui/Card", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/EmptyState", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/ErrorMessage", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/Loading", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/Skeleton", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/Avatar", () => ({__esModule: true, default: "div"}));
import { api } from "@/lib/api";
import { paymentsListResponseSchema } from "@/lib/schemas";

import PaymentsPage from "@/app/(app)/payments/page";

vi.mock("next/link", () => ({
  __esModule: true,
  default: {
    to: "/",
    className: "",
  },
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

  it("renders the page title", () => {
    render(<PaymentsPage />);
    expect(screen.getByRole("heading", { name: "المدفوعات" })).toBeInTheDocument();
  });

  it("calls getPaymentHistory on mount", async () => {
    render(<PaymentsPage />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockedApi.getPaymentHistory).toHaveBeenCalled();
  });

  it("handles loading state", () => {
    render(<PaymentsPage />);
    expect(screen.getByRole("status", { name: "جارٍ التحميل…" })).toBeInTheDocument();
  });

  it("displays payments when available", async () => {
    render(<PaymentsPage />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByText("1,000")).toBeInTheDocument();
  });
});