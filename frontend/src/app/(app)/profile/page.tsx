"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { LOGIN_ROUTE } from "@/lib/routes";
import { professionalProgress, type ProfessionalProgressReason } from "@/lib/account";
import { useStoredUser } from "@/lib/use-stored-user";
import { ButtonLink, Button } from "@/components/ui/Button";
import { Card, CardBody, PageHeader } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Loading } from "@/components/ui/Loading";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { useStrings } from "@/components/providers/LocaleProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { classifyError } from "@/lib/errors";
import { isFailedLoad, useInvalidation, useUserProfile, useUserStats } from "@/lib/queries";

function ProgressRow({
  label,
  current,
  threshold,
  percent,
  met,
}: {
  label: string;
  current: number;
  threshold: number;
  percent: number;
  met: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-ink">{label}</span>
        <span className="text-ink-muted">{current} / {threshold}</span>
      </div>
      <div className="h-2 bg-line rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            met ? "bg-success" : "bg-accent"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/**
 * The reader's OWN profile.
 *
 * WHY THE ID COMES FROM THE SESSION AND NOT FROM THE ROUTE. This page used to
 * read `useParams().id`, but `/profile` is a static route: there is no `id` in
 * the path, so the lookup was always empty and the page rendered "معرف المستخدم
 * مفقود" for every signed-in reader — a permanent dead end on the route the
 * header links to. The reader's id is a fact the session already carries
 * (`useStoredUser()`), and without one there is nothing to render, so the reader
 * goes to the login route instead.
 *
 * The stats are a second, optional call: a profile without its counters is still
 * a profile, so a failed `/users/:id/stats` renders zeros rather than an error.
 *
 * THE SESSION IS READ FROM THE STORE, NOT FROM LOCAL STORAGE DURING RENDER.
 * `getStoredUser()` was called in the body of this component, and that is a
 * read of a browser fact on a machine that has no browser: the server rendered
 * "not found" for a reader who IS signed in, and the client rendered the
 * profile. `useStoredUser` reads the same value through
 * `useSyncExternalStore`, so the server is given `null` and the client is
 * given the reader, and React hydrates the server's answer instead of
 * warning about a mismatch.
 */
export default function ProfilePage() {
  const router = useRouter();
  const strings = useStrings();
  const { notify } = useToast();
  const invalidate = useInvalidation();

  const storedUser = useStoredUser();
  const hasSession = Boolean(storedUser);
  const userId = storedUser?.id ?? "";

  const profileQuery = useUserProfile(userId);
  const statsQuery = useUserStats(userId);

  useEffect(() => {
    if (!hasSession) router.push(LOGIN_ROUTE);
  }, [router, hasSession]);

  /**
   * The upgrade request.
   *
   * WHY IT IS A MUTATION AND NOT AN `alert()`. The old button answered with a
   * browser dialog, which is not dismissible by a keyboard-only reader, cannot
   * carry the classified message, and blocks the page behind it. The result is
   * now an inline message and a toast, and the server's own answer — not the
   * client's guess — is what the profile shows afterwards.
   *
   * WHY THE REFUSAL IS TOLD AND NOT SWALLOWED. The endpoint answers `200
   * {eligible, reasons}`: a reader who does not qualify is not an error, it is
   * an answer. The client computes its own idea of who qualifies, and that
   * computation can disagree with the server's — it counts every story while
   * the server counts only the PUBLISHED ones, and it reads the manual
   * verification badge while the server reads the verified email. So the
   * request can come back refusing, and the reader is told which requirement
   * is still missing rather than pressing a button that does nothing.
   */
  const upgradeMutation = useMutation({
    mutationFn: () => api.professionalRequest(),
    onSuccess: async (result) => {
      if (result.eligible) {
        notify(strings.profile.upgradeRequested, "success");
        await invalidate.users(userId);
        return;
      }
      const reasons = result.reasons?.length ? result.reasons.join("، ") : "";
      notify(
        reasons
          ? `${strings.profile.upgradeNotEligible} ${reasons}`
          : strings.profile.upgradeNotEligible,
        "warning",
      );
    },
    onError: (err) => {
      notify(strings.errors[classifyError(err)], "error");
    },
  });

  if (profileQuery.isLoading) {
    return <Loading />;
  }

  if (isFailedLoad(profileQuery)) {
    return (
      <ErrorMessage
        error={strings.errors[classifyError(profileQuery.error)]}
        title={strings.profile.profileLoadFailed}
        onRetry={() => void profileQuery.refetch()}
      />
    );
  }

  const user = profileQuery.data;
  if (!user) return <div className="text-ink-muted">{strings.profile.profileNotFound}</div>;

  const stats = statsQuery.data ?? null;
  const progress = professionalProgress(user, stats);

  const reasonLabel = (reason: ProfessionalProgressReason): string => {
    if (reason.kind === "verified") return strings.profile.progressReasons.verified;
    return strings.profile.progressReasons[reason.metric](reason.current, reason.threshold);
  };

  const reasonKey = (reason: ProfessionalProgressReason): string =>
    reason.kind === "verified" ? "verified" : reason.metric;

  return (
    <div className="space-y-6">
      <PageHeader
        title={strings.profile.profileTitle}
        action={
          <ButtonLink href="/profile/edit" variant="secondary">
            <Icon name="pen" size="sm" />
            {strings.profile.profileEditButton}
          </ButtonLink>
        }
      />

      <Card>
        <CardBody>
          <div className="flex flex-col items-start gap-6 sm:flex-row">
            <Avatar src={user.avatar} name={user.name} size="xl" />

            <div className="min-w-0 flex-1">
              <h2 className="font-arabic-heading text-2xl font-bold text-ink">{user.name}</h2>
              <p className="font-latin text-sm text-ink-muted">@{user.username}</p>
              <Badge state={user.accountType ?? "reader"} className="mt-3 inline-block">
                {strings.profile.accountTypeLabels[user.accountType ?? "reader"] ?? user.accountType}
              </Badge>
              <p className="mt-3 text-sm leading-7 text-ink-muted">
                {user.bio || strings.profile.profileNoBio}
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={strings.profile.statStories} value={stats?.storiesCount ?? 0} icon="book" />

        {/* The two counters that have a list behind them are links to it. */}
        <Link
          href={`/users/${user.id}/followers`}
          className="block rounded-xl focus-visible:outline-2 transition-shadow duration-200 hover:shadow-card"
        >
          <StatCard label={strings.profile.statFollowers} value={stats?.followersCount ?? 0} icon="users" className="h-full" />
        </Link>
        <Link
          href={`/users/${user.id}/following`}
          className="block rounded-xl focus-visible:outline-2 transition-shadow duration-200 hover:shadow-card"
        >
          <StatCard label={strings.profile.statFollowing} value={stats?.followingCount ?? 0} icon="users" className="h-full" />
        </Link>
      </div>

      {user.accountType !== "professional" && user.accountType !== "publisher" && user.accountType !== "admin" && (
        <Card>
          <CardBody>
            <h3 className="font-arabic-heading text-lg font-semibold text-ink mb-4">
              {strings.profile.upgradeHeading}
            </h3>
            <p className="text-sm text-ink-muted mb-4">{strings.profile.upgradeDescription}</p>
            <div className="space-y-3">
              <ProgressRow
                label={strings.profile.progressLabels.stories}
                current={progress.storiesCount.current}
                threshold={progress.storiesCount.threshold}
                percent={progress.storiesCount.percent}
                met={progress.storiesCount.met}
              />
              <ProgressRow
                label={strings.profile.progressLabels.views}
                current={progress.totalViews.current}
                threshold={progress.totalViews.threshold}
                percent={progress.totalViews.percent}
                met={progress.totalViews.met}
              />
              <ProgressRow
                label={strings.profile.progressLabels.reactions}
                current={progress.totalReactions.current}
                threshold={progress.totalReactions.threshold}
                percent={progress.totalReactions.percent}
                met={progress.totalReactions.met}
              />
              <ProgressRow
                label={strings.profile.progressLabels.followers}
                current={progress.followersCount.current}
                threshold={progress.followersCount.threshold}
                percent={progress.followersCount.percent}
                met={progress.followersCount.met}
              />
              <ProgressRow
                label={strings.profile.progressLabels.verified}
                current={progress.isVerified.met ? 1 : 0}
                threshold={1}
                percent={progress.isVerified.met ? 100 : 0}
                met={progress.isVerified.met}
              />
            </div>

            {/* The unmet thresholds, in the reader's language. The helper in
                `lib/account.ts` returns the metric and the numbers; the
                dictionary writes the sentence. */}
            {!progress.eligible && (
              <ul className="mt-4 space-y-1">
                {progress.reasons.map((reason) => (
                  <li key={reasonKey(reason)} className="text-sm text-ink-muted">
                    {reasonLabel(reason)}
                  </li>
                ))}
              </ul>
            )}

            {upgradeMutation.isError && (
              <div className="mt-4">
                <ErrorMessage
                  error={strings.errors[classifyError(upgradeMutation.error)]}
                  title={strings.profile.upgradeFailed}
                />
              </div>
            )}

            {upgradeMutation.isSuccess && upgradeMutation.data?.eligible && (
              <p role="status" className="mt-4 text-sm text-success-ink">
                {strings.profile.upgradeRequested}
              </p>
            )}

            {progress.eligible && (
              <div className="mt-4">
                <Button
                  onClick={() => upgradeMutation.mutate()}
                  loading={upgradeMutation.isPending}
                  className="w-full"
                >
                  {strings.profile.upgradeButton}
                </Button>
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
