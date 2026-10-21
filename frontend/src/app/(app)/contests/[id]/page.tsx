"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { useStoredUser } from "@/lib/use-stored-user";
import { PageHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Icon } from "@/components/ui/Icon";
import { ContestStatusBadge } from "@/components/social/ContestStatusBadge";
import { useLocale, useStrings } from "@/components/providers/LocaleProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { classifyError } from "@/lib/errors";
import { formatDate } from "@/lib/i18n";
import { isFailedLoad, useContest, useContestVotes, useInvalidation } from "@/lib/queries";

export default function ContestDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const { intl } = useLocale();
  const strings = useStrings();
  const { notify } = useToast();
  const invalidate = useInvalidation();

  const [storyId, setStoryId] = useState("");
  const [selectedSubmissionId, setSelectedSubmissionId] = useState("");
  const [prizeSubmissionId, setPrizeSubmissionId] = useState("");
  const [prizeType, setPrizeType] = useState<string>("cash");
  const [prizeDescription, setPrizeDescription] = useState("");
  const [prizeAmount, setPrizeAmount] = useState("");
  const [prizeCurrency, setPrizeCurrency] = useState("EGP");

  const contestQuery = useContest(id);
  const votesQuery = useContestVotes(id);

  const contest = contestQuery.data ?? null;

  /**
   * The votes counted per entry.
   *
   * The API returns one row per vote, so the tally the page shows is a grouping
   * the client derives — and it is derived on every render rather than kept in a
   * state of its own, because a vote cast in another tab would otherwise leave
   * the numbers stale here.
   */
  const votes = useMemo(() => {
    const votesData = votesQuery.data;
    if (!votesData) return [];
    return votesData.votes.reduce<{ submissionId: string; count: number }[]>((acc, vote) => {
      const existing = acc.find((item) => item.submissionId === vote.submissionId);
      if (existing) {
        existing.count += 1;
      } else {
        acc.push({ submissionId: vote.submissionId, count: 1 });
      }
      return acc;
    }, []);
  }, [votesQuery.data]);

  const submitMutation = useMutation({
    mutationFn: (entryStoryId: string) => api.submitEntry(id, entryStoryId),
    onSuccess: async () => {
      setStoryId("");
      notify(strings.contests.submitSucceeded, "success");
      await invalidate.contests(id);
    },
  });

  const voteMutation = useMutation({
    mutationFn: (submissionId: string) => api.castVote(id, submissionId),
    onSuccess: async () => {
      notify(strings.contests.voteSucceeded, "success");
      await invalidate.contests(id);
    },
  });

  const winnerMutation = useMutation({
    mutationFn: (submissionId: string) => api.selectWinner(id, { submissionId, winnerId: submissionId }),
    onSuccess: async () => {
      notify(strings.contests.selectWinnerSucceeded, "success");
      await invalidate.contests(id);
    },
  });

  const prizeMutation = useMutation({
    mutationFn: () =>
      api.distributePrize(id, {
        submissionId: prizeSubmissionId,
        winnerId: prizeSubmissionId,
        prizeType,
        prizeDescription: prizeDescription || undefined,
        amount: prizeAmount ? Number(prizeAmount) : undefined,
        currency: prizeCurrency || undefined,
      }),
    onSuccess: async () => {
      notify(strings.contests.distributePrizeSucceeded, "success");
      await invalidate.contests(id);
    },
  });

  /**
   * The reader's id, and with it the ownership of this contest.
   *
   * The owner controls below are rendered only for the contest's creator, and
   * the id is read through the session store rather than out of local storage
   * during render: the server has no local storage, so it would answer `null`
   * and render a contest with no owner controls while the client rendered the
   * owner's — and React does not merge the two. See `lib/use-stored-user.ts`.
   */
  const currentUserId = useStoredUser()?.id ?? null;
  const isOwner = currentUserId != null && contest != null && contest.createdBy === currentUserId;

  if (contestQuery.isLoading) {
    return (
      <>
        <PageHeader title={strings.contests.detailTitle} />
        <p role="status" className="sr-only">
          {strings.common.loading}
        </p>
        <Card>
          <CardBody className="space-y-4">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-24 w-full" />
          </CardBody>
        </Card>
      </>
    );
  }

  if (isFailedLoad(contestQuery)) {
    return (
      <ErrorMessage
        error={strings.errors[classifyError(contestQuery.error)]}
        title={strings.contests.detailLoadFailed}
        onRetry={() => void contestQuery.refetch()}
      />
    );
  }

  if (!contest) {
    return (
      <ErrorMessage
        error={strings.contests.detailNotFoundMessage}
        title={strings.contests.detailNotFoundTitle}
      />
    );
  }

  // No local `formatDate` here on purpose: every date in the product goes
  // through `lib/i18n`'s pair, so the digit system is decided in one place.
  const facts: { label: string; value: React.ReactNode }[] = [
    { label: strings.contests.factCategory, value: contest.categoryId ?? "—" },
    { label: strings.contests.factStatus, value: <ContestStatusBadge status={contest.status} /> },
    { label: strings.contests.factStartDate, value: <span className="hk-numeric">{formatDate(contest.startDate, intl)}</span> },
    { label: strings.contests.factEndDate, value: <span className="hk-numeric">{formatDate(contest.endDate, intl)}</span> },
    {
      label: strings.contests.factSubmissionDeadline,
      value: <span className="hk-numeric">{formatDate(contest.submissionDeadline, intl)}</span>,
    },
    { label: strings.contests.factWinner, value: contest.winnerId ?? "—" },
  ];

  return (
    <div className="animate-rise">
      <Link
        href="/contests"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-chrome-ink hover:text-chrome"
      >
        <Icon name="chevron" size="sm" />
        {strings.contests.backToContests}
      </Link>

      <PageHeader title={contest.title} />

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-ink">{strings.contests.detailsHeading}</h2>
        </CardHeader>
        <CardBody className="space-y-6">
          {contest.description && (
            <p className="text-base leading-8 text-ink-muted">{contest.description}</p>
          )}

          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {facts.map((fact) => (
              <div key={fact.label}>
                <dt className="text-sm text-ink-muted">{fact.label}</dt>
                <dd className="mt-1 font-medium text-ink">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <h2 className="text-lg font-semibold text-ink">{strings.contests.submitHeading}</h2>
        </CardHeader>
        <CardBody>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitMutation.mutate(storyId);
            }}
            className="space-y-4"
          >
            {submitMutation.isError && (
              <ErrorMessage
                error={strings.errors[classifyError(submitMutation.error)]}
                title={strings.contests.submitFailed}
              />
            )}

            <Input
              label={strings.contests.storyIdLabel}
              type="text"
              required
              value={storyId}
              onChange={(e) => setStoryId(e.target.value)}
              placeholder={strings.contests.storyIdPlaceholder}
              wrapperClassName="max-w-md"
            />
            <Button type="submit" loading={submitMutation.isPending}>
              {strings.contests.submitButton}
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <h2 className="text-lg font-semibold text-ink">{strings.contests.votesHeading}</h2>
        </CardHeader>
        <CardBody>
          {voteMutation.isError && (
            <ErrorMessage
              error={strings.errors[classifyError(voteMutation.error)]}
              title={strings.contests.voteFailed}
              className="mb-4"
            />
          )}

          {votes.length === 0 ? (
            <p className="text-sm text-ink-muted">{strings.contests.votesEmpty}</p>
          ) : (
            <ul className="space-y-3">
              {votes.map((vote) => (
                <li key={vote.submissionId} className="flex items-center justify-between rounded-lg border border-line p-3">
                  <span className="text-sm text-ink-muted">
                    {strings.contests.submissionIdLabel(vote.submissionId)}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="hk-numeric text-sm font-medium text-ink">
                      {strings.contests.voteCount(vote.count)}
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={voteMutation.isPending && voteMutation.variables === vote.submissionId}
                      disabled={voteMutation.isPending}
                      onClick={() => voteMutation.mutate(vote.submissionId)}
                    >
                      {strings.contests.voteButton}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {isOwner && (
        <Card className="mt-6">
          <CardHeader>
            <h2 className="text-lg font-semibold text-ink">{strings.contests.ownerActionsHeading}</h2>
          </CardHeader>
          <CardBody className="space-y-5">
            {winnerMutation.isError && (
              <ErrorMessage
                error={strings.errors[classifyError(winnerMutation.error)]}
                title={strings.contests.selectWinnerFailed}
              />
            )}

            <div className="space-y-3">
              <p className="text-sm font-medium text-ink-muted">{strings.contests.selectWinnerHeading}</p>
              <Input
                label={strings.contests.winningSubmissionIdLabel}
                type="text"
                value={selectedSubmissionId}
                onChange={(e) => setSelectedSubmissionId(e.target.value)}
                placeholder={strings.contests.submissionIdPlaceholder}
                wrapperClassName="max-w-md"
              />
              <Button
                size="sm"
                onClick={() => winnerMutation.mutate(selectedSubmissionId)}
                loading={winnerMutation.isPending}
                disabled={!selectedSubmissionId}
              >
                {strings.contests.selectWinnerButton}
              </Button>
            </div>

            {prizeMutation.isError && (
              <ErrorMessage
                error={strings.errors[classifyError(prizeMutation.error)]}
                title={strings.contests.distributePrizeFailed}
              />
            )}

            <div className="border-t border-line pt-5 space-y-3">
              <p className="text-sm font-medium text-ink-muted">{strings.contests.distributePrizeHeading}</p>
              <Input
                label={strings.contests.prizeSubmissionIdLabel}
                type="text"
                value={prizeSubmissionId}
                onChange={(e) => setPrizeSubmissionId(e.target.value)}
                placeholder={strings.contests.submissionIdPlaceholder}
                wrapperClassName="max-w-md"
              />
              <Select
                label={strings.contests.prizeTypeLabel}
                value={prizeType}
                onChange={(e) => setPrizeType(e.target.value)}
                options={[
                  { value: "cash", label: strings.contests.prizeTypeCash },
                  { value: "other", label: strings.contests.prizeTypeOther },
                ]}
                wrapperClassName="max-w-md"
              />
              <Input
                label={strings.contests.prizeDescriptionLabel}
                type="text"
                value={prizeDescription}
                onChange={(e) => setPrizeDescription(e.target.value)}
                placeholder={strings.contests.prizeDescriptionPlaceholder}
                wrapperClassName="max-w-md"
              />
              <Input
                label={strings.contests.prizeAmountLabel}
                type="number"
                min={0}
                value={prizeAmount}
                onChange={(e) => setPrizeAmount(e.target.value)}
                placeholder={strings.contests.prizeAmountPlaceholder}
                wrapperClassName="max-w-md"
              />
              <Input
                label={strings.contests.prizeCurrencyLabel}
                type="text"
                value={prizeCurrency}
                onChange={(e) => setPrizeCurrency(e.target.value)}
                placeholder={strings.contests.prizeCurrencyPlaceholder}
                wrapperClassName="max-w-md"
              />
              <Button
                size="sm"
                onClick={() => prizeMutation.mutate()}
                loading={prizeMutation.isPending}
                disabled={!prizeSubmissionId || !prizeType}
              >
                {strings.contests.distributePrizeButton}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
