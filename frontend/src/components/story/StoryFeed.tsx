"use client";

import React, { useEffect, useRef } from "react";

import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { IconButton } from "@/components/ui/Button";
import { StoryCard, StoryCardCompact, StoryFeedSkeleton } from "@/components/story/StoryCard";
import { flattenStories, useStoriesFeed, type StoryFilters } from "@/lib/queries";

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
  const query = useStoriesFeed(filters);
  const sentinel = useRef<HTMLDivElement>(null);

  const stories = flattenStories(query.data);
  const hasMore = query.hasNextPage;

  useEffect(() => {
    if (!hasMore) return undefined;

    // The 400px root margin is the "prefetch at 50%" threshold of §7: the
    // request is already in flight while the reader is still two cards from the
    // sentinel, so by the time the next page is on screen it is usually
    // resolved. TanStack collapses the duplicate call if the observer fires
    // twice for the same page.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !query.isFetchingNextPage) {
          void query.fetchNextPage();
        }
      },
      { rootMargin: "400px 0px" },
    );

    if (sentinel.current) observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [hasMore, query.isFetchingNextPage, query]);

  if (query.isLoading) {
    return (
      <div>
        <span className="sr-only" role="status">
          جارٍ تحميل القصص
        </span>
        <StoryFeedSkeleton count={3} variant={variant} />
      </div>
    );
  }

  if (query.isError) {
    return (
      <ErrorMessage
        error={query.error instanceof Error ? query.error.message : "تعذّر تحميل القصص"}
        onRetry={() => void query.refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <ul className="space-y-6" aria-busy={query.isFetchingNextPage || undefined}>
        {stories.map((story) => (
          <li key={story.id}>
            {variant === "full" ? <StoryCard story={story} /> : <StoryCardCompact story={story} />}
          </li>
        ))}
      </ul>

      {stories.length === 0 && (
        <p className="rounded-xl border border-dashed border-line-strong p-8 text-center text-sm text-ink-muted">
          لا توجد قصص بعد. كن أول من يكتب.
        </p>
      )}

      {hasMore && (
        <div ref={sentinel} className="flex flex-col items-center gap-3 pt-2">
          {query.isFetchingNextPage ? (
            <>
              <span role="status" className="text-sm text-ink-muted">
                جارٍ تحميل المزيد…
              </span>
              <StoryFeedSkeleton count={1} variant={variant} />
            </>
          ) : (
            <IconButton label="تحميل المزيد من القصص" name="plus" onClick={() => void query.fetchNextPage()} />
          )}
        </div>
      )}
    </div>
  );
}
