import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').default(createId()).primaryKey(),
    participantIds: uuid('participant_ids').array().notNull(),
    lastMessageAt: timestamp('last_message_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    createdAtIdx: index('conversations_created_at_idx').on(table.createdAt),
  })
);

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
