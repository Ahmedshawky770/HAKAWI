import { isOneOf } from './common.js';
import type { AuthorSummary, NamedPage, Paginated } from './common.js';

export const REACTION_TYPES = ['like', 'love', 'wow', 'sad', 'angry', 'haunted'] as const;
export type ReactionType = (typeof REACTION_TYPES)[number];

export const isReactionType = (value: string): value is ReactionType => isOneOf(REACTION_TYPES, value);

export type Reaction = {
  id: string;
  userId: string;
  storyId: string;
  type: ReactionType;
  createdAt: string;
};

export type ReactionsListResponse = NamedPage<'reactions', Reaction>;

export type ReactionCounts = { [Type in ReactionType]: number };

export type Comment = {
  id: string;
  storyId: string;
  authorId: string;
  authorName: string;
  parentId: string | null;
  content: string;
  likeCount: number;
  replyCount: number;
  replies?: Comment[];
  createdAt: string;
  updatedAt: string;
};

export type CommentsListResponse = NamedPage<'comments', Comment>;

export type CommentRepliesResponse = Paginated<Comment>;

export type Follow = {
  id: string;
  followerId: string;
  followingId: string;
  createdAt: string;
};

export type FollowersResponse = NamedPage<'followers', Follow>;

export type FollowingResponse = NamedPage<'following', Follow>;

export type FollowStats = {
  followersCount: number;
  followingCount: number;
  isFollowing: boolean;
};

export const NOTIFICATION_TYPES = [
  'story_reaction',
  'comment',
  'comment_reply',
  'follow',
  'mention',
  'message',
  'contest',
  'payment',
  'system',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const isNotificationType = (value: string): value is NotificationType => isOneOf(NOTIFICATION_TYPES, value);

export type Notification = {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  data: Record<string, unknown> | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
};

export type NotificationsListResponse = NamedPage<'notifications', Notification>;

export type NotificationMarkReadResponse = {
  id: string;
  isRead: boolean;
  readAt: string;
};

export type Conversation = {
  id: string;
  participant1Id: string;
  participant2Id: string;
  participant: AuthorSummary;
  lastMessage?: {
    content: string;
    createdAt: string;
  };
  unreadCount: number;
  createdAt: string;
};

export type ConversationsListResponse = NamedPage<'conversations', Conversation>;

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
};

export type MessagesListResponse = NamedPage<'messages', Message>;
