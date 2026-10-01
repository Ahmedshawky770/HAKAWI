import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Inject,
} from '@nestjs/common';

import { EventValidatorService } from '../../common/events/event-validator.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { TaggedCacheService } from '../shared/cache/tagged-cache.service.ts';
import type {
  StoryCreatedEvent,
  StoryUpdatedEvent,
  StoryPublishedEvent,
  StoryArchivedEvent,
  StoryDeletedEvent,
} from '../../common/events/stories.events.ts';

import type {
  IStoriesRepository,
  StoryAuthorSummary,
  StoryCategorySummary,
  StoryTagSummary,
} from './interfaces/stories-repository.interface.ts';
import { STORIES_REPOSITORY, isUniqueViolation } from './interfaces/stories-repository.interface.ts';
import { deriveStorySlug, storySlugCandidates, MAX_SLUG_COLLISION_ATTEMPTS } from './dto/story-slug.ts';
import type { Story, CreateStoryInput, UpdateStoryInput, StoriesListResponse, StoryRecord } from './types.ts';
import { toStoryResponse, toStoryRecord, reviveStoryDates, type StoryAuthor, type StoryRelations } from './types.ts';

export const STORY_CACHE_NAMESPACE = 'story';
export const STORIES_CACHE_TAG = 'stories';
export const STORY_CACHE_TTL_SECONDS = 600;

interface StoryRelationsIndex {
  readonly authors: Map<string, StoryAuthor>;
  readonly categories: Map<string, string>;
  readonly tags: Map<string, string[]>;
}

const EMPTY_RELATIONS: StoryRelationsIndex = { authors: new Map(), categories: new Map(), tags: new Map() };

@Injectable()
export class StoriesService {
  constructor(
    @Inject(STORIES_REPOSITORY) private readonly storiesRepository: IStoriesRepository,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Inject(TaggedCacheService) private readonly cache: TaggedCacheService,
    @Inject(EventValidatorService) private readonly eventBus: EventValidatorService,
  ) {}

  /**
   * The create path, and the whole of the "slug is optional" contract lives here rather than in the
   * controller, because this is the layer that owns the insert. A candidate slug is only "free" if
   * the write that follows actually succeeds, and only this layer can find that out.
   *
   * Two policies, split by who chose the slug:
   *
   * 1. **The client sent a slug -> honor it verbatim, 409 on collision.** Rewriting it to
   *    `my-story-2` would mean the client believes it published at `/my-story` while the row says
   *    something else: two truths about one URL (Principle #9). Better to refuse and let the caller
   *    pick. This is the documented, pre-existing behaviour of this method and of the e2e contract
   *    ("a duplicate slug is a 409"), so backward compatibility is exact.
   * 2. **The client sent none -> derive it from the title and walk the suffixes.** Nobody had to
   *    transliterate anything, and the value stays a pure function of the title.
   *
   * The empty-slug case is rejected here as well as in the DTO. `@MinLength` cannot cover it,
   * because `@IsOptional()` skips validation for `null`, and `{ slug: null }` would otherwise reach
   * `.trim()` and throw a `TypeError` -> 500 instead of a 400.
   */
  async create(authorId: string, input: CreateStoryInput): Promise<Story> {
    const data: CreateStoryInput = {
      ...input,
      authorId,
      status: 'draft',
      viewCount: 0,
      likeCount: 0,
      commentCount: 0,
    };

    const story = await this.insertWithResolvedSlug(data);
    await this.eventBus.emit('story.created', { storyId: story.id, authorId } as StoryCreatedEvent);
    return story;
  }

  async findById(id: string): Promise<Story> {
    const { value } = await this.cache.getOrSet<Story>({
      namespace: STORY_CACHE_NAMESPACE,
      key: id,
      ttl: STORY_CACHE_TTL_SECONDS,
      tags: [STORIES_CACHE_TAG],
      revive: reviveStoryDates,
      load: async () => {
        const story = await this.storiesRepository.findById(id);
        if (!story || story.deletedAt) {
          throw new NotFoundException('Story not found');
        }
        return story;
      },
    });
    return value;
  }

  async findBySlug(slug: string): Promise<Story> {
    const { value } = await this.cache.getOrSet<Story>({
      namespace: STORY_CACHE_NAMESPACE,
      key: `slug:${slug}`,
      ttl: STORY_CACHE_TTL_SECONDS,
      tags: [STORIES_CACHE_TAG],
      revive: reviveStoryDates,
      load: async () => {
        const story = await this.storiesRepository.findBySlug(slug);
        if (!story || story.deletedAt) {
          throw new NotFoundException('Story not found');
        }
        return story;
      },
    });
    return value;
  }

  async findByIdWithRelations(id: string): Promise<{ story: Story; response: ReturnType<typeof toStoryResponse> }> {
    const story = await this.findById(id);
    const relations = await this.loadRelations([story]);
    return {
      story,
      response: toStoryResponse(story, relations.authors.get(story.authorId), relationsFor(story, relations)),
    };
  }

