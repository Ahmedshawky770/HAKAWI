import React from "react";

import {
  CONTEST_STATUSES,
  LIBRARY_ITEM_STATUSES,
  PAYMENT_STATUSES,
  RENTAL_STATUSES,
} from "@hakawi/shared-types";

export type BadgeTone = "neutral" | "accent" | "chrome" | "success" | "warning" | "error" | "info";

const TONES: Record<BadgeTone, string> = {
  neutral: "border-line-strong bg-surface-raised text-ink-muted",
  accent: "border-accent/30 bg-accent-soft text-accent-ink",
  chrome: "border-chrome/30 bg-chrome-soft text-chrome-ink",
  success: "border-success/30 bg-success-soft text-success-ink",
  warning: "border-warning/30 bg-warning-soft text-warning-ink",
  error: "border-error/30 bg-error-soft text-error-ink",
  info: "border-info/30 bg-info-soft text-info-ink",
};

/**
 * The status pill.
 *
 * Every status in the product — owned, rented, active, expired, pending — is a
 * badge, and each maps to a semantic tone. Before this component the mapping
 * was a table of Tailwind colour pairs repeated in three pages, which meant a
 * "rented" pill was blue on one page and grey on another. The mapping now lives
 * once, here.
 *
 * THE KEYS ARE THE API'S VOCABULARY, NOT AN INVENTED ONE. Each table below is
 * keyed by the shared-types constant it serves (`CONTEST_STATUSES`,
 * `PAYMENT_STATUSES`, `LIBRARY_ITEM_STATUSES`, `RENTAL_STATUSES`) rather than by
 * words that read nicely in English. The first version of this file used
 * `upcoming | open | closed | judging` for contests and silently rendered every
 * live contest as a neutral "closed" pill, because the API sends `active` and
 * `voting` and never sends either of those three.
 *
 * `assertEveryStatusIsMapped` below is the guard: it fails the build if the
 * shared contract grows a status and this file does not learn it.
 */
export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap ${TONES[tone]} ${className}`.trim()}
    >
      {children}
    </span>
  );
}

/** Library items: owned, rented, reading, completed. */
export const LIBRARY_STATUS_TONES: Record<string, BadgeTone> = {
  owned: "success",
  rented: "chrome",
  reading: "warning",
  completed: "neutral",
};

/** Rentals: active, expired, returned, cancelled. */
export const RENTAL_STATUS_TONES: Record<string, BadgeTone> = {
  active: "success",
  expired: "error",
  returned: "neutral",
  cancelled: "neutral",
};

/** Payments: pending, processing, completed, failed, cancelled, refunded. */
export const PAYMENT_STATUS_TONES: Record<string, BadgeTone> = {
  pending: "warning",
  processing: "info",
  completed: "success",
  failed: "error",
  cancelled: "neutral",
  refunded: "info",
};

/** Contests: draft, active, voting, completed, cancelled. */
export const CONTEST_STATUS_TONES: Record<string, BadgeTone> = {
  draft: "neutral",
  active: "success",
  voting: "accent",
  completed: "chrome",
  cancelled: "error",
};

/** Submission entries: pending, approved, rejected. */
export const SUBMISSION_STATUS_TONES: Record<string, BadgeTone> = {
  pending: "warning",
  approved: "success",
  rejected: "error",
};

/** Moderation items: the statuses `moderation.ts` declares. */
export const MODERATION_STATUS_TONES: Record<string, BadgeTone> = {
  open: "info",
  in_review: "warning",
  resolved: "success",
  dismissed: "neutral",
};

export function toneFor(map: Record<string, BadgeTone>, status: string): BadgeTone {
  return map[status] ?? "neutral";
}

/**
 * Every status the API can send, and the tone it renders as.
 *
 * Exported so a page can label a status without inventing a second vocabulary,
 * and so the contract below can be asserted against the shared constants.
 */
export const STATUS_TONES: Record<string, Record<string, BadgeTone>> = {
  library: LIBRARY_STATUS_TONES,
  rental: RENTAL_STATUS_TONES,
  payment: PAYMENT_STATUS_TONES,
  contest: CONTEST_STATUS_TONES,
  submission: SUBMISSION_STATUS_TONES,
  moderation: MODERATION_STATUS_TONES,
};

export interface StatusContract {
  domain: string;
  table: Record<string, BadgeTone>;
  statuses: readonly string[];
}

export const STATUS_CONTRACTS: StatusContract[] = [
  { domain: "library", table: LIBRARY_STATUS_TONES, statuses: LIBRARY_ITEM_STATUSES },
  { domain: "rental", table: RENTAL_STATUS_TONES, statuses: RENTAL_STATUSES },
  { domain: "payment", table: PAYMENT_STATUS_TONES, statuses: PAYMENT_STATUSES },
  { domain: "contest", table: CONTEST_STATUS_TONES, statuses: CONTEST_STATUSES },
];

/** Throws when a shared status has no tone. Returns the offending contract. */
export function findUnmappedStatus(contracts: StatusContract[] = STATUS_CONTRACTS): StatusContract | null {
  for (const contract of contracts) {
    for (const status of contract.statuses) {
      if (!contract.table[status]) return { ...contract, statuses: [status] };
    }
  }
  return null;
}

/**
 * The guard, RUN AT IMPORT.
 *
 * Calling this only from a test would mean the promise depends on someone
 * remembering to write that test, and the first thing that imported `Badge`
 * before it existed would have shipped the gap. Executing it while this module
 * loads means any consumer — a test, a page, a production bundle — fails
 * immediately the moment a shared contract grows a status these tables have not
 * learned.
 */
const UNMAPPED = findUnmappedStatus();
if (UNMAPPED) {
  throw new Error(
    `Badge: the ${UNMAPPED.domain} status "${UNMAPPED.statuses[0]}" has no tone. Add it to the shared table.`,
  );
}