"use client";

import React from "react";
import { useParams } from "next/navigation";

import { Avatar } from "@/components/ui/Avatar";
import { ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, CardFooter } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Loading } from "@/components/ui/Loading";
import { useStrings } from "@/components/providers/LocaleProvider";
import { classifyError } from "@/lib/errors";
import { formatCount } from "@/lib/i18n/common";
import { isFailedLoad, useUserProfile, useUserStats } from "@/lib/queries";

/**
 * Somebody else's public profile.
 *
 * The page renders what the profile endpoint answers and nothing else: there is
 * no follow control here because this client has no state to follow with — no
 * session, no cached relationship, and a follow button that always guesses
 * would be a control that lies. The footer offers the two lists that do exist
 * as routes instead.
 *
 * THE TWO READS ARE SEPARATE FACTS. The profile is who somebody is; the stats
 * are how many people follow them and how many they follow. They are two cache
 * entries, and a stats endpoint that fails leaves the profile intact — the
 * counters are a detail, not the page.
 */
export default function PublicUserPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const strings = useStrings();
  const { social } = strings;

  const profile = useUserProfile(id);
  const stats = useUserStats(id);

  if (!id) {
    return <div className="text-ink-muted">{social.profileIdMissing}</div>;
  }

  if (profile.isLoading) return <Loading />;

  if (isFailedLoad(profile)) {
    return (
      <ErrorMessage
        error={strings.errors[classifyError(profile.error)]}
        title={social.profileLoadFailed}
        onRetry={() => void profile.refetch()}
      />
    );
  }

  const user = profile.data;
  if (!user) return <div className="text-ink-muted">{social.profileUserNotFound}</div>;

  const followersCount = stats.data?.followersCount;
  const followingCount = stats.data?.followingCount;

  return (
    <Card>
      <CardBody>
        <div className="flex flex-col items-start gap-6 sm:flex-row">
          <Avatar src={user.avatar} name={user.name} size="xl" />

          <div className="min-w-0 flex-1">
            <h1 className="font-arabic-heading text-2xl font-bold text-ink">{user.name}</h1>
            <p className="font-latin text-sm text-ink-muted">@{user.username}</p>
            <p className="mt-3 text-sm leading-7 text-ink-muted">
              {user.bio || social.profileBioFallback}
            </p>
          </div>
        </div>
      </CardBody>

      <CardFooter>
        <ButtonLink href={`/users/${user.id}/followers`} variant="ghost" size="sm">
          {social.followersTitle}
          {followersCount !== undefined && (
            <span className="hk-numeric ms-2">{formatCount(followersCount)}</span>
          )}
        </ButtonLink>
        <ButtonLink href={`/users/${user.id}/following`} variant="ghost" size="sm">
          {social.followingTitle}
          {followingCount !== undefined && (
            <span className="hk-numeric ms-2">{formatCount(followingCount)}</span>
          )}
        </ButtonLink>
      </CardFooter>
    </Card>
  );
}
