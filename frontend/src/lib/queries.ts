import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { api } from "@/lib/api";
import type { StoriesListResponse, Story } from "@/types/api";

/**
 * The one place that knows how a story page is fetched, paged and cached.
 *
 * WHY NOT `useState` + `useEffect` IN EVERY PAGE. Four components read stories —
 * the feed, the story grid, the dashboard and the trending rail — and each one
 * used to keep its own copy. They disagreed: the dashboard showed 20 stories and
 * the grid showed the same 20 in a different order, and a story published in one
 * tab did not appear in the other until a manual reload.
 *
 * One query key per filter combination, one fetch function, one cache. The feed
 * and the trending rail use the SAME key, so opening a page with both on screen
 * issues one request rather than two.
 */

export const STORY_FEED_PAGE_SIZE = 20;
export const TRENDING_LIMIT = 5;

export interface StoryFilters {
  category?: string;
}

export const storyKeys = {
  feed: (filters: StoryFilters) => ["stories", "feed", filters] as const,
};

/**
 * How many pages exist, from the totals the API already returns.
 *
 * The list endpoints are `(page, limit, total)` shaped, so the next page is a
 * comparison rather than a guess: the old `hasNextPage = items.length === limit`
 * heuristic shows one empty page at the end of every list that divides evenly,
 * and shows *two* when the API caps `limit` below what was asked for.
 */
export function nextPageFrom(
  page: Pick<StoriesListResponse, "page" | "limit" | "total">,
): number | undefined {
  const consumed = page.page * page.limit;
  return consumed < page.total ? page.page + 1 : undefined;
}

export function fetchStoriesPage(filters: StoryFilters, page: number): Promise<StoriesListResponse> {
  return api.listStories({
    page,
    limit: STORY_FEED_PAGE_SIZE,
    category: filters.category,
  });
}

export type StoriesFeed = ReturnType<typeof useStoriesFeed>;

export function useStoriesFeed(filters: StoryFilters = {}) {
  return useInfiniteQuery({
    queryKey: storyKeys.feed(filters),
    queryFn: ({ pageParam }) => fetchStoriesPage(filters, pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => nextPageFrom(lastPage),
  });
}

/** Every story loaded so far, flattened across pages, de-duplicated by id. */
export function flattenStories(data: { pages: StoriesListResponse[] } | undefined): Story[] {
  if (!data) return [];
  const seen = new Set<string>();
  const stories: Story[] = [];
  for (const page of data.pages) {
    for (const story of page.stories) {
      if (seen.has(story.id)) continue;
      seen.add(story.id);
      stories.push(story);
    }
  }
  return stories;
}

/**
 * The trending rail's data.
 *
 * The API has no trending endpoint (`GET /stories` takes only page, limit and
 * category — see `api.listStories`), so "trending" is the recent page sorted by
 * reactions, computed here once. The sort is derived, never stored: a second copy
 * of a popularity score in the client would be a number that disagrees with the
 * server on the next page load.
 */
export function useTrendingStories(limit: number = TRENDING_LIMIT) {
  const query = useStoriesFeed({});
  const stories = useMemo(
    () => flattenStories(query.data).sort((a, b) => b.reactions - a.reactions).slice(0, limit),
    [query.data, limit],
  );

  return { stories, isLoading: query.isLoading, isError: query.isError };
}
