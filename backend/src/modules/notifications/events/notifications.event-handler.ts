import { Injectable, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { and, eq } from 'drizzle-orm';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type { NotificationCreatedEvent } from '../../../common/events/social.events.ts';
import type {
  ContestCreatedEvent,
  WinnerSelectedEvent,
  PrizeDistributedEvent,
} from '../../../common/events/contests.events.ts';
import type {
  UserFollowedEvent,
  CommentCreatedEvent,
  StoryReactedEvent,
  MessageSentEvent,
} from '../../../common/events/social.events.ts';
import type { INotificationsRepository } from '../interfaces/notifications-repository.interface.ts';
import { NOTIFICATIONS_REPOSITORY } from '../interfaces/notifications-repository.interface.ts';
import { NotificationsService } from '../notifications.service.ts';

import { comments, conversations } from '../../../db/schema/social.schema.ts';
import { stories } from '../../../db/schema/stories.schema.ts';
import { db } from '../../../db/index.ts';

/**
 * `comment.reacted` is emitted as a plain object literal
 * (`CommentsReactionsService.addReaction`) rather than an instance of a class, so there is nothing
 * to import for it. Its shape is pinned by `CommentReactionCreatedSchema` in
 * `src/common/events/event-schemas.ts`, and the event bus validates every payload against that
 * schema before a handler ever sees it — so this declaration describes the same contract the
 * runtime enforces, and cannot drift without the typecheck noticing a field the schema dropped.
 */
type CommentReactionCreated = {
  userId: string;
  commentId: string;
  reactionType: string;
};

@Injectable()
export class NotificationsEventHandler {
  constructor(
    @Inject(NOTIFICATIONS_REPOSITORY) private readonly notificationsRepository: INotificationsRepository,
    @Inject(NotificationsService) private readonly notificationsService: NotificationsService,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
  ) {}

  @OnEvent('notification.created')
  async handleNotificationCreated(event: NotificationCreatedEvent): Promise<void> {
    this.logger.info(
      `Notification ${event.notificationId} created for user ${event.userId} of type ${event.type}`,
      'NotificationsEventHandler',
    );
  }

  @OnEvent('contest.created')
  async handleContestCreated(event: ContestCreatedEvent): Promise<void> {
    this.logger.info(`Contest ${event.contestId} created by user ${event.createdBy}`, 'NotificationsEventHandler');
    await this.notificationsRepository.create({
      userId: event.createdBy,
      type: 'contest.created',
      title: 'Contest Created',
      message: 'Your contest has been created successfully.',
      data: JSON.stringify({ contestId: event.contestId }),
    });
  }

  @OnEvent('winner.selected')
  async handleWinnerSelected(event: WinnerSelectedEvent): Promise<void> {
    this.logger.info(
      `Winner selected for contest ${event.contestId}: user ${event.winnerId}`,
      'NotificationsEventHandler',
    );
    await this.notificationsRepository.create({
      userId: event.winnerId,
      type: 'winner.selected',
      title: 'Congratulations! You won a contest',
      message: 'You have been selected as the winner of a contest.',
      data: JSON.stringify({ contestId: event.contestId, submissionId: event.submissionId }),
    });
  }

  @OnEvent('prize.distributed')
  async handlePrizeDistributed(event: PrizeDistributedEvent): Promise<void> {
    this.logger.info(
      `Prize distributed for contest ${event.contestId} to winner ${event.winnerId}`,
      'NotificationsEventHandler',
    );
    await this.notificationsRepository.create({
      userId: event.winnerId,
      type: 'prize.distributed',
      title: 'Prize Distributed',
      message: 'Your prize has been distributed.',
      data: JSON.stringify({ contestId: event.contestId, prizeId: event.prizeId }),
    });
  }

  // ---------------------------------------------------------------------------
  // Social notifications.
  //
  // WHY THIS BLOCK EXISTED EMPTY. Following, commenting and reacting all emit their event, and the
  // only subscribers were log lines in the emitting module. So the product had a notifications
  // table, a preferences table, an unread badge and a notifications page — and none of them ever
  // received a row. `GET /notifications` could only ever be empty, and the preferences table could
  // only ever store settings that suppressed nothing, because nothing read them.
  //
  // WHY EVERY HANDLER GOES THROUGH `NotificationsService` AND NOT THE REPOSITORY. The service is
  // the only path that consults the recipient's preferences and emits `notification.created`; the
  // three contest handlers above predate that contract and still write through the repository
  // directly. Migrating them is a separate, deliberate change rather than a silent one here.
  //
  // WHY THE RECIPIENT IS RESOLVED FROM THE TABLES RATHER THAN THE PAYLOAD. `story.reacted` carries
  // `userId` and `storyId` but not the story's author; `comment.reacted` carries `userId` and
  // `commentId` but not the comment's author; `message.sent` names the sender and never the
  // recipient. `BadgesEventHandler.handleStoryPublished` already resolves an author the payload
  // omits by reading `stories` directly, and this is that same arrangement — which also means no
  // producer has to be changed and no event schema has to grow a field.
  // ---------------------------------------------------------------------------

  @OnEvent('user.followed')
  async handleUserFollowed(event: UserFollowedEvent): Promise<void> {
    // `FollowsService.follow` already rejects a self-follow, so this is a second line of defence
    // rather than the primary one. A "you started following yourself" notification is worse than a
    // crash, so the guard stays.
    if (event.followerId === event.followingId) {
      return;
    }

    await this.deliver('user.followed', event.followingId, () =>
      this.notificationsService.create({
        userId: event.followingId,
        type: 'follow',
        title: 'New follower',
        message: 'Someone started following you.',
        data: JSON.stringify({ followerId: event.followerId, followingId: event.followingId }),
      }),
    );
  }

  /**
   * A top-level comment notifies the story's author; a reply notifies the parent comment's author.
   *
   * A self-notification is suppressed: `CommentsService.create` lets an author reply to their own
   * comment, and being told about your own reply is noise, not information.
   */
  @OnEvent('comment.created')
  async handleCommentCreated(event: CommentCreatedEvent): Promise<void> {
    const isReply = typeof event.parentId === 'string' && event.parentId.length > 0;
    const recipient = isReply
      ? await this.authorOfComment(event.parentId as string)
      : await this.authorOfStory(event.storyId);

    if (recipient === null || recipient === event.authorId) {
      return;
    }

    await this.deliver('comment.created', event.commentId, () =>
      this.notificationsService.create({
        userId: recipient,
        type: isReply ? 'comment_reply' : 'comment',
        title: isReply ? 'New reply to your comment' : 'New comment on your story',
        message: isReply ? 'Someone replied to one of your comments.' : 'Someone commented on your story.',
        data: JSON.stringify({
          commentId: event.commentId,
          storyId: event.storyId,
          parentId: event.parentId ?? null,
        }),
      }),
    );
  }

  @OnEvent('comment.reacted')
  async handleCommentReacted(event: CommentReactionCreated): Promise<void> {
    const recipient = await this.authorOfComment(event.commentId);
    if (recipient === null || recipient === event.userId) {
      return;
    }

    await this.deliver('comment.reacted', event.commentId, () =>
      this.notificationsService.create({
        userId: recipient,
        type: 'story_reaction',
        title: 'New reaction to your comment',
        message: 'Someone reacted to one of your comments.',
        data: JSON.stringify({ commentId: event.commentId, reactionType: event.reactionType }),
      }),
    );
  }

  @OnEvent('story.reacted')
  async handleStoryReacted(event: StoryReactedEvent): Promise<void> {
    const recipient = await this.authorOfStory(event.storyId);
    if (recipient === null || recipient === event.userId) {
      return;
    }

    await this.deliver('story.reacted', event.storyId, () =>
      this.notificationsService.create({
        userId: recipient,
        type: 'story_reaction',
        title: 'New reaction to your story',
        message: 'Someone reacted to your story.',
        data: JSON.stringify({ storyId: event.storyId, reactionType: event.reactionType }),
      }),
    );
  }

  /**
   * The recipient is the conversation's other participant. `messages` has no `recipient_id`
   * (`db/schema/social.schema.ts`), and `MessagesService` has already proved the sender is a
   * participant before this fires, so the other column IS the recipient.
   */
  @OnEvent('message.sent')
  async handleMessageSent(event: MessageSentEvent): Promise<void> {
    const [conversation] = await db
      .select({ participant1Id: conversations.participant1Id, participant2Id: conversations.participant2Id })
      .from(conversations)
      .where(eq(conversations.id, event.conversationId))
      .limit(1);

    if (!conversation) {
      return;
    }

    const recipient =
      conversation.participant1Id === event.senderId ? conversation.participant2Id : conversation.participant1Id;

    if (recipient === event.senderId) {
      return;
    }

    await this.deliver('message.sent', event.messageId, () =>
      this.notificationsService.create({
        userId: recipient,
        type: 'message',
        title: 'New message',
        message: 'You have a new direct message.',
        data: JSON.stringify({ conversationId: event.conversationId, messageId: event.messageId }),
      }),
    );
  }

  private async authorOfStory(storyId: string): Promise<string | null> {
    const [story] = await db
      .select({ authorId: stories.authorId })
      .from(stories)
      .where(eq(stories.id, storyId))
      .limit(1);
    return story?.authorId ?? null;
  }

  /**
   * A soft-deleted comment is a tombstone: `CommentsService.findById` rejects it with a 404 and
   * `findReplies` filters it out, so notifying its author about a reaction to it would point at
   * something the recipient cannot open.
   */
  private async authorOfComment(commentId: string): Promise<string | null> {
    const [comment] = await db
      .select({ authorId: comments.authorId })
      .from(comments)
      .where(and(eq(comments.id, commentId), eq(comments.isDeleted, false)))
      .limit(1);
    return comment?.authorId ?? null;
  }

  /**
   * A notification is a side effect of the action that triggered it, not the action itself. If it
   * throws, the follow / comment / reaction has already been committed and must not be reported as
   * failed — so the error is logged with the event name and the id an operator can look up, and
   * swallowed.
   *
   * Without this, one unavailable table would turn every successful reaction in the product into a
   * 500.
   */
  private async deliver(eventName: string, subjectId: string, run: () => Promise<unknown>): Promise<void> {
    try {
      await run();
    } catch (error) {
      this.logger.error(
        `Notification for ${eventName} ${subjectId} failed: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        'NotificationsEventHandler',
      );
    }
  }
}
