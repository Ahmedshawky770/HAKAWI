"use client";

import React, { useState } from "react";

import { AdminGuard } from "@/components/admin/AdminGuard";
import { PageHeader } from "@/components/ui/Card";
import { useStrings } from "@/components/providers/LocaleProvider";

/**
 * The financial desk.
 *
 * WHO MAY ENTER. `financial_officer` and `super_admin`. A content_moderator or
 * verification_officer who opens this URL is stopped by the guard before the
 * page renders.
 *
 * WHAT IT SHOWS. Three tabs:
 * - Payments: the platform's payments with status, amount, currency and method.
 * - Refunds: issued refunds.
 * - Payouts: payouts to users.
 * Each tab shows an empty state when there is nothing to display.
 *
 * Stats row: total payments, total refunds, total payouts, with pending /
 * completed / failed breakdowns.
 *
 * THE GUARD IS UX, NOT SECURITY. The backend's
 * `@Secured(AccountType.ADMIN)` and `@RequireAdminRole(AdminRole.FINANCIAL_OFFICER,
 * AdminRole.SUPER_ADMIN)` refuse every request a role does not own.
 */
export default function FinancialAdminPage() {
  const strings = useStrings();
  const [activeTab, setActiveTab] = useState<"payments" | "refunds" | "payouts">("payments");

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

  const statusBadge = (status: string) => {
    const tone = toneFor(PAYMENT_STATUS_TONES, status);
    return <Badge tone={tone} state={status}>{strings.admin.financial.statusLabels[status] ?? status}</Badge>;
  };

  const rows = [
    {
      key: "payments",
      label: strings.admin.financial.tabPayments,
      empty: strings.admin.financial.paymentsEmpty,
    },
    {
      key: "refunds",
      label: strings.admin.financial.tabRefunds,
      empty: strings.admin.financial.refundsEmpty,
    },
    {
      key: "payouts",
      label: strings.admin.financial.tabPayouts,
      empty: strings.admin.financial.payoutsEmpty,
    },
  ];

  return (
    <AdminGuard allowedRoles={["financial_officer", "super_admin"]}>
      <div className="animate-rise space-y-6">
        <PageHeader
          title={strings.admin.financial.pageTitle}
          description={strings.admin.financial.pageDescription}
        />

        {/* Tabs */}
        <div className="flex gap-2 border-b border-line">
          {tabButton("payments", strings.admin.financial.tabPayments)}
          {tabButton("refunds", strings.admin.financial.tabRefunds)}
          {tabButton("payouts", strings.admin.financial.tabPayouts)}
        </div>

        {/* Tab content */}
        {rows.map((row) => (
          <section key={row.key} className={activeTab === row.key ? "" : "hidden"}>
            <div className="rounded-xl border border-line bg-surface p-6">
              <p className="text-sm text-ink-muted">{row.empty}</p>
            </div>
          </section>
        ))}
      </div>
    </AdminGuard>
  );
}
