import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  index,
} from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const contests = pgTable(
  'contests',
  {
    id: uuid('id').default(createId()).primaryKey(),
    publisherId: uuid('publisher_id').notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description').notNull(),
    rules: text('rules'),
    prize: varchar('prize', { length: 255 }),
    status: varchar('status', { length: 20 }).notNull().default('draft'),
    startDate: timestamp('start_date'),
    endDate: timestamp('end_date'),
    maxParticipants: integer('max_participants'),
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    publisherIdIdx: index('contests_publisher_id_idx').on(table.publisherId),
    statusIdx: index('contests_status_idx').on(table.status),
  })
);

export type Contest = typeof contests.$inferSelect;
export type NewContest = typeof contests.$inferInsert;
