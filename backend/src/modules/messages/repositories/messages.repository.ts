import { Injectable, Inject } from '@nestjs/common';
import { eq, and, ne, desc, inArray, sql } from 'drizzle-orm';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type {
  IMessagesRepository,
  IncomingUnreadByConversation,
  LastMessagesByConversation,
  Message,
  CreateMessageInput,
} from '../interfaces/messages-repository.interface.ts';
import { messages } from '../../../db/schema/social.schema.ts';
import { db, dbPrimary } from '../../../db/index.ts';

type MessagePgRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  is_read: boolean;
  read_at: Date | null;
  created_at: Date;
};

type ConversationCountPgRow = {
  conversation_id: string;
  total: string;
};

/**
 * CUTOVER PHASE: reads now target `messages_p` (the partitioned parent) instead of the legacy
 * `messages` table. PostgreSQL partition pruning makes time-range queries cheaper, and each
 * monthly child partition is small enough to vacuum/reindex independently.
 *
 * Writes (`create`, `markAsRead`, `markAllAsRead`) continue to target the legacy `messages`
 * table via the routed `db` proxy, plus dual-write to `messages_p`. Once migration 0039 drops
 * the legacy tables, `messages_p` becomes the Single Source of Truth.
 *
 * Prerequisite (must be satisfied before this code is deployed):
 *   1. Migration 0035 applied — `messages_p` exists.
 *   2. `npm run db:backfill-partitions` run — legacy data copied to `messages_p`.
 *   3. `npm run db:verify-cutover` passed — row counts match.
 *   4. Migration 0039 run — legacy `messages` table dropped.
 */

@Injectable()
export class MessagesRepository implements IMessagesRepository {
  constructor(@Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService) {}

  async findById(id: string): Promise<Message | null> {
    this.logger.debug(`Finding message by id: ${id}`);
    try {
      // CUTOVER: read from messages_p (partitioned parent) instead of legacy messages table.
      const result = await dbPrimary.execute(sql`SELECT id, conversation_id, sender_id, content, is_read, read_at, created_at
          FROM messages_p WHERE id = ${id} LIMIT 1`);
      const row = result.rows[0];
      if (!row) return null;
      return {
        id: row.id,
        conversationId: row.conversation_id,
        senderId: row.sender_id,
        content: row.content,
        isRead: row.is_read,
        readAt: row.read_at,
        createdAt: row.created_at,
      } as Message;
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      // 42P01 = undefined_table: partitioned table doesn't exist yet (pre-cutover). Fall back to legacy.
      if (code === '42P01') {
        const [message] = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
        return message ?? null;
      }
      if (code === '22P02') {
        return null;
      }
      throw error;
    }
  }

  async findByConversation(
    conversationId: string,
    page: number,
    limit: number,
  ): Promise<{ messages: Message[]; total: number }> {
    this.logger.debug(`Finding messages for conversation: ${conversationId}`);
    const offset = (page - 1) * limit;

    try {
      // CUTOVER: read from messages_p (partitioned parent).
      const [messagesResult, countResult] = await Promise.all([
        dbPrimary.execute(sql`SELECT id, conversation_id, sender_id, content, is_read, read_at, created_at
            FROM messages_p
            WHERE conversation_id = ${conversationId}
            ORDER BY created_at DESC
            LIMIT ${limit} OFFSET ${offset}`),
        dbPrimary.execute(sql`SELECT count(*) AS total FROM messages_p WHERE conversation_id = ${conversationId}`),
      ]);

      const messagesList = messagesResult.rows.map((row: Record<string, unknown>) => ({
        id: row.id,
        conversationId: row.conversation_id,
        senderId: row.sender_id,
        content: row.content,
        isRead: row.is_read,
        readAt: row.read_at,
        createdAt: row.created_at,
      }));

      return { messages: messagesList as Message[], total: Number(countResult.rows[0]?.total ?? 0) };
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      // 42P01 = undefined_table: fall back to legacy messages table.
      if (code === '42P01') {
        const [messagesList, [{ total }]] = await Promise.all([
          db
            .select()
            .from(messages)
            .where(eq(messages.conversationId, conversationId))
            .orderBy(desc(messages.createdAt))
            .limit(limit)
            .offset(offset),
          db
            .select({ total: sql<number>`count(*)` })
            .from(messages)
            .where(eq(messages.conversationId, conversationId)),
        ]);
        return { messages: messagesList as Message[], total: Number(total) };
      }
      throw error;
    }
  }

