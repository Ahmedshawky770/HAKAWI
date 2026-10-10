import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { AdminRole } from '../../common/constants/roles.ts';
import { TaggedCacheService } from '../shared/cache/tagged-cache.service.ts';
import { EventValidatorService } from '../../common/events/event-validator.service.ts';
import { MAX_SLUG_COLLISION_ATTEMPTS } from './dto/story-slug.ts';
import { SEARCH_CACHE_TAG } from '../search/cache-keys.ts';
import { STORIES_CACHE_TAG, STORY_CACHE_NAMESPACE } from './stories.service.ts';

import { StoriesService } from './stories.service.ts';
import type { StoryViewer } from './story-visibility.ts';
import { UNPUBLISHED_STORY_STATUSES } from './types.ts';
import type { Story, CreateStoryInput, UpdateStoryInput } from './types.ts';

// vi.mocked() returns `any` when the mock property is typed ReturnType<typeof vi.fn> (= any).
// This is a vitest typing limitation — mocks are correctly typed and tests pass.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

type MockStoriesRepository = {
  findById: ReturnType<typeof vi.fn<(id: string) => Promise<Story | null>>>;
  findBySlug: ReturnType<typeof vi.fn<(slug: string) => Promise<Story | null>>>;
  findAll: ReturnType<
    typeof vi.fn<
      (params: {
        page?: number;
        limit?: number;
        authorId?: string;
        categoryId?: string;
        status?: string | readonly string[];
        search?: string;
      }) => Promise<{ stories: Story[]; total: number }>
    >
  >;
  create: ReturnType<typeof vi.fn<(data: CreateStoryInput) => Promise<Story>>>;
  update: ReturnType<typeof vi.fn<(id: string, data: UpdateStoryInput) => Promise<Story>>>;
  softDelete: ReturnType<typeof vi.fn<(id: string) => Promise<void>>>;
  incrementViewCount: ReturnType<typeof vi.fn<(id: string) => Promise<void>>>;
  incrementLikeCount: ReturnType<typeof vi.fn<(id: string) => Promise<void>>>;
  decrementLikeCount: ReturnType<typeof vi.fn<(id: string) => Promise<void>>>;
  incrementCommentCount: ReturnType<typeof vi.fn<(id: string) => Promise<void>>>;
  decrementCommentCount: ReturnType<typeof vi.fn<(id: string) => Promise<void>>>;
  findAuthorsByIds: ReturnType<typeof vi.fn<(authorIds: string[]) => Promise<{ id: string; name: string }[]>>>;
  findCategoriesByIds: ReturnType<typeof vi.fn<(categoryIds: string[]) => Promise<{ id: string; name: string }[]>>>;
  findTagsByStoryIds: ReturnType<typeof vi.fn<(storyIds: string[]) => Promise<{ storyId: string; name: string }[]>>>;
  replaceTags: ReturnType<typeof vi.fn<(storyId: string, names: readonly string[]) => Promise<void>>>;
};

type MockWinstonLoggerService = {
  info: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  verbose: ReturnType<typeof vi.fn>;
};

type MockTaggedCacheService = {
  store: FakeTaggedCacheStore;
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  getOrSet: ReturnType<typeof vi.fn>;
  invalidateKey: ReturnType<typeof vi.fn>;
  invalidateTags: ReturnType<typeof vi.fn>;
};

type GetOrSetLike = {
  namespace: string;
  key: string;
  tags: readonly string[];
  load: () => Promise<unknown>;
  revive?: (value: never) => never;
};

/**
 * A stand-in for `TaggedCacheService` with the behaviour that decides whether invalidation is
 * correct: values are stored as JSON **text**, indexed per tag, and a targeted `invalidateKey`
 * drops the key from its tag index without touching any other key.
 *
 * The double this replaced was a set of `vi.fn()` mocks that recorded which methods were called.
 * It could not have caught a cache that evicted every story on every view, because asserting
 * "invalidateTags was called with ['stories']" *was* the bug — the mock recorded the call, the
 * suite went green, and production lost its whole cache to the first page view.
 */
class FakeTaggedCacheStore {
  readonly entries = new Map<string, string>();
  readonly tagIndex = new Map<string, Set<string>>();
  readonly generations = new Map<string, number>();

  private buildKey(namespace: string, key: string): string {
    return `cache:${namespace}:${key}`;
  }

  private bump(tags: readonly string[]): void {
    for (const tag of tags) {
      this.generations.set(tag, (this.generations.get(tag) ?? 0) + 1);
    }
  }

  cached(namespace: string, key: string): boolean {
    return this.entries.has(this.buildKey(namespace, key));
  }

  trackedBy(tag: string): readonly string[] {
    return [...(this.tagIndex.get(tag) ?? new Set<string>())];
  }

  async getOrSet<T>(options: GetOrSetLike): Promise<{ value: T; hit: boolean }> {
    const cacheKey = this.buildKey(options.namespace, options.key);
    const cached = this.entries.get(cacheKey);
    if (cached !== undefined) {
      const parsed: unknown = JSON.parse(cached);
      const revived = options.revive ? options.revive(parsed as never) : parsed;
      return { value: revived as T, hit: true };
    }
    const generations = options.tags.map((tag) => this.generations.get(tag) ?? 0);
    const loaded = (await options.load()) as T;
    const invalidated = options.tags.some((tag, index) => generations[index] !== (this.generations.get(tag) ?? 0));
    if (!invalidated) {
      this.entries.set(cacheKey, JSON.stringify(loaded));
      for (const tag of options.tags) {
        const index = this.tagIndex.get(tag) ?? new Set<string>();
        index.add(cacheKey);
        this.tagIndex.set(tag, index);
      }
    }
    return { value: loaded, hit: false };
  }

  async invalidateKey(namespace: string, key: string, tags: readonly string[] = []): Promise<void> {
    const cacheKey = this.buildKey(namespace, key);
    this.entries.delete(cacheKey);
    for (const tag of tags) {
      this.tagIndex.get(tag)?.delete(cacheKey);
    }
    this.bump(tags);
  }

  async invalidateTags(tags: readonly string[]): Promise<number> {
    let removed = 0;
    for (const tag of tags) {
      for (const cacheKey of this.tagIndex.get(tag) ?? new Set<string>()) {
        this.entries.delete(cacheKey);
        removed += 1;
      }
      this.tagIndex.delete(tag);
    }
    this.bump(tags);
    return removed;
  }
}

type MockEventValidatorService = {
  emit: ReturnType<typeof vi.fn>;
  validateEvent: ReturnType<typeof vi.fn>;
};

/** Wires spies around the behavioural double, so call assertions still work. */
function createCacheDouble(): MockTaggedCacheService {
  const store = new FakeTaggedCacheStore();
  return {
    store,
    get: vi.fn(),
    set: vi.fn(),
    getOrSet: vi.fn((options: GetOrSetLike) => store.getOrSet(options)),
    invalidateKey: vi.fn((namespace: string, key: string, tags?: readonly string[]) =>
      store.invalidateKey(namespace, key, tags),
    ),
    invalidateTags: vi.fn((tags: readonly string[]) => store.invalidateTags(tags)),
  };
}

