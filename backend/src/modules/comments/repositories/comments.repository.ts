import { Injectable, Inject } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type {
  ICommentsRepository,
  Comment,
  CreateCommentInput,
  UpdateCommentInput,
} from '../interfaces/comments-repository.interface.ts';
import { comments } from '../../../db/schema/social.schema.ts';
import { db } from '../../../db/index.ts';

// drizzle-ORM db and sql template tags are typed as `any` by the library.
// Accepted external-library typing limitation — no production code change.
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */

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

    // `parentId IS NULL` must be expressed with isNull(). `eq(parentId, null)` compiles to
    // `parent_id = NULL`, which SQL evaluates to NULL (never true) and returned an empty list
    // for every story. isDeleted is filtered here because soft-deleted comments are tombstones
    // everywhere else in this module (findById, update, remove all reject them).
    const visibleTopLevel = and(
      eq(comments.storyId, storyId),
      isNull(comments.parentId),
      eq(comments.isDeleted, false),
    );

    const [commentsList, [{ total }]] = await Promise.all([
      db.select().from(comments).where(visibleTopLevel).orderBy(desc(comments.createdAt)).limit(limit).offset(offset),
      db
        .select({ total: sql<number>`count(*)` })
        .from(comments)
        .where(visibleTopLevel),
    ]);

    return { comments: commentsList as Comment[], total: Number(total) };
  }

  async findReplies(parentId: string, page: number, limit: number): Promise<{ replies: Comment[]; total: number }> {
    this.logger.debug(`Finding replies for comment: ${parentId}`);
    const offset = (page - 1) * limit;

    const visibleReplies = and(eq(comments.parentId, parentId), eq(comments.isDeleted, false));

    const [repliesList, [{ total }]] = await Promise.all([
      db.select().from(comments).where(visibleReplies).orderBy(desc(comments.createdAt)).limit(limit).offset(offset),
      db
        .select({ total: sql<number>`count(*)` })
        .from(comments)
        .where(visibleReplies),
    ]);

    return { replies: repliesList as Comment[], total: Number(total) };
  }

  async create(data: CreateCommentInput): Promise<Comment> {
    this.logger.info(`Creating comment on story: ${data.storyId}`);
    const [comment] = (await db.insert(comments).values(data).returning()) as Comment[];
    return comment;
  }

  async update(id: string, data: UpdateCommentInput): Promise<Comment> {
    this.logger.debug(`Updating comment: ${id}`);
    const [comment] = (await db
      .update(comments)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(comments.id, id))
      .returning()) as Comment[];
    return comment;
  }

  async softDelete(id: string): Promise<void> {
    this.logger.info(`Soft deleting comment: ${id}`);
    await db.update(comments).set({ isDeleted: true, deletedAt: new Date() }).where(eq(comments.id, id));
  }

  async incrementReplyCount(parentId: string): Promise<void> {
    this.logger.debug(`Incrementing reply count for comment: ${parentId}`);
    await db
      .update(comments)
      .set({ replyCount: sql`${comments.replyCount} + 1` })
      .where(eq(comments.id, parentId));
  }

  async countReplies(parentId: string): Promise<number> {
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)` })
      .from(comments)
      .where(and(eq(comments.parentId, parentId), eq(comments.isDeleted, false)));
    return Number(total);
  }
}