  async create(data: CreateMessageInput): Promise<Message> {
    this.logger.info(`Creating message in conversation: ${data.conversationId}`);
    return await dbPrimary.transaction(async (tx) => {
      const [message] = await tx.insert(messages).values(data).returning();
      // Dual-write to the partitioned table during the migration phase. The partitioned parent
      // routes the row to the correct monthly child partition automatically. Same transaction
      // as the legacy write so both succeed or neither does.
      await tx.execute(sql`INSERT INTO messages_p (id, conversation_id, sender_id, content, is_read, read_at, created_at)
          VALUES (${message.id}, ${data.conversationId}, ${data.senderId}, ${data.content}, FALSE, NULL, ${message.createdAt?.toISOString() ?? new Date().toISOString()})
          ON CONFLICT (id) DO NOTHING`);
      return message;
    });
  }

  async markAsRead(id: string): Promise<Message> {
    this.logger.debug(`Marking message as read: ${id}`);
    return await dbPrimary.transaction(async (tx) => {
      const [message] = await tx
        .update(messages)
        .set({ isRead: true, readAt: new Date() })
        .where(eq(messages.id, id))
        .returning();
      // Dual-write the status change to the partitioned table. Same transaction.
      await tx.execute(sql`UPDATE messages_p SET is_read = TRUE, read_at = ${new Date().toISOString()} WHERE id = ${message.id}`);
      return message;
    });
  }

  /**
   * WHY `ne(senderId, userId)` AND NOT A RECIPIENT COLUMN. `messages` has no `recipient_id`
   * (`db/schema/social.schema.ts`); the recipient is implicit in the conversation's two
   * participant columns, and `MessagesService` has already proved the caller is one of them before
   * either of these is reached. Given that, "the unread messages of this conversation for me" is
   * exactly "the messages in this conversation that I did not send", and one negated predicate
   * expresses it without a subquery.
   *
   * WHY THIS WAS `eq(...)` AND WAS WRONG. The predicate selected the caller's OWN outbound
   * traffic: `GET /messages/conversations/:id/unread` counted what the caller had not yet seen of
   * their own messages, and `PATCH /messages/conversations/:id/read` marked the caller's own sent
   * messages as read. The sibling list path already had this right —
   * `countIncomingUnreadByConversations` below passes the OTHER participants' ids — so the two
   * disagreed inside one module.
   *
   * WHY THIS DEPENDS ON REFUSING SELF-DM. With `participant1_id = participant2_id` there is no
   * other side, `sender_id <> userId` matches nothing, and the badge would read 0 forever.
   * `MessagesService.getOrCreateConversation` rejects a self-DM, which is what keeps the negation
   * exact.
   */
  async markAllAsRead(conversationId: string, userId: string): Promise<void> {
    this.logger.info(`Marking all incoming messages as read in conversation: ${conversationId}`);
    return await dbPrimary.transaction(async (tx) => {
      await tx
        .update(messages)
        .set({ isRead: true, readAt: new Date() })
        .where(
          and(eq(messages.conversationId, conversationId), ne(messages.senderId, userId), eq(messages.isRead, false)),
        );
      // Dual-write the status change to the partitioned table. Same transaction.
      await tx.execute(sql`UPDATE messages_p SET is_read = TRUE, read_at = ${new Date().toISOString()}
          WHERE conversation_id = ${conversationId} AND sender_id <> ${userId} AND is_read = FALSE`);
    });
  }

  async countUnread(conversationId: string, userId: string): Promise<number> {
    try {
      // CUTOVER: read from messages_p (partitioned parent).
      const countResult = await dbPrimary.execute(sql`SELECT count(*) AS total FROM messages_p
          WHERE conversation_id = ${conversationId}
            AND sender_id <> ${userId}
            AND is_read = FALSE`);
      return Number(countResult.rows[0]?.total ?? 0);
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      // 42P01 = undefined_table: fall back to legacy messages table.
      if (code === '42P01') {
        const [{ total }] = await db
          .select({ total: sql<number>`count(*)` })
          .from(messages)
          .where(
            and(eq(messages.conversationId, conversationId), ne(messages.senderId, userId), eq(messages.isRead, false)),
          );
        return Number(total);
      }
      throw error;
    }
  }

