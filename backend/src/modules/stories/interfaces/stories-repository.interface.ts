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
    status?: string;
    search?: string;
  }): Promise<{ stories: Story[]; total: number }>;
  create(data: CreateStoryInput): Promise<Story>;
  update(id: string, data: UpdateStoryInput): Promise<Story>;
  softDelete(id: string): Promise<void>;
  incrementViewCount(id: string): Promise<void>;
  findAuthorsByIds(authorIds: string[]): Promise<StoryAuthorSummary[]>;
  findCategoriesByIds(categoryIds: string[]): Promise<StoryCategorySummary[]>;
  findTagsByStoryIds(storyIds: string[]): Promise<StoryTagSummary[]>;
}
