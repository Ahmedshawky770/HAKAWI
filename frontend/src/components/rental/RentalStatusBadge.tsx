"use client";

import React from "react";

import { RENTAL_OVERDUE_STATE, RENTAL_STATUS_LABELS, rentalStateView, type RentalTiming } from "./rentalState";
import { Badge } from "@/components/ui/Badge";

/**
 * The rental state pill.
 *
 * Pass `endDate` and the pill can say "متأخر" — see `rentalState.ts` for why that
 * is derived rather than sent. With only a `status`, the pill shows exactly what
 * the server said, which is what a component used with a bare status deserves.
 */
export function RentalStatusBadge({ status, endDate }: { status: string; endDate?: string }) {
  const view = rentalStateView({ status, endDate: endDate ?? "" } satisfies RentalTiming);

  return (
    <Badge tone={view.tone} state={view.state}>
      {view.label}
    </Badge>
  );
}

export { RENTAL_OVERDUE_STATE, RENTAL_STATUS_LABELS, rentalStateView };
