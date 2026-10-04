import React from "react";
import { isContestStatus } from "@hakawi/shared-types";

import { Badge, CONTEST_STATUS_TONES, toneFor, type BadgeTone } from "@/components/ui/Badge";

/**
 * The contest status pill.
 *
 * `CONTEST_STATUS_TONES` in `components/ui/Badge` is keyed on a vocabulary the
 * contests API does not use: it carries `upcoming`, `open`, `closed` and
 * `judging`, while `CONTEST_STATUSES` — the contract in
 * `packages/shared-types/src/contest.ts` — is `draft`, `active`, `voting`,
 * `completed`, `cancelled`. Only `completed` and `cancelled` overlap, so calling
 * `toneFor` alone renders every live contest as the neutral "closed" pill, which
 * makes an open contest look like a finished one.
 *
 * The shared map is still consulted first, because it owns the tones for the keys
 * it does define. `API_STATUS_TONES` below covers exactly the three statuses the
 * shared map misses, and nothing else — so when the shared vocabulary and the
 * API agree, the shared table is the one that decides (Principle #9: one place
 * per fact).
 */
const API_STATUS_TONES: Record<string, BadgeTone> = {
  draft: "neutral",
  active: "success",
  voting: "warning",
};

/**
 * Arabic labels for the statuses. An unknown value falls through unchanged, so a
 * status the backend adds later is displayed rather than swallowed.
 */
export const CONTEST_STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  active: "جارية",
  voting: "مرحلة التصويت",
  completed: "مكتملة",
  cancelled: "ملغاة",
  upcoming: "قادمة",
  open: "مفتوحة",
  closed: "مغلقة",
  judging: "مرحلة التحكيم",
};

export function contestStatusTone(status: string): BadgeTone {
  if (status in CONTEST_STATUS_TONES) return toneFor(CONTEST_STATUS_TONES, status);
  if (isContestStatus(status)) return API_STATUS_TONES[status] ?? "neutral";
  return "neutral";
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