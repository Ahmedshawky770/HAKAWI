import { Injectable, Inject } from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type { ICommentsRepository, Comment, CreateCommentInput, UpdateCommentInput } from '../interfaces/comments-repository.interface.ts';
import { COMMENTS_REPOSITORY } from '../interfaces/comments-repository.interface.ts';
import { comments } from '../../../db/schema/social.schema.ts';
import { db } from '../../../db/index.ts';

@Injectable()
export class CommentsRepository implements ICommentsRepository {
  constructor(@Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService) {}

  async findById(id: string): Promise<Comment | null> {
    this.logger.debug(`Finding comment by id: ${id}`);
    try {
      const [comment] = await db.select().from(comments).where(eq(comments.id, id)).limit(1);
      return (comment ?? null) as Comment | null;
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === '22P02') {
        return null;
      }
      throw error;
    }
  }

  async findByStory(storyId: string, page: number, limit: number): Promise<{ comments: Comment[]; total: number }> {
    this.logger.debug(`Finding comments for story: ${storyId}`);
    const offset = (page - 1) * limit;

    const [commentsList, [{ total }]] = await Promise.all([
      db.select().from(comments).where(and(eq(comments.storyId, storyId), eq(comments.parentId, null as unknown as string))).orderBy(desc(comments.createdAt)).limit(limit).offset(offset),
      db.select({ total: sql<number>`count(*)` }).from(comments).where(and(eq(comments.storyId, storyId), eq(comments.parentId, null as unknown as string))),
    ]);

    return { comments: commentsList as Comment[], total: Number(total) };
  }

  async findReplies(parentId: string, page: number, limit: number): Promise<{ replies: Comment[]; total: number }> {
    this.logger.debug(`Finding replies for comment: ${parentId}`);
    const offset = (page - 1) * limit;

    const [repliesList, [{ total }]] = await Promise.all([
      db.select().from(comments).where(eq(comments.parentId, parentId)).orderBy(desc(comments.createdAt)).limit(limit).offset(offset),
      db.select({ total: sql<number>`count(*)` }).from(comments).where(eq(comments.parentId, parentId)),
    ]);

    return { replies: repliesList as Comment[], total: Number(total) };
  }

  async create(data: CreateCommentInput): Promise<Comment> {
    this.logger.info(`Creating comment on story: ${data.storyId}`);
    const [comment] = await db.insert(comments).values(data).returning() as Comment[];
    return comment;
  }

  async update(id: string, data: UpdateCommentInput): Promise<Comment> {
    this.logger.debug(`Updating comment: ${id}`);
    const [comment] = await db.update(comments).set({ ...data, updatedAt: new Date() }).where(eq(comments.id, id)).returning() as Comment[];
    return comment;
  }

  async softDelete(id: string): Promise<void> {
    this.logger.info(`Soft deleting comment: ${id}`);
    await db.update(comments).set({ isDeleted: true, deletedAt: new Date() }).where(eq(comments.id, id));
  }

  async incrementReplyCount(parentId: string): Promise<void> {
    this.logger.debug(`Incrementing reply count for comment: ${parentId}`);
    await db.update(comments).set({ replyCount: sql`${comments.replyCount} + 1` }).where(eq(comments.id, parentId));
  }

  async countReplies(parentId: string): Promise<number> {
    const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(comments).where(eq(comments.parentId, parentId));
    return Number(total);
  }
}
