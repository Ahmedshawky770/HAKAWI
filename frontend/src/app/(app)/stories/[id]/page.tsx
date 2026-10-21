"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { api } from "@/lib/api";
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

  const storyQuery = useStory(id);
  const story: Story | null = storyQuery.data ?? null;
  const loading = storyQuery.isLoading;
  const error = isFailedLoad(storyQuery) ? strings.errors[classifyError(storyQuery.error)] : "";

  // The signed-in reader's id, from the shared session store — the store gives
  // the server `null` and the client the real id, so the owner controls below
  // are not rendered against two different readers. See
  // `lib/use-stored-user.ts`.
  const viewerId = useViewerId();

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

  const isOwner = story !== null && viewerId !== null && story.author.id === viewerId;

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
        العودة للقصص
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

            <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Avatar name={story.author.name ?? ""} />
                <div className="min-w-0">
                  <StoryByline author={story.author} linkToProfile className="text-sm" />
                  <StoryDate value={story.createdAt} intl={intl} />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-sm text-ink-muted">
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
                    تعديل القصة
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
    </div>
  );
}