"use client";

import React, { useMemo, useState } from "react";

import { useStoredUser } from "@/lib/use-stored-user";
import { PageHeader } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Loading } from "@/components/ui/Loading";
import { useStrings } from "@/components/providers/LocaleProvider";
import { classifyError } from "@/lib/errors";
import {
  isFailedLoad,
  useContests,
  usePublisherStats,
  usePublisherSubmissions,
  usePublisherVotes,
} from "@/lib/queries";

/**
 * The publisher dashboard.
 *
 * WHY THIS PAGE EXISTS. A publisher running a contest needs one place to see the
 * numbers that matter — how many contests are live, how many submissions are waiting,
 * and how people are voting. The three backend routes that serve this data are wired
 * here in one component so the publisher does not have to navigate three pages.
 *
 * WHY A FAILING LOADER NO LONGER BLANKS THE PAGE. The three loaders used to
 * swallow their own failures in a bare `catch {}`, so the page-level error branch
 * could never be reached and a broken panel looked like an empty one. Each loader
 * is now its own query with its own error, and the first failure is reported at
 * the top of the page while the panels that DID load stay on screen.
 */
export default function PublisherDashboardPage() {
  const strings = useStrings();

  /**
   * The publisher's own id, from the session store.
   *
   * The contest below is the publisher's OWN live contest, so the id decides
   * which one it is — and it is read through the store rather than out of
   * local storage during render, because the server has no local storage to
   * read and the two answers are not the same markup. See
   * `lib/use-stored-user.ts`.
   */
  const currentUserId = useStoredUser()?.id ?? null;

  const statsQuery = usePublisherStats();
  const contestsQuery = useContests();

  /**
   * The contest the entries and the votes below belong to.
   *
   * The publisher's routes are addressed by a contest id, and the id is the
   * publisher's own live contest — so it is derived from the contest list rather
   * than asked for. An empty id leaves the two queries disabled, which is why
   * they never fire for a publisher with no live contest.
   */
  const activeContestId = useMemo(() => {
    const contests = contestsQuery.data?.contests ?? [];
    const active = contests.find((contest) => contest.createdBy === currentUserId && contest.status === "active");
    return active?.id ?? "";
  }, [contestsQuery.data, currentUserId]);

  const submissionsQuery = usePublisherSubmissions(activeContestId);
  const votesQuery = usePublisherVotes(activeContestId);

  const [activeTab, setActiveTab] = useState<"overview" | "submissions" | "votes">("overview");

  // A failed BACKGROUND refetch keeps what is on the screen; only a load that
  // never arrived is a failure.
  const failure = isFailedLoad(statsQuery)
    ? statsQuery.error
    : isFailedLoad(contestsQuery)
      ? contestsQuery.error
      : isFailedLoad(submissionsQuery)
        ? submissionsQuery.error
        : isFailedLoad(votesQuery)
          ? votesQuery.error
          : null;

  const retryAll = () => {
    void statsQuery.refetch();
    void contestsQuery.refetch();
    void submissionsQuery.refetch();
    void votesQuery.refetch();
  };

  if (statsQuery.isLoading || contestsQuery.isLoading) {
    return (
      <>
        <PageHeader title={strings.contests.publisherTitle} />
        <Loading />
      </>
    );
  }

  const stats = statsQuery.data;

  const statCards = stats
    ? [
        { label: strings.contests.publisherStatTotalContests, value: stats.totalContests },
        { label: strings.contests.publisherStatActiveContests, value: stats.activeContests },
        { label: strings.contests.publisherStatCompletedContests, value: stats.completedContests },
        { label: strings.contests.publisherStatTotalSubmissions, value: stats.totalSubmissions },
        { label: strings.contests.publisherStatPendingSubmissions, value: stats.pendingSubmissions },
        { label: strings.contests.publisherStatTotalVotes, value: stats.totalVotes },
        { label: strings.contests.publisherStatTotalPrizes, value: stats.totalPrizes },
      ]
    : [];

  const submissions = submissionsQuery.data?.submissions ?? [];
  const votes = votesQuery.data?.votes ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title={strings.contests.publisherTitle} description={strings.contests.publisherDescription} />

      {failure && (
        <ErrorMessage
          error={strings.errors[classifyError(failure)]}
          title={strings.contests.publisherLoadFailed}
          onRetry={retryAll}
        />
      )}

      {statCards.length > 0 && (
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
          aria-current={activeTab === "overview" ? "true" : undefined}
          className={`min-h-11 px-4 py-2 text-sm font-medium ${
            activeTab === "overview" ? "border-b-2 border-ink text-ink" : "text-ink-muted"
          }`}
        >
          {strings.contests.publisherTabOverview}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("submissions")}
          aria-current={activeTab === "submissions" ? "true" : undefined}
          className={`min-h-11 px-4 py-2 text-sm font-medium ${
            activeTab === "submissions" ? "border-b-2 border-ink text-ink" : "text-ink-muted"
          }`}
        >
          {strings.contests.publisherTabSubmissions}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("votes")}
          aria-current={activeTab === "votes" ? "true" : undefined}
          className={`min-h-11 px-4 py-2 text-sm font-medium ${
            activeTab === "votes" ? "border-b-2 border-ink text-ink" : "text-ink-muted"
          }`}
        >
          {strings.contests.publisherTabVotes}
        </button>
      </div>

      {activeTab === "submissions" && (
        <div className="space-y-3">
          {submissionsQuery.isLoading ? (
            <Loading />
          ) : submissions.length === 0 ? (
            <p className="text-sm text-ink-muted">{strings.contests.publisherSubmissionsEmpty}</p>
          ) : (
            <ul className="space-y-3">
              {submissions.map((submission) => (
                <li key={submission.id} className="rounded-lg border border-line p-4">
                  <p className="font-medium text-ink">
                    {strings.contests.publisherSubmissionStoryId(submission.storyId)}
                  </p>
                  <p className="text-sm text-ink-muted">
                    {strings.contests.publisherSubmissionStatus(
                      strings.contests.submissionStatusLabels[submission.status] ?? submission.status,
                    )}
                  </p>
                  <p className="text-sm text-ink-muted">
                    {strings.contests.publisherSubmissionVotes(submission.votes)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {activeTab === "votes" && (
        <div className="space-y-3">
          {votesQuery.isLoading ? (
            <Loading />
          ) : votes.length === 0 ? (
            <p className="text-sm text-ink-muted">{strings.contests.publisherVotesEmpty}</p>
          ) : (
            <ul className="space-y-3">
              {votes.map((vote) => (
                <li key={vote.id} className="rounded-lg border border-line p-4">
                  <p className="text-sm text-ink-muted">
                    {strings.contests.publisherVoteSubmissionId(vote.submissionId)}
                  </p>
                  <p className="text-sm text-ink-muted">{strings.contests.publisherVoteVoter(vote.userId)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
