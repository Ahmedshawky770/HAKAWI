"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/Card";
import { Card, CardBody } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Icon } from "@/components/ui/Icon";
import { PaymentStatusBadge } from "@/components/commerce/PaymentStatusBadge";
import { useLocale } from "@/components/providers/LocaleProvider";
import type { Payment } from "@/types/api";

export default function PaymentDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const { intl } = useLocale();

  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api.getPayment(id);
      setPayment(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل تحميل تفاصيل الدفع");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    // Fire-and-forget; the retry below calls this same `load`.
    async function initialLoad() {
      await load();
    }
    void initialLoad();
  }, [load]);

  if (loading) {
    return (
      <>
        <PageHeader title="تفاصيل الدفع" />
        <p role="status" className="sr-only">
          جارٍ التحميل…
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

  if (error) {
    return (
      <ErrorMessage
        error={error}
        title="فشل تحميل تفاصيل الدفع"
        onRetry={() => {
          setLoading(true);
          setError("");
          void load();
        }}
      />
    );
  }

  if (!payment) {
    return <ErrorMessage error="تفاصيل الدفع غير موجودة" title="لا يوجد دفع بهذا المعرّف" />;
  }

  const formatDate = (value: string): string => new Date(value).toLocaleString(intl);

  const facts: { label: string; value: React.ReactNode }[] = [
    { label: "معرّف الدفع", value: <span className="hk-numeric break-all text-sm">{payment.id}</span> },
    { label: "معرّف المستخدم", value: <span className="hk-numeric break-all text-sm">{payment.userId}</span> },
    { label: "طريقة الدفع", value: payment.paymentMethod },
    { label: "تاريخ الإنشاء", value: <span className="hk-numeric text-sm">{formatDate(payment.createdAt)}</span> },
  ];

  return (
    <div className="animate-rise">
      <Link
        href="/payments"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-chrome-ink hover:text-chrome"
      >
        <Icon name="chevron" size="sm" />
        العودة للمدفوعات
      </Link>

      <PageHeader title="تفاصيل الدفع" />

      <Card>
        <CardBody>
          <p className="text-sm text-ink-muted">المبلغ</p>
          <p className="hk-numeric mt-1 text-4xl font-bold text-ink">
            {payment.amount} {payment.currency}
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
                <dt className="text-sm text-ink-muted">الوصف</dt>
                <dd className="mt-1 text-sm text-ink">{payment.description}</dd>
              </div>
            )}
          </dl>
        </CardBody>
      </Card>
    </div>
  );
}