import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useMemo } from "react";

import { api } from "@/lib/api";
import type { StoriesListResponse, Story } from "@/types/api";

/**
 * The one place that knows how a fact is fetched, paged and cached.
 *
 * WHY NOT `useState` + `useEffect` IN EVERY PAGE. The product used to keep its
 * own copy of the world in about twenty-five pages: each one had its own
 * `loading` flag, its own `error` string, its own `retry` handler and its own
 * `useEffect` that fired on mount. That is not a style preference — it is four
 * real bugs:
 *
 * - **No shared cache.** Two pages that show the same list issued two
 *   requests and could show two different answers.
 * - **No invalidation.** Publishing a story did not tell the dashboard, the
 *   feed or the trending rail that anything had changed, so the product's own
 *   home page kept showing the story as unpublished until the reader pressed
 *   refresh.
 * - **No dedupe across tabs.** Two tabs on the same list each fetched their
 *   own copy.
 * - **No stale time.** Every visit to every page re-fetched, so a list of
 *   notifications flickered through its skeleton on every navigation.
 *
 * One key per fact, one fetch function, one cache. This module is the
 * registry: a query key that is not declared here does not exist, and the
 * pages below read the cache rather than rebuilding it.
 *
 * HOW A PAGE USES IT. A page asks for a fact (`useBook(id)`), renders its
 * `isLoading` / `isError` / `data`, and lets a mutation invalidate the keys
 * it changed (`invalidateBook`). There is no `useEffect` that fetches, and no
 * `attempt` counter that re-arms one.
 */

/**
 * THE CACHE DOES NOT OUTLIVE A SESSION.
 *
 * The keys in this file are USER-AGNOSTIC on purpose — `["library","list"]`,
 * `["notifications","unread-count"]`, `["messages","conversations"]` are the
 * READER'S OWN facts, under a key that does not carry their id. Threading the
 * id through every key would make them correct on their own, and it would
 * also make every caller responsible for a key it does not own.
 *
 * That is only safe because the cache is EMPTIED at the session boundaries,
 * and there are exactly three of them:
 *
 * - the sign-in and registration screens call `startSession` (`lib/session.ts`)
 *   after a successful sign-in or sign-up — a sign-in can follow another
 *   session in the same tab, and the cache would still hold that reader's
 *   conversations, library and payments. The registration screen used to skip
 *   this, and registering a second account in the same tab handed the second
 *   reader the first reader's private lists.
 * - `components/layout/LogoutButton.tsx` calls `queryClient.clear()` on
 *   sign-out — the next reader of a shared machine must not be served the
 *   previous one's feed.
 * - the session that ends by itself: the providers empty the queries nobody is
 *   waiting for the moment it is announced (`app/providers.tsx`), and the
 *   authenticated frame empties the rest once it has torn down the pages that
 *   were reading it (`app/(app)/layout.tsx`).
 *
 * SO A KEY ADDED HERE IS A KEY THAT MUST NOT OUTLIVE THE SESSION THAT FILLED
 * IT. If the key holds the reader's own data, the answer is not a per-user key
 * to make it safe — the answer is that the calls above empty the cache, and
 * they are the whole invariant. The keys below are short because the cache is
 * disposable, and they are only disposable because it is cleared.
 */

/* -------------------------------------------------------------------------- */
/*  STORY FEED                                                                 */
/* -------------------------------------------------------------------------- */

export const STORY_FEED_PAGE_SIZE = 20;
export const TRENDING_LIMIT = 5;

export interface StoryFilters {
  category?: string;
}

export const storyKeys = {
  feed: (filters: StoryFilters) => ["stories", "feed", filters] as const,
  detail: (storyId: string) => ["stories", "detail", storyId] as const,
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

  return { stories, isLoading: query.isLoading, isError: isFailedLoad(query) };
}

/** One story, by id. */
export function useStory(storyId: string): UseQueryResult<Awaited<ReturnType<typeof api.getStory>>> {
  return useQuery({
    queryKey: storyKeys.detail(storyId),
    queryFn: () => api.getStory(storyId),
    enabled: storyId.length > 0,
  });
}

/* -------------------------------------------------------------------------- */
/*  REACTIONS                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The reaction keys live HERE, not in `ReactionBar`.
 *
 * They used to be declared inside the component that used them, which is the
 * shape that lets two surfaces invent two keys for one fact: the bar's own
 * cache entry and any other reader of the same counts would then never meet.
 * The keys are part of the contract, so they sit with the rest of the contract.
 */
