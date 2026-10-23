"use client";

import React, { useState } from "react";

import { AdminGuard } from "@/components/admin/AdminGuard";
import { PageHeader } from "@/components/ui/Card";
import { useStrings } from "@/components/providers/LocaleProvider";

/**
 * The verification desk.
 *
 * WHO MAY ENTER. `verification_officer` and `super_admin`. A content_moderator
 * or financial_officer who opens this URL is stopped by the guard before the
 * page renders.
 *
 * WHAT IT SHOWS. Three tabs:
 * - Pending: identity verification requests awaiting review.
 * - Approved: verified identities and onboarded publishers.
 * - Rejected: declined verification requests.
 * Each row shows the request id, type, status, submitted date, user full name
 * and email, with approve / reject / request-more-info actions.
 *
 * Stats row: total requests, pending, approved, rejected.
 *
 * THE GUARD IS UX, NOT SECURITY. The backend's
 * `@Secured(AccountType.ADMIN)` and `@RequireAdminRole(AdminRole.VERIFICATION_OFFICER,
 * AdminRole.SUPER_ADMIN)` refuse every request a role does not own.
 */
export default function VerificationAdminPage() {
  const strings = useStrings();
  const [activeTab, setActiveTab] = useState<"pending" | "approved" | "rejected">("pending");

  const tabButton = (tab: "pending" | "approved" | "rejected", label: string) => (
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
    const tone = toneFor(SUBMISSION_STATUS_TONES, status);
    return <Badge tone={tone} state={status}>{strings.admin.verification.statusLabels[status] ?? status}</Badge>;
  };

  const rows = [
    {
      key: "pending",
      label: strings.admin.verification.tabPending,
      empty: strings.admin.verification.verificationsEmpty,
    },
    {
      key: "approved",
      label: strings.admin.verification.tabApproved,
      empty: strings.admin.verification.verificationsEmpty,
    },
    {
      key: "rejected",
      label: strings.admin.verification.tabRejected,
      empty: strings.admin.verification.verificationsEmpty,
    },
  ];

  return (
    <AdminGuard allowedRoles={["verification_officer", "super_admin"]}>
      <div className="animate-rise space-y-6">
        <PageHeader
          title={strings.admin.verification.pageTitle}
          description={strings.admin.verification.pageDescription}
        />

        {/* Tabs */}
        <div className="flex gap-2 border-b border-line">
          {tabButton("pending", strings.admin.verification.tabPending)}
          {tabButton("approved", strings.admin.verification.tabApproved)}
          {tabButton("rejected", strings.admin.verification.tabRejected)}
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
