import { Injectable, Inject, NotFoundException, ConflictException } from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type { IFollowsRepository, Follow } from '../interfaces/follows-repository.interface.ts';
import { FOLLOWS_REPOSITORY } from '../interfaces/follows-repository.interface.ts';
import { follows } from '../../../db/schema/social.schema.ts';
import { db } from '../../../db/index.ts';

@Injectable()
export class FollowsRepository implements IFollowsRepository {
  constructor(@Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService) {}

  async findById(id: string): Promise<Follow | null> {
    this.logger.debug(`Finding follow by id: ${id}`);
    try {
      const [follow] = await db.select().from(follows).where(eq(follows.id, id)).limit(1);
      return follow ?? null;
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === '22P02') {
        return null;
      }
      throw error;
    }
  }

  async findByUsers(followerId: string, followingId: string): Promise<Follow | null> {
    this.logger.debug(`Finding follow: ${followerId} -> ${followingId}`);
    const [follow] = await db
      .select()
      .from(follows)
      .where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)))
      .limit(1);
    return follow ?? null;
  }

  async findFollowers(userId: string, page: number, limit: number): Promise<{ follows: Follow[]; total: number }> {
    this.logger.debug(`Finding followers for user: ${userId}`);
    const offset = (page - 1) * limit;

    const [followsList, [{ total }]] = await Promise.all([
      db.select().from(follows).where(eq(follows.followingId, userId)).orderBy(desc(follows.createdAt)).limit(limit).offset(offset),
      db.select({ total: sql<number>`count(*)` }).from(follows).where(eq(follows.followingId, userId)),
    ]);

    return { follows: followsList, total: Number(total) };
  }

  async findFollowing(userId: string, page: number, limit: number): Promise<{ follows: Follow[]; total: number }> {
    this.logger.debug(`Finding following for user: ${userId}`);
    const offset = (page - 1) * limit;

    const [followsList, [{ total }]] = await Promise.all([
      db.select().from(follows).where(eq(follows.followerId, userId)).orderBy(desc(follows.createdAt)).limit(limit).offset(offset),
      db.select({ total: sql<number>`count(*)` }).from(follows).where(eq(follows.followerId, userId)),
    ]);

    return { follows: followsList, total: Number(total) };
  }

  async create(data: { followerId: string; followingId: string }): Promise<Follow> {
    this.logger.info(`Creating follow: ${data.followerId} -> ${data.followingId}`);
    const [follow] = await db.insert(follows).values(data).returning();
    return follow;
  }

  async delete(id: string): Promise<void> {
    this.logger.info(`Deleting follow: ${id}`);
    await db.delete(follows).where(eq(follows.id, id));
  }

  async countFollowers(userId: string): Promise<number> {
    const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(follows).where(eq(follows.followingId, userId));
    return Number(total);
  }

  async countFollowing(userId: string): Promise<number> {
    const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(follows).where(eq(follows.followerId, userId));
    return Number(total);
  }

  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    const follow = await this.findByUsers(followerId, followingId);
    return Boolean(follow);
  }
}
