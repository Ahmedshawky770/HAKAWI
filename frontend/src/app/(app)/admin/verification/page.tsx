"use client";

import React, { useState } from "react";

import { AdminGuard } from "@/components/admin/AdminGuard";
import { PageHeader } from "@/components/ui/Card";
import { Card, CardBody } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Loading } from "@/components/ui/Loading";
import { Badge, toneFor, SUBMISSION_STATUS_TONES } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/Button";
import { useStrings } from "@/components/providers/LocaleProvider";
import { useStoredUser } from "@/lib/use-stored-user";
import { useAdminPublisherApplications, useAdminPublisherStats, isFailedLoad, useInvalidation } from "@/lib/queries";
import { useToast } from "@/components/providers/ToastProvider";
import { api } from "@/lib/api";
import { useMutation } from "@tanstack/react-query";
import { classifyError } from "@/lib/errors";

export default function VerificationAdminPage() {
  const strings = useStrings();
  const { notify } = useToast();
  const user = useStoredUser();
  const isVerificationAdmin = user?.accountType === "admin" && (user?.adminRole === "verification_officer" || user?.adminRole === "super_admin");
  const invalidate = useInvalidation();
  const [activeTab, setActiveTab] = useState<"pending" | "approved" | "rejected">("pending");

  const appsQuery = useAdminPublisherApplications({ limit: 100 }, isVerificationAdmin);
  const statsQuery = useAdminPublisherStats(isVerificationAdmin);

  const reviewMutation = useMutation({
    mutationFn: ({ id, status, rejectionReason }: { id: string; status: "approved" | "rejected"; rejectionReason?: string }) =>
      api.reviewPublisherApplication(id, { status, rejectionReason }),
    onSuccess: async () => {
      await invalidate.admin();
      notify(strings.admin.verification.approveVerification, "success");
    },
    onError: (err: Error) => {
      notify(classifyError(err), "error");
    },
  });

  if (appsQuery.isLoading) {
    return (
      <div className="animate-rise">
        <PageHeader title={strings.admin.verification.pageTitle} description={strings.admin.verification.pageDescription} />
        <Loading />
      </div>
    );
  }

  if (isFailedLoad(appsQuery)) {
    return (
      <div className="animate-rise">
        <PageHeader title={strings.admin.verification.pageTitle} description={strings.admin.verification.pageDescription} />
        <ErrorMessage
          title={strings.admin.common.loadFailed}
          error={strings.admin.common.refresh}
          onRetry={() => {
            void appsQuery.refetch();
            void statsQuery.refetch();
            void invalidate.admin();
          }}
        />
      </div>
    );
  }

  const applications = appsQuery.data?.applications ?? [];
  const filtered = applications.filter((app) => app.status === activeTab.replace("approved", "approved").replace("rejected", "rejected"));
  const stats = statsQuery.data;

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

  return (
    <AdminGuard allowedRoles={["verification_officer", "super_admin"]}>
      <div className="animate-rise space-y-6">
        <PageHeader
          title={strings.admin.verification.pageTitle}
          description={strings.admin.verification.pageDescription}
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={strings.admin.verification.statsTotal} value={stats ? stats.pendingApplications + stats.approvedApplications + stats.rejectedApplications : applications.length} icon="user" hint="" />
          <StatCard label={strings.admin.verification.statsPending} value={stats?.pendingApplications ?? 0} icon="clock" hint="" />
          <StatCard label={strings.admin.verification.statsApproved} value={stats?.approvedApplications ?? 0} icon="check" hint="" />
          <StatCard label={strings.admin.verification.statsRejected} value={stats?.rejectedApplications ?? 0} icon="close" hint="" />
        </div>

        <div className="flex gap-2 border-b border-line">
          {tabButton("pending", strings.admin.verification.tabPending)}
          {tabButton("approved", strings.admin.verification.tabApproved)}
          {tabButton("rejected", strings.admin.verification.tabRejected)}
        </div>

        <div className="space-y-3">
          {filtered.length === 0 ? (
            <p className="text-sm text-ink-muted">{strings.admin.verification.verificationsEmpty}</p>
          ) : (
            <ul className="space-y-3">
              {filtered.map((app) => (
                <li key={app.id} className="rounded-lg border border-line p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-ink">{strings.admin.verification.verificationId(app.id)}</p>
                      <p className="text-sm text-ink-muted">{strings.admin.verification.verificationType("publisher")}</p>
                      <p className="text-sm text-ink-muted">{strings.admin.verification.userFullName(app.contactName)}</p>
                      <p className="text-sm text-ink-muted">{strings.admin.verification.userEmail(app.contactEmail)}</p>
                      <p className="text-sm text-ink-muted">{strings.admin.verification.verificationSubmittedAt(app.createdAt)}</p>
                      <Badge tone={toneFor(SUBMISSION_STATUS_TONES, app.status)} state={app.status}>
                        {strings.admin.verification.statusLabels[app.status] ?? app.status}
                      </Badge>
                    </div>
                    {app.status === "pending" && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={reviewMutation.isPending}
                          disabled={reviewMutation.isPending}
                          onClick={() => reviewMutation.mutate({ id: app.id, status: "approved" })}
                        >
                          {strings.admin.verification.approveVerification}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={reviewMutation.isPending}
                          disabled={reviewMutation.isPending}
                          onClick={() => {
                            const reason = window.prompt(strings.admin.verification.rejectVerification);
                            if (reason === null) return;
                            reviewMutation.mutate({ id: app.id, status: "rejected", rejectionReason: reason || undefined });
                          }}
                        >
                          {strings.admin.verification.rejectVerification}
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AdminGuard>
  );
}
