import { Injectable, Inject } from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type { IMessagesRepository, Message, CreateMessageInput } from '../interfaces/messages-repository.interface.ts';
import { MESSAGES_REPOSITORY } from '../interfaces/messages-repository.interface.ts';
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

  async findByConversation(conversationId: string, page: number, limit: number): Promise<{ messages: Message[]; total: number }> {
    this.logger.debug(`Finding messages for conversation: ${conversationId}`);
    const offset = (page - 1) * limit;

    const [messagesList, [{ total }]] = await Promise.all([
      db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(desc(messages.createdAt)).limit(limit).offset(offset),
      db.select({ total: sql<number>`count(*)` }).from(messages).where(eq(messages.conversationId, conversationId)),
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
    const [message] = await db.update(messages).set({ isRead: true, readAt: new Date() }).where(eq(messages.id, id)).returning();
    return message;
  }

  async markAllAsRead(conversationId: string, userId: string): Promise<void> {
    this.logger.info(`Marking all messages as read in conversation: ${conversationId}`);
    await db
      .update(messages)
      .set({ isRead: true, readAt: new Date() })
      .where(and(eq(messages.conversationId, conversationId), eq(messages.senderId, userId), eq(messages.isRead, false)));
  }

  async countUnread(conversationId: string, userId: string): Promise<number> {
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)` })
      .from(messages)
      .where(and(eq(messages.conversationId, conversationId), eq(messages.senderId, userId), eq(messages.isRead, false)));
    return Number(total);
  }
}
