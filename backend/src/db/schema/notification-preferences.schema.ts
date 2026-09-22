import {
  pgTable,
  uuid,
  boolean,
  jsonb,
  timestamp,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    id: uuid('id').default(createId()).primaryKey(),
    userId: uuid('user_id').notNull().unique(),
    emailEnabled: boolean('email_enabled').notNull().default(true),
    pushEnabled: boolean('push_enabled').notNull().default(true),
    inAppEnabled: boolean('in_app_enabled').notNull().default(true),
    types: jsonb('types'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('notification_preferences_user_id_idx').on(table.userId),
  })
);

export type NotificationPreference =
  typeof notificationPreferences.$inferSelect;
export type NewNotificationPreference =
  typeof notificationPreferences.$inferInsert;
