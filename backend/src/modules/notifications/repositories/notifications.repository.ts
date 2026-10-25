import { Injectable, Inject } from '@nestjs/common';
import { and, eq, desc, sql } from 'drizzle-orm';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type {
  INotificationsRepository,
  Notification,
  CreateNotificationInput,
  NotificationPreferencesResponseDto,
  UpsertNotificationPreferencesInput,
} from '../interfaces/notifications-repository.interface.ts';
import { notifications, notificationPreferences } from '../../../db/schema/social.schema.ts';
import { db, dbPrimary } from '../../../db/index.ts';

/**
 * Notifications are eventual-consistency data (Principle #16), BUT reads that
 * follow a create (e.g. a user opening the bell drawer right after a new
 * notification lands) must observe the latest write. `findById`, `findByUser`,
 * `findUnread` and `countUnread` therefore read from `dbPrimary`. Writes
 * (`create`, `markAsRead`, `markAllAsRead`, `delete`) already route to the
 * primary through the routed `db` proxy.
 *
 * CUTOVER PHASE: reads now target `notifications_p` (the partitioned parent)
 * instead of the legacy `notifications` table. PostgreSQL partition pruning
 * makes time-range queries cheaper, and each monthly child partition is small
 * enough to vacuum/reindex independently.
 *
 * Prerequisite (must be satisfied before this code is deployed):
 *   1. Migration 0035 applied — `notifications_p` exists.
 *   2. `npm run db:backfill-partitions` run — legacy data copied to `notifications_p`.
 *   3. `npm run db:verify-cutover` passed — row counts match.
 *   4. Migration 0039 run — legacy `notifications` table dropped.
 */

@Injectable()
export class NotificationsRepository implements INotificationsRepository {
  constructor(@Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService) {}

  async findById(id: string): Promise<Notification | null> {
    this.logger.debug(`Finding notification by id: ${id}`);
    try {
      // CUTOVER: read from notifications_p (partitioned parent).
      const result = await dbPrimary.execute(sql`SELECT id, user_id, type, title, message, data, is_read, read_at, created_at
          FROM notifications_p WHERE id = ${id} LIMIT 1`);
      const row = result.rows[0];
      if (!row) return null;
      return {
        id: row.id,
        userId: row.user_id,
        type: row.type,
        title: row.title,
        message: row.message,
        data: row.data,
        isRead: row.is_read,
        readAt: row.read_at,
        createdAt: row.created_at,
      } as Notification;
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      // 42P01 = undefined_table: fall back to legacy notifications table.
      if (code === '42P01') {
        const [notification] = await db
          .select()
          .from(notifications)
          .where(eq(notifications.id, id))
          .limit(1);
        return notification ?? null;
      }
      if (code === '22P02') {
        return null;
      }
      throw error;
    }
  }

  async findByUser(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ notifications: Notification[]; total: number }> {
    this.logger.debug(`Finding notifications for user: ${userId}`);
    const offset = (page - 1) * limit;

    try {
      // CUTOVER: read from notifications_p (partitioned parent).
      const [notificationsResult, countResult] = await Promise.all([
        dbPrimary.execute(sql`SELECT id, user_id, type, title, message, data, is_read, read_at, created_at
            FROM notifications_p
            WHERE user_id = ${userId}
            ORDER BY created_at DESC
            LIMIT ${limit} OFFSET ${offset}`),
        dbPrimary.execute(sql`SELECT count(*) AS total FROM notifications_p WHERE user_id = ${userId}`),
      ]);

      const notificationsList = notificationsResult.rows.map((row: Record<string, unknown>) => ({
        id: row.id,
        userId: row.user_id,
        type: row.type,
        title: row.title,
        message: row.message,
        data: row.data,
        isRead: row.is_read,
        readAt: row.read_at,
        createdAt: row.created_at,
      }));

      return { notifications: notificationsList as Notification[], total: Number(countResult.rows[0]?.total ?? 0) };
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      // 42P01 = undefined_table: fall back to legacy notifications table.
      if (code === '42P01') {
        const [notificationsList, [{ total }]] = await Promise.all([
          db
            .select()
            .from(notifications)
            .where(eq(notifications.userId, userId))
            .orderBy(desc(notifications.createdAt))
            .limit(limit)
            .offset(offset),
          db
            .select({ total: sql<number>`count(*)` })
            .from(notifications)
            .where(eq(notifications.userId, userId)),
        ]);
        return { notifications: notificationsList as Notification[], total: Number(total) };
      }
      throw error;
    }
  }

