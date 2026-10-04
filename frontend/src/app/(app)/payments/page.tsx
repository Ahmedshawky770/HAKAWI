"use client";

import React, { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { PaymentListEmpty, PaymentListSkeleton, PaymentRow } from "@/components/commerce/PaymentRow";
import type { Payment } from "@/types/api";

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api.getPaymentHistory();
      setPayments(data.payments);
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل تحميل المدفوعات");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fire-and-forget; the retry below calls this same `load`.
    async function initialLoad() {
      await load();
    }
    void initialLoad();
  }, [load]);

  const retry = () => {
    setLoading(true);
    setError("");
    void load();
  };

  if (loading) {
    return (
      <>
        <PageHeader title="سجل المدفوعات" />
        <p role="status" className="sr-only">
          جارٍ التحميل…
        </p>
        <PaymentListSkeleton />
      </>
    );
  }

  if (error) {
    return <ErrorMessage error={error} onRetry={retry} title="فشل تحميل المدفوعات" />;
  }

  return (
    <div className="animate-rise">
      <PageHeader title="سجل المدفوعات" description="كل عمليات الشراء والاشتراك في حكاوي." />

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