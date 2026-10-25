"use client";

import React from "react";

import { useStoredUser } from "@/lib/use-stored-user";
import { PageHeader } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { BadgeCard, BadgeGridSkeleton } from "@/components/social/BadgeCard";
import { useStrings } from "@/components/providers/LocaleProvider";
import { classifyError } from "@/lib/errors";
import { isFailedLoad, useBadgeCatalog, useUserBadges } from "@/lib/queries";
import { BadgeCatalogEntry } from "@hakawi/shared-types";

/**
 * The badge catalogue.
 *
 * WHY THIS PAGE EXISTS. Badges are the product's gamification layer — they tell a reader
 * what the platform values and how to earn it. This page lists every badge the engine
 * knows about, so a reader can see the catalogue without needing to earn one first.
 *
 * WHY THE CATALOGUE IS FETCHED ONCE. The page used to define a `load` callback and
 * then ask for the same catalogue again from an effect, so every visit asked the
 * server twice for one list. The query hook asks once and caches it.
 */
export default function BadgesPage() {
  const strings = useStrings();

  /**
   * The reader's id, from the session store.
   *
   * A render-time read of local storage answers `null` on the server and the
   * reader on the client, and those two markups are not merged — so the id is
   * read through the store, which gives the server `null` and the client the
   * reader. See `lib/use-stored-user.ts`.
   */
  const userId = useStoredUser()?.id ?? "";

  const catalogQuery = useBadgeCatalog();
  const earnedQuery = useUserBadges(userId);

  if (catalogQuery.isLoading) {
    return (
      <>
        <PageHeader title={strings.profile.badgesTitle} />
        <p role="status" className="sr-only">
          {strings.common.loading}
        </p>
        <BadgeGridSkeleton count={6} />
      </>
    );
  }

  if (isFailedLoad(catalogQuery)) {
    return (
      <ErrorMessage
        error={strings.errors[classifyError(catalogQuery.error)]}
        title={strings.profile.badgesLoadFailed}
        onRetry={() => void catalogQuery.refetch()}
      />
    );
  }

  const badges = catalogQuery.data?.badges ?? [];

  /**
   * The badges this reader has already earned.
   *
   * The catalogue and the reader's own badges are two different facts about the
   * same thing, so they are two queries: the catalogue is public, the earned
   * list is the reader's, and the reader's list is empty for a visitor who is
   * not signed in.
   */
  const earnedKeys = new Set((earnedQuery.data?.badges ?? []).map((badge: { badgeKey: string; }) => badge.badgeKey));

  return (
    <div className="animate-rise">
      <PageHeader
        title={strings.profile.badgesTitle}
        description={strings.profile.badgesDescription}
      />

      {badges.length === 0 ? (
        <div className="text-center text-ink-muted">{strings.profile.badgesEmpty}</div>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2">
          {badges.map((badge: BadgeCatalogEntry) => (
            <li key={badge.key}>
              <BadgeCard badge={badge} isEarned={earnedKeys.has(badge.key)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
