import { Injectable, Inject } from '@nestjs/common';
import { eq, and, desc, sql } from 'drizzle-orm';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type { IReactionsRepository, Reaction } from '../interfaces/reactions-repository.interface.ts';
import { reactions } from '../../../db/schema/social.schema.ts';
import { db, dbPrimary } from '../../../db/index.ts';

/**
 * during the dual-write phase (migration to `reactions_p`), every write targets both the legacy
 * `reactions` table and the partitioned `reactions_p` parent.
 *
 * CUTOVER PHASE: reads now target `reactions_p` (the partitioned parent) instead of the legacy
 * `reactions` table. PostgreSQL partition pruning makes time-range queries cheaper, and each
 * monthly child partition is small enough to vacuum/reindex independently.
 *
 * Prerequisite (must be satisfied before this code is deployed):
 *   1. Migration 0035 applied — `reactions_p` exists.
 *   2. `npm run db:backfill-partitions` run — legacy data copied to `reactions_p`.
 *   3. `npm run db:verify-cutover` passed — row counts match.
 *   4. Migration 0039 run — legacy `reactions` table dropped.
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
      // 42P01 = undefined_table: fall back to legacy reactions table.
      if (code === '42P01') {
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
      // 42P01 = undefined_table: fall back to legacy reactions table.
      if (code === '42P01') {
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
      // 42P01 = undefined_table: fall back to legacy reactions table.
      if (code === '42P01') {
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
      const [reaction] = await tx.insert(reactions).values(data).returning();
      // Dual-write to the partitioned table during the migration phase. Same transaction.
      await tx.execute(sql`INSERT INTO reactions_p (id, user_id, story_id, type, created_at)
          VALUES (${reaction.id}, ${data.userId}, ${data.storyId}, ${data.type}, ${reaction.createdAt?.toISOString() ?? new Date().toISOString()})
          ON CONFLICT (id) DO NOTHING`);
      return reaction;
    });
  }

  async update(id: string, data: { type: string }): Promise<Reaction> {
    this.logger.debug(`Updating reaction: ${id}`);
    return await dbPrimary.transaction(async (tx) => {
      const [reaction] = await tx.update(reactions).set(data).where(eq(reactions.id, id)).returning();
      // Dual-write the type change to the partitioned table. Same transaction.
      await tx.execute(sql`UPDATE reactions_p SET type = ${data.type} WHERE id = ${reaction.id}`);
      return reaction;
    });
  }

  async delete(id: string): Promise<void> {
    this.logger.info(`Deleting reaction: ${id}`);
    return await dbPrimary.transaction(async (tx) => {
      await tx.delete(reactions).where(eq(reactions.id, id));
      // Dual-write the deletion to the partitioned table. Same transaction.
      await tx.execute(sql`DELETE FROM reactions_p WHERE id = ${id}`);
    });
  }

  async deleteByUserAndStory(userId: string, storyId: string): Promise<void> {
    this.logger.info(`Deleting reaction: ${userId} on story ${storyId}`);
    return await dbPrimary.transaction(async (tx) => {
      await tx.delete(reactions).where(and(eq(reactions.userId, userId), eq(reactions.storyId, storyId)));
      // Dual-write the deletion to the partitioned table. Same transaction.
      await tx.execute(sql`DELETE FROM reactions_p WHERE user_id = ${userId} AND story_id = ${storyId}`);
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
      // 42P01 = undefined_table: fall back to legacy reactions table.
      if (code === '42P01') {
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
      // 42P01 = undefined_table: fall back to legacy reactions table.
      if (code === '42P01') {
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

      return Object.fromEntries(rows.rows.map((row: Record<string, unknown>) => [String(row.type), Number(row.total)]));
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      // 42P01 = undefined_table: fall back to legacy reactions table.
      if (code === '42P01') {
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
