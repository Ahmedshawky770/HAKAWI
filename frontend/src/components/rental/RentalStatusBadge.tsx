"use client";

import React from "react";

import { RENTAL_OVERDUE_STATE, rentalStateView, type RentalTiming } from "./rentalState";
import { Badge } from "@/components/ui/Badge";
import { useStrings } from "@/components/providers/LocaleProvider";

/**
 * The rental state pill.
 *
 * Pass `endDate` and the pill can say "overdue" — see `rentalState.ts` for why
 * that is derived rather than sent. With only a `status`, the pill shows exactly
 * what the server said, which is what a component used with a bare status
 * deserves.
 *
 * The STATE is derived; the WORD is the dictionary's. The badge used to carry a
 * table of Arabic labels of its own, which meant the English reader saw a pill
 * that said "نشط" inside an English interface.
 */
export function RentalStatusBadge({ status, endDate }: { status: string; endDate?: string }) {
  const { rentals } = useStrings();
  const view = rentalStateView({ status, endDate: endDate ?? "" } satisfies RentalTiming);

  return (
    <Badge tone={view.tone} state={view.state}>
      {rentals.statusLabels[view.state] ?? view.state}
    </Badge>
  );
}

export { RENTAL_OVERDUE_STATE, rentalStateView };
