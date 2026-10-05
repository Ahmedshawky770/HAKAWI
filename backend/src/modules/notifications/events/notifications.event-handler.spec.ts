import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { EVENT_LISTENER_METADATA } from '@nestjs/event-emitter';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { EventValidatorService } from '../../../common/events/event-validator.service.ts';
import {
  CommentCreatedEvent,
  MessageSentEvent,
  StoryReactedEvent,
  UserFollowedEvent,
} from '../../../common/events/social.events.ts';
import { NOTIFICATIONS_REPOSITORY } from '../interfaces/notifications-repository.interface.ts';
import type { INotificationsRepository, Notification } from '../interfaces/notifications-repository.interface.ts';
import type { NotificationPreferencesResponseDto } from '../interfaces/notifications-repository.interface.ts';
import type { ICommentsRepository, Comment } from '../../comments/interfaces/comments-repository.interface.ts';
import { COMMENTS_REPOSITORY } from '../../comments/interfaces/comments-repository.interface.ts';
import type { IStoriesRepository, Story } from '../../stories/interfaces/stories-repository.interface.ts';
import { STORIES_REPOSITORY } from '../../stories/interfaces/stories-repository.interface.ts';
import { NotificationsService } from '../notifications.service.ts';

import { NotificationsEventHandler } from './notifications.event-handler.ts';

/**
 * WHY THIS SPEC EXISTS AT ALL. The Phase-3 write path (follow / react / comment / comment-react /
 * message → `notifications` row) was traced through four modules and asserted by none of them.
 *
 * `NotificationsService` here is the REAL one, on a repository double. That is deliberate: the defects
 * this pins are a type string and a missing preference family, and the consequence of either is only
 * observable through the preference gate inside `create`. A mocked service would assert the input it
 * was handed and nothing else — which is precisely what hid the defects.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

type CreatedRow = { userId: string; type: string; title: string; message: string; data?: string };

const ALL_ON: NotificationPreferencesResponseDto = {
  emailEnabled: true,
  pushEnabled: true,
  storyReactions: true,
  comments: true,
  follows: true,
  mentions: true,
  messages: true,
  system: true,
};

/**
 * Every `@OnEvent` name this class registers, read from the same decorator metadata Nest's
 * `EventEmitterModule` reads when it wires the listener. Asserting on the class rather than on a
 * removed method is deliberate: a deleted handler cannot be called, so a "method does not exist" test
 * would pass for a class that had been refactored into something else, while a re-added `@OnEvent`
 * would be caught here whether or not its body is reachable from a test.
 */
const subscribedEvents = (): string[] => {
  const prototype = NotificationsEventHandler.prototype;
  const names: string[] = [];
  for (const member of Object.getOwnPropertyNames(prototype)) {
    const listener: unknown = Object.getOwnPropertyDescriptor(prototype, member)?.value;
    if (typeof listener !== 'function') {
      continue;
    }
    const registered: unknown = Reflect.getMetadata(EVENT_LISTENER_METADATA, listener);
    for (const entry of Array.isArray(registered) ? (registered as unknown[]) : []) {
      if (typeof entry === 'object' && entry !== null && 'event' in entry) {
        names.push(String(entry.event));
      }
    }
  }
  return names.sort();
};

const AUTHOR_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';
const STORY_ID = '33333333-3333-4333-8333-333333333333';
const COMMENT_ID = '44444444-4444-4444-8444-444444444444';
const PARENT_ID = '55555555-5555-4555-8555-555555555555';

