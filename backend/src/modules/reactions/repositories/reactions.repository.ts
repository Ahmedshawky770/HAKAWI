import { Injectable, Inject } from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type { IReactionsRepository, Reaction } from '../interfaces/reactions-repository.interface.ts';
import { reactions } from '../../../db/schema/social.schema.ts';
import { db } from '../../../db/index.ts';

@Injectable()
export class ReactionsRepository implements IReactionsRepository {
  constructor(@Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService) {}

  async findById(id: string): Promise<Reaction | null> {
    this.logger.debug(`Finding reaction by id: ${id}`);
    try {
      const [reaction] = await db.select().from(reactions).where(eq(reactions.id, id)).limit(1);
      return reaction ?? null;
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === '22P02') {
        return null;
      }
      throw error;
    }
  }

  async findByUserAndStory(userId: string, storyId: string): Promise<Reaction | null> {
    this.logger.debug(`Finding reaction: ${userId} on story ${storyId}`);
    const [reaction] = await db
      .select()
      .from(reactions)
      .where(and(eq(reactions.userId, userId), eq(reactions.storyId, storyId)))
      .limit(1);
    return reaction ?? null;
  }

  async findReactionsByStory(storyId: string, page: number, limit: number): Promise<{ reactions: Reaction[]; total: number }> {
    this.logger.debug(`Finding reactions for story: ${storyId}`);
    const offset = (page - 1) * limit;

    const [reactionsList, [{ total }]] = await Promise.all([
      db.select().from(reactions).where(eq(reactions.storyId, storyId)).orderBy(desc(reactions.createdAt)).limit(limit).offset(offset),
      db.select({ total: sql<number>`count(*)` }).from(reactions).where(eq(reactions.storyId, storyId)),
    ]);

    return { reactions: reactionsList, total: Number(total) };
  }

  async create(data: { userId: string; storyId: string; type: string }): Promise<Reaction> {
    this.logger.info(`Creating reaction: ${data.type} on story ${data.storyId}`);
    const [reaction] = await db.insert(reactions).values(data).returning();
    return reaction;
  }

  async update(id: string, data: { type: string }): Promise<Reaction> {
    this.logger.debug(`Updating reaction: ${id}`);
    const [reaction] = await db.update(reactions).set(data).where(eq(reactions.id, id)).returning();
    return reaction;
  }

  async delete(id: string): Promise<void> {
    this.logger.info(`Deleting reaction: ${id}`);
    await db.delete(reactions).where(eq(reactions.id, id));
  }

  async deleteByUserAndStory(userId: string, storyId: string): Promise<void> {
    this.logger.info(`Deleting reaction: ${userId} on story ${storyId}`);
    await db.delete(reactions).where(and(eq(reactions.userId, userId), eq(reactions.storyId, storyId)));
  }

  async countReactions(storyId: string): Promise<number> {
    const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(reactions).where(eq(reactions.storyId, storyId));
    return Number(total);
  }

  async countReactionsByType(storyId: string, type: string): Promise<number> {
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)` })
      .from(reactions)
      .where(and(eq(reactions.storyId, storyId), eq(reactions.type, type)));
    return Number(total);
  }
}
