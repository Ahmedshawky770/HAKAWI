import { Injectable, Inject } from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type { ICommentReactionsRepository, CommentReaction } from '../interfaces/comments-repository.interface.ts';
import { commentReactions } from '../../../db/schema/social.schema.ts';
import { db } from '../../../db/index.ts';

@Injectable()
export class CommentReactionsRepository implements ICommentReactionsRepository {
  constructor(@Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService) {}

  async findById(id: string): Promise<CommentReaction | null> {
    this.logger.debug(`Finding comment reaction by id: ${id}`);
    const [reaction] = await db.select().from(commentReactions).where(eq(commentReactions.id, id)).limit(1);
    return (reaction ?? null) as CommentReaction | null;
  }

  async findByUserAndComment(userId: string, commentId: string): Promise<CommentReaction | null> {
    this.logger.debug(`Finding comment reaction: ${userId} on comment ${commentId}`);
    const [reaction] = await db
      .select()
      .from(commentReactions)
      .where(and(eq(commentReactions.userId, userId), eq(commentReactions.commentId, commentId)))
      .limit(1);
    return (reaction ?? null) as CommentReaction | null;
  }

  async findByComment(
    commentId: string,
    page: number,
    limit: number,
  ): Promise<{ reactions: CommentReaction[]; total: number }> {
    this.logger.debug(`Finding reactions for comment: ${commentId}`);
    const offset = (page - 1) * limit;

    const [reactionsList, [{ total }]] = await Promise.all([
      db
        .select()
        .from(commentReactions)
        .where(eq(commentReactions.commentId, commentId))
        .orderBy(desc(commentReactions.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: sql<number>`count(*)` })
        .from(commentReactions)
        .where(eq(commentReactions.commentId, commentId)),
    ]);

    return { reactions: reactionsList as CommentReaction[], total: Number(total) };
  }

  async create(data: { userId: string; commentId: string; type: string }): Promise<CommentReaction> {
    this.logger.info(`Creating comment reaction: ${data.type} on comment ${data.commentId}`);
    const [reaction] = (await db.insert(commentReactions).values(data).returning()) as CommentReaction[];
    return reaction;
  }

  /**
   * Mirrors `ReactionsRepository.update` for the story case. `comment_reactions_unique_idx` admits
   * one reaction per (user, comment), so this is how a reaction's type is changed — the alternative
   * being a DELETE followed by a POST, which briefly removes the reaction from the count.
   */
  async update(id: string, data: { type: string }): Promise<CommentReaction> {
    this.logger.info(`Updating comment reaction: ${id} to type ${data.type}`);
    const [reaction] = (await db
      .update(commentReactions)
      .set(data)
      .where(eq(commentReactions.id, id))
      .returning()) as CommentReaction[];
    return reaction;
  }

  async delete(id: string): Promise<void> {
    this.logger.info(`Deleting comment reaction: ${id}`);
    await db.delete(commentReactions).where(eq(commentReactions.id, id));
  }

  async deleteByUserAndComment(userId: string, commentId: string): Promise<void> {
    this.logger.info(`Deleting comment reaction: ${userId} on comment ${commentId}`);
    await db
      .delete(commentReactions)
      .where(and(eq(commentReactions.userId, userId), eq(commentReactions.commentId, commentId)));
  }

  async countReactions(commentId: string): Promise<number> {
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)` })
      .from(commentReactions)
      .where(eq(commentReactions.commentId, commentId));
    return Number(total);
  }
}
