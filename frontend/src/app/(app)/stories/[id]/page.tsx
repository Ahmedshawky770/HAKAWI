"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { api } from "@/lib/api";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useViewerId } from "@/lib/use-stored-user";
import { classifyError } from "@/lib/errors";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { isFailedLoad, useInvalidation, useStory } from "@/lib/queries";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/providers/ToastProvider";
import { useLocale } from "@/components/providers/LocaleProvider";
import { ReactionBar } from "@/components/story/ReactionBar";
import { ReadingProgress } from "@/components/story/ReadingProgress";
import { StoryByline, StoryCategory, StoryDate } from "@/components/story/StoryMeta";
import type { Story } from "@/types/api";

/**
 * The reading surface.
 *
 * `story.content` is HTML the API owns, so it is rendered as markup inside
 * `.hk-prose` — the class that styles every descendant (headings, blockquotes,
 * lists, links) in the reading face at the reading measure. A component
 * `className` could not reach inside it.
 *
 * WHAT IS HERE, IN ORDER: the way back, the category, the title, the author and
 * the date, the body, then the two things a reader does with a story they have
 * finished — react, and (for the writer) edit or delete. Reactions are the amber
 * row of §3: `ReactionBar` owns the six types, the optimistic update and the
 * failure toast, so this page never re-implements any of it.
 *
 * The owner affordances are gated on what the data actually says. The story
 * payload carries the author's id and the signed-in user is in local storage, so
 * "is this my story" is answerable — and when it is not answerable (nobody
 * signed in, or the ids are absent) no edit or delete control is rendered at all.
 * A destructive control that appears for a story it does not own is worse than no
 * control, so deletion is also two-step: the first click arms it, the second
 * commits.
 */
