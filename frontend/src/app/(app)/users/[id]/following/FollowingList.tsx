"use client";

import React from "react";

import { PageHeader } from "@/components/ui/Card";
import { Card } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Skeleton } from "@/components/ui/Skeleton";
import { FollowListEmpty, FollowListRow } from "@/components/social/FollowListRow";
import { useStrings } from "@/components/providers/LocaleProvider";
import { classifyError } from "@/lib/errors";
import { isFailedLoad, useFollowing } from "@/lib/queries";

/**
 * The list of accounts an account follows.
 *
 * IT IS A CLIENT COMPONENT BECAUSE IT FETCHES. The page it lives in is a
 * server component so it can keep its `generateMetadata`, and `generateMetadata`
 * is not allowed in a client file — so the fetch, the states and the rows moved
 * here, next to the page that renders them.
 *
 * A failure is a FAILURE, NOT AN EMPTY LIST. The page this replaces caught the
 * error and rendered "nobody follows anybody yet", which is a sentence about the
 * world that the server never said; the reader was told a fact that was only
 * true because the request failed. Now the failure is announced, with a retry
 * that asks the server again.
 */
export function FollowingList({ userId }: { userId: string }) {
  const strings = useStrings();
  const { social } = strings;
  const query = useFollowing(userId, { page: 1, limit: 20 });
  const following = query.data?.following ?? [];
  // A failed BACKGROUND REFETCH leaves the list in place; only a load that
  // never arrived is a failed page.
  const failed = isFailedLoad(query);

  return (
    <div>
      <PageHeader title={social.followingTitle} description={social.followingDescription} />

      {query.isLoading ? (
        <div aria-busy="true">
          <span role="status" className="sr-only">
            {strings.common.loading}
          </span>
          <div className="space-y-3">
            {Array.from({ length: 4 }, (_, index) => (
              <Card key={index} className="p-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="mt-2 h-3 w-24" />
              </Card>
            ))}
          </div>
        </div>
      ) : failed ? (
        <ErrorMessage
          error={strings.errors[classifyError(query.error)]}
          title={social.followingLoadFailed}
          onRetry={() => void query.refetch()}
        />
      ) : following.length === 0 ? (
        <FollowListEmpty label={social.followEmptyFollowing} />
      ) : (
        <div className="space-y-3">
          {following.map((follow) => (
            <FollowListRow key={follow.id} follow={follow} relation="following" />
          ))}
        </div>
      )}
    </div>
  );
}
