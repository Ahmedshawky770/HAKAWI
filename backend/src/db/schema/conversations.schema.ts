import { pgTable, uuid, varchar, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').default(createId()).primaryKey(),
    participantIds: uuid('participant_ids').array().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    createdAtIdx: index('conversations_created_at_idx').on(table.createdAt),
    updatedAtIdx: index('conversations_updated_at_idx').on(table.updatedAt),
  })
);

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