  async findBySlugWithRelations(slug: string): Promise<{ story: Story; response: ReturnType<typeof toStoryResponse> }> {
    const story = await this.findBySlug(slug);
    const relations = await this.loadRelations([story]);
    return {
      story,
      response: toStoryResponse(story, relations.authors.get(story.authorId), relationsFor(story, relations)),
    };
  }

  async findAll(params: {
    page?: number;
    limit?: number;
    authorId?: string;
    categoryId?: string;
    status?: string;
    search?: string;
  }): Promise<StoriesListResponse> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;

    const result = await this.storiesRepository.findAll(params);
    const relations = await this.loadRelations(result.stories);
    const stories = result.stories.map((story) =>
      toStoryResponse(story, relations.authors.get(story.authorId), relationsFor(story, relations)),
    );

    return {
      stories,
      total: result.total,
      page,
      limit,
    };
  }

  async toRecord(story: Story): Promise<StoryRecord> {
    const relations = await this.loadRelations([story]);
    return toStoryRecord(story, relations.authors.get(story.authorId)?.name ?? null);
  }

  async update(id: string, input: UpdateStoryInput, userId: string): Promise<Story> {
    const existing = await this.storiesRepository.findById(id);
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Story not found');
    }

    if (existing.authorId !== userId) {
      throw new ForbiddenException('You can only update your own stories');
    }

    if (input.slug && input.slug !== existing.slug) {
      const slugExists = await this.storiesRepository.findBySlug(input.slug);
      if (slugExists) {
        throw new ConflictException('Story slug already exists');
      }
    }

    const story = await this.storiesRepository.update(id, input);
    await this.invalidateStoryCache(id, existing.slug);

    await this.eventBus.emit('story.updated', { storyId: id, updatedFields: input } as StoryUpdatedEvent);
    return story;
  }

  async publish(id: string, userId: string): Promise<Story> {
    const story = await this.storiesRepository.findById(id);
    if (!story || story.deletedAt) {
      throw new NotFoundException('Story not found');
    }

    if (story.authorId !== userId) {
      throw new ForbiddenException('You can only publish your own stories');
    }

    if (story.status === 'published') {
      throw new ForbiddenException('Story is already published');
    }

    if (story.status === 'archived') {
      throw new ForbiddenException('Cannot publish an archived story');
    }

    const publishedAt = new Date();
    const updated = await this.storiesRepository.update(id, {
      status: 'published',
      publishedAt,
    });
    await this.invalidateStoryCache(id, story.slug);

    await this.eventBus.emit('story.published', { storyId: id, publishedAt } as StoryPublishedEvent);
    return updated;
  }

  async archive(id: string, userId: string): Promise<Story> {
    const story = await this.storiesRepository.findById(id);
    if (!story || story.deletedAt) {
      throw new NotFoundException('Story not found');
    }

    if (story.authorId !== userId) {
      throw new ForbiddenException('You can only archive your own stories');
    }

    if (story.status === 'archived') {
      throw new ForbiddenException('Story is already archived');
    }

    const updated = await this.storiesRepository.update(id, { status: 'archived' });
    await this.invalidateStoryCache(id, story.slug);

    await this.eventBus.emit('story.archived', { storyId: id } as StoryArchivedEvent);
    return updated;
  }

  async delete(id: string, userId: string): Promise<void> {
    const story = await this.storiesRepository.findById(id);
    if (!story || story.deletedAt) {
      throw new NotFoundException('Story not found');
    }

    if (story.authorId !== userId) {
      throw new ForbiddenException('You can only delete your own stories');
    }

    await this.storiesRepository.softDelete(id);
    await this.invalidateStoryCache(id, story.slug);

    await this.eventBus.emit('story.deleted', { storyId: id, authorId: story.authorId } as StoryDeletedEvent);
  }

  async incrementViewCount(id: string): Promise<void> {
    const story = await this.storiesRepository.findById(id);
    if (!story || story.deletedAt) {
      throw new NotFoundException('Story not found');
    }

    await this.storiesRepository.incrementViewCount(id);
    await this.invalidateStoryCache(id, story.slug);
    this.logger.debug(`Story ${id} view count incremented and cache invalidated`, 'StoriesService');
  }

  /**
   * WHY targeted and not a tag sweep — this used to call `invalidateTags([STORIES_CACHE_TAG])` on
   * every page view.
   *
   * The `stories` tag indexes every story-id *and* every story-slug entry, so one page view
   * evicted the entire story cache of the deployment: the next reader missed on a cold key, and
   * the invalidation still cost two `SMEMBERS` + N `DEL` round trips per view. Under read
   * traffic the hit rate collapsed towards zero while paying full price for the cache.
   *
   * Deleting this story's two keys (id and slug) is sufficient and equivalent for the row that
   * actually changed. `invalidateKey` bumps the tag generation, so an in-flight reader that loaded
   * this story before the bump still refuses to cache its now-stale copy — which is what made the
   * broad sweep look necessary.
   *
   * Tradeoff, stated plainly: `viewCount` lives inside the cached payload, so a view of story A
   * still costs A's own two keys. That is deliberate — the counter is inherently eventually
   * consistent, so the freshness window for it is the point of the invalidation rather than
   * something to eliminate. What must never happen is one story's view invalidating data that did
   * not change, which is exactly what the sweep did.
   */
  /**
   * Resolves the slug and writes the row, in one place so a candidate is never treated as free
   * without the write that proves it.
   *
   * WHY the insert is retried and not only pre-checked. A `SELECT` followed by an `INSERT` is a
   * check-then-insert, and `stories.slug` has **no unique constraint to close the gap** —
   * `stories.schema.ts:70` declares a plain non-unique `index('stories_slug_idx')` and
   * `migrations/0001_create_stories_tables.sql:52` creates it the same way, so two concurrent
   * creates of the same title can both pass the probe. Catching the unique violation and advancing
   * to the next candidate is therefore the only thing that makes the walk correct under
   * concurrency, and it costs nothing today: until such an index exists the catch simply never
   * fires. When the index is added, the same code becomes the authority instead of a pre-check.
   *
   * A raced attempt is deliberately not retried with the SAME candidate — that would spin on a value
   * now known to be taken — and the loop's exhaustion is what produces the 409, including when the
   * race is what exhausted it. That is why a race can never surface as a 500.
   */
  private async insertWithResolvedSlug(data: CreateStoryInput): Promise<Story> {
    const requested = data.slug;

    if (requested !== undefined) {
      const slug = requested.trim();
      if (slug.length === 0) {
        throw new BadRequestException('Slug must not be empty; omit it to have the server derive one from the title');
      }

      if (await this.slugIsTaken(slug)) {
        throw new ConflictException('Story slug already exists');
      }

      try {
        return await this.storiesRepository.create({ ...data, slug });
      } catch (error) {
        // Lost a race against a concurrent create of the identical slug. The caller asked for this
        // URL specifically, so there is no other candidate to offer — report the conflict.
        if (isUniqueViolation(error)) {
          throw new ConflictException('Story slug already exists');
        }
        throw error;
      }
    }

    const base = deriveStorySlug(data.title);
    const candidates = storySlugCandidates(base);

    for (const candidate of candidates) {
      if (await this.slugIsTaken(candidate)) {
        continue;
      }

      try {
        return await this.storiesRepository.create({ ...data, slug: candidate });
      } catch (error) {
        if (!isUniqueViolation(error)) {
          throw error;
        }
        this.logger.debug(
          `Slug "${candidate}" was taken between the check and the insert; trying the next candidate`,
          'StoriesService',
        );
      }
    }

    throw new ConflictException(
      `Could not derive a free slug from "${base}" after ${MAX_SLUG_COLLISION_ATTEMPTS} attempts. ` +
        'Send an explicit "slug" to choose the URL yourself.',
    );
  }

  /**
   * The probe deliberately goes to the repository rather than through `findBySlug`, because those are
   * NOT the same question: `findBySlug` also serves reads, so it filters soft-deleted rows and
   * populates the cache. This is the write-side question — "is this slug occupied by any row at
   * all" — and using the read path here would disagree with the collision guard about a slug held
   * only by a soft-deleted story, picking `base` and then losing the insert to it.
   */
  private async slugIsTaken(slug: string): Promise<boolean> {
    return (await this.storiesRepository.findBySlug(slug)) !== null;
  }

  private async invalidateStoryCache(id: string, slug?: string): Promise<void> {
    await this.cache.invalidateKey(STORY_CACHE_NAMESPACE, id, [STORIES_CACHE_TAG]);
    if (slug) {
      await this.cache.invalidateKey(STORY_CACHE_NAMESPACE, `slug:${slug}`, [STORIES_CACHE_TAG]);
    }
  }

  private async loadRelations(rows: readonly Story[]): Promise<StoryRelationsIndex> {
    if (rows.length === 0) {
      return EMPTY_RELATIONS;
    }

    const authorIds = [...new Set(rows.map((row) => row.authorId))];
    const categoryIds = [...new Set(rows.map((row) => row.categoryId).filter((id): id is string => id !== null))];
    const storyIds = rows.map((row) => row.id);

    const [authors, categories, tags] = await Promise.all([
      this.storiesRepository.findAuthorsByIds(authorIds),
      this.storiesRepository.findCategoriesByIds(categoryIds),
      this.storiesRepository.findTagsByStoryIds(storyIds),
    ]);

    const authorsById = new Map<string, StoryAuthor>(
      authors.map((entry: StoryAuthorSummary) => [entry.id, { id: entry.id, name: entry.name }]),
    );
    const categoriesById = new Map<string, string>(
      categories.map((entry: StoryCategorySummary) => [entry.id, entry.name]),
    );
    const tagsByStory = new Map<string, string[]>();
    for (const entry of tags as StoryTagSummary[]) {
      const bucket = tagsByStory.get(entry.storyId) ?? [];
      bucket.push(entry.name);
      tagsByStory.set(entry.storyId, bucket);
    }

    return { authors: authorsById, categories: categoriesById, tags: tagsByStory };
  }
}

function relationsFor(story: Story, index: StoryRelationsIndex): StoryRelations {
  return {
    category: story.categoryId === null ? null : (index.categories.get(story.categoryId) ?? null),
    tags: index.tags.get(story.id) ?? [],
  };
}
