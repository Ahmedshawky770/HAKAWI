/// <reference types="@testing-library/jest-dom/vitest" />

import { describe, expect, it } from "vitest";
import { RENTAL_STATUSES } from "@hakawi/shared-types";

import { rentalStateView, RENTAL_OVERDUE_STATE, RENTAL_STATUS_LABELS } from "@/components/rental/rentalState";

/**
 * Overdue is not a status, and that is the whole point of this suite.
 *
 * The backend stores a rental as `active` until a job expires it, finds the
 * overdue ones with `status = 'active' AND endDate < now`, and exposes them at
 * `GET /rentals/overdue`. So the client has to derive it — from the two fields it
 * already has — or the reader is told "نشط" about a rental that ended last month.
 *
 * `now` is passed explicitly rather than read from the clock, so every case here is
 * deterministic instead of depending on the day the suite runs.
 */
const NOW = new Date("2026-03-10T08:00:00.000Z");

describe("rentalStateView", () => {
  it("reads a running rental as active, not as overdue", () => {
    const view = rentalStateView({ status: "active", endDate: "2026-04-01T00:00:00.000Z" }, NOW);

    expect(view.state).toBe("active");
    expect(view.label).toBe("نشط");
    expect(view.tone).toBe("success");
    expect(view.overdue).toBe(false);
  });

  it("derives overdue from an active rental whose end date has passed", () => {
    const view = rentalStateView({ status: "active", endDate: "2026-03-01T00:00:00.000Z" }, NOW);

    expect(view.state).toBe(RENTAL_OVERDUE_STATE);
    expect(view.label).toBe("متأخر");
    expect(view.tone).toBe("error");
    expect(view.overdue).toBe(true);
  });

  it("treats the exact end instant as ended, because the day is up at that moment", () => {
    const view = rentalStateView({ status: "active", endDate: NOW.toISOString() }, NOW);
    expect(view.overdue).toBe(true);
  });

  it("never calls an already-expired rental overdue: that state has its own name", () => {
    const view = rentalStateView({ status: "expired", endDate: "2026-01-01T00:00:00.000Z" }, NOW);

    expect(view.state).toBe("expired");
    expect(view.label).toBe("منتهي");
    expect(view.overdue).toBe(false);
  });

  it("labels every status the contract declares, in Arabic", () => {
    for (const status of RENTAL_STATUSES) {
      expect(RENTAL_STATUS_LABELS[status], status).toBeTruthy();
      expect(rentalStateView({ status, endDate: "2026-12-01T00:00:00.000Z" }, NOW).label).not.toBe(status);
    }
  });

  it("passes an unknown status through rather than inventing a label for it", () => {
    // A state added to the API tomorrow is displayed as the API words it, and the
    // import guard in Badge.tsx catches the missing tone on the shared side.
    const view = rentalStateView({ status: "archived-2099", endDate: "2026-12-01T00:00:00.000Z" }, NOW);

    expect(view.label).toBe("archived-2099");
    expect(view.tone).toBe("neutral");
  });

  it("does not claim a rental is overdue when its end date cannot be read", () => {
    // An error the data cannot support is worse than the status the server sent.
    for (const endDate of ["", "not-a-date"]) {
      const view = rentalStateView({ status: "active", endDate }, NOW);
      expect(view.overdue).toBe(false);
      expect(view.state).toBe("active");
    }
  });

  it("accepts a clock argument as a Date as well as a timestamp", () => {
    const view = rentalStateView({ status: "active", endDate: "2026-03-05T00:00:00.000Z" }, NOW);
    expect(view.overdue).toBe(true);
  });
});
