/**
 * CONTEST NOTIFICATIONS ARE NOT THIS FILE'S JOB. The contests module owns them, in full, and it is
 * canonical — see `ContestsEventHandler` in `src/modules/contests/events/contests.event-handler.ts`.
 *
 * This file used to answer `contest.created`, `winner.selected` and `prize.distributed` as well, so a
 * winner received TWO rows for winning and TWO for the prize, each pair with a different type string
 * (`contest` and `payment` from the contests module, `winner.selected` and `prize.distributed` from
 * here), and a contest author received a row the contests module had deliberately decided they should
 * not have. The two sides also disagreed on the facts: only the contests module knows that nobody is to
 * be notified about `contest.created` ("nobody is notified — the author is the only party that did not
 * already know"), and only it knows which type string a prize payment belongs to.
 *
 * WHY THE CONTESTS MODULE IS THE ONE THAT DECIDES (Principle #7, modules communicate through their
 * owner's public surface; #9, one source of truth). A contest notification is a decision about a
 * contest, taken by the module that knows the contest's rules — who the organiser is, who entered, who
 * was paid — and its copy is written in the contests module next to those rules. A second handler in
 * the notifications module can only ever disagree with that decision, because it has no way to know
 * it: it sees the same event payload and no context. So the duplicate handlers are gone rather than
 * reconciled, and this header is here so nobody re-adds them as a "belt and braces" safety net. The
 * contests handlers already go through `NotificationsService`, so they sit behind the same preference
 * gate and emit `notification.created` exactly as the handlers in this file do.
 *
 * WHAT THIS FILE DOES OWN: the social events — a follow, a story reaction, a comment, a comment
 * reaction and a direct message — plus the `notification.created` log line. Every one of them writes
 * through `NotificationsService`, which is the single path that consults the recipient's preferences.
 */
import { Injectable, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type { NotificationCreatedEvent } from '../../../common/events/social.events.ts';
import type {
  UserFollowedEvent,
  CommentCreatedEvent,
  StoryReactedEvent,
  MessageSentEvent,
} from '../../../common/events/social.events.ts';
import type { IStoriesRepository } from '../../stories/interfaces/stories-repository.interface.ts';
import { STORIES_REPOSITORY } from '../../stories/interfaces/stories-repository.interface.ts';
import type { ICommentsRepository } from '../../comments/interfaces/comments-repository.interface.ts';
import { COMMENTS_REPOSITORY } from '../../comments/interfaces/comments-repository.interface.ts';
import { NotificationsService } from '../notifications.service.ts';

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
    @Inject(NotificationsService) private readonly notificationsService: NotificationsService,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    // Each is the OWNING module's public interface, not a table handle. Principle #7's enforcement is
    // "modules communicate via interfaces only" plus "dependency injection for all dependencies" —
    // reading `stories` and `comments` through `db` directly, as this handler used to, bypassed the
    // modules that own them and coupled notifications to two schemas it has no reason to know.
    @Inject(STORIES_REPOSITORY) private readonly storiesRepository: IStoriesRepository,
    @Inject(COMMENTS_REPOSITORY) private readonly commentsRepository: ICommentsRepository,
  ) {}

  @OnEvent('notification.created')
  async handleNotificationCreated(event: NotificationCreatedEvent): Promise<void> {
    this.logger.info(
      `Notification ${event.notificationId} created for user ${event.userId} of type ${event.type}`,
      'NotificationsEventHandler',
    );
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
  // the only path that consults the recipient's preferences and emits `notification.created`.
  // `NOTIFICATIONS_REPOSITORY` is not injected here at all, so this file cannot bypass the gate even
  // by accident — and neither can the contests module, whose handlers write through the same service
  // (see the header comment above for why those live over there).
  //
  // WHY SOME RECIPIENTS ARE RESOLVED AND ONE IS NOT. `message.sent` now carries `recipientId`,
  // because `MessagesService` had already loaded the conversation to validate participation and was
  // therefore holding the fact already (Principle #9: the producer is the source of truth). The other
  // four events do NOT name their recipient at all — `story.reacted` carries `userId` and `storyId`
  // but not the author, `comment.reacted` carries `userId` and `commentId` but not the comment's
  // author — so there is nothing on the payload to read and the lookup is unavoidable.
  //
  // It is done through `IStoriesRepository` and `ICommentsRepository`, the owning modules' public
  // interfaces. This handler previously read the `stories`, `comments` and `conversations` tables
  // through `db` directly — which is what `BadgesEventHandler` still does — and that couples
  // notifications to two schemas it has no reason to know while bypassing the modules that own them
  // (Principle #7).
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
        // `comment_reaction`, NOT `story_reaction`. The family a notification belongs to is resolved
        // from its type, so writing `story_reaction` here gated a reaction to a COMMENT on the
        // `storyReactions` preference: muting comments did not silence reactions to your comments, and
        // muting story reactions did not spare you from comment ones. Both were wrong. See
        // `./preference-family.ts`.
        type: 'comment_reaction',
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
    /**
     * WHY THE RECIPIENT COMES OFF THE EVENT.
     *
     * It used to be derived by reading the `conversations` table here — a cross-aggregate read from
     * a module that does not own that schema, re-reading a row `MessagesService` had already loaded
     * in order to validate participation (Principle #7 for the former, #9 for the latter). The
     * producer now supplies it, so this module needs nothing from the messages module at all.
     *
     * An absent recipient is the dead-letter queue's shape: an entry persisted before the field
     * existed has no recipient, and the right response is to notify nobody rather than to raise.
     */
    const recipient = event.recipientId;

    if (!recipient || recipient === event.senderId) {
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
    const story = await this.storiesRepository.findById(storyId);
    return story?.authorId ?? null;
  }

  /**
   * A soft-deleted comment is a tombstone: `CommentsService.findById` rejects it with a 404 and
   * `findReplies` filters it out, so notifying its author about a reaction to it would point at
   * something the recipient cannot open.
   */
  private async authorOfComment(commentId: string): Promise<string | null> {
    const comment = await this.commentsRepository.findById(commentId);
    // `CommentsRepository.findById` returns a soft-deleted row — `CommentsService` is the layer that
    // rejects it — so the `is_deleted` filter this handler used to push into SQL is applied here
    // rather than assumed.
    if (!comment || comment.isDeleted) {
      return null;
    }
    return comment.authorId;
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
