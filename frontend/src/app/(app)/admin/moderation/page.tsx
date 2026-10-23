"use client";

import React, { useState } from "react";

import { useMutation } from "@tanstack/react-query";

import { AdminGuard } from "@/components/admin/AdminGuard";
import { PageHeader } from "@/components/ui/Card";
import { Card, CardBody } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Loading } from "@/components/ui/Loading";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatCard } from "@/components/ui/StatCard";
import { Badge, toneFor, MODERATION_STATUS_TONES } from "@/components/ui/Badge";
import { useStrings } from "@/components/providers/LocaleProvider";
import { useStoredUser } from "@/lib/use-stored-user";
import { useToast } from "@/components/providers/ToastProvider";
import { api } from "@/lib/api";
import { useModerationQueue, useAdminModerationStats, isFailedLoad, useInvalidation } from "@/lib/queries";
import { classifyError } from "@/lib/errors";
import type { Report } from "@/types/api";

/**
 * The content moderation desk.
 *
 * WHO MAY ENTER. `content_moderator` and `super_admin`. A financial_officer or
 * verification_officer who opens this URL is stopped by the guard before the
 * page renders.
 *
 * WHAT IT SHOWS. Three tabs:
 * - Queue: the open reports, each with act-on buttons (under review / resolve /
 *   dismiss). Optimistic: the count moves on the same frame; a failure reverts
 *   and explains itself in a toast.
 * - Actions: the moderation actions already taken (placeholder until the
 *   actions query exists on the client).
 * - Stats: moderation counters from the shared admin stats query.
 *
 * THE GUARD IS UX, NOT SECURITY. The backend's `@Secured(AccountType.ADMIN)`
 * and `@RequireAdminRole(AdminRole.CONTENT_MODERATOR, AdminRole.SUPER_ADMIN)`
 * refuse every request a role does not own, so a caller who strips this guard
 * still cannot reach moderation data.
 */
