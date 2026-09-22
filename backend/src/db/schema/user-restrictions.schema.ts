import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const userRestrictions = pgTable(
  'user_restrictions',
  {
    id: uuid('id').default(createId()).primaryKey(),
    userId: uuid('user_id').notNull().unique(),
    restrictionType: varchar('restriction_type', { length: 50 }).notNull(),
    reason: text('reason').notNull(),
    expiresAt: timestamp('expires_at'),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('user_restrictions_user_id_idx').on(table.userId),
    expiresAtIdx: index('user_restrictions_expires_at_idx').on(table.expiresAt),
    createdByIdx: index('user_restrictions_created_by_idx').on(table.createdBy),
  })
);

export type UserRestriction = typeof userRestrictions.$inferSelect;
export type NewUserRestriction = typeof userRestrictions.$inferInsert;
