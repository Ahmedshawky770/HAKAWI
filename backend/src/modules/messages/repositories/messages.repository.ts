import { Injectable, Inject } from '@nestjs/common';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type {
  IMessagesRepository,
  IncomingUnreadByConversation,
  LastMessagesByConversation,
  Message,
  CreateMessageInput,
} from '../interfaces/messages-repository.interface.ts';
import { messages } from '../../../db/schema/social.schema.ts';
import { db } from '../../../db/index.ts';

@Injectable()
export class MessagesRepository implements IMessagesRepository {
  constructor(@Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService) {}

  async findById(id: string): Promise<Message | null> {
    this.logger.debug(`Finding message by id: ${id}`);
    try {
      const [message] = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
      return message ?? null;
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
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

    return { messages: messagesList, total: Number(total) };
  }

  async create(data: CreateMessageInput): Promise<Message> {
    this.logger.info(`Creating message in conversation: ${data.conversationId}`);
    const [message] = await db.insert(messages).values(data).returning();
    return message;
  }

  async markAsRead(id: string): Promise<Message> {
    this.logger.debug(`Marking message as read: ${id}`);
    const [message] = await db
      .update(messages)
      .set({ isRead: true, readAt: new Date() })
      .where(eq(messages.id, id))
      .returning();
    return message;
  }

  async markAllAsRead(conversationId: string, userId: string): Promise<void> {
    this.logger.info(`Marking all messages as read in conversation: ${conversationId}`);
    await db
      .update(messages)
      .set({ isRead: true, readAt: new Date() })
      .where(
        and(eq(messages.conversationId, conversationId), eq(messages.senderId, userId), eq(messages.isRead, false)),
      );
  }

  async countUnread(conversationId: string, userId: string): Promise<number> {
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)` })
      .from(messages)
      .where(
        and(eq(messages.conversationId, conversationId), eq(messages.senderId, userId), eq(messages.isRead, false)),
      );
    return Number(total);
  }

  async findLastByConversations(conversationIds: readonly string[]): Promise<LastMessagesByConversation> {
    const newest = new Map<string, Message>();
    if (conversationIds.length === 0) {
      return newest;
    }
    this.logger.debug(`Finding the newest message of ${conversationIds.length} conversations`);

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

  async countIncomingUnreadByConversations(
    conversationIds: readonly string[],
    senderIds: readonly string[],
  ): Promise<IncomingUnreadByConversation> {
    const unread = new Map<string, number>();
    if (conversationIds.length === 0 || senderIds.length === 0) {
      return unread;
    }
    this.logger.debug(`Counting incoming unread messages across ${conversationIds.length} conversations`);

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
}
