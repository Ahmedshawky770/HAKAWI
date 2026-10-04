/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { PAYMENT_STATUS_TONES } from "@/components/ui/Badge";
import {
  PAYMENT_STATUS_LABELS,
  PaymentStatusBadge,
  paymentStatusLabel,
  paymentStatusTone,
} from "@/components/commerce/PaymentStatusBadge";

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

describe("paymentStatusLabel", () => {
  it("translates every status PAYMENT_STATUSES can send", () => {
    expect(Object.keys(PAYMENT_STATUS_LABELS)).toEqual([
      "pending",
      "processing",
      "completed",
      "failed",
      "cancelled",
      "refunded",
    ]);
    expect(paymentStatusLabel("pending")).toBe("قيد المراجعة");
    expect(paymentStatusLabel("failed")).toBe("فشلت");
    expect(paymentStatusLabel("refunded")).toBe("مستردّة");
  });

  it("shows an unknown status unchanged", () => {
    expect(paymentStatusLabel("disputed-2099")).toBe("disputed-2099");
  });
});

describe("PaymentStatusBadge", () => {
  it("renders the Arabic label in the resolved tone", () => {
    render(<PaymentStatusBadge status="processing" />);
    expect(screen.getByText("قيد المعالجة").className).toContain(TONE_CLASS.info);
  });

  it("renders a failed payment in the error tone", () => {
    render(<PaymentStatusBadge status="failed" />);
    expect(screen.getByText("فشلت").className).toContain(TONE_CLASS.error);
  });
});