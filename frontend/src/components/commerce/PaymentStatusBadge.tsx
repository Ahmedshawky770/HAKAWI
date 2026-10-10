import React from "react";

import { Badge, PAYMENT_STATUS_TONES, toneFor, type BadgeTone } from "@/components/ui/Badge";

/**
 * The payment status pill.
 *
 * Tone from the shared table, which is keyed by `PAYMENT_STATUSES` — the contract
 * the API validates against, not a hand-written subset. The local overlay that
 * used to cover `processing` and `cancelled` is gone for the same reason as the
 * contest one: two tables for one fact is a fact that will disagree with itself.
 *
 * Only the Arabic labels are local, because only they are presentation.
 */
export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "قيد المراجعة",
  processing: "قيد المعالجة",
  completed: "مكتملة",
  failed: "فشلت",
  cancelled: "ملغاة",
  refunded: "مستردّة",
};

export function paymentStatusTone(status: string): BadgeTone {
  return toneFor(PAYMENT_STATUS_TONES, status);
}

export function paymentStatusLabel(status: string): string {
  return PAYMENT_STATUS_LABELS[status] ?? status;
}

export function PaymentStatusBadge({ status, className = "" }: { status: string; className?: string }) {
  return (
    <Badge tone={paymentStatusTone(status)} className={className}>
      {paymentStatusLabel(status)}
    </Badge>
  );
}
