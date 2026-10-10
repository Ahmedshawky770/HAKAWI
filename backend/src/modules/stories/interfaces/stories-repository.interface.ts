export const STORIES_REPOSITORY = Symbol('STORIES_REPOSITORY');

/**
 * Postgres SQLSTATE for `unique_violation`.
 *
 * WHY it is exported and classified here rather than inline in the service: the driver error code is
 * a persistence-layer detail, and the service must not learn the dialect. `StoriesRepository.findById`
 * already does exactly this for the invalid-uuid case (`22P02` -> `null`), so this follows the
 * module's own precedent.
 */
const UNIQUE_VIOLATION_SQLSTATE = '23505';

/**
 * Whether a failed write lost a race for a uniqueness constraint.
 *
 * WHY the service cares: `stories.slug` is only as unique as the application makes it — see
 * `StoriesService.create`, where this is what turns a lost check-then-insert race into "take the
 * next candidate" instead of a 500. Once a unique index exists on `stories.slug` this becomes the
 * authority rather than a belt-and-braces second line of defence.
 */
export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && code === UNIQUE_VIOLATION_SQLSTATE;
}

export type StoryAuthorSummary = {
  id: string;
  name: string;
};

export type StoryCategorySummary = {
  id: string;
  name: string;
};

export type StoryTagSummary = {
  storyId: string;
  name: string;
};

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
  slug: string;
  excerpt?: string | null;
  content?: string | null;
  coverImage?: string | null;
  categoryId?: string | null;
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
}>;

export interface IStoriesRepository {
  findById(id: string): Promise<Story | null>;
  findBySlug(slug: string): Promise<Story | null>;
  findAll(params: {
    page?: number;
    limit?: number;
    authorId?: string;
    categoryId?: string;
    /**
     * ONE status, or a set of them.
     *
     * WHY A UNION AND NOT A SECOND PARAMETER. "Every status that is not published" is a set, and the
     * only scalar ways to express it are `status <> 'published'` (which widens on its own the moment
     * the lifecycle grows a value) or two queries merged in the service — which cannot be, because
     * `total` and the page window would then describe two different row sets. `IN (...)` is one
     * predicate over one statement, so `total` and the page keep sharing it.
     *
     * The callers decide WHICH set; nothing here widens a set on its own.
     */
    status?: string | readonly string[];
    search?: string;
  }): Promise<{ stories: Story[]; total: number }>;
  create(data: CreateStoryInput): Promise<Story>;
  update(id: string, data: UpdateStoryInput): Promise<Story>;
  softDelete(id: string): Promise<void>;
  incrementViewCount(id: string): Promise<void>;
  /**
   * `stories.like_count` and `stories.comment_count` are read by the search index — including
   * `sortBy=reactions`, which orders on `like_count` — and by the story response, which exposes
   * them as `reactions`. Neither was ever written after the create-time zero, so the whole search
   * sort was permanently inert. These are the writers, called from `StoriesEventHandler`.
   */
  incrementLikeCount(id: string): Promise<void>;
  decrementLikeCount(id: string): Promise<void>;
  incrementCommentCount(id: string): Promise<void>;
  decrementCommentCount(id: string): Promise<void>;
  findAuthorsByIds(authorIds: string[]): Promise<StoryAuthorSummary[]>;
  findCategoriesByIds(categoryIds: string[]): Promise<StoryCategorySummary[]>;
  findTagsByStoryIds(storyIds: string[]): Promise<StoryTagSummary[]>;
  /**
   * Replaces a story's tag set in one transaction. Every supplied name must already exist in
   * `tags`; an unknown name is a `BadRequestException` rather than a silent no-op, because the DTO
   * accepted the field and the caller has been told it is understood.
   */
  replaceTags(storyId: string, names: readonly string[]): Promise<void>;
}
