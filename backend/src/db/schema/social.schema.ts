import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';

import { users } from './users.schema.ts';
import { stories } from './stories.schema.ts';

export const follows = pgTable(
  'follows',
  {
    id: uuid('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
    followerId: uuid('follower_id').notNull().references(() => users.id),
    followingId: uuid('following_id').notNull().references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    followerIdx: index('follows_follower_id_idx').on(table.followerId),
    followingIdx: index('follows_following_id_idx').on(table.followingId),
    uniqueFollow: index('follows_unique_idx').on(table.followerId, table.followingId),
  })
);

export const reactions = pgTable(
  'reactions',
  {
    id: uuid('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id),
    storyId: uuid('story_id').notNull().references(() => stories.id),
    type: varchar('type', { length: 20 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index('reactions_user_id_idx').on(table.userId),
    storyIdx: index('reactions_story_id_idx').on(table.storyId),
    uniqueReaction: index('reactions_unique_idx').on(table.userId, table.storyId),
  })
);

export const comments: ReturnType<typeof pgTable> = pgTable(
  'comments',
  {
    id: uuid('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
    storyId: uuid('story_id').notNull().references(() => stories.id),
    authorId: uuid('author_id').notNull().references(() => users.id),
    parentId: uuid('parent_id').references(() => comments.id),
    content: text('content').notNull(),
    likeCount: integer('like_count').default(0).notNull(),
    replyCount: integer('reply_count').default(0).notNull(),
    isDeleted: boolean('is_deleted').default(false).notNull(),
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    storyIdx: index('comments_story_id_idx').on(table.storyId),
    authorIdx: index('comments_author_id_idx').on(table.authorId),
    parentIdx: index('comments_parent_id_idx').on(table.parentId),
  })
);

export const commentReactions = pgTable(
  'comment_reactions',
  {
    id: uuid('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id),
    commentId: uuid('comment_id').notNull().references(() => comments.id),
    type: varchar('type', { length: 20 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index('comment_reactions_user_id_idx').on(table.userId),
    commentIdx: index('comment_reactions_comment_id_idx').on(table.commentId),
    uniqueReaction: index('comment_reactions_unique_idx').on(table.userId, table.commentId),
  })
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id),
    type: varchar('type', { length: 50 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    message: text('message').notNull(),
    data: text('data'),
    isRead: boolean('is_read').default(false).notNull(),
    readAt: timestamp('read_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index('notifications_user_id_idx').on(table.userId),
    readIdx: index('notifications_read_idx').on(table.userId, table.isRead),
  })
);

export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    id: uuid('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id),
    emailEnabled: boolean('email_enabled').default(true).notNull(),
    pushEnabled: boolean('push_enabled').default(true).notNull(),
    storyReactions: boolean('story_reactions').default(true).notNull(),
    comments: boolean('comments').default(true).notNull(),
    follows: boolean('follows').default(true).notNull(),
    mentions: boolean('mentions').default(true).notNull(),
    system: boolean('system').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('notification_preferences_user_id_idx').on(table.userId),
  })
);

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
    participant1Id: uuid('participant1_id').notNull().references(() => users.id),
    participant2Id: uuid('participant2_id').notNull().references(() => users.id),
    lastMessageAt: timestamp('last_message_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    participant1Idx: index('conversations_participant1_id_idx').on(table.participant1Id),
    participant2Idx: index('conversations_participant2_id_idx').on(table.participant2Id),
    uniqueConversation: index('conversations_unique_idx').on(table.participant1Id, table.participant2Id),
  })
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').$defaultFn(() => crypto.randomUUID()).primaryKey(),
    conversationId: uuid('conversation_id').notNull().references(() => conversations.id),
    senderId: uuid('sender_id').notNull().references(() => users.id),
    content: text('content').notNull(),
    isRead: boolean('is_read').default(false).notNull(),
    readAt: timestamp('read_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    conversationIdx: index('messages_conversation_id_idx').on(table.conversationId),
    senderIdx: index('messages_sender_id_idx').on(table.senderId),
  })
);

export type Follow = typeof follows.$inferSelect;
export type Reaction = typeof reactions.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type CommentReaction = typeof commentReactions.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
