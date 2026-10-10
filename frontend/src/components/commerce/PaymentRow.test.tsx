/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";

import { AnchorLink } from "@/test-utils/navigation-mock";
import { renderWithProviders } from "@/test-utils/render";
import {
  PaymentListEmpty,
  PaymentListSkeleton,
  PaymentRow,
  PaymentRowSkeleton,
} from "@/components/commerce/PaymentRow";
import { PAYMENT } from "@/test-utils/fixtures";
import type { Payment } from "@/types/api";

vi.mock("next/link", () => ({
  __esModule: true,
  default: AnchorLink,
}));

const PAYMENTS: Payment[] = [
  { ...PAYMENT },
  { ...PAYMENT, id: "payment-2", status: "pending", amount: 250 },
];

describe("PaymentRow", () => {
  it("makes the whole row one link to the detail page", () => {
    renderWithProviders(<PaymentRow payment={PAYMENT} />);

    const link = screen.getByRole("link", { name: /payment-1/ });
    expect(link).toHaveAttribute("href", "/payments/payment-1");
    expect(link.querySelector("button, a")).toBeNull();
  });

  it("shows the identifier, the amount with its currency and the date", () => {
    const { container } = renderWithProviders(<PaymentRow payment={PAYMENT} />);

    expect(screen.getByText(PAYMENT.id)).toHaveClass("hk-numeric");
    expect(screen.getByText(`${PAYMENT.amount} ${PAYMENT.currency}`)).toHaveClass("hk-numeric");
    expect(container.textContent).toContain(new Date(PAYMENT.createdAt).toLocaleDateString("ar-EG"));
  });

  it("labels the status in Arabic with the resolved tone", () => {
    renderWithProviders(
      <>
        <PaymentRow payment={PAYMENTS[0]} />
        <PaymentRow payment={PAYMENTS[1]} />
      </>,
    );

    expect(screen.getByText("مكتملة").className).toContain("text-success-ink");
    expect(screen.getByText("قيد المراجعة").className).toContain("text-warning-ink");
  });

  it("uses design tokens only", () => {
    const { container } = renderWithProviders(<PaymentRow payment={PAYMENT} />);
    expect(container.innerHTML).not.toMatch(/text-gray-|bg-white|border-gray-|text-blue-/);
  });
});

describe("PaymentListSkeleton", () => {
  it("hides the placeholders from assistive technology and counts them", () => {
    const { container } = renderWithProviders(<PaymentListSkeleton count={3} />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelectorAll(".hk-skeleton").length).toBeGreaterThanOrEqual(9);
  });

  it("renders a single row placeholder on its own", () => {
    const { container } = renderWithProviders(<PaymentRowSkeleton />);
    expect(container.querySelectorAll(".hk-skeleton").length).toBeGreaterThan(0);
  });
});

describe("PaymentListEmpty", () => {
  it("says there is no payment yet, in Arabic", () => {
    renderWithProviders(<PaymentListEmpty />);
    expect(screen.getByRole("heading", { name: "لا توجد مدفوعات بعد." })).toBeInTheDocument();
  });
});