describe('StoriesService', () => {
  let storiesService: StoriesService;
  let storiesRepository: MockStoriesRepository;
  let logger: MockWinstonLoggerService;
  let cache: MockTaggedCacheService;
  let eventValidatorService: MockEventValidatorService;

  const mockStory: Story = {
    id: 'story-123',
    authorId: 'user-123',
    title: 'Test Story',
    slug: 'test-story',
    excerpt: 'Test excerpt',
    content: '<p>Test content</p>',
    coverImage: 'https://example.com/cover.jpg',
    status: 'draft',
    categoryId: null,
    viewCount: 0,
    likeCount: 0,
    commentCount: 0,
    readingTime: 5,
    publishedAt: null,
    deletedAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  /**
   * `mockStory` is a DRAFT, and both read paths now decide visibility from `status`, so every read
   * below has to name a viewer. `AUTHOR_VIEWER` is the author — the one population an unpublished
   * story is readable to besides a content moderator. Omitting the argument is the anonymous case,
   * and it is asserted separately rather than used by accident here.
   */
  const AUTHOR_VIEWER: StoryViewer = { sub: mockStory.authorId, accountType: 'writer' };

  beforeEach(() => {
    storiesRepository = {
      findById: vi.fn<(id: string) => Promise<Story | null>>(),
      findBySlug: vi.fn<(slug: string) => Promise<Story | null>>(),
      findAll:
        vi.fn<
          (params: {
            page?: number;
            limit?: number;
            authorId?: string;
            categoryId?: string;
            status?: string | readonly string[];
            search?: string;
          }) => Promise<{ stories: Story[]; total: number }>
        >(),
      create: vi.fn<(data: CreateStoryInput) => Promise<Story>>(),
      update: vi.fn<(id: string, data: UpdateStoryInput) => Promise<Story>>(),
      softDelete: vi.fn<(id: string) => Promise<void>>(),
      incrementViewCount: vi.fn<(id: string) => Promise<void>>(),
      incrementLikeCount: vi.fn<(id: string) => Promise<void>>(),
      decrementLikeCount: vi.fn<(id: string) => Promise<void>>(),
      incrementCommentCount: vi.fn<(id: string) => Promise<void>>(),
      decrementCommentCount: vi.fn<(id: string) => Promise<void>>(),
      findAuthorsByIds: vi.fn<(authorIds: string[]) => Promise<{ id: string; name: string }[]>>(),
      findCategoriesByIds: vi.fn<(categoryIds: string[]) => Promise<{ id: string; name: string }[]>>(),
      findTagsByStoryIds: vi.fn<(storyIds: string[]) => Promise<{ storyId: string; name: string }[]>>(),
      replaceTags: vi.fn<(storyId: string, names: readonly string[]) => Promise<void>>().mockResolvedValue(undefined),
    };

    logger = {
      info: vi.fn(),
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
    };

    cache = createCacheDouble();

    eventValidatorService = {
      emit: vi.fn(),
      validateEvent: vi.fn(),
    };

    vi.mocked(storiesRepository.findAuthorsByIds).mockResolvedValue([]);
    vi.mocked(storiesRepository.findCategoriesByIds).mockResolvedValue([]);
    vi.mocked(storiesRepository.findTagsByStoryIds).mockResolvedValue([]);

    storiesService = new StoriesService(
      storiesRepository,
      logger as unknown as WinstonLoggerService,
      cache as unknown as TaggedCacheService,
      eventValidatorService as unknown as EventValidatorService,
    );
  });

  describe('create', () => {
    it('should create a story successfully', async () => {
      const createInput: CreateStoryInput = {
        authorId: 'author-123',
        title: 'New Story',
        slug: 'new-story',
        content: '<p>Content</p>',
        categoryId: null,
      };

      vi.mocked(storiesRepository.findBySlug).mockResolvedValue(null);
      vi.mocked(storiesRepository.create).mockResolvedValue({
        ...mockStory,
        ...createInput,
        id: 'story-123',
      });

      const result = await storiesService.create('author-123', createInput);

      expect(result).toHaveProperty('id', 'story-123');
      expect(result.title).toBe('New Story');
      expect(result.slug).toBe('new-story');
      expect(result.status).toBe('draft');
      expect(storiesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          authorId: 'author-123',
          title: 'New Story',
          slug: 'new-story',
          status: 'draft',
        }),
      );
      expect(eventValidatorService.emit).toHaveBeenCalledWith('story.created', expect.any(Object));
    });

    it('should throw ConflictException when slug already exists', async () => {
      const createInput: CreateStoryInput = {
        authorId: 'author-123',
        title: 'New Story',
        slug: 'existing-slug',
      };

      vi.mocked(storiesRepository.findBySlug).mockResolvedValue(mockStory);

      await expect(storiesService.create('author-123', createInput)).rejects.toThrow('Story slug already exists');
    });

    it('should propagate repository error on slug check', async () => {
      const createInput: CreateStoryInput = {
        authorId: 'author-123',
        title: 'New Story',
        slug: 'new-story',
      };

      vi.mocked(storiesRepository.findBySlug).mockRejectedValue(new Error('DB error'));

      await expect(storiesService.create('author-123', createInput)).rejects.toThrow('DB error');
    });
  });

  /**
   * The slug is optional, so the service — not the caller and not the controller — is what decides
   * what a story's public URL is. These tests pin that decision, because it used to be unsatisfiable:
   * `CreateStoryDto` required a slug that no client in the repository ever sent, so every
   * `POST /stories` was a 400 before it reached this method.
   */
  describe('create slug derivation', () => {
    const acceptsInsert = () => {
      vi.mocked(storiesRepository.findBySlug).mockResolvedValue(null);
      vi.mocked(storiesRepository.create).mockImplementation(async (data) => ({ ...mockStory, ...data }));
    };

    it('should derive the slug from the title when the input carries none', async () => {
      acceptsInsert();

      await storiesService.create('author-123', { authorId: 'author-123', title: 'The Lighthouse' });

      expect(storiesRepository.create).toHaveBeenCalledWith(expect.objectContaining({ slug: 'the-lighthouse' }));
    });

    it('should transliterate diacritics so no caller has to', async () => {
      acceptsInsert();

      await storiesService.create('author-123', { authorId: 'author-123', title: 'Café  au  Lait!' });

      expect(storiesRepository.create).toHaveBeenCalledWith(expect.objectContaining({ slug: 'cafe-au-lait' }));
    });

    it('should reject a title it cannot slugify instead of writing an empty slug', async () => {
      acceptsInsert();

      // Arabic survives NFKD but has no [a-z0-9], so the derived value would be ''. An empty slug
      // satisfies the column's NOT NULL and would collide with every other empty slug forever.
      await expect(
        storiesService.create('author-123', { authorId: 'author-123', title: 'ليلة في الحارة' }),
      ).rejects.toThrow(BadRequestException);
      expect(storiesRepository.create).not.toHaveBeenCalled();
    });

    it('should walk to the first free suffix when the derived slug is taken', async () => {
      vi.mocked(storiesRepository.findBySlug).mockImplementation(async (slug: string) =>
        slug === 'the-lighthouse' || slug === 'the-lighthouse-2' ? { ...mockStory, slug } : null,
      );
      vi.mocked(storiesRepository.create).mockImplementation(async (data) => ({ ...mockStory, ...data }));

      await storiesService.create('author-123', { authorId: 'author-123', title: 'The Lighthouse' });

      expect(storiesRepository.create).toHaveBeenCalledWith(expect.objectContaining({ slug: 'the-lighthouse-3' }));
    });

    it('should fail loudly with a 409 once the bounded walk is exhausted', async () => {
      vi.mocked(storiesRepository.findBySlug).mockImplementation(async (slug: string) => ({
        ...mockStory,
        slug,
      }));

      await expect(
        storiesService.create('author-123', { authorId: 'author-123', title: 'The Lighthouse' }),
      ).rejects.toThrow(ConflictException);
      expect(storiesRepository.create).not.toHaveBeenCalled();
    });

    it('should ask about at most the documented number of candidates', async () => {
      const asked: string[] = [];
      vi.mocked(storiesRepository.findBySlug).mockImplementation(async (slug: string) => {
        asked.push(slug);
        return { ...mockStory, slug };
      });

      await expect(
        storiesService.create('author-123', { authorId: 'author-123', title: 'The Lighthouse' }),
      ).rejects.toThrow(ConflictException);
      expect(asked).toHaveLength(MAX_SLUG_COLLISION_ATTEMPTS);
    });

    it('should take the next candidate when it loses the insert race', async () => {
      // `stories.slug` has no unique index today (stories.schema.ts:70 declares a plain non-unique
      // index), so this catch is what keeps the walk correct the moment one is added — and it is the
      // only defence that works, because a check-then-insert has a window between the two.
      vi.mocked(storiesRepository.findBySlug).mockResolvedValue(null);
      vi.mocked(storiesRepository.create)
        .mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: '23505' }))
        .mockImplementation(async (data) => ({ ...mockStory, ...data }));

      await storiesService.create('author-123', { authorId: 'author-123', title: 'The Lighthouse' });

      expect(storiesRepository.create).toHaveBeenCalledTimes(2);
      expect(storiesRepository.create).toHaveBeenLastCalledWith(expect.objectContaining({ slug: 'the-lighthouse-2' }));
    });

    it('should never retry a candidate it already knows is taken', async () => {
      vi.mocked(storiesRepository.findBySlug).mockResolvedValue(null);
      vi.mocked(storiesRepository.create).mockRejectedValue(
        Object.assign(new Error('duplicate key'), { code: '23505' }),
      );

      await expect(
        storiesService.create('author-123', { authorId: 'author-123', title: 'The Lighthouse' }),
      ).rejects.toThrow(ConflictException);
      // Bounded, and it ends in a 409 rather than a 500 — a race can never surface as a server error.
      expect(storiesRepository.create).toHaveBeenCalledTimes(MAX_SLUG_COLLISION_ATTEMPTS);
    });

    it('should not swallow a non-uniqueness write failure', async () => {
      vi.mocked(storiesRepository.findBySlug).mockResolvedValue(null);
      vi.mocked(storiesRepository.create).mockRejectedValue(new Error('connection terminated'));

      await expect(
        storiesService.create('author-123', { authorId: 'author-123', title: 'The Lighthouse' }),
      ).rejects.toThrow('connection terminated');
      expect(storiesRepository.create).toHaveBeenCalledTimes(1);
    });

    it('should treat a slug held only by a soft-deleted story as taken', async () => {
      // The probe reads the repository rather than the cached read path, because `findBySlug` on the
      // service filters soft-deleted rows — and two stories cannot share a URL just because one of
      // them was deleted.
      vi.mocked(storiesRepository.findBySlug).mockImplementation(async (slug: string) =>
        slug === 'the-lighthouse' ? { ...mockStory, slug, deletedAt: new Date() } : null,
      );
      vi.mocked(storiesRepository.create).mockImplementation(async (data) => ({ ...mockStory, ...data }));

      await storiesService.create('author-123', { authorId: 'author-123', title: 'The Lighthouse' });

      expect(storiesRepository.create).toHaveBeenCalledWith(expect.objectContaining({ slug: 'the-lighthouse-2' }));
    });

    it('should honor a client-supplied slug verbatim and never append a suffix to it', async () => {
      acceptsInsert();

      await storiesService.create('author-123', { authorId: 'author-123', title: 'Anything', slug: 'my-url' });

      expect(storiesRepository.create).toHaveBeenCalledWith(expect.objectContaining({ slug: 'my-url' }));
    });

    it('should report a conflict rather than rewriting a client-supplied slug', async () => {
      vi.mocked(storiesRepository.findBySlug).mockResolvedValue(mockStory);

      await expect(
        storiesService.create('author-123', { authorId: 'author-123', title: 'New Story', slug: 'my-url' }),
      ).rejects.toThrow('Story slug already exists');
    });

    it('should report a conflict when a client-supplied slug loses the insert race', async () => {
      vi.mocked(storiesRepository.findBySlug).mockResolvedValue(null);
      vi.mocked(storiesRepository.create).mockRejectedValue(
        Object.assign(new Error('duplicate key'), { code: '23505' }),
      );

      await expect(
        storiesService.create('author-123', { authorId: 'author-123', title: 'New Story', slug: 'my-url' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject a null or blank slug as a 400 rather than throwing a TypeError', async () => {
      // `@IsOptional()` skips validation for null, so { slug: null } reaches the service and used to
      // die on `.trim()` -> 500.
      vi.mocked(storiesRepository.findBySlug).mockResolvedValue(null);

      await expect(
        storiesService.create('author-123', { authorId: 'author-123', title: 'New Story', slug: '   ' }),
      ).rejects.toThrow(BadRequestException);
      expect(storiesRepository.create).not.toHaveBeenCalled();
    });

    it('should force the draft status and zeroed counters regardless of what the input carried', async () => {
      acceptsInsert();

      await storiesService.create('author-123', {
        authorId: 'author-123',
        title: 'New Story',
        status: 'published',
        viewCount: 99,
      });

      expect(storiesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'draft', viewCount: 0, likeCount: 0, commentCount: 0 }),
      );
    });

    it('should emit the created event with the resolved story id AND the story snapshot', async () => {
      // This assertion used to stop at the id, which is why the Sanity integration stayed dead for
      // the whole life of the codebase: `SanitySyncEventHandler` read `event.story` and returned on
      // a missing snapshot, so every handler no-opped while this test stayed green. The producer
      // contract is what a consumer-only test cannot prove, so it is pinned here.
      acceptsInsert();

      await storiesService.create('author-123', { authorId: 'author-123', title: 'The Lighthouse' });

      expect(eventValidatorService.emit).toHaveBeenCalledWith('story.created', {
        storyId: mockStory.id,
        authorId: 'author-123',
        // The snapshot is the row that was actually created — the caller's authorId and the
        // slug derived from the title — not the `mockStory` fixture. A snapshot built from anything
        // other than the created row would publish a Sanity document for a story that does not
        // exist under that slug.
        story: expect.objectContaining({
          id: mockStory.id,
          authorId: 'author-123',
          title: 'The Lighthouse',
          slug: 'the-lighthouse',
        }),
      });
    });
  });

  /**
   * The producer side of the Sanity sync contract.
   *
   * `SanitySyncEventHandler` reads the story off the event and no-ops on a missing snapshot, so
   * every handler was inert while the suite stayed green: nothing asserted that the producer ever
   * SET the snapshot. A consumer-only test cannot catch that, so it is pinned from here.
   */
  describe('event snapshots for the Sanity sync', () => {
    it('should attach a snapshot to the published event, built from the RETURNED row', async () => {
      // Not from the update input: `UpdateStoryInput` carries no id, no slug and an unset status, so
      // a Sanity document built from it would be almost entirely empty while the event still looked
      // well-formed.
      vi.mocked(storiesRepository.findById).mockResolvedValue(mockStory);
      vi.mocked(storiesRepository.update).mockResolvedValue({
        ...mockStory,
        status: 'published',
        publishedAt: new Date('2026-05-06T07:08:09.000Z'),
      });

      await storiesService.publish(mockStory.id, 'user-123');

      // `publish` mints its own `new Date()` and hands it to the repository, so the emitted
      // timestamp is the wall clock rather than the mocked value. The contract worth pinning is the
      // SNAPSHOT: that it is the returned row, carrying the new status and that same timestamp.
      expect(eventValidatorService.emit).toHaveBeenCalledWith('story.published', {
        storyId: mockStory.id,
        publishedAt: expect.any(Date),
        story: expect.objectContaining({
          id: mockStory.id,
          slug: mockStory.slug,
          status: 'published',
          publishedAt: expect.any(Date),
        }),
      });
    });

    it('should attach a snapshot to the updated event', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue(mockStory);
      vi.mocked(storiesRepository.update).mockResolvedValue({ ...mockStory, title: 'A New Title' });

      await storiesService.update(mockStory.id, { title: 'A New Title' }, 'user-123');

      expect(eventValidatorService.emit).toHaveBeenCalledWith('story.updated', {
        storyId: mockStory.id,
        updatedFields: { title: 'A New Title' },
        story: expect.objectContaining({
          id: mockStory.id,
          title: 'A New Title',
          slug: mockStory.slug,
          status: 'draft',
        }),
      });
    });

    it('should attach a snapshot to the archived event, so unpublishing reaches the CMS', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue(mockStory);
      vi.mocked(storiesRepository.update).mockResolvedValue({ ...mockStory, status: 'archived' });

      await storiesService.archive(mockStory.id, 'user-123');

      expect(eventValidatorService.emit).toHaveBeenCalledWith('story.archived', {
        storyId: mockStory.id,
        story: expect.objectContaining({ status: 'archived' }),
      });
    });
  });

  describe('findById', () => {
    it('should return a story by id', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue(mockStory);
      vi.mocked(storiesRepository.findAuthorsByIds).mockResolvedValue([]);
      vi.mocked(storiesRepository.findCategoriesByIds).mockResolvedValue([]);
      vi.mocked(storiesRepository.findTagsByStoryIds).mockResolvedValue([]);

      const result = await storiesService.findById('story-123', AUTHOR_VIEWER);

      expect(result).toEqual(mockStory);
      expect(storiesRepository.findById).toHaveBeenCalledWith('story-123');
    });

    it('should throw NotFoundException when story not found', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue(null);

      await expect(storiesService.findById('story-999')).rejects.toThrow('Story not found');
    });
  });

  describe('findBySlug', () => {
    it('should return a story by slug', async () => {
      vi.mocked(storiesRepository.findBySlug).mockResolvedValue(mockStory);

      const result = await storiesService.findBySlug('test-story', AUTHOR_VIEWER);

      expect(result).toEqual(mockStory);
      expect(storiesRepository.findBySlug).toHaveBeenCalledWith('test-story');
    });

    it('should throw NotFoundException when story not found', async () => {
      vi.mocked(storiesRepository.findBySlug).mockResolvedValue(null);

      await expect(storiesService.findBySlug('non-existent')).rejects.toThrow('Story not found');
    });
  });

  /**
   * The rule, at the layer that owns it. `GET /stories/:id` and `GET /stories/slug/:slug` are
   * `@Public()`, so an unpublished story used to be world-readable by both keys with no account,
   * while `GET /stories` had already been pinned to `published` — one rule, two answers.
   *
   * The denial is 404 rather than 403 so the response cannot be used as an oracle for which ids and
   * slugs hold unpublished work; the tests below pin the *message* as well as the status, because a
   * denial that named its reason would leak the very thing it hides.
   */
  describe('unpublished story visibility', () => {
    const archivedStory: Story = { ...mockStory, status: 'archived' };

    it.each([
      { status: 'draft', story: mockStory },
      { status: 'archived', story: archivedStory },
    ])('should refuse a story whose status is $status to an anonymous caller by id', async ({ story }) => {
      vi.mocked(storiesRepository.findById).mockResolvedValue(story);

      await expect(storiesService.findById('story-123')).rejects.toThrow('Story not found');
    });

    it.each([
      { status: 'draft', story: mockStory },
      { status: 'archived', story: archivedStory },
    ])('should refuse a story whose status is $status to an anonymous caller by slug', async ({ story }) => {
      vi.mocked(storiesRepository.findBySlug).mockResolvedValue(story);

      await expect(storiesService.findBySlug('test-story')).rejects.toThrow('Story not found');
    });

    it('should let the author read their own draft, which is what the edit page depends on', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue(mockStory);

      await expect(storiesService.findById('story-123', AUTHOR_VIEWER)).resolves.toMatchObject({
        id: 'story-123',
        status: 'draft',
      });
    });

    it('should refuse a draft to an authenticated stranger', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue(mockStory);

      await expect(
        storiesService.findById('story-123', { sub: 'someone-else', accountType: 'writer' }),
      ).rejects.toThrow('Story not found');
    });

    it('should let a content moderator read an unpublished story it did not write', async () => {
      vi.mocked(storiesRepository.findBySlug).mockResolvedValue(mockStory);

      await expect(
        storiesService.findBySlug('test-story', {
          sub: 'moderator-1',
          accountType: 'reader',
          adminRole: AdminRole.CONTENT_MODERATOR,
        }),
      ).resolves.toMatchObject({ id: 'story-123' });
    });

    it('should refuse a reader whose account type grants no moderation authority', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue(mockStory);

      // A `writer` holds `stories:edit:own` — its own — and no `:all` and no `content:moderate`. The
      // point of using the permission table rather than a role list is that this case is decided by
      // the same table `PermissionsGuard` reads, so the two cannot disagree about who moderates.
      await expect(
        storiesService.findById('story-123', { sub: 'other-writer', accountType: 'writer' }),
      ).rejects.toThrow('Story not found');
    });

    it('should answer the unpublished read with the same 404 as an id that does not exist', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue(mockStory);

      const denied = await storiesService.findById('story-123').catch((error: unknown) => error);
      vi.mocked(storiesRepository.findById).mockResolvedValue(null);
      const missing = await storiesService.findById('story-999').catch((error: unknown) => error);

      expect(denied).toBeInstanceOf(NotFoundException);
      expect(missing).toBeInstanceOf(NotFoundException);
      expect((denied as NotFoundException).getStatus()).toBe((missing as NotFoundException).getStatus());
      expect((denied as NotFoundException).message).toBe((missing as NotFoundException).message);
    });

    /**
     * The cache case. The row is cached by the author's read, so the anonymous read that follows is
     * a HIT — and `load` never runs, so a check placed inside `load` would not have executed. The
     * rule runs on the value the cache returned, which is the only reason this passes.
     */
    it('should refuse a CACHED draft to an anonymous caller, not only a cold one', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue(mockStory);

      await storiesService.findById('story-123', AUTHOR_VIEWER);
      expect(cache.store.cached('story', 'story-123')).toBe(true);
      vi.mocked(storiesRepository.findById).mockClear();

      await expect(storiesService.findById('story-123')).rejects.toThrow('Story not found');
      expect(storiesRepository.findById).not.toHaveBeenCalled();
    });

    it('should leave the cached entry in place after refusing it, so the author still reads warm', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue(mockStory);

      await storiesService.findById('story-123', AUTHOR_VIEWER);
      await expect(storiesService.findById('story-123')).rejects.toThrow('Story not found');

      await expect(storiesService.findById('story-123', AUTHOR_VIEWER)).resolves.toMatchObject({
        id: 'story-123',
      });
    });
  });

  describe('findAll', () => {
    it('should return paginated stories', async () => {
      const mockStories = [mockStory];
      vi.mocked(storiesRepository.findAll).mockResolvedValue({ stories: mockStories, total: 1 });

      const result = await storiesService.findAll({ page: 1, limit: 20 });

      expect(result.stories).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(storiesRepository.findAll).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        authorId: undefined,
        categoryId: undefined,
        status: undefined,
        search: undefined,
      });
    });

    it('should pass filters to repository', async () => {
      vi.mocked(storiesRepository.findAll).mockResolvedValue({ stories: [], total: 0 });

      await storiesService.findAll({ page: 2, limit: 10, authorId: 'author-123', status: 'published', search: 'test' });

      expect(storiesRepository.findAll).toHaveBeenCalledWith({
        page: 2,
        limit: 10,
        authorId: 'author-123',
        categoryId: undefined,
        status: 'published',
        search: 'test',
      });
    });
  });

  /**
   * The author-scoped list behind `GET /stories/mine`.
   *
   * It is the answer to a real defect: the public list is pinned to `published`, so a draft created at
   * 201 could not be listed by anyone, including its author. These cases pin the two halves of the
   * rule — WHO the rows belong to (the `authorId` argument, never a filter the caller chose) and WHICH
   * statuses count (the unpublished set, computed here rather than at the route so no handler can
   * forget it).
   */
  describe('findUnpublishedByAuthor', () => {
    beforeEach(() => {
      vi.mocked(storiesRepository.findAll).mockResolvedValue({ stories: [], total: 0 });
    });

    it('should scope to the given author and to the unpublished statuses when nothing was narrowed', async () => {
      await storiesService.findUnpublishedByAuthor('user-123', {});

      expect(storiesRepository.findAll).toHaveBeenCalledWith({
        page: undefined,
        limit: undefined,
        search: undefined,
        categoryId: undefined,
        authorId: 'user-123',
        status: UNPUBLISHED_STORY_STATUSES,
      });
    });

    it('should carry the pagination and filters through to the same single query', async () => {
      await storiesService.findUnpublishedByAuthor('user-123', {
        page: 3,
        limit: 5,
        search: 'night',
        categoryId: 'cat-1',
      });

      const forwarded = vi.mocked(storiesRepository.findAll).mock.calls[0]?.[0] as Record<string, unknown>;
      expect(forwarded).toMatchObject({
        page: 3,
        limit: 5,
        search: 'night',
        categoryId: 'cat-1',
        authorId: 'user-123',
      });
      // One statement, not one per status: `total` and the page window are computed from the same
      // predicate, and a merge of two queries could not keep them describing the same row set.
      expect(storiesRepository.findAll).toHaveBeenCalledTimes(1);
    });

    it.each(['draft', 'archived'])('should narrow to the single unpublished status %s', async (status) => {
      await storiesService.findUnpublishedByAuthor('user-123', { status });

      expect(storiesRepository.findAll).toHaveBeenCalledWith(expect.objectContaining({ status: [status] }));
    });

    /**
     * Fail closed. `status: 'published'` cannot reach here from HTTP (the DTO answers 400), but the
     * method is exported and the repository is a token away, and a method named
     * `findUnpublishedByAuthor` that could return a published story would be a lie in its own name.
     * The intersection is empty, and an empty set is `inArray`'s `false` — never "no filter".
     */
    it('should narrow to nothing rather than forward a status that is not unpublished', async () => {
      await storiesService.findUnpublishedByAuthor('user-123', { status: 'published' });

      expect(storiesRepository.findAll).toHaveBeenCalledWith(expect.objectContaining({ status: [] }));
    });

    it('should keep the author in the query even when every other filter is absent', async () => {
      await storiesService.findUnpublishedByAuthor('someone-else', {});

      const forwarded = vi.mocked(storiesRepository.findAll).mock.calls[0]?.[0] as Record<string, unknown>;
      expect(forwarded['authorId']).toBe('someone-else');
      // There is no code path in which the author is omitted: an unscoped list would be the public
      // one, which is the answer this route exists not to give.
      expect(forwarded).not.toHaveProperty('authorId', undefined);
    });

    it('should map the rows through the public list shape, not the write shape', async () => {
      vi.mocked(storiesRepository.findAll).mockResolvedValue({ stories: [mockStory], total: 1 });

      const result = await storiesService.findUnpublishedByAuthor('user-123', {});

      expect(result.total).toBe(1);
      expect(result.stories[0]).toMatchObject({ id: 'story-123', status: 'draft', views: 0 });
      // `toStoryResponse`, so the list beside it and this one cannot grow different contracts. The
      // author's own id is never echoed back on a list — `authorId` is an argument, not a field.
      expect(result.stories[0]).not.toHaveProperty('authorId');
    });
  });

  describe('update', () => {
    it('should update a story successfully', async () => {
      const updateInput: UpdateStoryInput = {
        title: 'Updated Title',
        content: '<p>Updated content</p>',
      };

      vi.mocked(storiesRepository.findById).mockResolvedValue(mockStory);
      vi.mocked(storiesRepository.update).mockResolvedValue({
        ...mockStory,
        ...updateInput,
      });

      const result = await storiesService.update('story-123', updateInput, 'user-123');

      expect(result.title).toBe('Updated Title');
      expect(result.content).toBe('<p>Updated content</p>');
      expect(storiesRepository.update).toHaveBeenCalledWith('story-123', expect.objectContaining(updateInput));
    });

    it('should throw NotFoundException when story not found', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue(null);

      await expect(storiesService.update('story-999', { title: 'New Title' }, 'user-123')).rejects.toThrow(
        'Story not found',
      );
    });
  });

  describe('publish', () => {
    it('should publish a draft story', async () => {
      const draftStory = { ...mockStory, status: 'draft', publishedAt: null };
      const publishedStory = { ...draftStory, status: 'published', publishedAt: new Date() };

      vi.mocked(storiesRepository.findById).mockResolvedValue(draftStory);
      vi.mocked(storiesRepository.update).mockResolvedValue(publishedStory);

      const result = await storiesService.publish('story-123', 'user-123');

      expect(result.status).toBe('published');
      expect(result.publishedAt).not.toBeNull();
      expect(storiesRepository.update).toHaveBeenCalledWith(
        'story-123',
        expect.objectContaining({ status: 'published', publishedAt: expect.any(Date) }),
      );
    });

    it('should throw ForbiddenException when story is already published', async () => {
      const publishedStory = { ...mockStory, status: 'published' };
      vi.mocked(storiesRepository.findById).mockResolvedValue(publishedStory);

      await expect(storiesService.publish('story-123', 'user-123')).rejects.toThrow('Story is already published');
    });

    it('should throw ForbiddenException when story is archived', async () => {
      const archivedStory = { ...mockStory, status: 'archived' };
      vi.mocked(storiesRepository.findById).mockResolvedValue(archivedStory);

      await expect(storiesService.publish('story-123', 'user-123')).rejects.toThrow('Cannot publish an archived story');
    });
  });

  describe('archive', () => {
    it('should archive a published story', async () => {
      const publishedStory = { ...mockStory, status: 'published' };
      const archivedStory = { ...publishedStory, status: 'archived' };

      vi.mocked(storiesRepository.findById).mockResolvedValue(publishedStory);
      vi.mocked(storiesRepository.update).mockResolvedValue(archivedStory);

      const result = await storiesService.archive('story-123', 'user-123');

      expect(result.status).toBe('archived');
      expect(storiesRepository.update).toHaveBeenCalledWith(
        'story-123',
        expect.objectContaining({ status: 'archived' }),
      );
    });

    it('should throw ForbiddenException when story is already archived', async () => {
      const archivedStory = { ...mockStory, status: 'archived' };
      vi.mocked(storiesRepository.findById).mockResolvedValue(archivedStory);

      await expect(storiesService.archive('story-123', 'user-123')).rejects.toThrow('Story is already archived');
    });
  });

  describe('delete', () => {
    it('should soft delete a story', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue(mockStory);
      vi.mocked(storiesRepository.softDelete).mockResolvedValue(undefined);

      await storiesService.delete('story-123', 'user-123');

      expect(storiesRepository.softDelete).toHaveBeenCalledWith('story-123');
      expect(eventValidatorService.emit).toHaveBeenCalledWith('story.deleted', expect.any(Object));
    });

    it('should throw NotFoundException when story not found', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue(null);

      await expect(storiesService.delete('story-999', 'user-123')).rejects.toThrow('Story not found');
    });
  });

  describe('incrementViewCount', () => {
    it('should increment view count', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue(mockStory);
      vi.mocked(storiesRepository.incrementViewCount).mockResolvedValue(undefined);

      await storiesService.incrementViewCount('story-123', AUTHOR_VIEWER);

      expect(storiesRepository.incrementViewCount).toHaveBeenCalledWith('story-123');
    });

    it('should throw NotFoundException when story not found', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue(null);

      await expect(storiesService.incrementViewCount('story-999', AUTHOR_VIEWER)).rejects.toThrow('Story not found');
    });

    /**
     * The oracle this route was, closed by reusing the read rule rather than writing a second one.
     *
     * `POST /stories/:id/view` used to take no viewer and incremented for any id that existed, so a
     * 204 confirmed "there is a draft at this id" to any authenticated account — the cheaper version
     * of the leak `GET /stories/:id` had just been closed against. The cases below pin that the
     * refusal is byte-identical to the one for an id that never existed, so this write route cannot
     * confirm a draft at all.
     */
    describe('the same visibility rule the detail routes use', () => {
      const publishedStory: Story = { ...mockStory, status: 'published' };
      const archivedStory: Story = { ...mockStory, status: 'archived' };
      const STRANGER_VIEWER: StoryViewer = { sub: 'someone-else', accountType: 'reader' };

      it.each([
        { status: 'draft', story: mockStory },
        { status: 'archived', story: archivedStory },
      ])('should refuse a $status story to an authenticated stranger', async ({ story }) => {
        vi.mocked(storiesRepository.findById).mockResolvedValue(story);

        await expect(storiesService.incrementViewCount('story-123', STRANGER_VIEWER)).rejects.toThrow(
          'Story not found',
        );
        // The refusal happens BEFORE the write, so a probe cannot even bump the counter.
        expect(storiesRepository.incrementViewCount).not.toHaveBeenCalled();
      });

      it('should let the author count a view on their own draft, as the read rule allows them to read it', async () => {
        vi.mocked(storiesRepository.findById).mockResolvedValue(mockStory);
        vi.mocked(storiesRepository.incrementViewCount).mockResolvedValue(undefined);

        await storiesService.incrementViewCount('story-123', AUTHOR_VIEWER);

        expect(storiesRepository.incrementViewCount).toHaveBeenCalledWith('story-123');
      });

      it('should let a content moderator count a view on unpublished work they did not write', async () => {
        vi.mocked(storiesRepository.findById).mockResolvedValue(mockStory);
        vi.mocked(storiesRepository.incrementViewCount).mockResolvedValue(undefined);

        await storiesService.incrementViewCount('story-123', {
          sub: 'moderator-1',
          accountType: 'reader',
          adminRole: AdminRole.CONTENT_MODERATOR,
        });

        expect(storiesRepository.incrementViewCount).toHaveBeenCalledWith('story-123');
      });

      it('should still count a view for an ordinary reader on a PUBLISHED story', async () => {
        // The normal case, and the reason the route exists. `assertStoryIsReadableBy` returns for a
        // published row without reading a single claim, so nothing here narrows who may count a view
        // on published content.
        vi.mocked(storiesRepository.findById).mockResolvedValue(publishedStory);
        vi.mocked(storiesRepository.incrementViewCount).mockResolvedValue(undefined);

        await storiesService.incrementViewCount('story-123', STRANGER_VIEWER);

        expect(storiesRepository.incrementViewCount).toHaveBeenCalledWith('story-123');
      });

      it('should answer a refused unpublished story exactly as it answers one that does not exist', async () => {
        vi.mocked(storiesRepository.findById).mockResolvedValue(mockStory);

        const denied = await storiesService
          .incrementViewCount('story-123', STRANGER_VIEWER)
          .catch((error: unknown) => error);
        vi.mocked(storiesRepository.findById).mockResolvedValue(null);
        const missing = await storiesService
          .incrementViewCount('story-999', STRANGER_VIEWER)
          .catch((error: unknown) => error);

        expect(denied).toBeInstanceOf(NotFoundException);
        expect(missing).toBeInstanceOf(NotFoundException);
        expect((denied as NotFoundException).getStatus()).toBe((missing as NotFoundException).getStatus());
        expect((denied as NotFoundException).message).toBe((missing as NotFoundException).message);
      });
    });
  });

  describe('incrementViewCount cache invalidation', () => {
    it('should drop the cached story so the next read sees the new count', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue(mockStory);
      vi.mocked(storiesRepository.incrementViewCount).mockResolvedValue(undefined);

      await storiesService.incrementViewCount('story-123', AUTHOR_VIEWER);

      expect(cache.invalidateKey).toHaveBeenCalledWith('story', 'story-123', ['stories']);
      expect(cache.invalidateKey).toHaveBeenCalledWith('story', 'slug:test-story', ['stories']);
    });

    /**
     * The regression this whole class of change exists for. `invalidateStoryCache` used to end
     * with `invalidateTags([STORIES_CACHE_TAG])`, and the `stories` tag indexes every story id
     * *and* every story slug — so one page view emptied the entire story cache of the deployment
     * and still paid two `SMEMBERS` + N `DEL` per view. The old suite asserted that the sweep
     * *was* called, so it passed while the cache was being destroyed.
     *
     * A view no longer sweeps the SEARCH tag either. `views` is projected into every cached search
     * page, so sweeping on each view emptied the whole search index once this method became
     * reachable over HTTP as `POST /stories/:id/view` — the same pathology one layer out. Search
     * pages now lag the counter by at most `SEARCH_CACHE_TTL_SECONDS`, which is the right trade for a
     * popularity metric that is already eventually consistent.
     */
    it('should not evict any other story, nor the whole search index, when one story is viewed', async () => {
      const storyA = { ...mockStory, id: 'story-a', slug: 'slug-a' };
      const storyB = { ...mockStory, id: 'story-b', slug: 'slug-b' };
      vi.mocked(storiesRepository.findById).mockImplementation(async (id: string) =>
        id === 'story-a' ? storyA : storyB,
      );
      vi.mocked(storiesRepository.findBySlug).mockImplementation(async (slug: string) =>
        slug === 'slug-a' ? storyA : storyB,
      );
      vi.mocked(storiesRepository.incrementViewCount).mockResolvedValue(undefined);
      await storiesService.findById('story-a', AUTHOR_VIEWER);
      await storiesService.findBySlug('slug-a', AUTHOR_VIEWER);
      await storiesService.findById('story-b', AUTHOR_VIEWER);
      await storiesService.findBySlug('slug-b', AUTHOR_VIEWER);

      await storiesService.incrementViewCount('story-a', AUTHOR_VIEWER);
      vi.mocked(storiesRepository.findById).mockClear();

      expect(cache.invalidateTags).not.toHaveBeenCalled();
      expect(cache.store.cached('story', 'story-b')).toBe(true);
      expect(cache.store.cached('story', 'slug:slug-b')).toBe(true);
      expect(cache.store.cached('story', 'story-a')).toBe(false);
      expect(cache.store.cached('story', 'slug:slug-a')).toBe(false);

      // Story B is still served from the cache, so the read never reaches the database again.
      await expect(storiesService.findById('story-b', AUTHOR_VIEWER)).resolves.toMatchObject({ id: 'story-b' });
      expect(storiesRepository.findById).not.toHaveBeenCalled();
    });

    it('should still sweep the search index on a real content write, so a view cannot leak into that', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue(mockStory);
      vi.mocked(storiesRepository.update).mockResolvedValue({ ...mockStory, title: 'Renamed' });
      vi.mocked(storiesRepository.replaceTags).mockResolvedValue(undefined);

      await storiesService.update('story-123', { title: 'Renamed' }, 'user-123');

      // The distinction `invalidateStoryCache` vs `invalidateCachedStoryKeys` exists for: a title or a
      // status change makes a cached search page WRONG, whereas a view only makes it slightly stale.
      expect(cache.invalidateTags).toHaveBeenCalledWith([SEARCH_CACHE_TAG]);
    });

    it('should leave the tag index tracking only the stories that are still cached', async () => {
      vi.mocked(storiesRepository.findById).mockImplementation(async (id: string) => ({ ...mockStory, id }));
      vi.mocked(storiesRepository.incrementViewCount).mockResolvedValue(undefined);
      await storiesService.findById('story-a', AUTHOR_VIEWER);
      await storiesService.findById('story-b', AUTHOR_VIEWER);

      await storiesService.incrementViewCount('story-a', AUTHOR_VIEWER);

      expect(cache.store.trackedBy('stories')).toEqual(['cache:story:story-b']);
    });

    it('should not touch the cache for a story that does not exist', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue(null);

      await expect(storiesService.incrementViewCount('story-999', AUTHOR_VIEWER)).rejects.toThrow('Story not found');
      expect(cache.invalidateKey).not.toHaveBeenCalled();
    });

    it('should not count the increment when the story is soft deleted', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue({ ...mockStory, deletedAt: new Date() });

      await expect(storiesService.incrementViewCount('story-123', AUTHOR_VIEWER)).rejects.toThrow('Story not found');
      expect(storiesRepository.incrementViewCount).not.toHaveBeenCalled();
    });
  });

  describe('tagged cache integration', () => {
    it('should read a story through the tagged cache with the stories tag', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue(mockStory);

      await storiesService.findById('story-123', AUTHOR_VIEWER);

      expect(cache.getOrSet).toHaveBeenCalledWith(
        expect.objectContaining({ namespace: 'story', key: 'story-123', tags: ['stories'] }),
      );
    });

    it('should revive the dates a cache hit hands back as strings', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue(mockStory);

      await storiesService.findById('story-123', AUTHOR_VIEWER);
      const warm = await storiesService.findById('story-123', AUTHOR_VIEWER);

      expect(cache.store.cached('story', 'story-123')).toBe(true);
      expect(warm.createdAt).toBeInstanceOf(Date);
      expect(warm.updatedAt).toBeInstanceOf(Date);
      expect(storiesRepository.findById).toHaveBeenCalledTimes(1);
    });

    it('should read a story by slug under a slug scoped key', async () => {
      vi.mocked(storiesRepository.findBySlug).mockResolvedValue(mockStory);

      await storiesService.findBySlug('test-story', AUTHOR_VIEWER);

      expect(cache.getOrSet).toHaveBeenCalledWith(
        expect.objectContaining({ namespace: 'story', key: 'slug:test-story', tags: ['stories'] }),
      );
    });

    it('should not consult the cache for a story that does not exist', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue(null);

      await expect(storiesService.findById('story-999')).rejects.toThrow('Story not found');
      expect(cache.getOrSet).toHaveBeenCalled();
    });

    it('should invalidate the story cache on update', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue(mockStory);
      vi.mocked(storiesRepository.update).mockResolvedValue({ ...mockStory, title: 'Edited' });

      await storiesService.update('story-123', { title: 'Edited' }, 'user-123');

      expect(cache.invalidateKey).toHaveBeenCalledWith('story', 'story-123', ['stories']);
      expect(cache.invalidateKey).toHaveBeenCalledWith('story', 'slug:test-story', ['stories']);
      // Scoped to the STORIES tag on purpose. The original assertion was a bare
      // `not.toHaveBeenCalled()`, guarding against a whole-tag sweep that emptied every story in
      // the deployment on each write. The search index is a different tag and DOES have to be swept
      // here, so the guard is narrowed rather than deleted.
      expect(cache.invalidateTags).not.toHaveBeenCalledWith([STORIES_CACHE_TAG]);
      expect(cache.invalidateTags).toHaveBeenCalledWith([SEARCH_CACHE_TAG]);
    });

    it('should invalidate the story cache on publish', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue({ ...mockStory, status: 'draft' });
      vi.mocked(storiesRepository.update).mockResolvedValue({ ...mockStory, status: 'published' });

      await storiesService.publish('story-123', 'user-123');

      expect(cache.invalidateKey).toHaveBeenCalledWith('story', 'story-123', ['stories']);
      // Scoped to the STORIES tag on purpose. The original assertion was a bare
      // `not.toHaveBeenCalled()`, guarding against a whole-tag sweep that emptied every story in
      // the deployment on each write. The search index is a different tag and DOES have to be swept
      // here, so the guard is narrowed rather than deleted.
      expect(cache.invalidateTags).not.toHaveBeenCalledWith([STORIES_CACHE_TAG]);
      expect(cache.invalidateTags).toHaveBeenCalledWith([SEARCH_CACHE_TAG]);
    });

    it('should invalidate the story cache on archive', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue({ ...mockStory, status: 'published' });
      vi.mocked(storiesRepository.update).mockResolvedValue({ ...mockStory, status: 'archived' });

      await storiesService.archive('story-123', 'user-123');

      expect(cache.invalidateKey).toHaveBeenCalledWith('story', 'story-123', ['stories']);
      // Scoped to the STORIES tag on purpose. The original assertion was a bare
      // `not.toHaveBeenCalled()`, guarding against a whole-tag sweep that emptied every story in
      // the deployment on each write. The search index is a different tag and DOES have to be swept
      // here, so the guard is narrowed rather than deleted.
      expect(cache.invalidateTags).not.toHaveBeenCalledWith([STORIES_CACHE_TAG]);
      expect(cache.invalidateTags).toHaveBeenCalledWith([SEARCH_CACHE_TAG]);
    });

    it('should invalidate the story cache on delete', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue(mockStory);
      vi.mocked(storiesRepository.softDelete).mockResolvedValue(undefined);

      await storiesService.delete('story-123', 'user-123');

      expect(cache.invalidateKey).toHaveBeenCalledWith('story', 'story-123', ['stories']);
      expect(cache.invalidateKey).toHaveBeenCalledWith('story', 'slug:test-story', ['stories']);
      // Scoped to the STORIES tag on purpose. The original assertion was a bare
      // `not.toHaveBeenCalled()`, guarding against a whole-tag sweep that emptied every story in
      // the deployment on each write. The search index is a different tag and DOES have to be swept
      // here, so the guard is narrowed rather than deleted.
      expect(cache.invalidateTags).not.toHaveBeenCalledWith([STORIES_CACHE_TAG]);
      expect(cache.invalidateTags).toHaveBeenCalledWith([SEARCH_CACHE_TAG]);
    });
  });

  describe('author and category relations', () => {
    it('should resolve the author name for a single story', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue(mockStory);
      vi.mocked(storiesRepository.findAuthorsByIds).mockResolvedValue([{ id: 'user-123', name: 'Keeper' }]);

      const { response } = await storiesService.findByIdWithRelations('story-123', AUTHOR_VIEWER);

      expect(response.author).toEqual({ id: 'user-123', name: 'Keeper' });
    });

    it('should resolve the category name and the tag names', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue({ ...mockStory, categoryId: 'cat-1' });
      vi.mocked(storiesRepository.findCategoriesByIds).mockResolvedValue([{ id: 'cat-1', name: 'Sea Stories' }]);
      vi.mocked(storiesRepository.findTagsByStoryIds).mockResolvedValue([{ storyId: 'story-123', name: 'night' }]);

      const { response } = await storiesService.findByIdWithRelations('story-123', AUTHOR_VIEWER);

      expect(response.category).toBe('Sea Stories');
      expect(response.tags).toEqual(['night']);
    });

    it('should report a null category for a story with no category', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue(mockStory);

      const { response } = await storiesService.findByIdWithRelations('story-123', AUTHOR_VIEWER);

      expect(response.category).toBeNull();
    });

    it('should fall back to a null author name when the join finds nobody', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue(mockStory);

      const { response } = await storiesService.findByIdWithRelations('story-123', AUTHOR_VIEWER);

      expect(response.author).toEqual({ id: 'user-123', name: null });
    });

    it('should resolve relations for a story read by slug', async () => {
      vi.mocked(storiesRepository.findBySlug).mockResolvedValue(mockStory);
      vi.mocked(storiesRepository.findAuthorsByIds).mockResolvedValue([{ id: 'user-123', name: 'Keeper' }]);

      const { response } = await storiesService.findBySlugWithRelations('test-story', AUTHOR_VIEWER);

      expect(response.author.name).toBe('Keeper');
    });

    it('should resolve relations for a whole page of stories', async () => {
      vi.mocked(storiesRepository.findAll).mockResolvedValue({ stories: [mockStory], total: 1 });
      vi.mocked(storiesRepository.findAuthorsByIds).mockResolvedValue([{ id: 'user-123', name: 'Keeper' }]);

      const result = await storiesService.findAll({ page: 1, limit: 20 });

      expect(result.stories[0]?.author.name).toBe('Keeper');
    });

    it('should not run any relation query for an empty page', async () => {
      vi.mocked(storiesRepository.findAll).mockResolvedValue({ stories: [], total: 0 });

      const result = await storiesService.findAll({ page: 1, limit: 20 });

      expect(result.stories).toEqual([]);
      expect(storiesRepository.findAuthorsByIds).not.toHaveBeenCalled();
    });
  });

  describe('toRecord', () => {
    it('should resolve the author name through the same batched join the list uses', async () => {
      vi.mocked(storiesRepository.findAuthorsByIds).mockResolvedValue([{ id: 'user-123', name: 'Keeper' }]);

      const record = await storiesService.toRecord(mockStory);

      expect(record.authorId).toBe('user-123');
      expect(record.authorName).toBe('Keeper');
      expect(storiesRepository.findAuthorsByIds).toHaveBeenCalledWith(['user-123']);
    });

    it('should report a null author name when the join finds nobody', async () => {
      vi.mocked(storiesRepository.findAuthorsByIds).mockResolvedValue([]);

      const record = await storiesService.toRecord(mockStory);

      expect(record.authorName).toBeNull();
    });

    it('should serialise the persistence timestamps so the record matches the shared type', async () => {
      vi.mocked(storiesRepository.findAuthorsByIds).mockResolvedValue([{ id: 'user-123', name: 'Keeper' }]);

      const record = await storiesService.toRecord(mockStory);

      expect(record.createdAt).toBe('2024-01-01T00:00:00.000Z');
      expect(record.updatedAt).toBe('2024-01-01T00:00:00.000Z');
      expect(record.publishedAt).toBeNull();
    });
  });
});
