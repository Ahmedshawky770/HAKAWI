import { Injectable, Inject } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { eq, and, desc, sql } from 'drizzle-orm';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type { IReactionsRepository, Reaction } from '../interfaces/reactions-repository.interface.ts';
import { reactions, reactionsP } from '../../../db/schema/social.schema.ts';
import { db, dbPrimary } from '../../../db/index.ts';

/**
 * Single source of truth is now `reactions_p` (the partitioned parent). Reads target
 * `reactions_p` with a 42P01 fallback to the legacy `reactions` table. Writes target
 * `reactions_p` directly.
 */

@Injectable()
export class ReactionsRepository implements IReactionsRepository {
  constructor(@Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService) {}

  async findById(id: string): Promise<Reaction | null> {
    this.logger.debug(`Finding reaction by id: ${id}`);
    try {
      // CUTOVER: read from reactions_p (partitioned parent).
      const result = await dbPrimary.execute(sql`SELECT id, user_id, story_id, type, created_at
          FROM reactions_p WHERE id = ${id} LIMIT 1`);
      const row = result.rows[0];
      if (!row) return null;
      return {
        id: row.id,
        userId: row.user_id,
        storyId: row.story_id,
        type: row.type,
        createdAt: row.created_at,
      } as Reaction;
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      // 42P01 = undefined_table: partitioned table doesn't exist yet (pre-cutover).
      // Any other code: still fall back to legacy reactions table if it exists.
      if (code === '42P01' || code === undefined) {
        const [reaction] = await db
          .select()
          .from(reactions)
          .where(eq(reactions.id, id))
          .limit(1);
        return reaction ?? null;
      }
      if (code === '22P02') {
        return null;
      }
      throw error;
    }
  }

  async findByUserAndStory(userId: string, storyId: string): Promise<Reaction | null> {
    this.logger.debug(`Finding reaction: ${userId} on story ${storyId}`);
    try {
      // CUTOVER: read from reactions_p (partitioned parent).
      const result = await dbPrimary.execute(sql`SELECT id, user_id, story_id, type, created_at
          FROM reactions_p
          WHERE user_id = ${userId} AND story_id = ${storyId}
          LIMIT 1`);
      const row = result.rows[0];
      if (!row) return null;
      return {
        id: row.id,
        userId: row.user_id,
        storyId: row.story_id,
        type: row.type,
        createdAt: row.created_at,
      } as Reaction;
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      // 42P01 = undefined_table: partitioned table doesn't exist yet (pre-cutover).
      // Any other code: still fall back to legacy reactions table if it exists.
      if (code === '42P01' || code === undefined) {
        const [reaction] = await db
          .select()
          .from(reactions)
          .where(and(eq(reactions.userId, userId), eq(reactions.storyId, storyId)))
          .limit(1);
        return reaction ?? null;
      }
      if (code === '22P02') {
        return null;
      }
      throw error;
    }
  }

  async findReactionsByStory(
    storyId: string,
    page: number,
    limit: number,
  ): Promise<{ reactions: Reaction[]; total: number }> {
    this.logger.debug(`Finding reactions for story: ${storyId}`);
    const offset = (page - 1) * limit;

    try {
      // CUTOVER: read from reactions_p (partitioned parent).
      const [reactionsResult, countResult] = await Promise.all([
        dbPrimary.execute(sql`SELECT id, user_id, story_id, type, created_at
            FROM reactions_p
            WHERE story_id = ${storyId}
            ORDER BY created_at DESC
            LIMIT ${limit} OFFSET ${offset}`),
        dbPrimary.execute(sql`SELECT count(*) AS total FROM reactions_p WHERE story_id = ${storyId}`),
      ]);

      const reactionsList = reactionsResult.rows.map((row: Record<string, unknown>) => ({
        id: row.id,
        userId: row.user_id,
        storyId: row.story_id,
        type: row.type,
        createdAt: row.created_at,
      }));

      return { reactions: reactionsList as Reaction[], total: Number(countResult.rows[0]?.total ?? 0) };
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      // 42P01 = undefined_table: partitioned table doesn't exist yet (pre-cutover).
      // Any other code: still fall back to legacy reactions table if it exists.
      if (code === '42P01' || code === undefined) {
        const [reactionsList, [{ total }]] = await Promise.all([
          db
            .select()
            .from(reactions)
            .where(eq(reactions.storyId, storyId))
            .orderBy(desc(reactions.createdAt))
            .limit(limit)
            .offset(offset),
          db
            .select({ total: sql<number>`count(*)` })
            .from(reactions)
            .where(eq(reactions.storyId, storyId)),
        ]);
        return { reactions: reactionsList as Reaction[], total: Number(total) };
      }
      throw error;
    }
  }

