import { Injectable, Inject } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { and, eq, desc, sql } from 'drizzle-orm';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type {
  INotificationsRepository,
  Notification,
  CreateNotificationInput,
  NotificationPreferencesResponseDto,
  UpsertNotificationPreferencesInput,
} from '../interfaces/notifications-repository.interface.ts';
import { notifications, notificationPreferences, notificationsP } from '../../../db/schema/social.schema.ts';
import { db, dbPrimary } from '../../../db/index.ts';

/**
 * Single source of truth is now `notifications_p` (the partitioned parent). Reads target
 * `notifications_p` with a 42P01 fallback to the legacy `notifications` table. Writes target
 * `notifications_p` directly.
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
      // 42P01 = undefined_table: partitioned table doesn't exist yet (pre-cutover).
      // Any other code: still fall back to legacy notifications if it exists.
      if (code === '42P01' || code === undefined) {
        try {
          const [notification] = await db
            .select()
            .from(notifications)
            .where(eq(notifications.id, id))
            .limit(1);
          return notification ?? null;
        } catch {
          return null;
        }
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
      // 42P01 = undefined_table: partitioned table doesn't exist yet (pre-cutover).
      // Any other code: still fall back to legacy notifications if it exists.
      if (code === '42P01' || code === undefined) {
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
      // 42P01 = undefined_table: partitioned table doesn't exist yet (pre-cutover).
      // Any other code: still fall back to legacy notifications if it exists.
      if (code === '42P01' || code === undefined) {
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
      // Partitioned tables require `id` and `created_at` in the INSERT because both are part of
      // the composite primary key `(id, created_at)`, and `id` has no default on the parent table.
      const [notification] = await tx
        .insert(notificationsP)
        .values({
          id: randomUUID(),
          ...data,
          createdAt: (data as { createdAt?: Date }).createdAt ?? new Date(),
        } as never)
        .returning();
      return notification;
    });
  }

  async markAsRead(id: string): Promise<Notification> {
    this.logger.debug(`Marking notification as read: ${id}`);
    return await dbPrimary.transaction(async (tx) => {
      const [notification] = await tx
        .update(notificationsP)
        .set({ isRead: true, readAt: new Date() })
        .where(eq(notificationsP.id, id))
        .returning();
      return notification;
    });
  }

  async markAllAsRead(userId: string): Promise<void> {
    this.logger.info(`Marking all notifications as read for user: ${userId}`);
    return await dbPrimary.transaction(async (tx) => {
      await tx
        .update(notificationsP)
        .set({ isRead: true, readAt: new Date() })
        .where(and(eq(notificationsP.userId, userId), eq(notificationsP.isRead, false)));
    });
  }

  async delete(id: string): Promise<void> {
    this.logger.info(`Deleting notification: ${id}`);
    await db.delete(notificationsP).where(eq(notificationsP.id, id));
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
      // 42P01 = undefined_table: partitioned table doesn't exist yet (pre-cutover).
      // Any other code: still fall back to legacy notifications if it exists.
      if (code === '42P01' || code === undefined) {
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