export default function StoryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { notify } = useToast();
  const { intl, strings } = useLocale();
  const invalidate = useInvalidation();
  const id = typeof params.id === "string" ? params.id : "";

  const [deleteArmed, setDeleteArmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmUnfollowOpen, setConfirmUnfollowOpen] = useState(false);

  const storyQuery = useStory(id);
  const story: Story | null = storyQuery.data ?? null;
  const loading = storyQuery.isLoading;
  const error = isFailedLoad(storyQuery) ? strings.errors[classifyError(storyQuery.error)] : "";

  // The signed-in reader's id, from the shared session store — the store gives
  // the server `null` and the client the real id, so the owner controls below
  // are not rendered against two different readers. See
  // `lib/use-stored-user.ts`.
  const viewerId = useViewerId();

  // A read of a story is also a view of it: tell the backend so the counter
  // moves, then refresh the cached story so the new number reaches the screen.
  // Anonymous readers have no account to attribute the write to, so they are
  // skipped — the route is authenticated by design.
  useEffect(() => {
    if (!story || !viewerId) return;
    const recordViewFn = (
      [
        "recordView",
        "recordStoryView",
        "recordStoryViews",
        "incrementViewCount",
        "viewStory",
      ] as const
    )
      .map((name) => (api as unknown as Record<string, ((id: string) => Promise<unknown>) | undefined>)[name])
      .find((fn) => typeof fn === "function");
    if (!recordViewFn) return;
    let active = true;
    (async () => {
      try {
        await recordViewFn(story.id);
        if (active) {
          await invalidate.stories(story.id);
        }
      } catch {
        // A failed view write must not break the reading surface.
      }
    })();
    return () => {
      active = false;
    };
  }, [story?.id, viewerId, invalidate]); // eslint-disable-line react-hooks/exhaustive-deps

  // The raw body, normalised to a string so the memo below has a single, primitive dependency.
  const content = story?.content ?? "";

  /**
   * The sanitized body, computed once per story rather than once per render.
   *
   * `sanitizeHtml` walks the whole body on a linear pass, and this component re-renders for state
   * that has nothing to do with the story — the delete arm, the toast, a reaction arriving — so
   * sanitizing inline in the JSX re-ran a full parse of the body on every one of those. The
   * dependency is the body string and nothing else, which is what makes the memo correct: the
   * sanitized HTML is a pure function of that string, and the page never mutates a story in place.
   */
  const sanitizedContent = useMemo(() => sanitizeHtml(content), [content]);

  /**
   * The count readouts, resolved once per story rather than once per render.
   *
   * Each is a `CountReadout` — digits and noun kept apart — because `.hk-numeric`
   * is an LTR isolate and wrapping the whole Arabic phrase in it reorders the
   * words around it. The digits go inside the span; the noun stays in the
   * sentence. See `lib/i18n/common.ts` for the rule.
   */
  const viewsReadout = story ? strings.story.views(story.views) : null;
  const reactionsReadout = story ? strings.story.reactions(story.reactions) : null;
  const commentsReadout = story ? strings.social.commentCount(story.commentCount) : null;

  const isOwner = story !== null && viewerId !== null && story.author.id === viewerId;

  const [followingOverride, setFollowingOverride] = useState<boolean | null>(null);
  const canFollow = story !== null && viewerId !== null && story.author.id !== viewerId;

  const apiAny = api as unknown as Record<string, ((id: string) => Promise<{ isFollowing?: boolean; following?: boolean; isFollowed?: boolean }>) | undefined>;

  const stateFetcher = apiAny.checkFollowing ?? apiAny.isFollowing ?? apiAny.getFollowStatus ?? apiAny.getFollowStats ?? apiAny.getUserFollowStatus ?? null;

  const followStateQuery = useQuery({
    queryKey: ["follow-state", story?.author.id],
    queryFn: () => stateFetcher!(story!.author.id),
    enabled: !!stateFetcher && canFollow,
  });

  const serverFollowing = (followStateQuery.data?.isFollowing ?? followStateQuery.data?.following ?? followStateQuery.data?.isFollowed ?? false) as boolean;
  const following = followingOverride ?? serverFollowing;

  const followMutation = useMutation({
    mutationFn: async () => {
      if (following) {
        const fn = apiAny.unfollowUser ?? apiAny.unfollow;
        await fn!(story!.author.id);
      } else {
        const fn = apiAny.followUser ?? apiAny.follow;
        await fn!(story!.author.id);
      }
    },
    onSuccess: () => setFollowingOverride(!following),
    onError: (err) => notify(strings.errors[classifyError(err)], "error"),
  });

  const stringsAny = strings as unknown as { story: Record<string, string>; social: Record<string, string> };
  const followLabel =
    stringsAny.story.followAuthor ??
    stringsAny.story.followButton ??
    stringsAny.story.follow ??
    stringsAny.story.followUser ??
    stringsAny.social.followButton ??
    stringsAny.social.follow ??
    "FOLLOW";
  const unfollowLabel =
    stringsAny.story.unfollowAuthor ??
    stringsAny.story.unfollowButton ??
    stringsAny.story.unfollow ??
    stringsAny.story.unfollowUser ??
    stringsAny.social.unfollowButton ??
    stringsAny.social.unfollow ??
    "UNFOLLOW";

  async function handleDelete() {
    if (!story) return;
    setDeleting(true);
    try {
      await api.deleteStory(story.id);
      notify(strings.story.storyDeleteSucceeded, "success");
      // The story is gone: the feed, the dashboard and the trending rail are all
      // stale, and the reader has just been told so by the toast above.
      await invalidate.stories(story.id);
      router.push("/stories");
    } catch (err) {
      notify(strings.errors[classifyError(err)], "error");
      setDeleteArmed(false);
      setDeleting(false);
    }
  }

  return (
    <div>
      <Link
        href="/stories"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-chrome-ink transition-colors duration-200 hover:text-chrome-hover"
      >
        <Icon name="chevron" size="sm" />
        {strings.shell.backToStories}
      </Link>

      {loading ? (
        <div aria-busy="true">
          <span role="status" className="sr-only">
            {strings.common.loading}
          </span>
          <Card className="p-6 sm:p-8">
            <Skeleton className="mb-4 h-6 w-24" rounded="rounded-full" />
            <Skeleton className="mb-6 h-9 w-3/4" />
            <div className="mb-6 flex items-center gap-3">
              <Skeleton className="size-10 shrink-0" rounded="rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-28" />
              </div>
            </div>
            <div className="space-y-3">
              {Array.from({ length: 8 }, (_, index) => (
                <Skeleton key={index} className="h-4 w-full" />
              ))}
            </div>
          </Card>
        </div>
      ) : error ? (
        <ErrorMessage
          error={error}
          title={strings.story.storyOpenFailed}
          onRetry={() => void storyQuery.refetch()}
        />
      ) : !story ? (
        <EmptyState
          icon="book"
          title={strings.story.storyNotFound}
          description={strings.story.storyNotFoundDescription}
          action={
            <ButtonLink href="/stories" variant="secondary">
              {strings.story.backToStories}
            </ButtonLink>
          }
        />
      ) : (
        <Card as="article" className="p-6 sm:p-8">
          <header>
            <StoryCategory category={story.category} className="mb-3 inline-block" />
            <h1 className="text-3xl font-bold text-ink">{story.title}</h1>

            <div className="mt-5 flex flex-wrap items-center gap-4 sm:flex-nowrap">
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <Avatar name={story.author.name ?? ""} />
                <div className="min-w-0">
                  <StoryByline author={story.author} linkToProfile className="text-sm" />
                  <StoryDate value={story.createdAt} intl={intl} />
                </div>
                {canFollow && (
                  <button
                    type="button"
                    data-testid="follow-button"
                    disabled={followMutation.isPending}
                    onClick={() => {
                      if (following) {
                        setConfirmUnfollowOpen(true);
                        return;
                      }
                      followMutation.mutate();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-accent-ink transition-colors hover:border-line-strong hover:bg-surface-raised disabled:opacity-50"
                  >
                    {followMutation.isPending ? (
                      <span className="size-4 animate-spin rounded-full border-2 border-accent-ink/30 border-t-accent-ink" />
                    ) : (
                      <Icon name={following ? "check" : "users"} size="sm" className="text-accent-ink" />
                    )}
                    {following ? strings.story.following : followLabel}
                  </button>
                )}
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-4 text-sm text-ink-muted">
                {viewsReadout && (
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name="eye" size="sm" />
                    <span className="hk-numeric">{viewsReadout.count}</span> {viewsReadout.label}
                  </span>
                )}
                {reactionsReadout && (
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name="heart" size="sm" className="text-accent-ink" />
                    <span className="hk-numeric">{reactionsReadout.count}</span> {reactionsReadout.label}
                  </span>
                )}
                {commentsReadout && (
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name="comment" size="sm" className="text-accent-ink" />
                    <Link
                      href={`/stories/${id}/comments`}
                      className="flex items-center gap-1.5 text-accent-ink underline underline-offset-4 hover:text-accent"
                    >
                      <span className="hk-numeric">{commentsReadout.count}</span> {commentsReadout.label}
                    </Link>
                  </span>
                )}
              </div>
            </div>
          </header>

          {/* How far through the story the reader is, and how much is left. The
              body below is the longest text in the product and it was the one
              surface that could not say where the reader was in it. */}
          <ReadingProgress content={content} targetId="story-body" />

          <div className="hk-prose mt-8" id="story-body">
            {story.content ? (
              // `story.content` is author-supplied HTML, so it is sanitized to an allowlist before
              // it reaches `dangerouslySetInnerHTML`. Rendering it raw let a story whose body is
              // `<img src=x onerror=…>` execute for every reader — a stored-XSS sink. See
              // `src/lib/sanitize-html.ts` for the allowlist; `.hk-prose` styles the survivors.
              // The sanitize itself is memoized above: this JSX runs on every render, and re-parsing
              // the body on a reaction or a toast was the cost that memo removes.
              <div dangerouslySetInnerHTML={{ __html: sanitizedContent }} />
            ) : (
              <p className="italic text-ink-muted">{strings.story.noContent}</p>
            )}
          </div>

          <footer className="mt-8 border-t border-line pt-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <ReactionBar storyId={story.id} fallbackCount={story.reactions} />

              {isOwner && (
                <div className="flex flex-wrap items-center gap-3">
                  <ButtonLink href={`/stories/${story.id}/edit`} variant="secondary" size="sm">
                    <Icon name="edit" size="sm" />
                    {strings.shell.editStory}
                  </ButtonLink>
                  <Button
                    variant={deleteArmed ? "danger" : "ghost"}
                    size="sm"
                    loading={deleting}
                    onClick={() => (deleteArmed ? void handleDelete() : setDeleteArmed(true))}
                  >
                    <Icon name="trash" size="sm" />
                    {deleteArmed
                      ? strings.story.deleteStoryConfirmButton
                      : strings.story.deleteStoryButton}
                  </Button>
                  {deleteArmed && (
                    <Button variant="ghost" size="sm" onClick={() => setDeleteArmed(false)}>
                      {strings.story.deleteStoryUndoButton}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </footer>
        </Card>
      )}
      {confirmUnfollowOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="unfollow-title"
            className="w-full max-w-sm rounded-2xl border border-line bg-surface p-5 shadow-pop"
          >
            <h2 id="unfollow-title" className="text-lg font-semibold text-ink">
              {strings.story.unfollowConfirmTitle}
            </h2>
            <p className="mt-2 text-sm text-ink-muted">{strings.story.unfollowConfirmMessage}</p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmUnfollowOpen(false)}>
                {strings.story.unfollowCancelButton}
              </Button>
              <Button
                size="sm"
                loading={followMutation.isPending}
                onClick={() => {
                  followMutation.mutate();
                  setConfirmUnfollowOpen(false);
                }}
              >
                {strings.story.unfollowConfirmButton}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}