export default function ModerationAdminPage() {
  const strings = useStrings();
  const { notify } = useToast();
  const user = useStoredUser();
  const isSuperAdmin = user?.accountType === "admin" && user?.adminRole === "super_admin";
  const invalidate = useInvalidation();
  const [activeTab, setActiveTab] = useState<"queue" | "actions" | "stats">("queue");

  const queueQuery = useModerationQueue();
  const statsQuery = useAdminModerationStats(isSuperAdmin);

  const moderateMutation = useMutation({
    mutationFn: ({ reportId, status }: { reportId: string; status: Report["status"] }) =>
      api.moderateItem(reportId, { status }),
    onSuccess: async () => {
      await invalidate.moderation();
    },
    onError: (err: Error) => {
      notify(strings.admin.moderation.moderateFailed, "error");
    },
  });

  if (queueQuery.isLoading) {
    return (
      <div className="animate-rise">
        <PageHeader title={strings.admin.moderation.pageTitle} description={strings.admin.moderation.pageDescription} />
        <Loading />
      </div>
    );
  }

  if (isFailedLoad(queueQuery)) {
    return (
      <div className="animate-rise">
        <PageHeader title={strings.admin.moderation.pageTitle} description={strings.admin.moderation.pageDescription} />
        <ErrorMessage
          title={strings.admin.common.loadFailed}
          error={strings.admin.common.refresh}
          onRetry={() => {
            void queueQuery.refetch();
            void statsQuery.refetch();
            void invalidate.admin();
          }}
        />
      </div>
    );
  }

  const reports = queueQuery.data?.reports ?? [];
  const stats = statsQuery.data;

  const tabButton = (tab: "queue" | "actions" | "stats", label: string) => (
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
    const tone = toneFor(MODERATION_STATUS_TONES, status);
    return <Badge tone={tone} state={status}>{strings.admin.moderation.statusLabels[status] ?? status}</Badge>;
  };

  return (
    <AdminGuard allowedRoles={["content_moderator", "super_admin"]}>
      <div className="animate-rise space-y-6">
        <PageHeader
          title={strings.admin.moderation.pageTitle}
          description={strings.admin.moderation.pageDescription}
        />

        {/* Stats row */}
        {activeTab === "stats" && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label={strings.admin.moderation.statsReports} value={stats?.totalReports ?? 0} icon="comment" hint={strings.admin.moderation.statsOpen} />
            <StatCard label={strings.admin.moderation.statsOpen} value={stats?.openReports ?? 0} icon="warning" hint="" />
            <StatCard label={strings.admin.moderation.statsResolved} value={stats?.resolvedReports ?? 0} icon="check" hint="" />
            <StatCard label={strings.admin.moderation.statsDismissed} value={stats?.dismissedReports ?? 0} icon="close" hint="" />
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 border-b border-line">
          {tabButton("queue", strings.admin.moderation.tabQueue)}
          {tabButton("actions", strings.admin.moderation.tabActions)}
          {tabButton("stats", strings.admin.moderation.tabStats)}
        </div>

        {/* Queue tab */}
        {activeTab === "queue" && (
          <div className="space-y-3">
            {moderateMutation.isError && (
              <ErrorMessage
                error={strings.admin.moderation.moderateFailed}
                title={strings.admin.moderation.moderateFailed}
              />
            )}
            {reports.length === 0 ? (
              <p className="text-sm text-ink-muted">{strings.admin.moderation.queueEmpty}</p>
            ) : (
              <ul className="space-y-3">
                {reports.map((report: Report) => (
                  <li key={report.id} className="rounded-lg border border-line p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-ink">
                          {strings.admin.moderation.reportTargetId(report.targetId)}
                        </p>
                        <p className="text-sm text-ink-muted">
                          {strings.admin.moderation.reportTargetType(
                            strings.admin.moderation.targetTypeLabels[report.targetType] ?? report.targetType,
                          )}
                        </p>
                        <p className="text-sm text-ink-muted">
                          {strings.admin.moderation.reportReason(report.reason)}
                        </p>
                        {report.description && (
                          <p className="text-sm text-ink-muted">
                            {strings.admin.moderation.reportDescription(report.description)}
                          </p>
                        )}
                        <p className="text-sm text-ink-muted">
                          {strings.admin.moderation.reportStatus(
                            strings.admin.moderation.statusLabels[report.status] ?? report.status,
                          )}
                        </p>
                        <p className="text-sm text-ink-muted">
                          {strings.admin.moderation.reportCreatedAt(report.createdAt)}
                        </p>
                        {statusBadge(report.status)}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={moderateMutation.isPending && moderateMutation.variables?.reportId === report.id}
                          disabled={moderateMutation.isPending}
                          onClick={() =>
                            moderateMutation.mutate({ reportId: report.id, status: "in_review" })
                          }
                        >
                          {strings.admin.moderation.moderateInReview}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={moderateMutation.isPending && moderateMutation.variables?.reportId === report.id}
                          disabled={moderateMutation.isPending}
                          onClick={() =>
                            moderateMutation.mutate({ reportId: report.id, status: "resolved" })
                          }
                        >
                          {strings.admin.moderation.moderateResolve}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={moderateMutation.isPending && moderateMutation.variables?.reportId === report.id}
                          disabled={moderateMutation.isPending}
                          onClick={() =>
                            moderateMutation.mutate({ reportId: report.id, status: "dismissed" })
                          }
                        >
                          {strings.admin.moderation.moderateDismiss}
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Actions tab */}
        {activeTab === "actions" && (
          <div className="rounded-xl border border-line bg-surface p-6">
            <p className="text-sm text-ink-muted">{strings.admin.moderation.actionsPlaceholder}</p>
          </div>
        )}

        {/* Stats tab content already rendered above */}
      </div>
    </AdminGuard>
  );
}
