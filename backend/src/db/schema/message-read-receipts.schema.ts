import {
  pgTable,
  uuid,
  timestamp,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const messageReadReceipts = pgTable(
  'message_read_receipts',
  {
    id: uuid('id').default(createId()).primaryKey(),
    messageId: uuid('message_id').notNull(),
    userId: uuid('user_id').notNull(),
    readAt: timestamp('read_at').defaultNow().notNull(),
  },
  (table) => ({
    messageIdIdx: index('message_read_receipts_message_id_idx').on(table.messageId),
    userIdIdx: index('message_read_receipts_user_id_idx').on(table.userId),
    userIdMessageIdUnique: unique('message_read_receipts_user_id_message_id_key').on(table.userId, table.messageId),
  })
);

export type MessageReadReceipt = typeof messageReadReceipts.$inferSelect;
export type NewMessageReadReceipt = typeof messageReadReceipts.$inferInsert;
