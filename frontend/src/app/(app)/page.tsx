"use client";

import React from "react";

import { ButtonLink } from "@/components/ui/Button";
import { Card, PageHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatCard } from "@/components/ui/StatCard";
import { StoryCard, StoryFeedSkeleton } from "@/components/story/StoryCard";
import { StoryLoadMore } from "@/components/story/StoryFeed";
import { useStrings } from "@/components/providers/LocaleProvider";
import { formatCount } from "@/lib/i18n/common";
import { classifyError } from "@/lib/errors";
import { flattenStories, isFailedLoad, useStoriesFeed } from "@/lib/queries";

/**
 * The dashboard.
 *
 * ONE FEED, TWO SURFACES. The dashboard and the stories grid read the SAME
 * `useStoriesFeed()` entry — one key, one cache, one request — so the home page
 * and the list page cannot show two different answers to the same question, and
 * a story published in one of them appears in the other without a refresh.
 *
 * Three totals, then the most recent stories. The totals are the sum of the
 * list ON SCREEN, not a second aggregate endpoint: one request, one truth, and
 * a dashboard whose counters cannot disagree with the cards above them. The
 * list grows when the reader asks for more, and the counters grow with it.
 *
 * The four states of the list are all implemented — a shaped skeleton while the
 * request is in flight, the semantic error surface with a retry when it fails, an
 * empty state that offers the action that fills it, and the cards themselves.
 * The header and the totals row are rendered in every one of those states except a
 * failure, so the page does not jump under the reader when the data lands.
 */
export default function DashboardPage() {
  const strings = useStrings();
  const { dashboard } = strings;
  const feed = useStoriesFeed();
  const stories = flattenStories(feed.data);

  // A FAILED REFETCH IS NOT A FAILED PAGE. `isError` is also true when a
  // background refetch fails while the reader is looking at data that is still
  // there — blanking the dashboard in that case would take away stories the
  // reader can already read, over a request whose result they never asked for.
  const failed = isFailedLoad(feed);

  const views = stories.reduce((sum, story) => sum + story.views, 0);
  const reactions = stories.reduce((sum, story) => sum + story.reactions, 0);

  return (
    <div>
      <PageHeader
        title={dashboard.pageTitle}
        description={dashboard.pageDescription}
        action={
          <ButtonLink href="/stories/create" variant="primary">
            {strings.shell.createStory}
          </ButtonLink>
        }
      />

      {failed ? (
        <ErrorMessage
          error={strings.errors[classifyError(feed.error)]}
          title={dashboard.loadFailedTitle}
          onRetry={() => void feed.refetch()}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {feed.isLoading ? (
              <>
                <StatSkeleton />
                <StatSkeleton />
                <StatSkeleton />
              </>
            ) : (
              <>
                {/* `formatCount`, not a bare `toLocaleString()`: the runtime's
                    default locale differs between the server and the browser, so
                    the raw call hydrates one set of digits and renders another
                    (and renders Arabic-Indic digits in an Arabic browser,
                    against the convention every other figure follows). */}
                <StatCard label={dashboard.statStoriesLabel} value={formatCount(stories.length)} icon="book" />
                <StatCard label={dashboard.statViewsLabel} value={formatCount(views)} icon="eye" />
                <StatCard label={dashboard.statReactionsLabel} value={formatCount(reactions)} icon="heart" />
              </>
            )}
          </div>

          <section className="mt-8" aria-labelledby="latest-stories-heading">
            <h2 id="latest-stories-heading" className="mb-4 text-xl font-semibold text-ink">
              {dashboard.latestStoriesHeading}
            </h2>

            {feed.isLoading ? (
              <div aria-busy="true">
                <span role="status" className="sr-only">
                  {strings.common.loading}
                </span>
                <StoryFeedSkeleton count={3} />
              </div>
            ) : stories.length === 0 ? (
              <EmptyState
                icon="book"
                title={strings.shell.noStories}
                description={dashboard.emptyDescription}
                action={
                  <ButtonLink href="/stories/create" variant="primary">
                    {strings.shell.createStory}
                  </ButtonLink>
                }
              />
            ) : (
              <>
                <ul className="space-y-6">
                  {stories.map((story) => (
                    <li key={story.id}>
                      <StoryCard story={story} />
                    </li>
                  ))}
                </ul>

                {feed.hasNextPage && (
                  <StoryLoadMore
                    isFetching={feed.isFetchingNextPage}
                    onLoadMore={() => void feed.fetchNextPage()}
                  />
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/**
 * The placeholder for a `StatCard`, at the same height (padding, label, value) so
 * the totals row does not resize when the numbers arrive.
 */
function StatSkeleton() {
  return (
    <Card className="p-5">
      <Skeleton className="h-5 w-24" />
      <Skeleton className="mt-2 h-8 w-16" />
    </Card>
  );
}
