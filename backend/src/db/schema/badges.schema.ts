import { pgTable, uuid, varchar, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';

import { users } from './users.schema.ts';

export const badges = pgTable(
  'badges',
  {
    id: uuid('id')
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    icon: varchar('icon', { length: 255 }),
    criteria: text('criteria'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    nameIdx: index('badges_name_idx').on(table.name),
  }),
);

export const userBadges = pgTable(
  'user_badges',
  {
    id: uuid('id')
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    badgeId: uuid('badge_id')
      .notNull()
      .references(() => badges.id, { onDelete: 'cascade' }),
    awardedAt: timestamp('awarded_at').defaultNow().notNull(),
    awardedBy: uuid('awarded_by').references(() => users.id),
  },
  (table) => ({
    uniqueUserBadge: uniqueIndex('user_badges_unique_idx').on(table.userId, table.badgeId),
    userIdIdx: index('user_badges_user_id_idx').on(table.userId),
    badgeIdIdx: index('user_badges_badge_id_idx').on(table.badgeId),
  }),
);

export type Badge = typeof badges.$inferSelect;
export type NewBadge = typeof badges.$inferInsert;
export type UserBadge = typeof userBadges.$inferSelect;
export type NewUserBadge = typeof userBadges.$inferInsert;
