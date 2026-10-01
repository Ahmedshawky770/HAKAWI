import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';

/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { TaggedCacheService } from '../shared/cache/tagged-cache.service.ts';
import { EventValidatorService } from '../../common/events/event-validator.service.ts';
import { MAX_SLUG_COLLISION_ATTEMPTS } from './dto/story-slug.ts';

import { StoriesService } from './stories.service.ts';
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
        status?: string;
        search?: string;
      }) => Promise<{ stories: Story[]; total: number }>
    >
  >;
  create: ReturnType<typeof vi.fn<(data: CreateStoryInput) => Promise<Story>>>;
  update: ReturnType<typeof vi.fn<(id: string, data: UpdateStoryInput) => Promise<Story>>>;
  softDelete: ReturnType<typeof vi.fn<(id: string) => Promise<void>>>;
  incrementViewCount: ReturnType<typeof vi.fn<(id: string) => Promise<void>>>;
  findAuthorsByIds: ReturnType<typeof vi.fn<(authorIds: string[]) => Promise<{ id: string; name: string }[]>>>;
  findCategoriesByIds: ReturnType<typeof vi.fn<(categoryIds: string[]) => Promise<{ id: string; name: string }[]>>>;
  findTagsByStoryIds: ReturnType<typeof vi.fn<(storyIds: string[]) => Promise<{ storyId: string; name: string }[]>>>;
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
            status?: string;
            search?: string;
          }) => Promise<{ stories: Story[]; total: number }>
        >(),
      create: vi.fn<(data: CreateStoryInput) => Promise<Story>>(),
      update: vi.fn<(id: string, data: UpdateStoryInput) => Promise<Story>>(),
      softDelete: vi.fn<(id: string) => Promise<void>>(),
      incrementViewCount: vi.fn<(id: string) => Promise<void>>(),
      findAuthorsByIds: vi.fn<(authorIds: string[]) => Promise<{ id: string; name: string }[]>>(),
      findCategoriesByIds: vi.fn<(categoryIds: string[]) => Promise<{ id: string; name: string }[]>>(),
      findTagsByStoryIds: vi.fn<(storyIds: string[]) => Promise<{ storyId: string; name: string }[]>>(),
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

    it('should emit the created event with the resolved story id', async () => {
      acceptsInsert();

      await storiesService.create('author-123', { authorId: 'author-123', title: 'The Lighthouse' });

      expect(eventValidatorService.emit).toHaveBeenCalledWith('story.created', {
        storyId: mockStory.id,
        authorId: 'author-123',
      });
    });
  });

  describe('findById', () => {
    it('should return a story by id', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue(mockStory);
      vi.mocked(storiesRepository.findAuthorsByIds).mockResolvedValue([]);
      vi.mocked(storiesRepository.findCategoriesByIds).mockResolvedValue([]);
      vi.mocked(storiesRepository.findTagsByStoryIds).mockResolvedValue([]);

      const result = await storiesService.findById('story-123');

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

      const result = await storiesService.findBySlug('test-story');

      expect(result).toEqual(mockStory);
      expect(storiesRepository.findBySlug).toHaveBeenCalledWith('test-story');
    });

    it('should throw NotFoundException when story not found', async () => {
      vi.mocked(storiesRepository.findBySlug).mockResolvedValue(null);

      await expect(storiesService.findBySlug('non-existent')).rejects.toThrow('Story not found');
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

      await storiesService.incrementViewCount('story-123');

      expect(storiesRepository.incrementViewCount).toHaveBeenCalledWith('story-123');
    });

    it('should throw NotFoundException when story not found', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue(null);

      await expect(storiesService.incrementViewCount('story-999')).rejects.toThrow('Story not found');
    });
  });

  describe('incrementViewCount cache invalidation', () => {
    it('should drop the cached story so the next read sees the new count', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue(mockStory);
      vi.mocked(storiesRepository.incrementViewCount).mockResolvedValue(undefined);

      await storiesService.incrementViewCount('story-123');

      expect(cache.invalidateKey).toHaveBeenCalledWith('story', 'story-123', ['stories']);
      expect(cache.invalidateKey).toHaveBeenCalledWith('story', 'slug:test-story', ['stories']);
    });

    /**
     * The regression this whole class of change exists for. `invalidateStoryCache` used to end
     * with `invalidateTags([STORIES_CACHE_TAG])`, and the `stories` tag indexes every story id
     * *and* every story slug — so one page view emptied the entire story cache of the deployment
     * and still paid two `SMEMBERS` + N `DEL` per view. The old suite asserted that the sweep
     * *was* called, so it passed while the cache was being destroyed.
     */
    it('should not evict any other story when one story is viewed', async () => {
      const storyA = { ...mockStory, id: 'story-a', slug: 'slug-a' };
      const storyB = { ...mockStory, id: 'story-b', slug: 'slug-b' };
      vi.mocked(storiesRepository.findById).mockImplementation(async (id: string) =>
        id === 'story-a' ? storyA : storyB,
      );
      vi.mocked(storiesRepository.findBySlug).mockImplementation(async (slug: string) =>
        slug === 'slug-a' ? storyA : storyB,
      );
      vi.mocked(storiesRepository.incrementViewCount).mockResolvedValue(undefined);
      await storiesService.findById('story-a');
      await storiesService.findBySlug('slug-a');
      await storiesService.findById('story-b');
      await storiesService.findBySlug('slug-b');

      await storiesService.incrementViewCount('story-a');
      vi.mocked(storiesRepository.findById).mockClear();

      expect(cache.invalidateTags).not.toHaveBeenCalled();
      expect(cache.store.cached('story', 'story-b')).toBe(true);
      expect(cache.store.cached('story', 'slug:slug-b')).toBe(true);
      expect(cache.store.cached('story', 'story-a')).toBe(false);
      expect(cache.store.cached('story', 'slug:slug-a')).toBe(false);

      // Story B is still served from the cache, so the read never reaches the database again.
      await expect(storiesService.findById('story-b')).resolves.toMatchObject({ id: 'story-b' });
      expect(storiesRepository.findById).not.toHaveBeenCalled();
    });

    it('should leave the tag index tracking only the stories that are still cached', async () => {
      vi.mocked(storiesRepository.findById).mockImplementation(async (id: string) => ({ ...mockStory, id }));
      vi.mocked(storiesRepository.incrementViewCount).mockResolvedValue(undefined);
      await storiesService.findById('story-a');
      await storiesService.findById('story-b');

      await storiesService.incrementViewCount('story-a');

      expect(cache.store.trackedBy('stories')).toEqual(['cache:story:story-b']);
    });

    it('should not touch the cache for a story that does not exist', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue(null);

      await expect(storiesService.incrementViewCount('story-999')).rejects.toThrow('Story not found');
      expect(cache.invalidateKey).not.toHaveBeenCalled();
    });

    it('should not count the increment when the story is soft deleted', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue({ ...mockStory, deletedAt: new Date() });

      await expect(storiesService.incrementViewCount('story-123')).rejects.toThrow('Story not found');
      expect(storiesRepository.incrementViewCount).not.toHaveBeenCalled();
    });
  });

  describe('tagged cache integration', () => {
    it('should read a story through the tagged cache with the stories tag', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue(mockStory);

      await storiesService.findById('story-123');

      expect(cache.getOrSet).toHaveBeenCalledWith(
        expect.objectContaining({ namespace: 'story', key: 'story-123', tags: ['stories'] }),
      );
    });

    it('should revive the dates a cache hit hands back as strings', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue(mockStory);

      await storiesService.findById('story-123');
      const warm = await storiesService.findById('story-123');

      expect(cache.store.cached('story', 'story-123')).toBe(true);
      expect(warm.createdAt).toBeInstanceOf(Date);
      expect(warm.updatedAt).toBeInstanceOf(Date);
      expect(storiesRepository.findById).toHaveBeenCalledTimes(1);
    });

    it('should read a story by slug under a slug scoped key', async () => {
      vi.mocked(storiesRepository.findBySlug).mockResolvedValue(mockStory);

      await storiesService.findBySlug('test-story');

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
      expect(cache.invalidateTags).not.toHaveBeenCalled();
    });

    it('should invalidate the story cache on publish', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue({ ...mockStory, status: 'draft' });
      vi.mocked(storiesRepository.update).mockResolvedValue({ ...mockStory, status: 'published' });

      await storiesService.publish('story-123', 'user-123');

      expect(cache.invalidateKey).toHaveBeenCalledWith('story', 'story-123', ['stories']);
      expect(cache.invalidateTags).not.toHaveBeenCalled();
    });

    it('should invalidate the story cache on archive', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue({ ...mockStory, status: 'published' });
      vi.mocked(storiesRepository.update).mockResolvedValue({ ...mockStory, status: 'archived' });

      await storiesService.archive('story-123', 'user-123');

      expect(cache.invalidateKey).toHaveBeenCalledWith('story', 'story-123', ['stories']);
      expect(cache.invalidateTags).not.toHaveBeenCalled();
    });

    it('should invalidate the story cache on delete', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue(mockStory);
      vi.mocked(storiesRepository.softDelete).mockResolvedValue(undefined);

      await storiesService.delete('story-123', 'user-123');

      expect(cache.invalidateKey).toHaveBeenCalledWith('story', 'story-123', ['stories']);
      expect(cache.invalidateKey).toHaveBeenCalledWith('story', 'slug:test-story', ['stories']);
      expect(cache.invalidateTags).not.toHaveBeenCalled();
    });
  });

  describe('author and category relations', () => {
    it('should resolve the author name for a single story', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue(mockStory);
      vi.mocked(storiesRepository.findAuthorsByIds).mockResolvedValue([{ id: 'user-123', name: 'Keeper' }]);

      const { response } = await storiesService.findByIdWithRelations('story-123');

      expect(response.author).toEqual({ id: 'user-123', name: 'Keeper' });
    });

    it('should resolve the category name and the tag names', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue({ ...mockStory, categoryId: 'cat-1' });
      vi.mocked(storiesRepository.findCategoriesByIds).mockResolvedValue([{ id: 'cat-1', name: 'Sea Stories' }]);
      vi.mocked(storiesRepository.findTagsByStoryIds).mockResolvedValue([{ storyId: 'story-123', name: 'night' }]);

      const { response } = await storiesService.findByIdWithRelations('story-123');

      expect(response.category).toBe('Sea Stories');
      expect(response.tags).toEqual(['night']);
    });

    it('should report a null category for a story with no category', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue(mockStory);

      const { response } = await storiesService.findByIdWithRelations('story-123');

      expect(response.category).toBeNull();
    });

    it('should fall back to a null author name when the join finds nobody', async () => {
      vi.mocked(storiesRepository.findById).mockResolvedValue(mockStory);

      const { response } = await storiesService.findByIdWithRelations('story-123');

      expect(response.author).toEqual({ id: 'user-123', name: null });
    });

    it('should resolve relations for a story read by slug', async () => {
      vi.mocked(storiesRepository.findBySlug).mockResolvedValue(mockStory);
      vi.mocked(storiesRepository.findAuthorsByIds).mockResolvedValue([{ id: 'user-123', name: 'Keeper' }]);

      const { response } = await storiesService.findBySlugWithRelations('test-story');

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