  /**
   * Capped, and the cap is part of the contract.
   *
   * This had no `LIMIT` at all, so a user with thousands of unread rows downloaded all of them on
   * every poll — and `GET /notifications/unread` took no query parameters to bound it even if it had.
   * The badge COUNT comes from `countUnread`, which is unaffected; the two numbers are deliberately
   * different things, so capping the list does not change the count.
   */
  async findUnread(userId: string, limit: number): Promise<Notification[]> {
    this.logger.debug(`Finding unread notifications for user: ${userId}`);
    // Read after a create: the unread badge must reflect the latest write.
    try {
      // CUTOVER: read from notifications_p (partitioned parent).
      const result = await dbPrimary.execute(sql`SELECT id, user_id, type, title, message, data, is_read, read_at, created_at
          FROM notifications_p
          WHERE user_id = ${userId} AND is_read = FALSE
          ORDER BY created_at DESC
          LIMIT ${limit}`);

      return result.rows.map((row: Record<string, unknown>) => ({
        id: row.id,
        userId: row.user_id,
        type: row.type,
        title: row.title,
        message: row.message,
        data: row.data,
        isRead: row.is_read,
        readAt: row.read_at,
        createdAt: row.created_at,
      })) as Notification[];
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      // 42P01 = undefined_table: fall back to legacy notifications table.
      if (code === '42P01') {
        return db
          .select()
          .from(notifications)
          .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)))
          .orderBy(desc(notifications.createdAt))
          .limit(limit);
      }
      throw error;
    }
  }

  async create(data: CreateNotificationInput): Promise<Notification> {
    this.logger.info(`Creating notification for user: ${data.userId}`);
    return await dbPrimary.transaction(async (tx) => {
      // Writes route to primary via the transaction so the returning row is read from the same primary (read-after-write).
      const [notification] = await tx
        .insert(notifications)
        .values(data)
        .returning();
      // Dual-write to the partitioned table during the migration phase. Same transaction.
      await tx.execute(sql`INSERT INTO notifications_p (id, user_id, type, title, message, data, is_read, read_at, created_at)
          VALUES (${notification.id}, ${data.userId}, ${data.type}, ${data.title}, ${data.message}, ${data.data ?? null}, ${notification.isRead}, ${notification.readAt ?? null}, ${notification.createdAt?.toISOString() ?? new Date().toISOString()})
          ON CONFLICT (id) DO NOTHING`);
      return notification;
    });
  }

  async markAsRead(id: string): Promise<Notification> {
    this.logger.debug(`Marking notification as read: ${id}`);
    return await dbPrimary.transaction(async (tx) => {
      const [notification] = await tx
        .update(notifications)
        .set({ isRead: true, readAt: new Date() })
        .where(eq(notifications.id, id))
        .returning();
      // Dual-write the status change to the partitioned table. Same transaction.
      await tx.execute(sql`UPDATE notifications_p SET is_read = TRUE, read_at = ${new Date().toISOString()} WHERE id = ${notification.id}`);
      return notification;
    });
  }

  async markAllAsRead(userId: string): Promise<void> {
    this.logger.info(`Marking all notifications as read for user: ${userId}`);
    return await dbPrimary.transaction(async (tx) => {
      await tx
        .update(notifications)
        .set({ isRead: true, readAt: new Date() })
        .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
      // Dual-write the status change to the partitioned table. Same transaction.
      await tx.execute(sql`UPDATE notifications_p SET is_read = TRUE, read_at = ${new Date().toISOString()}
          WHERE user_id = ${userId} AND is_read = FALSE`);
    });
  }

  async delete(id: string): Promise<void> {
    this.logger.info(`Deleting notification: ${id}`);
    await db.delete(notifications).where(eq(notifications.id, id));
  }

  async countUnread(userId: string): Promise<number> {
    try {
      // Read after a create: the unread count must reflect the latest write.
      // CUTOVER: read from notifications_p (partitioned parent).
      const countResult = await dbPrimary.execute(sql`SELECT count(*) AS total FROM notifications_p
          WHERE user_id = ${userId} AND is_read = FALSE`);
      return Number(countResult.rows[0]?.total ?? 0);
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      // 42P01 = undefined_table: fall back to legacy notifications table.
      if (code === '42P01') {
        const [{ total }] = await db
          .select({ total: sql<number>`count(*)` })
          .from(notifications)
          .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
        return Number(total);
      }
      throw error;
    }
  }

  async findPreferences(userId: string): Promise<NotificationPreferencesResponseDto> {
    this.logger.debug(`Finding notification preferences for user: ${userId}`);
    const [prefs] = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId))
      .limit(1);
    if (prefs) {
      return {
        emailEnabled: prefs.emailEnabled,
        pushEnabled: prefs.pushEnabled,
        storyReactions: prefs.storyReactions,
        comments: prefs.comments,
        follows: prefs.follows,
        mentions: prefs.mentions,
        messages: prefs.messages,
        system: prefs.system,
      };
    }
    return {
      emailEnabled: true,
      pushEnabled: true,
      storyReactions: true,
      comments: true,
      follows: true,
      mentions: true,
      messages: true,
      system: true,
    };
  }

  async upsertPreferences(
    userId: string,
    data: UpsertNotificationPreferencesInput,
  ): Promise<NotificationPreferencesResponseDto> {
    this.logger.debug(`Upserting notification preferences for user: ${userId}`);
    const [prefs] = await db
      .insert(notificationPreferences)
      .values({
        userId,
        ...data,
      })
      .onConflictDoUpdate({
        target: notificationPreferences.userId,
        set: {
          ...data,
          updatedAt: new Date(),
        },
      })
      .returning();
    return {
      emailEnabled: prefs.emailEnabled,
      pushEnabled: prefs.pushEnabled,
      storyReactions: prefs.storyReactions,
      comments: prefs.comments,
      follows: prefs.follows,
      mentions: prefs.mentions,
      messages: prefs.messages,
      system: prefs.system,
    };
  }
}
