"use client";

import React, { useCallback, useEffect, useState } from "react";

import { api, getStoredUser } from "@/lib/api";
import { PageHeader } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Loading } from "@/components/ui/Loading";
import type { PublisherStatsResponse, PublisherSubmissionOverview, PublisherVoteOverview } from "@hakawi/shared-types";

/**
 * The publisher dashboard.
 *
 * WHY THIS PAGE EXISTS. A publisher running a contest needs one place to see the
 * numbers that matter — how many contests are live, how many submissions are waiting,
 * and how people are voting. The three backend routes that serve this data are wired
 * here in one component so the publisher does not have to navigate three pages.
 */
export default function PublisherDashboardPage() {
  const currentUserId = getStoredUser()?.id ?? null;
  const [stats, setStats] = useState<PublisherStatsResponse | null>(null);
  const [submissions, setSubmissions] = useState<PublisherSubmissionOverview[]>([]);
  const [votes, setVotes] = useState<PublisherVoteOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "submissions" | "votes">("overview");

  const loadStats = useCallback(async () => {
    try {
      const data = await api.getPublisherStats();
      setStats(data);
    } catch {
      // Stats are additive; a failure here does not block the rest.
    }
  }, []);

  const loadSubmissions = useCallback(async () => {
    try {
      const { contests } = await api.listContests();
      const activeContest = contests.find((c) => c.createdBy === currentUserId && c.status === "active");
      if (!activeContest) return;
      const data = await api.getPublisherSubmissions(activeContest.id);
      setSubmissions(data.submissions);
    } catch {
      // Submissions are secondary; a failure here does not block stats.
    }
  }, [currentUserId]);

  const loadVotes = useCallback(async () => {
    try {
      const { contests } = await api.listContests();
      const activeContest = contests.find((c) => c.createdBy === currentUserId && c.status === "active");
      if (!activeContest) return;
      const data = await api.getPublisherVotes(activeContest.id);
      setVotes(data.votes);
    } catch {
      // Votes are secondary; a failure here does not block stats.
    }
  }, [currentUserId]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        await Promise.all([loadStats(), loadSubmissions(), loadVotes()]);
      } catch {
        if (active) setError("فشل تحميل لوحة الناشر");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [loadStats, loadSubmissions, loadVotes]);

  const retry = () => {
    setLoading(true);
    setError("");
    void loadStats();
    void loadSubmissions();
    void loadVotes();
  };

  if (loading) {
    return (
      <>
        <PageHeader title="لوحة الناشر" />
        <Loading />
      </>
    );
  }

  if (error) {
    return <ErrorMessage error={error} onRetry={retry} title="فشل تحميل لوحة الناشر" />;
  }

  const statCards = stats
    ? [
          { label: "إجمالي المسابقات", value: stats.totalContests },
          { label: "المسابقات النشطة", value: stats.activeContests },
          { label: "المسابقات المكتملة", value: stats.totalSubmissions },
          { label: "المشاركات المعلّقة", value: stats.pendingSubmissions },
          { label: "إجمالي الأصوات", value: stats.totalVotes },
          { label: "إجمالي الجوائز", value: stats.totalPrizes },
        ]
    : [];

  return (
    <div className="space-y-6">
      <PageHeader title="لوحة الناشر" description="نظرة عامة على مسابقاتك ومشاركاتها." />

      {stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {statCards.map((stat) => (
            <div key={stat.label} className="rounded-lg border border-line p-4">
              <p className="text-sm text-ink-muted">{stat.label}</p>
              <p className="mt-1 hk-numeric text-2xl font-bold text-ink">{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 border-b border-line">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === "overview" ? "border-b-2 border-ink text-ink" : "text-ink-muted"
          }`}
        >
          نظرة عامة
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("submissions")}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === "submissions" ? "border-b-2 border-ink text-ink" : "text-ink-muted"
          }`}
        >
          المشاركات
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("votes")}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === "votes" ? "border-b-2 border-ink text-ink" : "text-ink-muted"
          }`}
        >
          الأصوات
        </button>
      </div>

      {activeTab === "submissions" && (
        <div className="space-y-3">
          {submissions.length === 0 ? (
            <p className="text-sm text-ink-muted">لا توجد مشاركات بعد.</p>
          ) : (
            <ul className="space-y-3">
              {submissions.map((submission) => (
                <li key={submission.id} className="rounded-lg border border-line p-4">
                  <p className="font-medium text-ink">معرّف القصة: {submission.storyId}</p>
                  <p className="text-sm text-ink-muted">الحالة: {submission.status}</p>
                  <p className="text-sm text-ink-muted">الأصوات: {submission.votes}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {activeTab === "votes" && (
        <div className="space-y-3">
          {votes.length === 0 ? (
            <p className="text-sm text-ink-muted">لا توجد أصوات بعد.</p>
          ) : (
            <ul className="space-y-3">
              {votes.map((vote) => (
                <li key={vote.id} className="rounded-lg border border-line p-4">
                  <p className="text-sm text-ink-muted">معرّف المشاركة: {vote.submissionId}</p>
                  <p className="text-sm text-ink-muted">الناخب: {vote.userId}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
