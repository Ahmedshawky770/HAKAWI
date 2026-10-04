/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { RENTAL_STATUSES } from "@hakawi/shared-types";

import { renderWithProviders } from "@/test-utils/render";
import { RENTAL_STATUS_LABELS, RentalStatusBadge } from "@/components/rental/RentalStatusBadge";
import { RENTAL_STATUS_TONES, toneFor } from "@/components/ui/Badge";

/** The class each tone paints its pill with, so the wiring can be asserted without copying the map. */
const TONE_CLASS = {
  neutral: "bg-surface-raised",
  accent: "bg-accent-soft",
  chrome: "bg-chrome-soft",
  success: "bg-success-soft",
  warning: "bg-warning-soft",
  error: "bg-error-soft",
  info: "bg-info-soft",
} as const;

describe("RentalStatusBadge", () => {
  it("labels every status the API can send, in Arabic", () => {
    for (const status of RENTAL_STATUSES) {
      expect(RENTAL_STATUS_LABELS[status]).toBeTruthy();
    }
  });

  it("paints each status with the tone the design system assigns it", () => {
    for (const status of RENTAL_STATUSES) {
      const { unmount } = renderWithProviders(<RentalStatusBadge status={status} />);

      const badge = screen.getByText(RENTAL_STATUS_LABELS[status]);
      expect(badge.className).toContain(TONE_CLASS[toneFor(RENTAL_STATUS_TONES, status)]);
      unmount();
    }
  });

  it("marks a live rental with the success tone", () => {
    renderWithProviders(<RentalStatusBadge status="active" />);

    const badge = screen.getByText(RENTAL_STATUS_LABELS.active);
    expect(badge.className).toContain(TONE_CLASS[toneFor(RENTAL_STATUS_TONES, "active")]);
    expect(badge.className).toContain("text-success-ink");
  });

  it("marks an expired rental with the error tone", () => {
    renderWithProviders(<RentalStatusBadge status="expired" />);

    expect(screen.getByText(RENTAL_STATUS_LABELS.expired).className).toContain(
      TONE_CLASS[toneFor(RENTAL_STATUS_TONES, "expired")],
    );
  });

  it("shows a state it has no label for as it came, rather than blanking it", () => {
    renderWithProviders(<RentalStatusBadge status="archived-2099" />);

    // `overdue` used to be labelled "متأخر" here. It is not in RENTAL_STATUSES, so
    // that was copy for a state the API cannot produce; an unknown state now falls
    // through, which is also what a state added tomorrow will do.
    expect(screen.getByText("archived-2099").className).toContain(TONE_CLASS.neutral);
    expect(toneFor(RENTAL_STATUS_TONES, "archived-2099")).toBe("neutral");
  });
});
