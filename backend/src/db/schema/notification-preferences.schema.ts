import { pgTable, uuid, varchar, timestamp, boolean, index, unique } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    id: uuid('id').default(createId()).primaryKey(),
    userId: uuid('user_id').notNull(),
    notificationType: varchar('notification_type', { length: 50 }).notNull(),
    enabled: boolean('enabled').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdNotificationTypeUnique: unique('notification_preferences_user_id_notification_type_unique').on(
      table.userId,
      table.notificationType
    ),
    userIdIdx: index('notification_preferences_user_id_idx').on(table.userId),
  })
);

export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type NewNotificationPreference = typeof notificationPreferences.$inferInsert;
