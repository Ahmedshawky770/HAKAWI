"use client";

import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { classifyError } from "@/lib/errors";
import { isFailedLoad, usePayment } from "@/lib/queries";
import { PageHeader } from "@/components/ui/Card";
import { Card, CardBody } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Icon } from "@/components/ui/Icon";
import { PaymentStatusBadge } from "@/components/commerce/PaymentStatusBadge";
import { useLocale } from "@/components/providers/LocaleProvider";
import { formatDateTime } from "@/lib/i18n";
import { formatPrice } from "@/lib/money";

/**
 * One payment, in full.
 *
 * The payment is read through `usePayment`, so this page and the history that
 * links to it are looking at the same cache entry, and the amount is read
 * through `formatPrice` — the one division by a hundred in the product — rather
 * than printed as the raw integer the gateway charges in piastres.
 *
 * The symbol comes from the transaction's own currency, which the backend
 * validated and stored when it charged (`payments.service.ts` —
 * `validateCurrency`, defaulting to EGP). For the ordinary EGP payment this is
 * the product's own "ج.م"; for a payment made in another currency it is the
 * currency that was actually charged.
 */
export default function PaymentDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const { intl, strings } = useLocale();
  const { payments: copy } = strings;

  const paymentQuery = usePayment(id);

  if (paymentQuery.isLoading) {
    return (
      <>
        <PageHeader title={copy.detailTitle} />
        <p role="status" className="sr-only">
          {strings.common.loading}
        </p>
        <Card>
          <CardBody className="space-y-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </CardBody>
        </Card>
      </>
    );
  }

  if (isFailedLoad(paymentQuery)) {
    return (
      <ErrorMessage
        error={strings.errors[classifyError(paymentQuery.error)]}
        title={copy.detailLoadFailedTitle}
        onRetry={() => void paymentQuery.refetch()}
      />
    );
  }

  const payment = paymentQuery.data ?? null;

  if (!payment) {
    return <ErrorMessage error={copy.notFoundMessage} title={copy.notFoundTitle} />;
  }

  const facts: { label: string; value: React.ReactNode }[] = [
    { label: copy.paymentIdLabel, value: <span className="hk-numeric break-all text-sm">{payment.id}</span> },
    { label: copy.userIdLabel, value: <span className="hk-numeric break-all text-sm">{payment.userId}</span> },
    // The gateway's own name for the method. It is a wire value rather than the
    // product's copy, so it is shown as it came — the same policy the story
    // category follows.
    { label: copy.paymentMethodLabel, value: payment.paymentMethod },
    { label: copy.createdAtLabel, value: <span className="hk-numeric text-sm">{formatDateTime(payment.createdAt, intl)}</span> },
  ];

  return (
    <div className="animate-rise">
      <Link
        href="/payments"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-chrome-ink hover:text-chrome"
      >
        <Icon name="chevron" size="sm" />
        {copy.backToPayments}
      </Link>

      <PageHeader title={copy.detailTitle} />

      <Card>
        <CardBody>
          <p className="text-sm text-ink-muted">{copy.amountLabel}</p>
          <p className="hk-numeric mt-1 text-4xl font-bold text-ink">
            {formatPrice(payment.amount, payment.currency)}
          </p>
          <div className="mt-3">
            <PaymentStatusBadge status={payment.status} />
          </div>

          <dl className="mt-6 grid grid-cols-1 gap-4 border-t border-line pt-6 sm:grid-cols-2">
            {facts.map((fact) => (
              <div key={fact.label}>
                <dt className="text-sm text-ink-muted">{fact.label}</dt>
                <dd className="mt-1 font-medium text-ink">{fact.value}</dd>
              </div>
            ))}
            {payment.description && (
              <div className="sm:col-span-2">
                <dt className="text-sm text-ink-muted">{copy.descriptionLabel}</dt>
                <dd className="mt-1 text-sm text-ink">{payment.description}</dd>
              </div>
            )}
          </dl>
        </CardBody>
      </Card>
    </div>
  );
}
