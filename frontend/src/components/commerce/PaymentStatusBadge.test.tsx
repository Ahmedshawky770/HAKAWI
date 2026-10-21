/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";

import { renderWithProviders } from "@/test-utils/render";
import { PAYMENT_STATUS_TONES } from "@/components/ui/Badge";
import { PaymentStatusBadge, paymentStatusTone } from "@/components/commerce/PaymentStatusBadge";
import { AR, EN } from "@/lib/i18n/payments";

const TONE_CLASS: Record<string, string> = {
  neutral: "text-ink-muted",
  accent: "text-accent-ink",
  chrome: "text-chrome-ink",
  success: "text-success-ink",
  warning: "text-warning-ink",
  error: "text-error-ink",
  info: "text-info-ink",
};

describe("paymentStatusTone", () => {
  it("defers to the shared table for the statuses it names", () => {
    expect(paymentStatusTone("pending")).toBe(PAYMENT_STATUS_TONES.pending);
    expect(paymentStatusTone("completed")).toBe(PAYMENT_STATUS_TONES.completed);
    expect(paymentStatusTone("failed")).toBe(PAYMENT_STATUS_TONES.failed);
    expect(paymentStatusTone("refunded")).toBe(PAYMENT_STATUS_TONES.refunded);
  });

  it("covers the two statuses the API can send and the shared table misses", () => {
    expect(paymentStatusTone("processing")).toBe("info");
    expect(paymentStatusTone("cancelled")).toBe("neutral");
  });

  it("falls back to neutral for a status it has never seen", () => {
    expect(paymentStatusTone("disputed-2099")).toBe("neutral");
  });
});

describe("PaymentStatusBadge", () => {
  it("names every status the API can send, in the dictionary", () => {
    expect(Object.keys(AR.statusLabels)).toEqual([
      "pending",
      "processing",
      "completed",
      "failed",
      "cancelled",
      "refunded",
    ]);
    for (const status of Object.keys(AR.statusLabels)) {
      expect(EN.statusLabels[status as keyof typeof EN.statusLabels], status).toBeTruthy();
    }
  });

  it("renders the dictionary's label in the resolved tone", () => {
    renderWithProviders(<PaymentStatusBadge status="processing" />);
    expect(screen.getByText(AR.statusLabels.processing).className).toContain(TONE_CLASS.info);
  });

  it("renders a failed payment in the error tone", () => {
    renderWithProviders(<PaymentStatusBadge status="failed" />);
    expect(screen.getByText(AR.statusLabels.failed).className).toContain(TONE_CLASS.error);
  });

  it("shows an unknown status unchanged", () => {
    renderWithProviders(<PaymentStatusBadge status="disputed-2099" />);
    expect(screen.getByText("disputed-2099")).toBeInTheDocument();
  });
});
