"use client";

import React from "react";

import { Badge, CONTEST_STATUS_TONES, toneFor, type BadgeTone } from "@/components/ui/Badge";
import { useStrings } from "@/components/providers/LocaleProvider";
import type { ContestsStrings } from "@/lib/i18n/contests";

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
 * THE WORD FOR EACH STATE LIVES IN THE DICTIONARY, NOT HERE. The label used to be
 * a table of Arabic words inside the component, which meant the pill on a card and
 * the pill on a contest's own page were two copies of the same sentence — and an
 * English reader saw an Arabic pill on an otherwise English page. `strings.contests
 * .statusLabels` is the one table, and a status the dictionary does not know falls
 * through unchanged, so a state added later is displayed rather than swallowed.
 */
export function contestStatusTone(status: string): BadgeTone {
  return toneFor(CONTEST_STATUS_TONES, status);
}

export function contestStatusLabel(status: string, strings: ContestsStrings): string {
  return strings.statusLabels[status] ?? status;
}

export function ContestStatusBadge({ status, className = "" }: { status: string; className?: string }) {
  const strings = useStrings();

  return (
    <Badge tone={contestStatusTone(status)} className={className}>
      {contestStatusLabel(status, strings.contests)}
    </Badge>
  );
}
