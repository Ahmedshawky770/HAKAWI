import { Injectable, Inject } from '@nestjs/common';
import { eq, and, desc, or } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type { IConversationsRepository, Conversation, CreateConversationInput } from '../interfaces/messages-repository.interface.ts';
import { CONVERSATIONS_REPOSITORY } from '../interfaces/messages-repository.interface.ts';
import { conversations } from '../../../db/schema/social.schema.ts';
import { db } from '../../../db/index.ts';

@Injectable()
export class ConversationsRepository implements IConversationsRepository {
  constructor(@Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService) {}

  async findById(id: string): Promise<Conversation | null> {
    this.logger.debug(`Finding conversation by id: ${id}`);
    try {
      const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
      return conversation ?? null;
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === '22P02') {
        return null;
      }
      throw error;
    }
  }

  async findByParticipants(participant1Id: string, participant2Id: string): Promise<Conversation | null> {
    this.logger.debug(`Finding conversation between ${participant1Id} and ${participant2Id}`);
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.participant1Id, participant1Id),
          eq(conversations.participant2Id, participant2Id)
        )
      )
      .limit(1);
    return conversation ?? null;
  }

  async findByUser(userId: string, page: number, limit: number): Promise<{ conversations: Conversation[]; total: number }> {
    this.logger.debug(`Finding conversations for user: ${userId}`);
    const offset = (page - 1) * limit;

    const [conversationsList, [{ total }]] = await Promise.all([
      db
        .select()
        .from(conversations)
        .where(or(eq(conversations.participant1Id, userId), eq(conversations.participant2Id, userId)))
        .orderBy(desc(conversations.lastMessageAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: sql<number>`count(*)` })
        .from(conversations)
        .where(or(eq(conversations.participant1Id, userId), eq(conversations.participant2Id, userId))),
    ]);

    return { conversations: conversationsList, total: Number(total) };
  }

  async create(data: CreateConversationInput): Promise<Conversation> {
    this.logger.info(`Creating conversation between ${data.participant1Id} and ${data.participant2Id}`);
    const [conversation] = await db.insert(conversations).values(data).returning();
    return conversation;
  }

  async updateLastMessage(id: string): Promise<void> {
    this.logger.debug(`Updating last message timestamp for conversation: ${id}`);
    await db.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, id));
  }
}
