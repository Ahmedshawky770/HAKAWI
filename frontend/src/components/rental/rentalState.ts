import { RENTAL_STATUSES, type Rental } from "@hakawi/shared-types";

import { RENTAL_STATUS_TONES, toneFor, type BadgeTone } from "@/components/ui/Badge";

/**
 * What a rental's pill should say, which is not quite what its `status` says.
 *
 * WHY THIS FILE EXISTS. "Overdue" is a real state in this product and it is not a
 * status. The database stores a rental as `active` until a scheduled job expires
 * it; the backend finds the overdue ones with `findOverdue()`, which is
 * `status = 'active' AND endDate < now`, and exposes them at
 * `GET /rentals/overdue`. So `status` alone tells the reader a rental is "نشط"
 * three weeks after it ended — and the API will never send them `overdue`, which
 * is why an `overdue` entry in a label table was copy for a state the API cannot
 * produce.
 *
 * The fix is not a seventh status and not a new request. It is the same
 * comparison the backend makes, made from the two fields already in hand, in one
 * place — so the reader is never told a rental is active when it is not, and the
 * client stays a subscriber to the server's data rather than a second opinion.
 *
 * `now` is a parameter rather than a hidden `Date.now()` so this is testable: a
 * clock argument is what makes "expired yesterday" assertable at all.
 */

/** A derived state, not a stored one. */
export const RENTAL_OVERDUE_STATE = "overdue";

export type RentalDisplayState = (typeof RENTAL_STATUSES)[number] | typeof RENTAL_OVERDUE_STATE;

/** The states the contract declares, in Arabic. Only these are ever stored. */
export const RENTAL_STATUS_LABELS: Record<string, string> = {
  active: "نشط",
  expired: "منتهي",
  returned: "مُرجع",
  cancelled: "ملغى",
  [RENTAL_OVERDUE_STATE]: "متأخر",
};

export interface RentalStateView {
  state: RentalDisplayState;
  label: string;
  tone: BadgeTone;
  /** True only while the rental is still running or rescuable — never for an ended one. */
  overdue: boolean;
}

/** Just the date fields, so a caller can pass a `Rental` or anything shaped like one. */
export type RentalTiming = Pick<Rental, "status" | "endDate">;

/**
 * The displayed state of a rental.
 *
 * Overdue is `active` past its `endDate` — the same predicate the backend uses,
 * so the pill and the gateway agree about when a rental has run out. An
 * unparseable date is treated as NOT overdue: showing an error the data cannot
 * support is worse than showing the status the server sent.
 */
export function rentalStateView(rental: RentalTiming, now: number | Date = Date.now()): RentalStateView {
  const at = now instanceof Date ? now.getTime() : now;
  const endedAt = Date.parse(rental.endDate);

  if (rental.status === "active" && Number.isFinite(endedAt) && endedAt <= at) {
    return { state: RENTAL_OVERDUE_STATE, label: RENTAL_STATUS_LABELS[RENTAL_OVERDUE_STATE], tone: "error", overdue: true };
  }

  return {
    state: rental.status as RentalDisplayState,
    label: RENTAL_STATUS_LABELS[rental.status] ?? rental.status,
    tone: toneFor(RENTAL_STATUS_TONES, rental.status),
    overdue: false,
  };
}
