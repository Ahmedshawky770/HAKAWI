"use client";

import React from "react";

import { useStoredUser } from "@/lib/use-stored-user";
import { PageHeader } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Loading } from "@/components/ui/Loading";
import { useLocale, useStrings } from "@/components/providers/LocaleProvider";
import { classifyError } from "@/lib/errors";
import { formatDateTime } from "@/lib/i18n";
import { isFailedLoad, useUserRestrictions } from "@/lib/queries";

/**
 * The user restrictions page.
 *
 * WHY THIS PAGE EXISTS. A reader who has been restricted needs a first-class place
 * to see what the restriction is, when it was applied, and when (or if) it expires.
 * This page shows the restrictions for the currently authenticated user only.
 *
 * WHY THE DOUBLE FETCH IS GONE. The page used to define a `load` callback and
 * then fetch the same restrictions again from an effect, so every visit asked
 * the server twice for one list. The query hook asks once and caches it.
 */
export default function UserRestrictionsPage() {
  const { intl } = useLocale();
  const strings = useStrings();

  /**
   * The reader's id, from the session store.
   *
   * The list below is the reader's OWN restrictions, so it is asked for with
   * the reader's id — read through the store rather than out of local storage
   * during render, because the server has no local storage to read and the two
   * answers are not the same markup. See `lib/use-stored-user.ts`.
   */
  const currentUserId = useStoredUser()?.id ?? "";

  const restrictionsQuery = useUserRestrictions(currentUserId, true);

  if (restrictionsQuery.isLoading) {
    return (
      <>
        <PageHeader title={strings.moderation.restrictionsTitle} />
        <Loading />
      </>
    );
  }

  if (isFailedLoad(restrictionsQuery)) {
    return (
      <ErrorMessage
        error={strings.errors[classifyError(restrictionsQuery.error)]}
        title={strings.moderation.restrictionsLoadFailed}
        onRetry={() => void restrictionsQuery.refetch()}
      />
    );
  }

  const restrictions = restrictionsQuery.data?.restrictions ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title={strings.moderation.restrictionsTitle} description={strings.moderation.restrictionsDescription} />

      {restrictions.length === 0 ? (
        <p className="text-sm text-ink-muted">{strings.moderation.restrictionsEmpty}</p>
      ) : (
        <ul className="space-y-3">
          {restrictions.map((restriction) => (
            <li key={restriction.id} className="rounded-lg border border-line p-4">
              <p className="font-medium text-ink">
                {strings.moderation.restrictionAction(
                  strings.moderation.actionLabels[restriction.action] ?? restriction.action,
                )}
              </p>
              <p className="text-sm text-ink-muted">
                {strings.moderation.restrictionReason(restriction.reason)}
              </p>
              {restriction.expiresAt && (
                <p className="text-sm text-ink-muted">
                  {strings.moderation.restrictionExpiresAt(formatDateTime(restriction.expiresAt, intl))}
                </p>
              )}
              <p className="text-sm text-ink-muted">
                {strings.moderation.restrictionCreatedAt(formatDateTime(restriction.createdAt, intl))}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
