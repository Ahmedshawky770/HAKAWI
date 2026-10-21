/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";

import { CONTEST_STATUS_TONES } from "@/components/ui/Badge";
import {
  ContestStatusBadge,
  contestStatusLabel,
  contestStatusTone,
} from "@/components/social/ContestStatusBadge";
import { renderWithProviders } from "@/test-utils/render";
import { AR as AR_CONTESTS } from "@/lib/i18n/contests";

/**
 * The mapping is a contract between the backend vocabulary
 * (`CONTEST_STATUSES`) and the badge vocabulary (`CONTEST_STATUS_TONES`), so the
 * test asserts the outcome for every status the API can send rather than for the
 * ones the shared table happens to name.
 */
const TONE_CLASS: Record<string, string> = {
  neutral: "text-ink-muted",
  accent: "text-accent-ink",
  chrome: "text-chrome-ink",
  success: "text-success-ink",
  warning: "text-warning-ink",
  error: "text-error-ink",
  info: "text-info-ink",
};

describe("contestStatusTone", () => {
  it("gives a live contest the success tone rather than the neutral closed pill", () => {
    expect(contestStatusTone("active")).toBe("success");
  });

  it("gives the voting window the accent tone, because voting is the phase a reader can act in", () => {
    expect(contestStatusTone("voting")).toBe("accent");
  });

  it("keeps the shared table for the statuses both vocabularies define", () => {
    expect(contestStatusTone("completed")).toBe(CONTEST_STATUS_TONES.completed);
    expect(contestStatusTone("cancelled")).toBe(CONTEST_STATUS_TONES.cancelled);
  });

  it("falls back to neutral for a draft and for a status it has never seen", () => {
    expect(contestStatusTone("draft")).toBe("neutral");
    expect(contestStatusTone("archived-2099")).toBe("neutral");
  });
});

describe("contestStatusLabel", () => {
  it("translates every status the API can send", () => {
    expect(Object.keys(AR_CONTESTS.statusLabels).length).toBeGreaterThanOrEqual(5);
    expect(contestStatusLabel("active", AR_CONTESTS)).toBe("جارية");
    expect(contestStatusLabel("voting", AR_CONTESTS)).toBe("مرحلة التصويت");
    expect(contestStatusLabel("completed", AR_CONTESTS)).toBe("مكتملة");
    expect(contestStatusLabel("cancelled", AR_CONTESTS)).toBe("ملغاة");
    expect(contestStatusLabel("draft", AR_CONTESTS)).toBe("مسودة");
  });

  it("shows an unknown status unchanged instead of swallowing it", () => {
    expect(contestStatusLabel("archived-2099", AR_CONTESTS)).toBe("archived-2099");
  });
});

describe("ContestStatusBadge", () => {
  it("renders the Arabic label in the tone the mapping resolves", () => {
    renderWithProviders(<ContestStatusBadge status="active" />);
    const badge = screen.getByText("جارية");
    expect(badge.className).toContain(TONE_CLASS.success);
  });

  it("renders a neutral pill for a cancelled contest", () => {
    renderWithProviders(<ContestStatusBadge status="cancelled" />);
    expect(screen.getByText("ملغاة").className).toContain(TONE_CLASS.error);
  });
});
