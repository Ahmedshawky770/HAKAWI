import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').default(createId()).primaryKey(),
    userId: uuid('user_id').notNull(),
    type: varchar('type', { length: 50 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    message: text('message').notNull(),
    isRead: boolean('is_read').notNull().default(false),
    readAt: timestamp('read_at'),
    actorId: uuid('actor_id'),
    entityId: uuid('entity_id'),
    data: jsonb('data'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('notifications_user_id_idx').on(table.userId),
    isReadIdx: index('notifications_is_read_idx').on(table.isRead),
    typeIdx: index('notifications_type_idx').on(table.type),
    createdAtIdx: index('notifications_created_at_idx').on(table.createdAt),
    actorIdIdx: index('notifications_actor_id_idx').on(table.actorId),
  })
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
