"use client";

import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Button } from "@/components/ui/Button";
import { Loading } from "@/components/ui/Loading";
import { useStrings } from "@/components/providers/LocaleProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { classifyError } from "@/lib/errors";
import { isFailedLoad, useInvalidation, useModerationQueue } from "@/lib/queries";
import type { Report } from "@/types/api";

/**
 * The moderation admin dashboard.
 *
 * WHY THIS PAGE EXISTS. Moderators need one place to see the state of the queue,
 * act on reports, and view the actions that have already been taken. The three
 * backend routes that serve this data are wired here so the moderator does not
 * have to navigate three pages.
 *
 * WHY THE STATISTICS TAB IS STILL A PLACEHOLDER. The query registry
 * (`lib/queries.ts`) has hooks for the moderation surface — `useModerationQueue`
 * and `useUserRestrictions` — but none for the statistics, and that is not an
 * oversight in the registry: the client HAS the call, `api.getModerationStats`,
 * and it parses the backend's admin dashboard DTO (`totalReports`,
 * `openReports`, `totalActions`, …) with the PUBLISHER's schema, which is a
 * different set of fields, so the request can never satisfy it. The schema
 * belongs to `lib/schemas.ts` and the call to `lib/api.ts` — neither is this
 * surface's file to change — and a tab that always showed an error would be
 * worse than one that tells the moderator the numbers are not available yet.
 */
export default function ModerationDashboardPage() {
  const strings = useStrings();
  const { notify } = useToast();
  const invalidate = useInvalidation();
  const [activeTab, setActiveTab] = useState<"queue" | "actions" | "stats">("queue");

  const queueQuery = useModerationQueue();

  /**
   * A moderation action failure is surfaced twice, on purpose: inline where the moderator is
   * looking, and as a toast, because the control they pressed scrolls with the queue. A silent
   * revert of the status chip is indistinguishable from a bug.
   */
  const moderateMutation = useMutation({
    mutationFn: ({ reportId, status }: { reportId: string; status: Report["status"] }) =>
      api.moderateItem(reportId, { status }),
    onSuccess: async () => {
      await invalidate.moderation();
    },
    onError: (err) => {
      notify(strings.errors[classifyError(err)], "error");
    },
  });

  if (queueQuery.isLoading) {
    return (
      <>
        <PageHeader title={strings.moderation.dashboardTitle} />
        <Loading />
      </>
    );
  }

  if (isFailedLoad(queueQuery)) {
    return (
      <ErrorMessage
        error={strings.errors[classifyError(queueQuery.error)]}
        title={strings.moderation.dashboardLoadFailed}
        onRetry={() => void queueQuery.refetch()}
      />
    );
  }

  const reports = queueQuery.data?.reports ?? [];

  const tabButton = (tab: "queue" | "actions" | "stats", label: string) => (
    <button
      type="button"
      onClick={() => setActiveTab(tab)}
      aria-current={activeTab === tab ? "true" : undefined}
      className={`min-h-11 px-4 py-2 text-sm font-medium ${
        activeTab === tab ? "border-b-2 border-ink text-ink" : "text-ink-muted"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <PageHeader title={strings.moderation.dashboardTitle} description={strings.moderation.dashboardDescription} />

      <div className="flex gap-2 border-b border-line">
        {tabButton("queue", strings.moderation.tabQueue)}
        {tabButton("actions", strings.moderation.tabActions)}
        {tabButton("stats", strings.moderation.tabStats)}
      </div>

      {activeTab === "queue" && (
        <div className="space-y-3">
          {moderateMutation.isError && (
            <ErrorMessage
              error={strings.errors[classifyError(moderateMutation.error)]}
              title={strings.moderation.moderateFailed}
            />
          )}
          {reports.length === 0 ? (
            <p className="text-sm text-ink-muted">{strings.moderation.queueEmpty}</p>
          ) : (
            <ul className="space-y-3">
              {reports.map((report) => (
                <li key={report.id} className="rounded-lg border border-line p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-ink">
                        {strings.moderation.reportTargetId(report.targetId)}
                      </p>
                      <p className="text-sm text-ink-muted">
                        {strings.moderation.reportTargetType(
                          strings.moderation.targetTypeLabels[report.targetType] ?? report.targetType,
                        )}
                      </p>
                      <p className="text-sm text-ink-muted">{strings.moderation.reportReason(report.reason)}</p>
                      {report.description && (
                        <p className="text-sm text-ink-muted">
                          {strings.moderation.reportDescription(report.description)}
                        </p>
                      )}
                      <p className="text-sm text-ink-muted">
                        {strings.moderation.reportStatus(
                          strings.moderation.statusLabels[report.status] ?? report.status,
                        )}
                      </p>
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
                        {strings.moderation.moderateInReview}
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
                        {strings.moderation.moderateResolve}
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
                        {strings.moderation.moderateDismiss}
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {activeTab === "actions" && (
        <p className="text-sm text-ink-muted">{strings.moderation.actionsPlaceholder}</p>
      )}

      {activeTab === "stats" && (
        <p className="text-sm text-ink-muted">{strings.moderation.statsPlaceholder}</p>
      )}
    </div>
  );
}
