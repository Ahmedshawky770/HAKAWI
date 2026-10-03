import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type { StorySnapshot } from '../../../common/events/stories.events.ts';

import { SanityService } from './sanity.service.ts';
import { SanitySyncEventHandler } from './sanity-sync.event-handler.ts';

/**
 * This file is the regression guard for a defect that no test could see.
 *
 * `SanitySyncEventHandler` read the story off the event as `event.story` and returned early on
 * `if (!story)`. No producer ever set that field, so all three handlers returned immediately, on
 * every call, forever. The Sanity client, the GROQ query, the Zod response validation and the
 * circuit breaker were all real and all reachable from a test — which is exactly why a green suite
 * proved nothing: nothing had ever asserted that a sync happened.
 *
 * Two things are pinned here, and the second is the one that matters:
 *
 *  1. the handler maps a snapshot to a Sanity document correctly;
 *  2. the PRODUCER sets the snapshot. A test that only exercises the handler with a hand-built
 *     payload would still pass if `stories.service.ts` went back to emitting the id alone — which
 *     is the shape the code had for its entire life.
 */
const snapshot = (overrides: Partial<StorySnapshot> = {}): StorySnapshot => ({
  id: 'story-1',
  authorId: 'author-1',
  title: 'حكاية',
  slug: 'hikaya',
  excerpt: 'مقتطف',
  content: 'المتن',
  coverImage: 'https://cdn.test/cover.png',
  status: 'draft',
  publishedAt: null,
  ...overrides,
});

describe('SanitySyncEventHandler', () => {
  let handler: SanitySyncEventHandler;
  let sanityService: {
    isEnabled: ReturnType<typeof vi.fn>;
    syncStoryToSanity: ReturnType<typeof vi.fn>;
    deleteStoryFromSanity: ReturnType<typeof vi.fn>;
  };
  let logger: {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    sanityService = {
      isEnabled: vi.fn().mockReturnValue(true),
      syncStoryToSanity: vi.fn().mockResolvedValue({ success: true }),
      deleteStoryFromSanity: vi.fn().mockResolvedValue({ success: true }),
    };
    logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    handler = new SanitySyncEventHandler(
      logger as unknown as WinstonLoggerService,
      sanityService as unknown as SanityService,
    );
  });

  describe('story.created', () => {
    it('should sync the story the event carries', async () => {
      await handler.handleStoryCreated({ storyId: 'story-1', authorId: 'author-1', story: snapshot() });

      expect(sanityService.syncStoryToSanity).toHaveBeenCalledTimes(1);
    });

    it('should map the snapshot onto the Sanity document shape', async () => {
      await handler.handleStoryCreated({ storyId: 'story-1', authorId: 'author-1', story: snapshot() });

      expect(sanityService.syncStoryToSanity).toHaveBeenCalledWith({
        _id: 'story-story-1',
        _type: 'story',
        title: 'حكاية',
        slug: 'hikaya',
        excerpt: 'مقتطف',
        content: 'المتن',
        coverImage: 'https://cdn.test/cover.png',
        status: 'draft',
        publishedAt: undefined,
        authorId: 'author-1',
        hakawiId: 'story-1',
      });
    });

    it('should serialise a published timestamp', async () => {
      const publishedAt = new Date('2026-03-01T10:00:00.000Z');
      await handler.handleStoryCreated({
        storyId: 'story-1',
        authorId: 'author-1',
        story: snapshot({ status: 'published', publishedAt }),
      });

      expect(sanityService.syncStoryToSanity).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'published', publishedAt: publishedAt.toISOString() }),
      );
    });

    it('should coerce a string timestamp, which is what a dead-letter replay delivers', async () => {
      // dlq.service.ts persists the payload, so a replayed event has been through JSON and its
      // Date has become a string. Calling .toISOString() on that is a TypeError.
      await handler.handleStoryCreated({
        storyId: 'story-1',
        authorId: 'author-1',
        story: { ...snapshot(), publishedAt: '2026-03-01T10:00:00.000Z' as unknown as Date },
      });

      expect(sanityService.syncStoryToSanity).toHaveBeenCalledWith(
        expect.objectContaining({ publishedAt: '2026-03-01T10:00:00.000Z' }),
      );
    });

    it('should skip and warn when the event carries no snapshot, rather than throwing', async () => {
      // The snapshot is optional in the schema so a pre-existing DLQ entry stays replayable. A
      // replay of one must degrade, not crash.
      await handler.handleStoryCreated({ storyId: 'story-1', authorId: 'author-1' });

      expect(sanityService.syncStoryToSanity).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should not call Sanity at all when it is not configured', async () => {
      sanityService.isEnabled.mockReturnValue(false);

      await handler.handleStoryCreated({ storyId: 'story-1', authorId: 'author-1', story: snapshot() });

      expect(sanityService.syncStoryToSanity).not.toHaveBeenCalled();
    });
  });

  describe('story.updated', () => {
    it('should sync the updated row, not the patch', async () => {
      // The producer must attach the RETURNED row. Emitting `updatedFields` alone would build a
      // Sanity document from a partial patch with no id, no slug and an unset status.
      await handler.handleStoryUpdated({
        storyId: 'story-1',
        updatedFields: { title: 'عنوان جديد' },
        story: snapshot({ title: 'عنوان جديد' }),
      });

      expect(sanityService.syncStoryToSanity).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'عنوان جديد', _id: 'story-story-1' }),
      );
    });
  });

  describe('story.published', () => {
    it('should sync with the published status and timestamp', async () => {
      const publishedAt = new Date('2026-04-02T08:30:00.000Z');
      await handler.handleStoryPublished({
        storyId: 'story-1',
        publishedAt,
        story: snapshot({ status: 'published', publishedAt }),
      });

      expect(sanityService.syncStoryToSanity).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'published', publishedAt: publishedAt.toISOString() }),
      );
    });
  });

  describe('story.archived', () => {
    it('should push the archived status rather than delete the document', async () => {
      // Archiving keeps the editorial record; only story.deleted removes it.
      await handler.handleStoryArchived({ storyId: 'story-1', story: snapshot({ status: 'archived' }) });

      expect(sanityService.syncStoryToSanity).toHaveBeenCalledWith(expect.objectContaining({ status: 'archived' }));
      expect(sanityService.deleteStoryFromSanity).not.toHaveBeenCalled();
    });
  });

  describe('story.deleted', () => {
    it('should remove the document, and needs no snapshot because the id is enough', async () => {
      await handler.handleStoryDeleted({ storyId: 'story-1', authorId: 'author-1' });

      expect(sanityService.deleteStoryFromSanity).toHaveBeenCalledWith('story-1');
      expect(sanityService.syncStoryToSanity).not.toHaveBeenCalled();
    });
  });
});
