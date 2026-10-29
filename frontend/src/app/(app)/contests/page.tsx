"use client";

import React from "react";

import { PageHeader } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { ContestCard, ContestListEmpty, ContestListSkeleton } from "@/components/social/ContestCard";
import { useStrings } from "@/components/providers/LocaleProvider";
import { classifyError } from "@/lib/errors";
import { isFailedLoad, useContests } from "@/lib/queries";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

export default function ContestsPage() {
  const strings = useStrings();
  const contestsQuery = useContests();
  const { data, isLoading, error, refetch } = contestsQuery;

  if (isLoading) {
    return (
      <>
        <PageHeader title={strings.contests.listTitle} />
        <p role="status" className="sr-only">
          {strings.common.loading}
        </p>
        <ContestListSkeleton />
      </>
    );
  }

  if (isFailedLoad(contestsQuery)) {
    return (
      <>
        <PageHeader title={strings.contests.listTitle} />
        <ErrorMessage
          error={strings.errors[classifyError(error)]}
          title={strings.contests.listLoadFailed}
          onRetry={() => void refetch()}
        />
      </>
    );
  }

  const contests = data?.contests ?? [];

  return (
    <div className="animate-rise">
      <PageHeader
        title={strings.contests.listTitle}
        description={strings.contests.listDescription}
      />

      {contests.length === 0 ? (
        <ContestListEmpty />
      ) : (
        <ul className="space-y-4">
          {contests.map((contest) => (
            <li key={contest.id}>
              <ContestCard contest={contest} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