function story(authorId: string): Story {
  return {
    id: STORY_ID,
    authorId,
    title: 'A story',
    slug: 'a-story',
    excerpt: null,
    content: '<p>body</p>',
    coverImage: null,
    status: 'published',
    categoryId: null,
    viewCount: 0,
    likeCount: 0,
    commentCount: 0,
    readingTime: null,
    publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function comment(authorId: string, isDeleted = false): Comment {
  return {
    id: COMMENT_ID,
    storyId: STORY_ID,
    authorId,
    parentId: null,
    content: 'A comment',
    likeCount: 0,
    replyCount: 0,
    isDeleted,
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

describe('NotificationsEventHandler', () => {
  let handler: NotificationsEventHandler;
  let notificationsRepository: INotificationsRepository;
  let findStory: ReturnType<typeof vi.fn<(id: string) => Promise<Story | null>>>;
  let findComment: ReturnType<typeof vi.fn<(id: string) => Promise<Comment | null>>>;
  let emit: ReturnType<typeof vi.fn<(eventName: string, payload: unknown) => Promise<void>>>;
  let logError: ReturnType<typeof vi.fn>;
  let created: CreatedRow[];

  const storiesRepository: Pick<IStoriesRepository, 'findById'> = {
    findById: (id: string) => findStory(id),
  };

  const commentsRepository: Pick<ICommentsRepository, 'findById'> = {
    findById: (id: string) => findComment(id),
  };

  const writtenTypes = (): string[] => created.map((row) => row.type);

  beforeEach(async () => {
    created = [];
    let sequence = 0;

    notificationsRepository = {
      findById: vi.fn<(id: string) => Promise<Notification | null>>(() => Promise.resolve(null)),
      findByUser: vi.fn<
        (userId: string, page: number, limit: number) => Promise<{ notifications: Notification[]; total: number }>
      >(() => Promise.resolve({ notifications: [], total: 0 })),
      findUnread: vi.fn<(userId: string, limit: number) => Promise<Notification[]>>(() => Promise.resolve([])),
      markAsRead: vi.fn<(id: string) => Promise<Notification>>(),
      markAllAsRead: vi.fn<(userId: string) => Promise<void>>(() => Promise.resolve()),
      delete: vi.fn<(id: string) => Promise<void>>(() => Promise.resolve()),
      countUnread: vi.fn<(userId: string) => Promise<number>>(() => Promise.resolve(0)),
      findPreferences: vi.fn<(userId: string) => Promise<NotificationPreferencesResponseDto>>(() =>
        Promise.resolve({ ...ALL_ON }),
      ),
      upsertPreferences:
        vi.fn<
          (userId: string, data: NotificationPreferencesResponseDto) => Promise<NotificationPreferencesResponseDto>
        >(),
      create: vi.fn<(data: CreatedRow) => Promise<Notification>>((data) => {
        sequence += 1;
        created.push(data);
        return Promise.resolve({
          id: `notification-${sequence}`,
          userId: data.userId,
          type: data.type,
          title: data.title,
          message: data.message,
          data: data.data ?? null,
          isRead: false,
          readAt: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        });
      }),
    };

    findStory = vi.fn<(id: string) => Promise<Story | null>>(() => Promise.resolve(story(AUTHOR_ID)));
    findComment = vi.fn<(id: string) => Promise<Comment | null>>(() => Promise.resolve(comment(AUTHOR_ID)));
    emit = vi.fn<(eventName: string, payload: unknown) => Promise<void>>(() => Promise.resolve());

    // A real logger with its methods replaced, rather than an object cast to the service type. The
    // handler only ever calls `info`, `error` and `debug` on it.
    const logger = new WinstonLoggerService();
    logError = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    vi.spyOn(logger, 'debug').mockImplementation(() => undefined);

    // The handler is resolved through Nest rather than constructed by hand, so its constructor is the
    // one production wires: the repository token it no longer injects, the service it does, and the two
    // owning-module interfaces. A double that implements only one method is fine at the token boundary
    // and impossible to smuggle past the compiler.
    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationsService,
        NotificationsEventHandler,
        // The spied instance, not the class: a class provider would have Nest construct a second
        // logger, and these assertions are about what the handler logged, not about a stand-in nobody
        // injected.
        { provide: WinstonLoggerService, useValue: logger },
        { provide: NOTIFICATIONS_REPOSITORY, useValue: notificationsRepository },
        { provide: STORIES_REPOSITORY, useValue: storiesRepository },
        { provide: COMMENTS_REPOSITORY, useValue: commentsRepository },
        { provide: EventValidatorService, useValue: { emit, validateEvent: () => Promise.resolve(true) } },
      ],
    }).compile();

    handler = moduleRef.get(NotificationsEventHandler);
  });

  describe('handleCommentReacted', () => {
    it('should notify the comment author with a comment_reaction, not a story_reaction', async () => {
      await handler.handleCommentReacted({ userId: ACTOR_ID, commentId: COMMENT_ID, reactionType: 'like' });

      expect(created).toHaveLength(1);
      expect(created[0]!.userId).toBe(AUTHOR_ID);
      expect(created[0]!.type).toBe('comment_reaction');
    });

    // The C3 regression. With `story_reaction` here the gate consulted `storyReactions`, so a user who
    // had turned COMMENTS off was still notified about reactions to their own comments.
    it('should not notify when the comment author has comment notifications disabled', async () => {
      vi.mocked(notificationsRepository.findPreferences).mockResolvedValue({ ...ALL_ON, comments: false });

      await handler.handleCommentReacted({ userId: ACTOR_ID, commentId: COMMENT_ID, reactionType: 'like' });

      expect(created).toEqual([]);
      expect(emit).not.toHaveBeenCalled();
    });

    // The other half of the same defect: a user who had turned STORY reactions off was not spared
    // reactions on their COMMENTS.
    it('should still notify when only story reactions are disabled', async () => {
      vi.mocked(notificationsRepository.findPreferences).mockResolvedValue({ ...ALL_ON, storyReactions: false });

      await handler.handleCommentReacted({ userId: ACTOR_ID, commentId: COMMENT_ID, reactionType: 'like' });

      expect(writtenTypes()).toEqual(['comment_reaction']);
    });

    it('should emit notification.created with the row the service wrote', async () => {
      await handler.handleCommentReacted({ userId: ACTOR_ID, commentId: COMMENT_ID, reactionType: 'love' });

      expect(emit).toHaveBeenCalledWith('notification.created', {
        notificationId: 'notification-1',
        userId: AUTHOR_ID,
        type: 'comment_reaction',
      });
    });

    it('should not notify the reactor about their own reaction', async () => {
      await handler.handleCommentReacted({ userId: AUTHOR_ID, commentId: COMMENT_ID, reactionType: 'like' });

      expect(created).toEqual([]);
    });

    it('should not notify about a reaction on a soft-deleted comment', async () => {
      findComment.mockResolvedValue(comment(AUTHOR_ID, true));

      await handler.handleCommentReacted({ userId: ACTOR_ID, commentId: COMMENT_ID, reactionType: 'like' });

      expect(created).toEqual([]);
    });

    it('should not notify when the comment cannot be found', async () => {
      findComment.mockResolvedValue(null);

      await handler.handleCommentReacted({ userId: ACTOR_ID, commentId: COMMENT_ID, reactionType: 'like' });

      expect(created).toEqual([]);
    });
  });

  describe('contest events', () => {
    // THE DUPLICATE-HANDLER REGRESSION. This class used to answer `contest.created`,
    // `winner.selected` and `prize.distributed` as well as `ContestsEventHandler` did, so a winner
    // got two rows for winning and two for the prize — the two halves typed differently — and a contest
    // author got a row the contests module had decided in writing nobody should receive. Asserted
    // against the registered listeners rather than against a deleted method, so re-adding any of the
    // three fails here even if the new handler is never called from a test.
    it.each([['contest.created'], ['winner.selected'], ['prize.distributed']])(
      'registers no listener for %s, which the contests module owns',
      (eventName: string) => {
        expect(subscribedEvents()).not.toContain(eventName);
      },
    );

    // The probe above would pass on a class that had lost every listener, so the events this class
    // DOES own are pinned in the same list. If the metadata read were wrong, this fails.
    it('registers exactly the social events and the notification.created log line', () => {
      expect(subscribedEvents()).toEqual([
        'comment.created',
        'comment.reacted',
        'message.sent',
        'notification.created',
        'story.reacted',
        'user.followed',
      ]);
    });
  });

  describe('social handlers', () => {
    it('should notify the followed user with a follow notification', async () => {
      await handler.handleUserFollowed(new UserFollowedEvent(ACTOR_ID, AUTHOR_ID));

      expect(writtenTypes()).toEqual(['follow']);
    });

    it('should not notify a user about their own follow', async () => {
      await handler.handleUserFollowed(new UserFollowedEvent(AUTHOR_ID, AUTHOR_ID));

      expect(created).toEqual([]);
    });

    it('should notify the story author with a story_reaction', async () => {
      await handler.handleStoryReacted(new StoryReactedEvent(ACTOR_ID, STORY_ID, 'love'));

      expect(writtenTypes()).toEqual(['story_reaction']);
    });

    it('should notify the story author with a comment for a top-level comment', async () => {
      await handler.handleCommentCreated(new CommentCreatedEvent(COMMENT_ID, STORY_ID, ACTOR_ID));

      expect(writtenTypes()).toEqual(['comment']);
    });

    it('should notify the parent comment author with a comment_reply', async () => {
      findComment.mockImplementation((id: string) => Promise.resolve({ ...comment(AUTHOR_ID), id }));

      await handler.handleCommentCreated(new CommentCreatedEvent(COMMENT_ID, STORY_ID, ACTOR_ID, PARENT_ID));

      expect(writtenTypes()).toEqual(['comment_reply']);
    });

    it('should not notify a commenter about their own comment', async () => {
      await handler.handleCommentCreated(new CommentCreatedEvent(COMMENT_ID, STORY_ID, AUTHOR_ID));

      expect(created).toEqual([]);
    });

    it('should notify the conversation counterpart with a message', async () => {
      await handler.handleMessageSent(new MessageSentEvent(COMMENT_ID, STORY_ID, ACTOR_ID, AUTHOR_ID));

      expect(writtenTypes()).toEqual(['message']);
    });

    it('should not notify a message sender about their own message', async () => {
      await handler.handleMessageSent(new MessageSentEvent(COMMENT_ID, STORY_ID, ACTOR_ID, ACTOR_ID));

      expect(created).toEqual([]);
    });

    // A direct message was the one notification with no preference behind it: `message` had no entry in
    // `PREFERENCE_FOR_TYPE` and `notification_preferences` had no column for it, so a recipient could
    // not silence one by any means. Migration 0023 added `messages`, and these two cases are the whole
    // point of it — asserted here, where the type string the handler writes and the family the gate
    // resolves it to are both visible.
    it('should not write a message notification when the recipient has messages disabled', async () => {
      vi.mocked(notificationsRepository.findPreferences).mockResolvedValue({ ...ALL_ON, messages: false });

      await handler.handleMessageSent(new MessageSentEvent(COMMENT_ID, STORY_ID, ACTOR_ID, AUTHOR_ID));

      expect(created).toEqual([]);
      expect(notificationsRepository.findPreferences).toHaveBeenCalledWith(AUTHOR_ID);
    });

    it('should still write a message notification when another family is disabled', async () => {
      vi.mocked(notificationsRepository.findPreferences).mockResolvedValue({ ...ALL_ON, system: false });

      await handler.handleMessageSent(new MessageSentEvent(COMMENT_ID, STORY_ID, ACTOR_ID, AUTHOR_ID));

      expect(writtenTypes()).toEqual(['message']);
    });

    it('should swallow a failed notification rather than fail the follow', async () => {
      vi.mocked(notificationsRepository.create).mockRejectedValue(new Error('notifications table unavailable'));

      await expect(handler.handleUserFollowed(new UserFollowedEvent(ACTOR_ID, AUTHOR_ID))).resolves.toBeUndefined();
      expect(logError).toHaveBeenCalled();
    });
  });
});
