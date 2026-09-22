import { pgTable, uuid, varchar, text, timestamp, index } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const userRestrictions = pgTable(
  'user_restrictions',
  {
    id: uuid('id').default(createId()).primaryKey(),
    userId: uuid('user_id').notNull(),
    restrictionType: varchar('restriction_type', { length: 50 }).notNull(),
    reason: text('reason').notNull(),
    restrictedBy: uuid('restricted_by').notNull(),
    expiresAt: timestamp('expires_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('user_restrictions_user_id_idx').on(table.userId),
    restrictedByIdx: index('user_restrictions_restricted_by_idx').on(table.restrictedBy),
    createdAtIdx: index('user_restrictions_created_at_idx').on(table.createdAt),
  })
);

export type UserRestriction = typeof userRestrictions.$inferSelect;
export type NewUserRestriction = typeof userRestrictions.$inferInsert;
