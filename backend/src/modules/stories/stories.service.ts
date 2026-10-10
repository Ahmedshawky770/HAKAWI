/**
 * Projects a stored story into the snapshot the Sanity sync reads off the event.
 *
 * WHY THIS IS A FUNCTION AND NOT AN INLINE OBJECT LITERAL. The four emit sites each need the same
 * eight fields, and the mapping is the part that has to stay in step with `SanityStoryDocument`. A
 * literal per site would let one of them drift, and the symptom would be a Sanity document that
 * silently omits a field only on create or only on publish.
 *
 * WHY `publishedAt` IS PASSED THROUGH UNTOUCHED. `SanitySyncEventHandler.toSanityDocument` calls
 * `.toISOString()` on it, so a string here would be a `TypeError` at the point of use. The event
 * schema coerces it back to a Date for payloads that round-trip through the dead-letter queue, but
 * an in-process emit never serialises, so the Date survives as a Date.
 */
function toStorySnapshot(story: Story): StorySnapshot {
  return {
    id: story.id,
    authorId: story.authorId,
    title: story.title,
    slug: story.slug,
    excerpt: story.excerpt,
    content: story.content,
    coverImage: story.coverImage,
    status: story.status,
    publishedAt: story.publishedAt,
  };
}

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
  StorySnapshot,
} from '../../common/events/stories.events.ts';
import { SEARCH_CACHE_TAG } from '../search/cache-keys.ts';

