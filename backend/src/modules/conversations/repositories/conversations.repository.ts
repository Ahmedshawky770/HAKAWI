import { Injectable, Logger } from '@nestjs/common';
import { eq, and, desc, sql } from 'drizzle-orm';
import { conversations } from '../../../db/schema/conversations.schema.js';
import { db } from '../../../db/index.js';
import type {
  IConversationsRepository,
  Conversation,
  CreateConversationData,
  UpdateConversationData,
} from '../interfaces/conversations-repository.interface.js';

@Injectable()
export class ConversationsRepository implements IConversationsRepository {
  private readonly logger = new Logger(ConversationsRepository.name);

  async findById(id: string): Promise<Conversation | null> {
    this.logger.debug(`Finding conversation by id: ${id}`);
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);
    return conversation ?? null;
  }

  async findByParticipantId(userId: string): Promise<Conversation[]> {
    this.logger.debug(`Finding conversations by participant: ${userId}`);
    return db
      .select()
      .from(conversations)
      .where(
        sql`${conversations.participantIds} @> ${JSON.stringify([userId])}::jsonb`,
      )
      .orderBy(desc(conversations.lastMessageAt ?? conversations.createdAt));
  }

  async findByParticipants(
    participantIds: string[],
  ): Promise<Conversation | null> {
    this.logger.debug(
      `Finding conversation by participants: ${participantIds.join(',')}`,
    );
    const sortedIds = [...participantIds].sort();
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(
        sql`${conversations.participantIds} @> ${JSON.stringify(sortedIds)}::jsonb`,
      )
      .limit(1);
    return conversation ?? null;
  }

  async create(data: CreateConversationData): Promise<Conversation> {
    this.logger.info(
      `Creating conversation with participants: ${JSON.stringify(data.participantIds)}`,
    );
    const [conversation] = await db
      .insert(conversations)
      .values(data)
      .returning();
    return conversation;
  }

  async update(
    id: string,
    data: Partial<UpdateConversationData>,
  ): Promise<Conversation> {
    this.logger.debug(`Updating conversation: ${id}`);
    const [conversation] = await db
      .update(conversations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(conversations.id, id))
      .returning();
    return conversation;
  }

  async delete(id: string): Promise<void> {
    this.logger.debug(`Deleting conversation: ${id}`);
    await db.delete(conversations).where(eq(conversations.id, id));
  }
}
