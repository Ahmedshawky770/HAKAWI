export class UserFollowedEvent {
  constructor(public readonly followerId: string, public readonly followingId: string) {}
}

export class UserUnfollowedEvent {
  constructor(public readonly followerId: string, public readonly followingId: string) {}
}

export class StoryReactedEvent {
  constructor(public readonly userId: string, public readonly storyId: string, public readonly reactionType: string) {}
}

export class StoryReactionRemovedEvent {
  constructor(public readonly userId: string, public readonly storyId: string) {}
}

export class CommentCreatedEvent {
  constructor(public readonly commentId: string, public readonly storyId: string, public readonly authorId: string, public readonly parentId?: string) {}
}

export class CommentUpdatedEvent {
  constructor(public readonly commentId: string, public readonly storyId: string) {}
}

export class CommentDeletedEvent {
  constructor(public readonly commentId: string, public readonly storyId: string) {}
}

export class NotificationCreatedEvent {
  constructor(public readonly notificationId: string, public readonly userId: string, public readonly type: string) {}
}

export class MessageSentEvent {
  constructor(public readonly messageId: string, public readonly conversationId: string, public readonly senderId: string) {}
}

export class MessageReadEvent {
  constructor(public readonly messageId: string, public readonly conversationId: string, public readonly readBy: string) {}
}
