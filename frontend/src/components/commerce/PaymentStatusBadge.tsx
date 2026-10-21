"use client";

import React from "react";
import type { PaymentStatus } from "@hakawi/shared-types";

import { Badge, PAYMENT_STATUS_TONES, toneFor, type BadgeTone } from "@/components/ui/Badge";
import { useStrings } from "@/components/providers/LocaleProvider";

/**
 * The payment status pill.
 *
 * Tone from the shared table, which is keyed by `PAYMENT_STATUSES` — the contract
 * the API validates against, not a hand-written subset. The local overlay that
 * used to cover `processing` and `cancelled` is gone for the same reason as the
 * contest one: two tables for one fact is a fact that will disagree with itself.
 *
 * The WORD is the dictionary's. The badge used to carry a table of Arabic labels
 * of its own, which meant the English reader saw a pill that said "مكتملة"
 * inside an English interface.
 */
export function paymentStatusTone(status: string): BadgeTone {
  return toneFor(PAYMENT_STATUS_TONES, status);
}

export function PaymentStatusBadge({ status, className = "" }: { status: string; className?: string }) {
  const { payments } = useStrings();

  // A status the contract does not declare has no word, so it is shown as the API
  // sent it — more honest to the reader than blanking it.
  const label = payments.statusLabels[status as PaymentStatus] ?? status;

  return (
    <Badge tone={paymentStatusTone(status)} className={className}>
      {label}
    </Badge>
  );
}