import type {
  IStoriesRepository,
  StoryAuthorSummary,
  StoryCategorySummary,
  StoryTagSummary,
} from './interfaces/stories-repository.interface.ts';
import { STORIES_REPOSITORY, isUniqueViolation } from './interfaces/stories-repository.interface.ts';
import { deriveStorySlug, storySlugCandidates, MAX_SLUG_COLLISION_ATTEMPTS } from './dto/story-slug.ts';
import { assertStoryIsReadableBy } from './story-visibility.ts';
import type { StoryViewer } from './story-visibility.ts';
import type { Story, CreateStoryInput, UpdateStoryInput, StoriesListResponse, StoryRecord } from './types.ts';
import {
  toStoryResponse,
  toStoryRecord,
  reviveStoryDates,
  UNPUBLISHED_STORY_STATUSES,
  type StoryAuthor,
  type StoryRelations,
} from './types.ts';

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

    if (data.tags !== undefined) {
      await this.storiesRepository.replaceTags(story.id, data.tags);
    }

    await this.eventBus.emit('story.created', {
      storyId: story.id,
      authorId,
      story: toStorySnapshot(story),
    } as StoryCreatedEvent);
    return story;
  }

  /**
   * WHY THE VISIBILITY CHECK IS AFTER THE CACHE AND NOT INSIDE `load`.
   *
   * `TaggedCacheService.getOrSet` returns a hit without ever calling `load`, and the entry is keyed
   * on the id (or the slug) alone — it holds no viewer, because a cached value cannot hold one
   * without becoming one-entry-per-viewer, which is what the cache exists to avoid. A check placed
   * inside `load` would therefore run only on a MISS: the first anonymous read of a cold draft would
   * be refused, and then the story would have been cached by nothing while the author's own read —
   * which does pass — caches the row, and from that moment every anonymous reader is served the
   * cached draft without `load` running again. Authorization that depends on cache state is not
   * authorization. Running `assertStoryIsReadableBy` on the returned value means a cached draft is
   * checked on every single read, hit or miss, which is the property that actually matters here.
   */
  async findById(id: string, viewer?: StoryViewer): Promise<Story> {
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
    assertStoryIsReadableBy(value, viewer);
    return value;
  }

  /** The slug read is the id read with a different key; see `findById` for why the check sits outside `load`. */
  async findBySlug(slug: string, viewer?: StoryViewer): Promise<Story> {
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
    assertStoryIsReadableBy(value, viewer);
    return value;
  }

  /**
   * `viewer` is forwarded rather than re-read here: the allow/deny rule lives next to the
   * `deletedAt` check in `findById`/`findBySlug`, one helper for both, so this layer only carries the
   * identity it was handed. An `undefined` viewer means the route saw no verified subject, which is
   * the anonymous case the rule denies — it is never defaulted to a permissive value.
   */
  async findByIdWithRelations(
    id: string,
    viewer?: StoryViewer,
  ): Promise<{ story: Story; response: ReturnType<typeof toStoryResponse> }> {
    const story = await this.findById(id, viewer);
    const relations = await this.loadRelations([story]);
    return {
      story,
      response: toStoryResponse(story, relations.authors.get(story.authorId), relationsFor(story, relations)),
    };
  }

  async findBySlugWithRelations(
    slug: string,
    viewer?: StoryViewer,
  ): Promise<{ story: Story; response: ReturnType<typeof toStoryResponse> }> {
    const story = await this.findBySlug(slug, viewer);
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
    status?: string | readonly string[];
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

  /**
   * One author's UNPUBLISHED stories, and nothing else. This is the service half of
   * `GET /stories/mine`; the route resolves who the caller is and forwards the identity, which is the
   * whole of its job on this path (Principle #7).
   *
   * WHY A METHOD AND NOT `findAll({ authorId, ... })` FROM THE ROUTE. `findAll` is the same primitive
   * the public list uses, and `authorId` has been a parameter of it all along — which is how the
   * capability sat one layer below HTTP with no way to reach it. Handing the route that parameter
   * directly would also hand it the decision of WHO, and the only thing separating "my drafts" from
   * "everyone's drafts" would be one argument at one call site. A method whose name states the rule
   * makes the safe shape the default shape: there is no signature here that can list another author's
   * work, so the route cannot grow one by accident.
   *
   * WHY THE STATUS SET IS DECIDED HERE AND NOT AT THE ROUTE. The route's DTO can only narrow to a
   * single unpublished status; the default — the answer to "what does this endpoint return?" — belongs
   * beside the mapping that produces the rows, where it cannot be forgotten by a future handler.
   *
   * WHY A NONSENSE `status` NARROWS TO NOTHING INSTEAD OF BEING FORWARDED. The intersection is
   * computed against `UNPUBLISHED_STORY_STATUSES`, so `status: 'published'` produces an empty set, and
   * an empty set is `inArray`'s `false` rather than "no filter". A method called
   * `findUnpublishedByAuthor` that could return a published story would be a lie in its own name; the
   * DTO already answers a caller who asks for one with a 400 that names the route that serves them.
   */
  async findUnpublishedByAuthor(
    authorId: string,
    params: {
      page?: number;
      limit?: number;
      categoryId?: string;
      search?: string;
      status?: string;
    },
  ): Promise<StoriesListResponse> {
    const status =
      params.status === undefined
        ? UNPUBLISHED_STORY_STATUSES
        : UNPUBLISHED_STORY_STATUSES.filter((candidate) => candidate === params.status);

    return this.findAll({
      page: params.page,
      limit: params.limit,
      search: params.search,
      categoryId: params.categoryId,
      authorId,
      status,
    });
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

    if (input.tags !== undefined) {
      // Omitting `tags` leaves the current set alone, exactly as omitting `slug` leaves the
      // current slug alone. Only an explicit array replaces, so a client that PATCHes just the
      // title does not silently strip a story's tags.
      await this.storiesRepository.replaceTags(id, input.tags);
    }

    await this.invalidateStoryCache(id, existing.slug);

    await this.eventBus.emit('story.updated', {
      storyId: id,
      updatedFields: input,
      story: toStorySnapshot(story),
    } as StoryUpdatedEvent);
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

    await this.eventBus.emit('story.published', {
      storyId: id,
      publishedAt,
      story: toStorySnapshot(updated),
    } as StoryPublishedEvent);
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

    await this.eventBus.emit('story.archived', {
      storyId: id,
      story: toStorySnapshot(updated),
    } as StoryArchivedEvent);
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

  /**
   * `viewer` is REQUIRED here, while `findById`/`findBySlug` take it as optional. Those two are
   * reachable without a credential — they sit on `@Public()` routes behind `OptionalJwtAuthGuard` — so
   * `undefined` is a real case there and means "anonymous". This method sits behind `JwtAuthGuard`,
   * which never lets a handler run without a verified subject, so an optional parameter here would be
   * a permissive default with no caller that needs it: a missing viewer would be a programming error,
   * and `assertStoryIsReadableBy` would answer it by silently treating the request as anonymous.
   *
   * WHY THE RULE IS REUSED INSTEAD OF A VIEW-SPECIFIC ONE. The counter used to be incremented for any
   * id that existed, which made a 204 the answer to "does this draft exist?" for any account that
   * cared to ask — the cheaper version of the oracle the detail routes were just closed against. There
   * is exactly one allow/deny rule for reading a story, and this path is reading one; a second
   * expression would be the "one rule, two answers" shape that produced the defect. The consequence
   * worth stating plainly: a refusal is `NotFoundException('Story not found')` — byte-identical to the
   * one below it for an id that never existed — so this route cannot be used to confirm that a draft
   * is there either.
   *
   * AND WHAT THIS DOES NOT CHANGE. A published story is readable by anyone, so any authenticated
   * reader still counts a view on one. That is the ordinary case and the reason the route exists; the
   * check returns before the counter for a published row and adds nothing to that path.
   */
  async incrementViewCount(id: string, viewer: StoryViewer): Promise<void> {
    const story = await this.storiesRepository.findById(id);
    if (!story || story.deletedAt) {
      throw new NotFoundException('Story not found');
    }

    assertStoryIsReadableBy(story, viewer);

    await this.storiesRepository.incrementViewCount(id);
    // Only this story's own two keys, deliberately NOT the search sweep. Exposing this over HTTP as
    // `POST /stories/:id/view` turned the sweep from a defect nobody could reach into a per-page-view
    // cost: `views` is projected into every cached search page, so a sweep on each view empties the
    // entire search index of the deployment while paying `SMEMBERS` + N `DEL` to do it — the same
    // pathology `invalidateStoryCache` already documents for the STORIES tag, one layer out. Search
    // pages now lag the counter by at most `SEARCH_CACHE_TTL_SECONDS`, which is the right trade for a
    // popularity metric: it stays eventually consistent by design (see the route's comment) while the
    // cache it is read through keeps actually caching. Content writes still sweep, because a title or
    // a status change is a correctness problem and a view is not.
    await this.invalidateCachedStoryKeys(id, story.slug);
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

  /**
   * WHY THE SEARCH SWEEP LIVES HERE AND NOT IN AN EVENT HANDLER.
   *
   * The search index is a projection of stories, so every story write makes some cached search page
   * wrong. Before this, the cache was an untagged `valkeyService.set()` and nothing could reach it:
   * a story published at T was invisible to search for up to 300s, and a story unpublished at T
   * stayed findable for the same window — which, with the public route now pinned to
   * `status = 'published'`, turned a staleness bug into a disclosure of unpublished work.
   *
   * Hooking it into this method rather than into a `story.*` event handler covers more than the
   * handler would: a write that succeeds and then fails to emit still invalidates, and the five call
   * sites here are the only writes to the table.
   *
   * WHY THE TAG COMES FROM THE SEARCH MODULE. `SEARCH_CACHE_TAG` is imported from
   * `search/cache-keys.ts` rather than re-spelled. Two copies of the string would both typecheck
   * and produce a cache that is silently never invalidated, which is the exact failure this replaces.
   */
  private async invalidateStoryCache(id: string, slug?: string): Promise<void> {
    await this.cache.invalidateTags([SEARCH_CACHE_TAG]);
    await this.invalidateCachedStoryKeys(id, slug);
  }

  /**
   * Drops this story's two cached representations and nothing else.
   *
   * Split out of `invalidateStoryCache` so the view counter can be invalidated precisely: the
   * difference between the two callers is whether the SEARCH projection went stale, and that is a
   * property of WHAT changed, not of how the story is keyed. See `incrementViewCount`.
   */
  private async invalidateCachedStoryKeys(id: string, slug?: string): Promise<void> {
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