export const reactionKeys = {
  counts: (storyId: string) => ["reactions", storyId, "counts"] as const,
  list: (storyId: string) => ["reactions", storyId, "list"] as const,
};

/* -------------------------------------------------------------------------- */
/*  BOOKS                                                                      */
/* -------------------------------------------------------------------------- */

export const bookKeys = {
  list: (params?: { page?: number; limit?: number; categoryId?: string }) =>
    ["books", "list", params ?? {}] as const,
  detail: (bookId: string) => ["books", "detail", bookId] as const,
};

export function useBooks(params?: { page?: number; limit?: number; categoryId?: string }) {
  return useQuery({
    queryKey: bookKeys.list(params),
    queryFn: () => api.listBooks(params),
  });
}

export function useBook(bookId: string) {
  return useQuery({
    queryKey: bookKeys.detail(bookId),
    queryFn: () => api.getBook(bookId),
    enabled: bookId.length > 0,
  });
}

/* -------------------------------------------------------------------------- */
/*  LIBRARY                                                                    */
/* -------------------------------------------------------------------------- */

export const libraryKeys = {
  list: (params?: { page?: number; limit?: number }) => ["library", "list", params ?? {}] as const,
  progress: (bookId: string) => ["library", "progress", bookId] as const,
};

export function useLibrary(params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: libraryKeys.list(params),
    queryFn: () => api.listLibrary(params),
  });
}

export function useReadingProgress(bookId: string) {
  return useQuery({
    queryKey: libraryKeys.progress(bookId),
    queryFn: () => api.getReadingProgress(bookId),
    enabled: bookId.length > 0,
  });
}

/* -------------------------------------------------------------------------- */
/*  RENTALS                                                                    */
/* -------------------------------------------------------------------------- */

export const rentalKeys = {
  list: (params?: { page?: number; limit?: number; status?: string }) =>
    ["rentals", "list", params ?? {}] as const,
  detail: (rentalId: string) => ["rentals", "detail", rentalId] as const,
  extensionQuote: (rentalId: string, days: number) => ["rentals", "quote", rentalId, days] as const,
};

export function useRentals(params?: { page?: number; limit?: number; status?: string }) {
  return useQuery({
    queryKey: rentalKeys.list(params),
    queryFn: () => api.getMyRentals(params),
  });
}

export function useRental(rentalId: string) {
  return useQuery({
    queryKey: rentalKeys.detail(rentalId),
    queryFn: () => api.getRental(rentalId),
    enabled: rentalId.length > 0,
  });
}

/** The price of an extension, before any money moves. */
export function useRentalExtensionQuote(rentalId: string, days: number | null) {
  return useQuery({
    queryKey: rentalKeys.extensionQuote(rentalId, days ?? 0),
    queryFn: () => api.quoteRentalExtension(rentalId, days as number),
    enabled: rentalId.length > 0 && days !== null && days > 0,
  });
}

/* -------------------------------------------------------------------------- */
/*  PAYMENTS                                                                   */
/* -------------------------------------------------------------------------- */

export const paymentKeys = {
  list: (params?: { page?: number; limit?: number }) => ["payments", "list", params ?? {}] as const,
  detail: (paymentId: string) => ["payments", "detail", paymentId] as const,
};

export function usePayments(params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: paymentKeys.list(params),
    queryFn: () => api.getPaymentHistory(params),
  });
}

export function usePayment(paymentId: string) {
  return useQuery({
    queryKey: paymentKeys.detail(paymentId),
    queryFn: () => api.getPayment(paymentId),
    enabled: paymentId.length > 0,
  });
}

/* -------------------------------------------------------------------------- */
/*  MESSAGES                                                                   */
/* -------------------------------------------------------------------------- */

export const messageKeys = {
  conversations: () => ["messages", "conversations"] as const,
  thread: (conversationId: string) => ["messages", "thread", conversationId] as const,
};

export function useConversations() {
  return useQuery({
    queryKey: messageKeys.conversations(),
    queryFn: () => api.getConversations(),
  });
}

/**
 * The number of unread messages, for the badge on the messages target.
 *
 * There is no endpoint for this, and there does not need to be one: every
 * conversation carries its own `unreadCount`, so the total is the sum of a list
 * the product already fetches. The conversations query is shared, so the badge
 * costs no extra request.
 */