  async create(data: { userId: string; storyId: string; type: string }): Promise<Reaction> {
    this.logger.info(`Creating reaction: ${data.type} on story ${data.storyId}`);
    return await dbPrimary.transaction(async (tx) => {
      // Partitioned tables require `id` and `created_at` in the INSERT because both are part of
      // the composite primary key `(id, created_at)`, and `id` has no default on the parent table.
      const [reaction] = await tx
        .insert(reactionsP)
        .values({ id: randomUUID(), ...data, createdAt: new Date() } as never)
        .returning();
      return reaction;
    });
  }

  async update(id: string, data: { type: string }): Promise<Reaction> {
    this.logger.debug(`Updating reaction: ${id}`);
    return await dbPrimary.transaction(async (tx) => {
      const [reaction] = await tx.update(reactionsP).set(data).where(eq(reactionsP.id, id)).returning();
      return reaction;
    });
  }

  async delete(id: string): Promise<void> {
    this.logger.info(`Deleting reaction: ${id}`);
    return await dbPrimary.transaction(async (tx) => {
      await tx.delete(reactionsP).where(eq(reactionsP.id, id));
    });
  }

  async deleteByUserAndStory(userId: string, storyId: string): Promise<void> {
    this.logger.info(`Deleting reaction: ${userId} on story ${storyId}`);
    return await dbPrimary.transaction(async (tx) => {
      await tx.delete(reactionsP).where(and(eq(reactionsP.userId, userId), eq(reactionsP.storyId, storyId)));
    });
  }

  async countReactions(storyId: string): Promise<number> {
    try {
      // CUTOVER: read from reactions_p (partitioned parent).
      const countResult = await dbPrimary.execute(sql`SELECT count(*) AS total FROM reactions_p
          WHERE story_id = ${storyId}`);
      return Number(countResult.rows[0]?.total ?? 0);
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      // 42P01 = undefined_table: partitioned table doesn't exist yet (pre-cutover).
      // Any other code: still fall back to legacy reactions table if it exists.
      if (code === '42P01' || code === undefined) {
        const [{ total }] = await db
          .select({ total: sql<number>`count(*)` })
          .from(reactions)
          .where(eq(reactions.storyId, storyId));
        return Number(total);
      }
      throw error;
    }
  }

  async countReactionsByType(storyId: string, type: string): Promise<number> {
    try {
      // CUTOVER: read from reactions_p (partitioned parent).
      const countResult = await dbPrimary.execute(sql`SELECT count(*) AS total FROM reactions_p
          WHERE story_id = ${storyId} AND type = ${type}`);
      return Number(countResult.rows[0]?.total ?? 0);
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      // 42P01 = undefined_table: partitioned table doesn't exist yet (pre-cutover).
      // Any other code: still fall back to legacy reactions table if it exists.
      if (code === '42P01' || code === undefined) {
        const [{ total }] = await db
          .select({ total: sql<number>`count(*)` })
          .from(reactions)
          .where(and(eq(reactions.storyId, storyId), eq(reactions.type, type)));
        return Number(total);
      }
      throw error;
    }
  }

  /**
   * `GROUP BY type` rather than six `count(*)` round trips.
   *
   * `ReactionsService.getReactionCounts` looped over `VALID_REACTION_TYPES` and issued one query per
   * type — six sequential awaits to answer `GET /reactions/stories/:storyId/counts`, a public route
   * every story card calls. `GROUP BY` returns only the types that actually have rows, so the caller
   * still has to substitute 0 for the rest; that is the service's job, not the repository's, because
   * only the service knows which types are valid.
   */
  async countByType(storyId: string): Promise<Record<string, number>> {
    this.logger.debug(`Counting reactions by type for story: ${storyId}`);
    try {
      // CUTOVER: read from reactions_p (partitioned parent).
      const rows = await dbPrimary.execute(sql`SELECT type, count(*) AS total FROM reactions_p
          WHERE story_id = ${storyId}
          GROUP BY type`);

      return Object.fromEntries((rows?.rows ?? rows ?? []).map((row: Record<string, unknown>) => [String(row.type), Number(row.total)]));
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      // 42P01 = undefined_table: partitioned table doesn't exist yet (pre-cutover).
      // Any other code: still fall back to legacy reactions table if it exists.
      if (code === '42P01' || code === undefined) {
        const dbRows = await db
          .select({ type: reactions.type, total: sql<number>`count(*)` })
          .from(reactions)
          .where(eq(reactions.storyId, storyId))
          .groupBy(reactions.type);

        return Object.fromEntries(dbRows.map((row: { type: string; total: number }) => [row.type, Number(row.total)]));
      }
      throw error;
    }
  }
}
