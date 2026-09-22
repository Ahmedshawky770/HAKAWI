import { pgTable, uuid, text, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').default(createId()).primaryKey(),
    conversationId: uuid('conversation_id').notNull(),
    senderId: uuid('sender_id').notNull(),
    content: text('content').notNull(),
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    conversationIdIdx: index('messages_conversation_id_idx').on(table.conversationId),
    senderIdIdx: index('messages_sender_id_idx').on(table.senderId),
    createdAtIdx: index('messages_created_at_idx').on(table.createdAt),
  })
);

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
