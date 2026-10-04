import React from "react";

import { Badge, CONTEST_STATUS_TONES, toneFor, type BadgeTone } from "@/components/ui/Badge";

/**
 * The contest status pill.
 *
 * The tone comes from `CONTEST_STATUS_TONES`, which is keyed by `CONTEST_STATUSES`
 * from `@hakawi/shared-types` — the same list the API validates against. This
 * component used to carry its own overlay table for the three statuses the shared
 * one missed; that overlay existed because the shared table was keyed on
 * `upcoming | open | closed | judging`, words the contests API never sends, which
 * made every live contest render as a neutral "closed" pill. The shared table is
 * fixed, so the overlay is gone: one table per domain, and a status that arrives
 * tomorrow is a change in one place.
 *
 * Only the LABELS live here — the Arabic word for each state is presentation, and
 * the API speaks English. An unknown status falls through unchanged, so a state
 * added later is displayed rather than swallowed.
 */
export const CONTEST_STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  active: "جارية",
  voting: "مرحلة التصويت",
  completed: "مكتملة",
  cancelled: "ملغاة",
};

export function contestStatusTone(status: string): BadgeTone {
  return toneFor(CONTEST_STATUS_TONES, status);
}

export function contestStatusLabel(status: string): string {
  return CONTEST_STATUS_LABELS[status] ?? status;
}

export function ContestStatusBadge({ status, className = "" }: { status: string; className?: string }) {
  return (
    <Badge tone={contestStatusTone(status)} className={className}>
      {contestStatusLabel(status)}
    </Badge>
  );
}