export function useUnreadMessageCount(): number {
  const conversations = useConversations();
  return useMemo(
    () =>
      (conversations.data?.conversations ?? []).reduce(
        (total, conversation) => total + (conversation.unreadCount ?? 0),
        0,
      ),
    [conversations.data],
  );
}

export function useMessages(conversationId: string) {
  return useQuery({
    queryKey: messageKeys.thread(conversationId),
    queryFn: () => api.getMessages(conversationId),
    enabled: conversationId.length > 0,
  });
}

/* -------------------------------------------------------------------------- */
/*  NOTIFICATIONS                                                               */
/* -------------------------------------------------------------------------- */

export const notificationKeys = {
  list: (params?: { page?: number; limit?: number }) => ["notifications", "list", params ?? {}] as const,
  unreadCount: () => ["notifications", "unread-count"] as const,
};

export function useNotifications(params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: notificationKeys.list(params),
    queryFn: () => api.getNotifications(params),
  });
}

/**
 * The number of unread notifications, for the badge in the header and the
 * sidebar.
 *
 * `staleTime` is short on purpose: an unread count is the one number a reader
 * expects to be RIGHT — a badge that says "3" when there are 5 is worse than no
 * badge — so it is refetched more eagerly than the lists around it.
 */
export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: () => api.getUnreadNotificationCount(),
    staleTime: 1000 * 60,
  });
}

/* -------------------------------------------------------------------------- */
/*  CONTESTS                                                                   */
/* -------------------------------------------------------------------------- */

export const contestKeys = {
  list: (params?: { page?: number; limit?: number }) => ["contests", "list", params ?? {}] as const,
  detail: (contestId: string) => ["contests", "detail", contestId] as const,
  votes: (contestId: string, params?: { submissionId?: string; page?: number; limit?: number }) =>
    ["contests", "votes", contestId, params ?? {}] as const,
  publisherStats: () => ["contests", "publisher", "stats"] as const,
  publisherSubmissions: (contestId: string, params?: { page?: number; limit?: number }) =>
    ["contests", "publisher", contestId, "submissions", params ?? {}] as const,
  publisherVotes: (contestId: string, params?: { page?: number; limit?: number }) =>
    ["contests", "publisher", contestId, "votes", params ?? {}] as const,
};

export function useContests(params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: contestKeys.list(params),
    queryFn: () => api.listContests(params),
  });
}

export function useContest(contestId: string) {
  return useQuery({
    queryKey: contestKeys.detail(contestId),
    queryFn: () => api.getContest(contestId),
    enabled: contestId.length > 0,
  });
}

export function useContestVotes(
  contestId: string,
  params?: { submissionId?: string; page?: number; limit?: number },
) {
  return useQuery({
    queryKey: contestKeys.votes(contestId, params),
    queryFn: () => api.getVotes(contestId, params),
    enabled: contestId.length > 0,
  });
}

export function usePublisherStats() {
  return useQuery({
    queryKey: contestKeys.publisherStats(),
    queryFn: () => api.getPublisherStats(),
  });
}

export function usePublisherSubmissions(contestId: string, params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: contestKeys.publisherSubmissions(contestId, params),
    queryFn: () => api.getPublisherSubmissions(contestId, params),
    enabled: contestId.length > 0,
  });
}

export function usePublisherVotes(contestId: string, params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: contestKeys.publisherVotes(contestId, params),
    queryFn: () => api.getPublisherVotes(contestId, params),
    enabled: contestId.length > 0,
  });
}

/* -------------------------------------------------------------------------- */
/*  MODERATION                                                                 */
/* -------------------------------------------------------------------------- */

export const moderationKeys = {
  queue: (params?: { page?: number; limit?: number; status?: string }) =>
    ["moderation", "queue", params ?? {}] as const,
  restrictions: (userId: string, includeExpired: boolean) =>
    ["moderation", "restrictions", userId, includeExpired] as const,
};

export function useModerationQueue(params?: { page?: number; limit?: number; status?: string }) {
  return useQuery({
    queryKey: moderationKeys.queue(params),
    queryFn: () => api.getModerationQueue(params),
  });
}

export function useUserRestrictions(userId: string, includeExpired = true) {
  return useQuery({
    queryKey: moderationKeys.restrictions(userId, includeExpired),
    queryFn: () => api.getUserRestrictions(userId, { includeExpired }),
    enabled: userId.length > 0,
  });
}

/* -------------------------------------------------------------------------- */
/*  ADMIN                                                                     */
/* -------------------------------------------------------------------------- */

