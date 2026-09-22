import { Injectable, Logger } from '@nestjs/common';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { messages } from '../../../db/schema/messages.schema.js';
import { messageReadReceipts } from '../../../db/schema/message-read-receipts.schema.js';
import { db } from '../../../db/index.js';
import type {
  IMessagesRepository,
  Message,
  CreateMessageData,
  UpdateMessageData,
} from '../interfaces/messages-repository.interface.js';

@Injectable()
export class MessagesRepository implements IMessagesRepository {
  private readonly logger = new Logger(MessagesRepository.name);

  async findById(id: string): Promise<Message | null> {
    this.logger.debug(`Finding message by id: ${id}`);
    const [message] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, id))
      .limit(1);
    return message ?? null;
  }

  async findByConversationId(conversationId: string): Promise<Message[]> {
    this.logger.debug(`Finding messages by conversation: ${conversationId}`);
    return db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt));
  }

  async create(data: CreateMessageData): Promise<Message> {
    this.logger.info(`Creating message in conversation: ${data.conversationId}`);
    const [message] = await db.insert(messages).values(data).returning();
    return message;
  }

  async update(id: string, data: Partial<UpdateMessageData>): Promise<Message> {
    this.logger.debug(`Updating message: ${id}`);
    const [message] = await db
      .update(messages)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(messages.id, id))
      .returning();
    return message;
  }

  async delete(id: string): Promise<void> {
    this.logger.debug(`Soft deleting message: ${id}`);
    await db
      .update(messages)
      .set({ deletedAt: new Date() })
      .where(eq(messages.id, id));
  }

  async markAsRead(messageId: string, userId: string): Promise<void> {
    this.logger.debug(`Marking message as read: ${messageId} by ${userId}`);
    await db
      .insert(messageReadReceipts)
      .values({ messageId, userId, readAt: new Date() })
      .onConflictDoNothing();
  }

  async getUnreadCount(
    conversationId: string,
    userId: string,
  ): Promise<number> {
    this.logger.debug(
      `Getting unread count for conversation: ${conversationId}`,
    );
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          sql`${messages.senderId} != ${userId}`,
        ),
      );
    return Number(count);
  }
}
