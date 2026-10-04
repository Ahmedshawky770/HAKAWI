"use client";

import React from "react";

import { CardLink } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useLocale } from "@/components/providers/LocaleProvider";
import type { Payment } from "@/types/api";

import { PaymentStatusBadge } from "./PaymentStatusBadge";

/**
 * One payment, as a row that opens its detail page.
 *
 * The whole row is the link target through `CardLink`, and nothing inside it is
 * a control — the status is a `Badge` and the amount is text — so the row is
 * one tab stop with one accessible name instead of a link with a button nested
 * inside it.
 *
 * The amount and the identifier are `hk-numeric`: a payment is read as a figure,
 * and `direction: ltr` isolation is what stops the currency code from jumping
 * to the other side of the number inside an RTL sentence.
 */
export function PaymentRow({ payment }: { payment: Payment }) {
  const { intl } = useLocale();

  return (
    <CardLink href={`/payments/${payment.id}`} className="h-full">
      <div className="flex h-full flex-wrap items-center gap-3 p-5">
        <div className="min-w-0 flex-1">
          <p className="hk-numeric truncate text-sm text-ink-muted">{payment.id}</p>
          <p className="hk-numeric mt-1 text-xl font-bold text-ink">
            {payment.amount} {payment.currency}
          </p>
          <p className="mt-1 text-xs text-ink-faint">
            {new Date(payment.createdAt).toLocaleDateString(intl)}
          </p>
        </div>
        <PaymentStatusBadge status={payment.status} className="shrink-0" />
      </div>
    </CardLink>
  );
}

export function PaymentRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-5">
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton className="h-6 w-20" rounded="rounded-full" />
    </div>
  );
}

export function PaymentListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-4" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <PaymentRowSkeleton key={index} />
      ))}
    </div>
  );
}

export function PaymentListEmpty() {
  return (
    <EmptyState
      icon="wallet"
      title="لا توجد مدفوعات بعد."
      description="ستظهر هنا كل عملية شراء أو اشتراك تجريه في حكاوي."
    />
  );
}