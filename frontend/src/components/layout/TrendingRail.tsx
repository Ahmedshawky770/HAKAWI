"use client";

import React from "react";
import Link from "next/link";

import { useStrings } from "@/components/providers/LocaleProvider";
import { useTrendingStories } from "@/lib/queries";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * The end column of §5: 280px, hidden below `lg`.
 *
 * This rail is discovery, not navigation: the two things a reader is most
 * likely to want next — write something, or read what is being read. Both
 * disappear below `lg`, where the feed takes the full width and the bottom bar
 * takes over navigation.
 *
 * It shares the feed's cache entry (see `useTrendingStories`), so a page showing
 * both this rail and the feed makes exactly one request, not two.
 */
export function TrendingRail() {
  const { stories, isLoading } = useTrendingStories();
  const strings = useStrings();

  return (
    <aside
      aria-label={strings.secondaryNavigation}
      className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-70 shrink-0 overflow-y-auto border-s border-line bg-surface/40 xl:block"
    >
      <div className="flex flex-col gap-5 p-4">
        <div className="rounded-xl border border-accent/30 bg-accent-soft p-5">
          <Icon name="pen" className="mb-3 text-accent" />
          <h2 className="font-arabic-heading text-lg font-bold text-ink">{strings.createStory}</h2>
          <p className="mt-1 text-sm text-ink-muted">{strings.tagline}</p>
          <ButtonLink href="/stories/create" variant="primary" block className="mt-4">
            {strings.writeSomething}
          </ButtonLink>
        </div>

        <section aria-labelledby="trending-heading">
          <h2 id="trending-heading" className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <Icon name="trending" size="sm" className="text-chrome-ink" />
            {strings.trendingTitle}
          </h2>

          {/* aria-hidden: the loading state is announced once, by the query's own
              status region. Three placeholder rows are not content. */}
          {isLoading && (
            <ul className="space-y-3" aria-hidden="true">
              {[0, 1, 2].map((index) => (
                <li key={index} className="flex gap-3">
                  <Skeleton className="size-6 shrink-0" rounded="rounded-md" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </li>
              ))}
            </ul>
          )}

          {!isLoading && stories.length === 0 && (
            <p className="text-sm text-ink-muted">{strings.trendingEmpty}</p>
          )}

          {!isLoading && stories.length > 0 && (
            <ol className="space-y-1">
              {stories.map((story, index) => (
                <li key={story.id}>
                  <Link
                    href={`/stories/${story.id}`}
                    className="flex items-start gap-3 rounded-lg p-2 transition-colors duration-200 hover:bg-surface-raised"
                  >
                    <span className="hk-numeric mt-0.5 text-sm font-bold text-ink-faint">{index + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 block text-sm text-ink">{story.title}</span>
                      <span className="hk-numeric mt-0.5 flex items-center gap-1 text-xs text-ink-muted">
                        <Icon name="heart" size="sm" className="text-accent-ink" />
                        {story.reactions}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </aside>
  );
}
