import React from "react";
import { isPaymentStatus } from "@hakawi/shared-types";

import { Badge, PAYMENT_STATUS_TONES, toneFor, type BadgeTone } from "@/components/ui/Badge";

/**
 * The payment status pill.
 *
 * Same shape of gap as the contest one: `PAYMENT_STATUS_TONES` covers
 * `pending`, `completed`, `failed` and `refunded`, while
 * `PAYMENT_STATUSES` (`packages/shared-types/src/payment.ts`) is `pending`,
 * `processing`, `completed`, `failed`, `cancelled`, `refunded`. The shared map
 * decides for the four it defines; `API_STATUS_TONES` decides for the two it
 * misses.
 */
const API_STATUS_TONES: Record<string, BadgeTone> = {
  processing: "info",
  cancelled: "neutral",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "قيد المراجعة",
  processing: "قيد المعالجة",
  completed: "مكتملة",
  failed: "فشلت",
  cancelled: "ملغاة",
  refunded: "مستردّة",
};

export function paymentStatusTone(status: string): BadgeTone {
  if (status in PAYMENT_STATUS_TONES) return toneFor(PAYMENT_STATUS_TONES, status);
  if (isPaymentStatus(status)) return API_STATUS_TONES[status] ?? "neutral";
  return "neutral";
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