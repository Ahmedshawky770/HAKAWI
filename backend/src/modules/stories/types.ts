import {
  REACTION_TYPES,
  type AuthorSummary,
  type Exact,
  type ReactionType,
  type Story as SharedStory,
  type StoryRecord as SharedStoryRecord,
  type StoriesListResponse as SharedStoriesListResponse,
  type StoryStatus as SharedStoryStatus,
} from '@hakawi/shared-types';

import { VALID_REACTION_TYPES } from '../reactions/types.ts';
import { reviveNullableDate, reviveRequiredDate } from '../shared/cache/date-revival.ts';

export type BackendReactionType = (typeof VALID_REACTION_TYPES)[number];

export const REACTION_TYPES_MATCH_SHARED_CONTRACT: Exact<BackendReactionType, ReactionType> = true;

export const REACTION_TYPES_ARE_SHARED_REACTION_TYPES: readonly ReactionType[] = REACTION_TYPES;

export type Story = {
  id: string;
  authorId: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string | null;
  coverImage: string | null;
  status: string;
  categoryId: string | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  readingTime: number | null;
  publishedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateStoryInput = {
  authorId: string;
  title: string;
  /**
   * OPTIONAL, and deliberately so — this is the fix for a 400 on every create. It used to be
   * required, which made `POST /stories` unsatisfiable for every client in the repository, because
   * no caller sends a slug.
   *
   * Omit it and `StoriesService.create` derives it from `title` and resolves collisions. Send it and
   * it is honored verbatim. `Story.slug` (the row that gets written) is non-optional; this input is
   * the request, not the row.
   */
  slug?: string;
  excerpt?: string | null;
  content?: string | null;
  coverImage?: string | null;
  status?: string;
  categoryId?: string | null;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  /**
   * Accepted and validated by `CreateStoryDto`, and declared here so the controller can forward the
   * DTO without a type assertion (Principle #1 — no `as` to bridge a mismatch).
   *
   * NOT PERSISTED YET, and the type says so rather than pretending otherwise: tags live in the
   * `story_tags` join (`stories.schema.ts:75-91`), not in a `stories` column, and `StoriesRepository`
   * exposes no writer for it. Drizzle builds its INSERT/UPDATE from the table's own column list, so
   * the key is dropped without error — verified against
   * `drizzle-orm/pg-core/query-builders/insert.js` and `drizzle-orm/pg-core/dialect.js`
   * (`buildInsertQuery` and `buildUpdateSet` both iterate `table[Symbol.Columns]`). Persisting it
   * needs a repository tag writer and a call from `StoriesService.create`/`update`.
   */
  tags?: string[];
};

export type UpdateStoryInput = Partial<{
  title: string;
  slug: string;
  excerpt: string | null;
  content: string | null;
  coverImage: string | null;
  status: string;
  categoryId: string | null;
  publishedAt: Date | null;
  /** Same caveat as `CreateStoryInput.tags` — accepted and validated, not written. */
  tags?: string[];
}>;

export type BackendStoryStatus = 'draft' | 'published' | 'archived';

export const STORY_STATUSES_MATCH_SHARED_CONTRACT: Exact<BackendStoryStatus, SharedStoryStatus> = true;

export const BACKEND_STORY_STATUSES = [
  'draft',
  'published',
  'archived',
] as const satisfies readonly BackendStoryStatus[];

export type StoryStatus = SharedStoryStatus;

/**
 * The only status an UNAUTHENTICATED caller may ever read, in one named place.
 *
 * WHY THIS IS A CONSTANT AND NOT A STRING AT EACH ROUTE. `GET /stories` and `GET /search` are both
 * `@Public()` and both used to decide independently whether a caller-supplied `status` reached the
 * query — and they disagreed, which is how `?status=draft` became an anonymous dump of every draft
 * in the system on the stories route while the search route had already closed the same hole. Two
 * public read routes and two hand-written literals is two rules; a route that forgot the literal would
 * typecheck perfectly and leak. One constant is the only thing that makes "public reads published
 * content" a property of the codebase rather than of each route's memory.
 *
 * TYPED AS THE SHARED `StoryStatus`, so the literal is checked against `@hakawi/shared-types` rather
 * than being a bare string that could drift from the contract the frontend validates against.
 *
 * THE SAME CONSTANT DECIDES THE DETAIL ROUTES. `assertStoryIsReadableBy` (`story-visibility.ts`) reads
 * this value, so "published is the only status a public caller may read" is one comparison in one
 * place across the list route, the item-by-id route and the item-by-slug route. The first half of this
 * note describes how the constant stopped one route from forgetting; the second describes the second
 * half of that failure — the routes that pinned it in the query string while the detail routes, which
 * never consulted it at all, served drafts to anybody.
 */
export const PUBLIC_STORY_STATUS: StoryStatus = 'published';

/**
 * Every lifecycle status that is NOT the public one: the complete set of rows `GET /stories` cannot
 * return, and therefore the whole reason an author needs a route of their own.
 *
 * WHY A SET AND NOT `status <> 'published'`. The exclusion is a filter that gets WIDER every time a
 * status is added: a fourth lifecycle value would be readable by nobody through the public list and
 * would then be handed out by the author route as if it were safe to read. Deriving the set from the
 * same tuple `StoriesQueryDto` whitelists against means a new status has to be classified on purpose,
 * in the one file that already holds the classification (`PUBLIC_STORY_STATUS` above), and the two
 * cannot drift (Principle #9).
 */
export const UNPUBLISHED_STORY_STATUSES: readonly BackendStoryStatus[] = BACKEND_STORY_STATUSES.filter(
  (status) => status !== PUBLIC_STORY_STATUS,
);

export type StoryAuthor = AuthorSummary;

export type StoryResponse = SharedStory;

export type StoryRecord = SharedStoryRecord;

export type StoriesListResponse = SharedStoriesListResponse;

export interface StoryRelations {
  readonly category?: string | null;
  readonly tags?: readonly string[];
}

export function toStoryResponse(
  story: Story,
  author: StoryAuthor = { id: story.authorId, name: null },
  relations: StoryRelations = {},
): StoryResponse {
  return {
    id: story.id,
    title: story.title,
    slug: story.slug,
    excerpt: story.excerpt,
    content: story.content,
    coverImage: story.coverImage,
    status: story.status,
    category: relations.category ?? null,
    tags: relations.tags ? [...relations.tags] : [],
    views: story.viewCount,
    reactions: story.likeCount,
    author,
    createdAt: story.createdAt.toISOString(),
    updatedAt: story.updatedAt.toISOString(),
  };
}

export function toStoryRecord(story: Story, authorName: string | null): StoryRecord {
  return {
    id: story.id,
    authorId: story.authorId,
    authorName,
    title: story.title,
    slug: story.slug,
    excerpt: story.excerpt,
    content: story.content,
    coverImage: story.coverImage,
    status: story.status,
    categoryId: story.categoryId,
    viewCount: story.viewCount,
    likeCount: story.likeCount,
    commentCount: story.commentCount,
    readingTime: story.readingTime,
    publishedAt: story.publishedAt?.toISOString() ?? null,
    deletedAt: story.deletedAt?.toISOString() ?? null,
    createdAt: story.createdAt.toISOString(),
    updatedAt: story.updatedAt.toISOString(),
  };
}

/**
 * Restores the `Date` fields of a story that came back from the cache.
 *
 * WHY this lives next to the mappers rather than in `stories.service.ts`. It is the third thing you
 * need to turn a `Story` into a response, and the first two live in this file: `toStoryResponse` and
 * `toStoryRecord` both call `.toISOString()` on `createdAt`/`updatedAt`, so the set of fields that
 * have to be real `Date` objects is *defined* by those mappers. Keeping the reviver here means the
 * mappers and the thing that feeds them cannot drift apart, and the module's story knowledge stays in
 * one file (Principle #10). The primitives themselves stay shared with every other cached entity
 * (`shared/cache/date-revival.ts`); only the field list below is story knowledge.
 *
 * WHAT IT PREVENTS. A value that has only been through `JSON.stringify` -> `JSON.parse` hands back
 * ISO strings, and the request then dies with `TypeError: ...toISOString is not a function` — on
 * every cache HIT, while the first cold read works fine. It is passed to `getOrSet` as `revive` so
 * the cached path is shape-identical to the uncached one.
 */
export function reviveStoryDates(story: Story): Story {
  return {
    ...story,
    publishedAt: reviveNullableDate(story.publishedAt, 'publishedAt'),
    deletedAt: reviveNullableDate(story.deletedAt, 'deletedAt'),
    createdAt: reviveRequiredDate(story.createdAt, 'createdAt'),
    updatedAt: reviveRequiredDate(story.updatedAt, 'updatedAt'),
  };
}
