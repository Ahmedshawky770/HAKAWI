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
import { formatDate, intlLocale } from "@/lib/i18n";
import { DEFAULT_LOCALE } from "@/lib/preferences";
import { PAYMENT } from "@/test-utils/fixtures";
import { AR as AR_PAYMENTS } from "@/lib/i18n/payments";
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
    // The amount is in PIASTRES: 100 piastres is 1.00 EGP, not "100 EGP".
    expect(screen.getByText("1.00 ج.م")).toHaveClass("hk-numeric");
    expect(container.textContent).toContain(formatDate(PAYMENT.createdAt, intlLocale(DEFAULT_LOCALE)));
  });

  it("labels the status in Arabic with the resolved tone", () => {
    renderWithProviders(
      <>
        <PaymentRow payment={PAYMENTS[0]} />
        <PaymentRow payment={PAYMENTS[1]} />
      </>,
    );

    expect(screen.getByText(AR_PAYMENTS.statusLabels.completed).className).toContain("text-success-ink");
    expect(screen.getByText(AR_PAYMENTS.statusLabels.pending).className).toContain("text-warning-ink");
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
  it("says there is no payment yet", () => {
    renderWithProviders(<PaymentListEmpty />);
    expect(screen.getByRole("heading", { name: AR_PAYMENTS.emptyTitle })).toBeInTheDocument();
  });
});