export const adminKeys = {
  moderationStats: () => ["admin", "moderation", "stats"] as const,
  roleAssignments: () => ["admin", "roles", "assignments"] as const,
  payments: () => ["admin", "financial", "payments"] as const,
  paymentStats: () => ["admin", "financial", "stats"] as const,
  publisherApplications: () => ["admin", "verification", "applications"] as const,
  publisherStats: () => ["admin", "verification", "stats"] as const,
};

export function useAdminModerationStats(enabled = true) {
  return useQuery({
    queryKey: adminKeys.moderationStats(),
    queryFn: () => api.getAdminModerationStats(),
    enabled,
  });
}

export function useAdminRoleAssignments(enabled = true) {
  return useQuery({
    queryKey: adminKeys.roleAssignments(),
    queryFn: () => api.getAdminRoleAssignments(),
    enabled,
  });
}

export function useAdminPayments(params?: { status?: string; page?: number; limit?: number }, enabled = true) {
  return useQuery({
    queryKey: [...adminKeys.payments(), params ?? {}],
    queryFn: () => api.getAdminPayments(params),
    enabled,
  });
}

export function useAdminPaymentStats(enabled = true) {
  return useQuery({
    queryKey: adminKeys.paymentStats(),
    queryFn: () => api.getAdminPaymentStats(),
    enabled,
  });
}

export function useAdminPublisherApplications(params?: { status?: string; page?: number; limit?: number }, enabled = true) {
  return useQuery({
    queryKey: [...adminKeys.publisherApplications(), params ?? {}],
    queryFn: () => api.getAdminPublisherApplications(params),
    enabled,
  });
}

export function useAdminPublisherStats(enabled = true) {
  return useQuery({
    queryKey: adminKeys.publisherStats(),
    queryFn: () => api.getAdminPublisherStats(),
    enabled,
  });
}

/* -------------------------------------------------------------------------- */
/*  USERS                                                                     */
/* -------------------------------------------------------------------------- */
/*  USERS                                                                      */
/* -------------------------------------------------------------------------- */

export const userKeys = {
  profile: (userId: string) => ["users", "profile", userId] as const,
  stats: (userId: string) => ["users", "stats", userId] as const,
  followers: (userId: string, params?: { page?: number; limit?: number }) =>
    ["users", "followers", userId, params ?? {}] as const,
  following: (userId: string, params?: { page?: number; limit?: number }) =>
    ["users", "following", userId, params ?? {}] as const,
};

export function useUserProfile(userId: string) {
  return useQuery({
    queryKey: userKeys.profile(userId),
    queryFn: () => api.getUser(userId),
    enabled: userId.length > 0,
  });
}

export function useUserStats(userId: string) {
  return useQuery({
    queryKey: userKeys.stats(userId),
    queryFn: () => api.getUserStats(userId),
    enabled: userId.length > 0,
  });
}

export function useFollowers(userId: string, params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: userKeys.followers(userId, params),
    queryFn: () => api.getFollowers(userId, params),
    enabled: userId.length > 0,
  });
}

export function useFollowing(userId: string, params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: userKeys.following(userId, params),
    queryFn: () => api.getFollowing(userId, params),
    enabled: userId.length > 0,
  });
}

/* -------------------------------------------------------------------------- */
/*  BADGES                                                                     */
/* -------------------------------------------------------------------------- */

export const badgeKeys = {
  catalog: () => ["badges", "catalog"] as const,
  user: (userId: string, key?: string) => ["badges", "user", userId, key ?? "all"] as const,
};

export function useBadgeCatalog() {
  return useQuery({
    queryKey: badgeKeys.catalog(),
    queryFn: () => api.listBadges(),
  });
}

export function useUserBadges(userId: string, key?: string) {
  return useQuery({
    queryKey: badgeKeys.user(userId, key),
    queryFn: () => api.listUserBadges(userId, { key }),
    enabled: userId.length > 0,
  });
}

/* -------------------------------------------------------------------------- */
/*  SEARCH                                                                     */
/* -------------------------------------------------------------------------- */

export const searchKeys = {
  query: (params: { query: string; category?: string; tag?: string; page?: number; limit?: number }) =>
    ["search", params] as const,
};

export function useSearch(params: { query: string; category?: string; tag?: string; page?: number; limit?: number }) {
  return useQuery({
    queryKey: searchKeys.query(params),
    queryFn: () => api.search(params),
    enabled: params.query.trim().length > 0,
  });
}

