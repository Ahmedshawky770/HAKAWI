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
import { messages, messagesP } from '../../../db/schema/social.schema.ts';
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
 * Single source of truth is now `messages_p` (the partitioned parent). Reads target
 * `messages_p` with a 42P01 fallback to the legacy `messages` table for pre-cutover
 * environments. Writes target `messages_p` directly.
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
      const [message] = await tx.insert(messagesP).values(data as never).returning();
      return message;
    });
  }

  async markAsRead(id: string): Promise<Message> {
    this.logger.debug(`Marking message as read: ${id}`);
    return await dbPrimary.transaction(async (tx) => {
      const [message] = await tx
        .update(messagesP)
        .set({ isRead: true, readAt: new Date() })
        .where(eq(messagesP.id, id))
        .returning();
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
        .update(messagesP)
        .set({ isRead: true, readAt: new Date() })
        .where(
          and(eq(messagesP.conversationId, conversationId), ne(messagesP.senderId, userId), eq(messagesP.isRead, false)),
        );
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
      const queryText = `SELECT DISTINCT ON (conversation_id) id, conversation_id, sender_id, content, is_read, read_at, created_at
          FROM messages_p
          WHERE conversation_id IN (${placeholders})
          ORDER BY conversation_id, created_at DESC, id DESC`;
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
