"use client";

import React, { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Button } from "@/components/ui/Button";
import { Loading } from "@/components/ui/Loading";
import { useToast } from "@/components/providers/ToastProvider";
import type { Report } from "@/types/api";

/**
 * The moderation admin dashboard.
 *
 * WHY THIS PAGE EXISTS. Moderators need one place to see the state of the queue,
 * act on reports, and view the actions that have already been taken. The three
 * backend routes that serve this data are wired here so the moderator does not
 * have to navigate three pages.
 */
export default function ModerationDashboardPage() {
  const { notify } = useToast();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [activeTab, setActiveTab] = useState<"queue" | "actions" | "stats">("queue");
  // Bumped by `retry` to re-arm the load effect. The queue load owns its own loading/error
  // transitions, so there is no longer an out-of-band flag to reset (see the load below).
  const [attempt, setAttempt] = useState(0);

  /**
   * WHY THE LOAD OWNS ITS OWN STATE.
   *
   * This was `loadQueue`, a `useCallback` that swallowed every failure in a bare `catch {}` and
   * never touched `loading`. `retry` called it directly, so on failure `loading` stayed `true`
   * forever (the button spins, the error branch is never reachable) and the queue simply never
   * populated. The load now sets `loading` and `error` around the request the same way the book
   * detail page does, and `retry` re-arms it through the `attempt` counter rather than reaching
   * around it.
   */
  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const data = await api.getModerationQueue();
        if (active) setReports(data.reports);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "فشل تحميل لوحة الاعتدال");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [attempt]);

  /**
   * A moderation action failure is surfaced twice, on purpose: inline where the moderator is
   * looking, and as a toast, because the control they pressed scrolls with the queue. A silent
   * revert of the status chip is indistinguishable from a bug.
   */
  const handleModerate = async (reportId: string, status: "open" | "in_review" | "resolved" | "dismissed") => {
    setActionLoading(true);
    setActionError("");
    try {
      await api.moderateItem(reportId, { status });
      setReports((prev) => prev.map((r) => (r.id === reportId ? { ...r, status } : r)));
    } catch (err) {
      const message = err instanceof Error ? err.message : "تعذّر تحديث البلاغ";
      setActionError(message);
      notify(message, "error");
    } finally {
      setActionLoading(false);
    }
  };

  const retry = () => {
    setLoading(true);
    setError("");
    setAttempt((n) => n + 1);
  };

  if (loading) {
    return (
      <>
        <PageHeader title="لوحة الاعتدال" />
        <Loading />
      </>
    );
  }

  if (error) {
    return <ErrorMessage error={error} onRetry={retry} title="فشل تحميل لوحة الاعتدال" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="لوحة الاعتدال" description="راقب البلاغات واتخذ الإجراءات المناسبة." />

      <div className="flex gap-2 border-b border-line">
        <button
          type="button"
          onClick={() => setActiveTab("queue")}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === "queue" ? "border-b-2 border-ink text-ink" : "text-ink-muted"
          }`}
        >
          طابور البلاغات
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("actions")}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === "actions" ? "border-b-2 border-ink text-ink" : "text-ink-muted"
          }`}
        >
          الإجراءات
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("stats")}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === "stats" ? "border-b-2 border-ink text-ink" : "text-ink-muted"
          }`}
        >
          الإحصائيات
        </button>
      </div>

      {activeTab === "queue" && (
        <div className="space-y-3">
          {actionError && <ErrorMessage error={actionError} title="تعذّر تحديث البلاغ" />}
          {reports.length === 0 ? (
            <p className="text-sm text-ink-muted">لا توجد بلاغات معلّقة.</p>
          ) : (
            <ul className="space-y-3">
              {reports.map((report) => (
                <li key={report.id} className="rounded-lg border border-line p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-ink">
                        معرّف الهدف: {report.targetId}
                      </p>
                      <p className="text-sm text-ink-muted">النوع: {report.targetType}</p>
                      <p className="text-sm text-ink-muted">السبب: {report.reason}</p>
                      {report.description && (
                        <p className="text-sm text-ink-muted">الوصف: {report.description}</p>
                      )}
                      <p className="text-sm text-ink-muted">الحالة: {report.status}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={actionLoading}
                        onClick={() => handleModerate(report.id, "in_review")}
                      >
                        قيد المراجعة
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={actionLoading}
                        onClick={() => handleModerate(report.id, "resolved")}
                      >
                        حلّ
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={actionLoading}
                        onClick={() => handleModerate(report.id, "dismissed")}
                      >
                        رفض
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
        <p className="text-sm text-ink-muted">الإجراءات تظهر هنا بعد اتخاذها.</p>
      )}

      {activeTab === "stats" && (
        <p className="text-sm text-ink-muted">الإحصائيات تظهر هنا عند توفرها.</p>
      )}
    </div>
  );
}
