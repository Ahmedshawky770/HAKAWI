"use client";

import React from "react";

import { classifyError } from "@/lib/errors";
import { isFailedLoad, usePayments } from "@/lib/queries";
import { PageHeader } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { PaymentListEmpty, PaymentListSkeleton, PaymentRow } from "@/components/commerce/PaymentRow";
import { useStrings } from "@/components/providers/LocaleProvider";

/**
 * The reader's payment history.
 *
 * The history is ONE cache entry (`usePayments`), so the list on this page and
 * the row on any other surface that shows a payment agree about it, and
 * returning to the page does not re-request what is already known.
 */
export default function PaymentsPage() {
  const strings = useStrings();
  const { payments: copy } = strings;
  const history = usePayments();

  if (history.isLoading) {
    return (
      <>
        <PageHeader title={copy.pageTitle} />
        <p role="status" className="sr-only">
          {strings.common.loading}
        </p>
        <PaymentListSkeleton />
      </>
    );
  }

  if (isFailedLoad(history)) {
    return (
      <ErrorMessage
        error={strings.errors[classifyError(history.error)]}
        title={copy.loadFailedTitle}
        onRetry={() => void history.refetch()}
      />
    );
  }

  const payments = history.data?.payments ?? [];

  return (
    <div className="animate-rise">
      <PageHeader title={copy.pageTitle} description={copy.pageDescription} />

      {payments.length === 0 ? (
        <PaymentListEmpty />
      ) : (
        <ul className="space-y-4">
          {payments.map((payment) => (
            <li key={payment.id}>
              <PaymentRow payment={payment} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
