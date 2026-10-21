"use client";

import React, { useState } from "react";

import { ButtonLink } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Select } from "@/components/ui/Input";
import { StoryCardCompact, StoryFeedSkeleton } from "@/components/story/StoryCard";
import { StoryLoadMore } from "@/components/story/StoryFeed";
import { storyCategoryFilterOptions } from "@/components/story/StoryCategoryOptions";
import { useLocale } from "@/components/providers/LocaleProvider";
import { classifyError } from "@/lib/errors";
import { flattenStories, isFailedLoad, useStoriesFeed } from "@/lib/queries";

/**
 * The story index: the whole catalogue, filterable by category.
 *
 * ONE COLUMN, NOT THREE. The feed column this page renders inside is 672px wide
 * (§5 of the design system). A three-column grid inside it gives each card about
 * 200px, which is too narrow for the Arabic title to take more than one line and
 * leaves the excerpt three words long — the card becomes a thumbnail with a
 * caption. `StoryCardCompact` is the variant built for exactly this: no cover,
 * a three-line excerpt, the byline and the view count.
 *
 * The filter is a labelled `Select` (not a bare `<select>`), so it is announced,
 * focusable with the product's ring and sized like every other control in the
 * product. Selecting a category refetches with that filter and nothing else
 * changes: the request, the limit and the response handling are the ones this page
 * always made.
 *
 * THE UNFILTERED LIST IS THE DASHBOARD'S LIST. With no category selected the
 * filters are the empty object, so the query key is the one the dashboard reads:
 * one cache entry, one request, and the two surfaces cannot disagree.
 */
export default function StoriesPage() {
  const { locale, strings } = useLocale();
  const [category, setCategory] = useState("");

  const feed = useStoriesFeed(category ? { category } : {});
  const stories = flattenStories(feed.data);

  // A failed BACKGROUND REFETCH leaves the stories the reader is already
  // looking at in place; only a load that never arrived is a failed page.
  const failed = isFailedLoad(feed);

  return (
    <div>
      <PageHeader
        title={strings.shell.navStories}
        description={strings.story.storiesPageDescription}
        action={
          <ButtonLink href="/stories/create" variant="primary">
            {strings.shell.createStory}
          </ButtonLink>
        }
      />

      <div className="mb-6 max-w-xs">
        <Select
          label={strings.story.storiesCategoryLabel}
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          options={storyCategoryFilterOptions(locale)}
        />
      </div>

      {failed ? (
        <ErrorMessage
          error={strings.errors[classifyError(feed.error)]}
          title={strings.story.storiesLoadFailed}
          onRetry={() => void feed.refetch()}
        />
      ) : feed.isLoading ? (
        <div aria-busy="true">
          <span role="status" className="sr-only">
            {strings.common.loading}
          </span>
          <StoryFeedSkeleton count={4} variant="compact" />
        </div>
      ) : stories.length === 0 ? (
        <EmptyState
          icon="book"
          title={strings.shell.noStories}
          description={
            category
              ? strings.story.storiesEmptyInCategory
              : strings.story.storiesEmptyHere
          }
          action={
            <ButtonLink href="/stories/create" variant="primary">
              {strings.shell.createStory}
            </ButtonLink>
          }
        />
      ) : (
        <>
          <ul className="space-y-4">
            {stories.map((story) => (
              <li key={story.id}>
                <StoryCardCompact story={story} />
              </li>
            ))}
          </ul>

          {feed.hasNextPage && (
            <StoryLoadMore
              variant="compact"
              isFetching={feed.isFetchingNextPage}
              onLoadMore={() => void feed.fetchNextPage()}
            />
          )}
        </>
      )}
    </div>
  );
}
