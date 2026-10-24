"use client";

import React, { useState } from "react";

import { AdminGuard } from "@/components/admin/AdminGuard";
import { PageHeader } from "@/components/ui/Card";
import { Card, CardBody } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Loading } from "@/components/ui/Loading";
import { Badge, toneFor, PAYMENT_STATUS_TONES } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { useStrings } from "@/components/providers/LocaleProvider";
import { useStoredUser } from "@/lib/use-stored-user";
import type { Payment } from "@hakawi/shared-types";
import { useAdminPayments, useAdminPaymentStats, isFailedLoad, useInvalidation } from "@/lib/queries";
import { useToast } from "@/components/providers/ToastProvider";

export default function FinancialAdminPage() {
  const strings = useStrings();
  const { notify } = useToast();
  const user = useStoredUser();
  const isFinanceAdmin = user?.accountType === "admin" && (user?.adminRole === "financial_officer" || user?.adminRole === "super_admin");
  const invalidate = useInvalidation();
  const [activeTab, setActiveTab] = useState<"payments" | "refunds" | "payouts">("payments");

  const paymentsQuery = useAdminPayments({ limit: 50 }, isFinanceAdmin);
  const statsQuery = useAdminPaymentStats(isFinanceAdmin);

  if (paymentsQuery.isLoading) {
    return (
      <div className="animate-rise">
        <PageHeader title={strings.admin.financial.pageTitle} description={strings.admin.financial.pageDescription} />
        <Loading />
      </div>
    );
  }

  if (isFailedLoad(paymentsQuery)) {
    return (
      <div className="animate-rise">
        <PageHeader title={strings.admin.financial.pageTitle} description={strings.admin.financial.pageDescription} />
        <ErrorMessage
          title={strings.admin.common.loadFailed}
          error={strings.admin.common.refresh}
          onRetry={() => {
            void paymentsQuery.refetch();
            void statsQuery.refetch();
            void invalidate.admin();
          }}
        />
      </div>
    );
  }

  const payments = paymentsQuery.data?.payments ?? [];
  const stats = statsQuery.data;

  const tabButton = (tab: "payments" | "refunds" | "payouts", label: string) => (
    <button
      type="button"
      onClick={() => setActiveTab(tab)}
      aria-current={activeTab === tab ? "true" : undefined}
      className={`min-h-11 px-4 py-2 text-sm font-medium ${
        activeTab === tab ? "border-b-2 border-accent text-accent-ink" : "text-ink-muted"
      }`}
    >
      {label}
    </button>
  );

  return (
    <AdminGuard allowedRoles={["financial_officer", "super_admin"]}>
      <div className="animate-rise space-y-6">
        <PageHeader
          title={strings.admin.financial.pageTitle}
          description={strings.admin.financial.pageDescription}
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={strings.admin.financial.statsTotalPayments} value={stats?.total ?? payments.length} icon="wallet" hint="" />
          <StatCard label={strings.admin.financial.statsPending} value={stats?.byStatus?.pending ?? 0} icon="clock" hint="" />
          <StatCard label={strings.admin.financial.statsCompleted} value={stats?.byStatus?.completed ?? 0} icon="check" hint="" />
          <StatCard label={strings.admin.financial.statsFailed} value={stats?.byStatus?.failed ?? 0} icon="close" hint="" />
        </div>

        <div className="flex gap-2 border-b border-line">
          {tabButton("payments", strings.admin.financial.tabPayments)}
          {tabButton("refunds", strings.admin.financial.tabRefunds)}
          {tabButton("payouts", strings.admin.financial.tabPayouts)}
        </div>

        {activeTab === "payments" && (
          <div className="space-y-3">
            {payments.length === 0 ? (
              <p className="text-sm text-ink-muted">{strings.admin.financial.paymentsEmpty}</p>
            ) : (
              <ul className="space-y-3">
                {payments.map((payment: Payment) => (
                  <li key={payment.id} className="rounded-lg border border-line p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-ink">{strings.admin.financial.paymentId(payment.id)}</p>
                        <p className="text-sm text-ink-muted">{strings.admin.financial.paymentAmount(String(payment.amount))}</p>
                        <p className="text-sm text-ink-muted">{strings.admin.financial.paymentCurrency(payment.currency)}</p>
                        <p className="text-sm text-ink-muted">{strings.admin.financial.paymentMethod(payment.paymentMethod)}</p>
                        <p className="text-sm text-ink-muted">{strings.admin.financial.paymentCreatedAt(payment.createdAt)}</p>
                        <p className="text-sm text-ink-muted">{strings.admin.financial.userId(payment.userId)}</p>
                      </div>
                      <Badge tone={toneFor(PAYMENT_STATUS_TONES, payment.status)} state={payment.status}>
                        {strings.admin.financial.statusLabels[payment.status] ?? payment.status}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {activeTab === "refunds" && (
          <div className="rounded-xl border border-line bg-surface p-6">
            <p className="text-sm text-ink-muted">{strings.admin.financial.refundsEmpty}</p>
          </div>
        )}

        {activeTab === "payouts" && (
          <div className="rounded-xl border border-line bg-surface p-6">
            <p className="text-sm text-ink-muted">{strings.admin.financial.payoutsEmpty}</p>
          </div>
        )}
      </div>
    </AdminGuard>
  );
}
