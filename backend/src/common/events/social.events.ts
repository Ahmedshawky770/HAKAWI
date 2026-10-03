export class UserFollowedEvent {
  constructor(
    public readonly followerId: string,
    public readonly followingId: string,
  ) {}
}

export class UserUnfollowedEvent {
  constructor(
    public readonly followerId: string,
    public readonly followingId: string,
  ) {}
}

export class StoryReactedEvent {
  constructor(
    public readonly userId: string,
    public readonly storyId: string,
    public readonly reactionType: string,
  ) {}
}

export class StoryReactionRemovedEvent {
  constructor(
    public readonly userId: string,
    public readonly storyId: string,
  ) {}
}

export class CommentCreatedEvent {
  constructor(
    public readonly commentId: string,
    public readonly storyId: string,
    public readonly authorId: string,
    public readonly parentId?: string,
  ) {}
}

export class CommentUpdatedEvent {
  constructor(
    public readonly commentId: string,
    public readonly storyId: string,
  ) {}
}

export class CommentDeletedEvent {
  constructor(
    public readonly commentId: string,
    public readonly storyId: string,
  ) {}
}

export class NotificationCreatedEvent {
  constructor(
    public readonly notificationId: string,
    public readonly userId: string,
    public readonly type: string,
  ) {}
}

export class MessageSentEvent {
  constructor(
    public readonly messageId: string,
    public readonly conversationId: string,
    public readonly senderId: string,
    /**
     * The other participant — the account that should be told about this message.
     *
     * WHY IT IS ON THE EVENT. It used to be absent, and the notifications consumer read the
     * `conversations` table itself to derive it. That is a cross-aggregate read by a module that does
     * not own the conversations schema (Principle #7), carried out when the producer had already
     * loaded the very row being re-read (Principle #9 — the producer of a fact is its source of
     * truth). `MessagesService.sendMessage` validates participation before it emits, so both
     * participants are in hand and this costs one expression and no query.
     *
     * It is optional only because the dead-letter queue persists payloads: an entry replayed from
     * before this field existed must still validate, and a consumer with no recipient has nothing to
     * notify rather than an error to raise.
     */
    public readonly recipientId?: string,
  ) {}
}

export class MessageReadEvent {
  constructor(
    public readonly messageId: string,
    public readonly conversationId: string,
    public readonly readBy: string,
  ) {}
}