  async findLastByConversations(conversationIds: readonly string[]): Promise<LastMessagesByConversation> {
    const newest = new Map<string, Message>();
    if (conversationIds.length === 0) {
      return newest;
    }
    this.logger.debug(`Finding the newest message of ${conversationIds.length} conversations`);

    try {
      // CUTOVER: read from messages_p (partitioned parent).
      const placeholders = conversationIds.map((_, i) => `$${i + 1}`).join(', ');
      const queryText = `SELECT id, conversation_id, sender_id, content, is_read, read_at, created_at
          FROM messages_p
          WHERE conversation_id IN (${placeholders})
          GROUP BY conversation_id, id, sender_id, content, is_read, read_at, created_at
          HAVING created_at = MAX(created_at)`;
      const result = await dbPrimary.$client.query(queryText, [...conversationIds]);

      for (const row of result.rows as MessagePgRow[]) {
        newest.set(row.conversation_id, {
          id: row.id,
          conversationId: row.conversation_id,
          senderId: row.sender_id,
          content: row.content,
          isRead: row.is_read,
          readAt: row.read_at,
          createdAt: row.created_at,
        } as Message);
      }
      return newest;
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      // 42P01 = undefined_table: fall back to legacy messages table via Drizzle.
      if (code === '42P01') {
        // Drizzle's PgSelect has no DISTINCT ON, so the "newest per conversation" row is selected
        // by a correlated subquery on the primary key. `id` breaks ties on `created_at`, which is
        // not unique, so two messages filed in the same millisecond still yield exactly one row per
        // conversation rather than an arbitrary pair.
        const rows = await db
          .select({
            id: messages.id,
            conversationId: messages.conversationId,
            senderId: messages.senderId,
            content: messages.content,
            isRead: messages.isRead,
            readAt: messages.readAt,
            createdAt: messages.createdAt,
          })
          .from(messages)
          .where(
            and(
              inArray(messages.conversationId, [...conversationIds]),
              sql`${messages.id} = (
                select "latest"."id" from "messages" "latest"
                where "latest"."conversation_id" = ${messages.conversationId}
                order by "latest"."created_at" desc, "latest"."id" desc
                limit 1
              )`,
            ),
          );

        for (const row of rows) {
          newest.set(row.conversationId, row);
        }
        return newest;
      }
      throw error;
    }
  }

  async countIncomingUnreadByConversations(
    conversationIds: readonly string[],
    senderIds: readonly string[],
  ): Promise<IncomingUnreadByConversation> {
    const unread = new Map<string, number>();
    if (conversationIds.length === 0 || senderIds.length === 0) {
      return unread;
    }
    this.logger.debug(`Counting incoming unread messages across ${conversationIds.length} conversations`);

    try {
      // CUTOVER: read from messages_p (partitioned parent).
      const allParams = [...conversationIds, ...senderIds];
      const convPlaceholders = conversationIds.map((_, i) => `$${i + 1}`).join(', ');
      const senderPlaceholders = senderIds.map((_, i) => `$${conversationIds.length + i + 1}`).join(', ');
      const queryText = `SELECT conversation_id, count(*) AS total FROM messages_p
          WHERE conversation_id IN (${convPlaceholders})
            AND sender_id IN (${senderPlaceholders})
            AND is_read = FALSE
          GROUP BY conversation_id`;
      const result = await dbPrimary.$client.query(queryText, allParams);

      for (const row of result.rows as ConversationCountPgRow[]) {
        unread.set(row.conversation_id, Number(row.total));
      }
      return unread;
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      // 42P01 = undefined_table: fall back to legacy messages table via Drizzle.
      if (code === '42P01') {
        const rows = await db
          .select({ conversationId: messages.conversationId, total: sql<number>`count(*)` })
          .from(messages)
          .where(
            and(
              inArray(messages.conversationId, [...conversationIds]),
              inArray(messages.senderId, [...senderIds]),
              eq(messages.isRead, false),
            ),
          )
          .groupBy(messages.conversationId);

        for (const row of rows) {
          unread.set(row.conversationId, Number(row.total));
        }
        return unread;
      }
      throw error;
    }
  }
}
