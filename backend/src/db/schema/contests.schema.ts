import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const contests = pgTable(
  'contests',
  {
    id: uuid('id').default(createId()).primaryKey(),
    publisherId: uuid('publisher_id').notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description').notNull(),
    theme: varchar('theme', { length: 255 }),
    category: varchar('category', { length: 100 }),
    participantType: varchar('participant_type', { length: 20 })
      .notNull()
      .default('writer'),
    status: varchar('status', { length: 20 }).notNull().default('draft'),
    startDate: timestamp('start_date').notNull(),
    endDate: timestamp('end_date').notNull(),
    submissionDeadline: timestamp('submission_deadline').notNull(),
    prizeType: varchar('prize_type', { length: 20 }).notNull(),
    prizeValue: integer('prize_value'),
    prizeDescription: text('prize_description'),
    rules: text('rules'),
    minWordCount: integer('min_word_count').notNull().default(0),
    maxWordCount: integer('max_word_count'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    publisherIdIdx: index('contests_publisher_id_idx').on(table.publisherId),
    statusIdx: index('contests_status_idx').on(table.status),
    startDateIdx: index('contests_start_date_idx').on(table.startDate),
    endDateIdx: index('contests_end_date_idx').on(table.endDate),
  })
);

export type Contest = typeof contests.$inferSelect;
export type NewContest = typeof contests.$inferInsert;
