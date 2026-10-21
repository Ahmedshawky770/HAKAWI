"use client";

import React from "react";

import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { useLocale } from "@/components/providers/LocaleProvider";
import { formatDate } from "@/lib/i18n";
import type { Follow } from "@/types/api";

interface FollowListRowProps {
  follow: Follow;
  /**
   * Which list the row belongs to.
   *
   * A follower row reads "Follower" and a following row reads "Following" —
   * the same edge seen from the two ends — so the row asks which one it is
   * rather than guessing from the data.
   */
  relation?: "follower" | "following";
}

/**
 * One row of a follow list.
 *
 * The API's edge carries ids and a date, not a name (the join that would
 * carry one is in the contract, but the client schema does not parse it), so
 * the row names the RELATION rather than inventing a name for a person it does
 * not have: "Follower" on the followers list, "Following" on the following one.
 */
export function FollowListRow({ follow, relation = "follower" }: FollowListRowProps) {
  const { intl, strings } = useLocale();
  const { social } = strings;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <Avatar name={social.followAvatarFallback} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">
            {relation === "following" ? social.followFollowingLabel : social.followFollowerLabel}
          </p>
          <p className="text-xs text-ink-muted">{formatDate(follow.createdAt, intl)}</p>
        </div>
      </div>
    </Card>
  );
}

interface FollowListEmptyProps {
  label?: string;
}

export function FollowListEmpty({ label }: FollowListEmptyProps = {}) {
  const { strings } = useLocale();

  return (
    <Card className="p-8 text-center">
      <p className="text-sm text-ink-muted">{label ?? strings.social.followEmptyFollowers}</p>
    </Card>
  );
}
