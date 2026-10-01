import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { StoryCreatedEvent } from '../../../common/events/stories.events.ts';
import type { CommentCreatedEvent } from '../../../common/events/social.events.ts';

import { ContentModerationService } from '../content-moderation/content-moderation.service.ts';

import { ContentModerationEventHandler } from './content-moderation.event-handler.ts';

type MockLogger = {
  info: Mock;
  log: Mock;
  error: Mock;
  warn: Mock;
  debug: Mock;
  verbose: Mock;
};

type MockContentModeration = {
  reviewStory: Mock<(storyId: string) => Promise<unknown>>;
  reviewComment: Mock<(commentId: string) => Promise<unknown>>;
};

const storyCreated: StoryCreatedEvent = new StoryCreatedEvent('story-1', 'author-1');
const commentCreated = { commentId: 'comment-1', storyId: 'story-1', authorId: 'author-1' } as CommentCreatedEvent;

describe('ContentModerationEventHandler', () => {
  let handler: ContentModerationEventHandler;
  let contentModeration: MockContentModeration;
  let logger: MockLogger;

  beforeEach(() => {
    logger = { info: vi.fn(), log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), verbose: vi.fn() };
    contentModeration = {
      reviewStory: vi.fn<(storyId: string) => Promise<unknown>>().mockResolvedValue([]),
      reviewComment: vi.fn<(commentId: string) => Promise<unknown>>().mockResolvedValue([]),
    };
    handler = new ContentModerationEventHandler(
      contentModeration as unknown as ContentModerationService,
      logger as unknown as WinstonLoggerService,
    );
  });

  it('should review a story on creation', async () => {
    await handler.handleStoryCreated(storyCreated);

    expect(contentModeration.reviewStory).toHaveBeenCalledWith('story-1');
  });

  it('should review a story again when it is published', async () => {
    await handler.handleStoryPublished({ storyId: 'story-2', publishedAt: new Date() });

    expect(contentModeration.reviewStory).toHaveBeenCalledWith('story-2');
  });

  it('should review a comment on creation', async () => {
    await handler.handleCommentCreated(commentCreated);

    expect(contentModeration.reviewComment).toHaveBeenCalledWith('comment-1');
  });

  it('should swallow and log a moderation failure instead of breaking the emit', async () => {
    contentModeration.reviewStory.mockRejectedValueOnce(new Error('table missing'));

    await expect(handler.handleStoryCreated(storyCreated)).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      'Content moderation failed for story.created story-1: table missing',
      undefined,
      'ContentModerationEventHandler',
    );
  });

  it('should swallow a non error rejection too', async () => {
    contentModeration.reviewComment.mockRejectedValueOnce('boom');

    await expect(handler.handleCommentCreated(commentCreated)).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      'Content moderation failed for comment.created comment-1: boom',
      undefined,
      'ContentModerationEventHandler',
    );
  });
});
