"use client";

import React from "react";

import { CardLink } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useLocale } from "@/components/providers/LocaleProvider";
import { formatDate } from "@/lib/i18n";
import { formatPrice } from "@/lib/money";
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
 *
 * THE AMOUNT IS IN PIASTRES, AND THIS ROW USED TO LIE ABOUT IT BY A HUNDRED
 * TIMES. `payments.amount` is the integer the gateway was asked to charge — the
 * same unit as `books.price` and `RENTAL_PRICE_PER_DAY_PIASTRES`, one EGP to a
 * hundred piastres. The row printed the raw integer next to the raw currency
 * code, so a payment of 2500 piastres read "2500 EGP" instead of "25.00 ج.م":
 * the reader was told the transaction cost a hundred times what it cost.
 * `formatPrice` owns the conversion — the one division by 100 in the product.
 *
 * THE SYMBOL COMES FROM THE TRANSACTION'S OWN CURRENCY. The backend validates
 * and stores the currency it charged (`payments.service.ts` — `validateCurrency`,
 * defaulting to EGP), so the record's own column is the authoritative answer
 * to "what was this paid in". Naming every amount in the product's single
 * currency instead would say a different thing about a transaction that was
 * not made in it. For the ordinary EGP payment the symbol is the product's own
 * "ج.م" either way; only a payment made in another currency reads differently,
 * and then it reads correctly.
 */
export function PaymentRow({ payment }: { payment: Payment }) {
  const { intl } = useLocale();

  return (
    <CardLink href={`/payments/${payment.id}`} className="h-full">
      <div className="flex h-full flex-wrap items-center gap-3 p-5">
        <div className="min-w-0 flex-1">
          <p className="hk-numeric truncate text-sm text-ink-muted">{payment.id}</p>
          <p className="hk-numeric mt-1 text-xl font-bold text-ink">
            {formatPrice(payment.amount, payment.currency)}
          </p>
          <p className="mt-1 text-xs text-ink-faint">
            {formatDate(payment.createdAt, intl)}
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
  const { strings } = useLocale();

  return (
    <EmptyState
      icon="wallet"
      title={strings.payments.emptyTitle}
      description={strings.payments.emptyDescription}
    />
  );
}
