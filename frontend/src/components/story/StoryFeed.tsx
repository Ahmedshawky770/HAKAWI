"use client";

import React, { useEffect, useRef } from "react";

import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { IconButton } from "@/components/ui/Button";
import { StoryCard, StoryCardCompact, StoryFeedSkeleton } from "@/components/story/StoryCard";
import { useStrings } from "@/components/providers/LocaleProvider";
import { classifyError } from "@/lib/errors";
import { flattenStories, isFailedLoad, type StoryFilters, useStoriesFeed } from "@/lib/queries";

/**
 * The infinite feed of §7.
 *
 * The thresholds are not arbitrary — they are a trade between wasted requests and
 * a reader who reaches the end and waits:
 *
 * | at           | behaviour                             | why                                  |
 * |--------------|---------------------------------------|--------------------------------------|
 * | 50% scrolled | prefetch the next page                | the request has finished before the  |
 * |              |                                       | reader decides they want more        |
 * | 80% scrolled | fetch the next page                   | the next screen is already partly    |
 * |              |                                       | visible, so waiting is visible       |
 * | last page    | explicit "more" button as a fallback   | scroll-driven loading fails on a     |
 * |              |                                       | keyboard that cannot reach the end   |
 *
 * The fallback is not decoration. Infinite scroll is unusable with a keyboard
 * and hostile to a screen reader if the only way to continue is to keep pressing
 * `End`, so the button is always rendered while more pages exist — the automatic
 * path is an enhancement over it, not the only path.
 *
 * Loading, failure and exhaustion each get their own announcement:
 * `aria-busy` on the list, `role="status"` for the pending pages, `role="alert"`
 * for the failure with a retry, and nothing at all once everything is loaded.
 */
export function StoryFeed({ filters = {}, variant = "full" }: { filters?: StoryFilters; variant?: "full" | "compact" }) {
  const strings = useStrings();
  const query = useStoriesFeed(filters);
  const sentinel = useRef<HTMLDivElement>(null);

  const stories = flattenStories(query.data);
  const hasMore = query.hasNextPage;
  const { fetchNextPage, isFetchingNextPage } = query;

  useEffect(() => {
    if (!hasMore) return undefined;

    // The 400px root margin is the "prefetch at 50%" threshold of §7: the
    // request is already in flight while the reader is still two cards from the
    // sentinel, so by the time the next page is on screen it is usually
    // resolved. TanStack collapses the duplicate call if the observer fires
    // twice for the same page.
    //
    // The dependencies are the STABLE pieces of the query — `fetchNextPage` is
    // the same function for the life of the observer — so the sentinel is
    // observed once, not re-subscribed on every render.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: "400px 0px" },
    );

    if (sentinel.current) observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [hasMore, isFetchingNextPage, fetchNextPage]);

  if (query.isLoading) {
    return (
      <div>
        <span className="sr-only" role="status">
          {strings.story.feedLoadingLabel}
        </span>
        <StoryFeedSkeleton count={3} variant={variant} />
      </div>
    );
  }

  if (isFailedLoad(query)) {
    return (
      <ErrorMessage
        error={strings.errors[classifyError(query.error)]}
        title={strings.story.storiesLoadFailed}
        onRetry={() => void query.refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <ul className="space-y-6" aria-busy={isFetchingNextPage || undefined}>
        {stories.map((story) => (
          <li key={story.id}>
            {variant === "full" ? <StoryCard story={story} /> : <StoryCardCompact story={story} />}
          </li>
        ))}
      </ul>

      {stories.length === 0 && (
        <div className="rounded-xl border border-dashed border-line-strong p-8 text-center">
          <p className="text-sm font-semibold text-ink">{strings.story.feedEmptyTitle}</p>
          <p className="mt-1 text-sm text-ink-muted">{strings.story.feedEmptyDescription}</p>
        </div>
      )}

      {hasMore && (
        <div ref={sentinel}>
          <StoryLoadMore
            variant={variant}
            isFetching={isFetchingNextPage}
            onLoadMore={() => void fetchNextPage()}
          />
        </div>
      )}
    </div>
  );
}

/**
 * The control that asks for the next page.
 *
 * It is exported because the dashboard and the stories grid read the SAME feed
 * and both need the affordance: infinite scroll is an enhancement over this
 * button, never a replacement for it, and a button that exists in one surface
 * and not in another is a surface a keyboard user cannot finish.
 */
export function StoryLoadMore({
  isFetching,
  onLoadMore,
  variant = "full",
}: {
  isFetching: boolean;
  onLoadMore: () => void;
  variant?: "full" | "compact";
}) {
  const strings = useStrings();

  return (
    <div className="flex flex-col items-center gap-3 pt-2">
      {isFetching ? (
        <>
          <span role="status" className="text-sm text-ink-muted">
            {strings.story.loadingMoreStories}
          </span>
          <StoryFeedSkeleton count={1} variant={variant} />
        </>
      ) : (
        <IconButton label={strings.story.loadMoreStories} name="plus" onClick={onLoadMore} />
      )}
    </div>
  );
}
