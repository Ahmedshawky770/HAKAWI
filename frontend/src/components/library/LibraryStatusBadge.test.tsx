/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { LIBRARY_ITEM_STATUSES } from "@hakawi/shared-types";

import { renderWithProviders } from "@/test-utils/render";
import { LIBRARY_STATUS_LABELS, LibraryStatusBadge } from "@/components/library/LibraryStatusBadge";
import { LIBRARY_STATUS_TONES, toneFor } from "@/components/ui/Badge";

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

describe("LibraryStatusBadge", () => {
  it("labels every status the API can send, in Arabic", () => {
    for (const status of LIBRARY_ITEM_STATUSES) {
      expect(LIBRARY_STATUS_LABELS[status]).toBeTruthy();
    }
  });

  it("paints each status with the tone the design system assigns it", () => {
    for (const status of LIBRARY_ITEM_STATUSES) {
      const { unmount } = renderWithProviders(<LibraryStatusBadge status={status} />);

      const badge = screen.getByText(LIBRARY_STATUS_LABELS[status]);
      expect(badge.className).toContain(TONE_CLASS[toneFor(LIBRARY_STATUS_TONES, status)]);
      unmount();
    }
  });

  it("takes the tone from the shared map rather than a table of its own", () => {
    renderWithProviders(<LibraryStatusBadge status="reading" />);

    const badge = screen.getByText(LIBRARY_STATUS_LABELS.reading);
    expect(badge.className).toContain(TONE_CLASS[toneFor(LIBRARY_STATUS_TONES, "reading")]);
    expect(badge.className).not.toMatch(/bg-(white|gray|green|yellow|blue)-\d/);
  });

  it("falls back to the raw status and a neutral tone for a state it has never heard of", () => {
    renderWithProviders(<LibraryStatusBadge status="archived-somehow" />);

    expect(screen.getByText("archived-somehow").className).toContain(TONE_CLASS.neutral);
    expect(toneFor(LIBRARY_STATUS_TONES, "archived-somehow")).toBe("neutral");
  });
});
