"use client";

import React from "react";

import { Badge, RENTAL_STATUS_TONES, toneFor } from "@/components/ui/Badge";

/**
 * The rental state pill.
 *
 * Tone from the shared table, keyed by `RENTAL_STATUSES`. Only the labels are
 * local, and they list exactly the states the contract declares — an earlier
 * version also carried `overdue`, which the rentals API never sends: a label for
 * a state that cannot occur is copy for a bug that has not happened yet.
 */
export const RENTAL_STATUS_LABELS: Record<string, string> = {
  active: "نشط",
  expired: "منتهي",
  returned: "مُرجع",
  cancelled: "ملغى",
};

export function rentalStatusLabel(status: string): string {
  return RENTAL_STATUS_LABELS[status] ?? status;
}

export function RentalStatusBadge({ status }: { status: string }) {
  return <Badge tone={toneFor(RENTAL_STATUS_TONES, status)}>{rentalStatusLabel(status)}</Badge>;
}