/* -------------------------------------------------------------------------- */
/*  INVALIDATION                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The writes that change the world, and the keys they retire.
 *
 * Every mutation in the product that changes a fact calls one of these. The
 * point is not the refetch — it is that the reader who publishes a story sees
 * it in the feed without a refresh, and that the dashboard, the feed and the
 * trending rail cannot disagree about whether a story exists.
 */
export function useInvalidation() {
  const queryClient = useQueryClient();

  return useMemo(
    () => ({
      /** A story was created, edited, published, deleted or reacted to. */
      stories: async (storyId?: string) => {
        await queryClient.invalidateQueries({ queryKey: ["stories"] });
        if (storyId) {
          await queryClient.invalidateQueries({ queryKey: storyKeys.detail(storyId) });
        }
        // The trending rail reads the same feed entry, so it is covered by the
        // `["stories"]` sweep above; the reactions are not, and they move with
        // the story.
        await queryClient.invalidateQueries({ queryKey: ["reactions"] });
      },

      /** A book was bought, rented, published, archived or deleted. */
      books: async (bookId?: string) => {
        await queryClient.invalidateQueries({ queryKey: ["books"] });
        if (bookId) {
          await queryClient.invalidateQueries({ queryKey: bookKeys.detail(bookId) });
        }
        // A purchase creates a payment and an entitlement, so the money pages
        // and the shelf are stale too.
        await queryClient.invalidateQueries({ queryKey: ["payments"] });
        await queryClient.invalidateQueries({ queryKey: ["library"] });
        await queryClient.invalidateQueries({ queryKey: ["rentals"] });
      },

      /** The reader's shelf changed. */
      library: async () => {
        await queryClient.invalidateQueries({ queryKey: ["library"] });
      },

      /** A rental was returned or extended. */
      rentals: async (rentalId?: string) => {
        await queryClient.invalidateQueries({ queryKey: ["rentals"] });
        if (rentalId) {
          await queryClient.invalidateQueries({ queryKey: rentalKeys.detail(rentalId) });
        }
        await queryClient.invalidateQueries({ queryKey: ["library"] });
      },

      /** A payment moved. */
      payments: async () => {
        await queryClient.invalidateQueries({ queryKey: ["payments"] });
      },

      /** A message was sent or read. */
      messages: async (conversationId?: string) => {
        await queryClient.invalidateQueries({ queryKey: messageKeys.conversations() });
        if (conversationId) {
          await queryClient.invalidateQueries({ queryKey: messageKeys.thread(conversationId) });
        }
      },

      /** A notification arrived or was read. */
      notifications: async () => {
        await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      },

      /** A contest changed. */
      contests: async (contestId?: string) => {
        await queryClient.invalidateQueries({ queryKey: ["contests"] });
        if (contestId) {
          await queryClient.invalidateQueries({ queryKey: contestKeys.detail(contestId) });
        }
      },

      /** A report was filed or moderated. */
      moderation: async () => {
        await queryClient.invalidateQueries({ queryKey: ["moderation"] });
      },

      /** An admin surface changed: moderation stats, financial stats, verification stats or role assignments. */
      admin: async () => {
        await queryClient.invalidateQueries({ queryKey: ["admin"] });
      },

      /** A profile changed. */
      users: async (userId?: string) => {
        await queryClient.invalidateQueries({ queryKey: ["users"] });
        if (userId) {
          await queryClient.invalidateQueries({ queryKey: userKeys.profile(userId) });
        }
      },
    }),
    [queryClient],
  );
}

/* -------------------------------------------------------------------------- */
/*  READING A QUERY RESULT                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Did the load FAIL, or did a background refetch fail?
 *
 * TanStack Query keeps the data when a REFETCH fails: the status becomes
 * "error" while `data` stays populated. A bare `isError` therefore treats a
 * list the reader is looking at as a failed page — the list is replaced by an
 * error screen because a background request that the reader never asked for
 * came back unhappy. The refactor made that more likely, because every
 * mutation now invalidates, and an invalidation triggers a refetch.
 *
 * A load that NEVER ARRIVED is a failure the reader must be told about. A load
 * that arrived and whose refresh failed is not — the reader has the list.
 *
 * So the rule lives here, once, instead of being written out on every page
 * with a different answer.
 */
export function isFailedLoad(query: { isError: boolean; data: unknown }): boolean {
  return query.isError && query.data === undefined;
}
