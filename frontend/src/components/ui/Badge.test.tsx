/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import {
  CONTEST_STATUSES,
  CONTEST_SUBMISSION_STATUSES,
  LIBRARY_ITEM_STATUSES,
  PAYMENT_STATUSES,
  RENTAL_STATUSES,
} from "@hakawi/shared-types";
import {
  assertEveryStatusIsMapped,
  Badge,
  CONTEST_STATUS_TONES,
  LIBRARY_STATUS_TONES,
  MODERATION_STATUS_TONES,
  PAYMENT_STATUS_TONES,
  RENTAL_STATUS_TONES,
  STATUS_TONES,
  SUBMISSION_STATUS_TONES,
  toneFor,
} from "@/components/ui/Badge";

describe("Badge", () => {
  it("renders its label inside a pill", () => {
    renderStatuses();
    expect(screen.getByText("مؤجرة")).toBeInTheDocument();
    expect(screen.getByText("مؤجرة").className).toContain("rounded-full");
  });

  it("paints each tone with semantic tokens, so it follows the theme", () => {
    renderStatuses();
    expect(screen.getByText("مملوكة").className).toContain("bg-success-soft");
    expect(screen.getByText("مؤجرة").className).toContain("bg-chrome-soft");
    expect(screen.getByText("متأخرة").className).toContain("bg-error-soft");
    expect(screen.getByText("محجوزة").className).toContain("bg-warning-soft");
  });
});

function renderStatuses() {
  render(
    <ul>
      <li>
        <Badge tone={toneFor(LIBRARY_STATUS_TONES, "owned")}>مملوكة</Badge>
      </li>
      <li>
        <Badge tone={toneFor(LIBRARY_STATUS_TONES, "rented")}>مؤجرة</Badge>
      </li>
      <li>
        <Badge tone={toneFor(RENTAL_STATUS_TONES, "expired")}>متأخرة</Badge>
      </li>
      <li>
        <Badge tone={toneFor(LIBRARY_STATUS_TONES, "reading")}>محجوزة</Badge>
      </li>
    </ul>,
  );
}

describe("the status→tone tables", () => {
  it("covers every status the API can send, in every domain", () => {
    expect(() => assertEveryStatusIsMapped()).not.toThrow();
  });

  it("is keyed by the shared vocabulary rather than by invented words", () => {
    // The regression this guards: a table keyed `open | closed | judging`
    // rendered every live contest as neutral, because the API never sends those.
    for (const status of CONTEST_STATUSES) {
      expect(CONTEST_STATUS_TONES[status], `contest ${status}`).toBeTruthy();
    }
    for (const status of PAYMENT_STATUSES) {
      expect(PAYMENT_STATUS_TONES[status], `payment ${status}`).toBeTruthy();
    }
    for (const status of LIBRARY_ITEM_STATUSES) {
      expect(LIBRARY_STATUS_TONES[status], `library ${status}`).toBeTruthy();
    }
    for (const status of RENTAL_STATUSES) {
      expect(RENTAL_STATUS_TONES[status], `rental ${status}`).toBeTruthy();
    }
    for (const status of CONTEST_SUBMISSION_STATUSES) {
      expect(SUBMISSION_STATUS_TONES[status], `submission ${status}`).toBeTruthy();
    }
    for (const status of ["open", "in_review", "resolved", "dismissed"]) {
      expect(MODERATION_STATUS_TONES[status], `moderation ${status}`).toBeTruthy();
    }
  });

  it("marks a live contest as live, not as a finished one", () => {
    expect(toneFor(CONTEST_STATUS_TONES, "active")).toBe("success");
    expect(toneFor(CONTEST_STATUS_TONES, "voting")).toBe("accent");
  });

  it("treats an unknown status as neutral instead of inventing a colour", () => {
    expect(toneFor(LIBRARY_STATUS_TONES, "teleported")).toBe("neutral");
  });

  it("exposes every table by domain, so a page never imports a private map", () => {
    expect(Object.keys(STATUS_TONES).sort()).toEqual([
      "contest",
      "library",
      "moderation",
      "payment",
      "rental",
      "submission",
    ]);
  });
});