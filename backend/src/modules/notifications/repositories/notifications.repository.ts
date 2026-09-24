import { Injectable, Inject } from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type { INotificationsRepository, Notification, CreateNotificationInput, NotificationPreferencesResponseDto, UpsertNotificationPreferencesInput } from '../interfaces/notifications-repository.interface.ts';
import { NOTIFICATIONS_REPOSITORY } from '../interfaces/notifications-repository.interface.ts';
import { notifications, notificationPreferences } from '../../../db/schema/social.schema.ts';
import { db } from '../../../db/index.ts';

@Injectable()
export class NotificationsRepository implements INotificationsRepository {
  constructor(@Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService) {}

  async findById(id: string): Promise<Notification | null> {
    this.logger.debug(`Finding notification by id: ${id}`);
    try {
      const [notification] = await db.select().from(notifications).where(eq(notifications.id, id)).limit(1);
      return notification ?? null;
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === '22P02') {
        return null;
      }
      throw error;
    }
  }

  async findByUser(userId: string, page: number, limit: number): Promise<{ notifications: Notification[]; total: number }> {
    this.logger.debug(`Finding notifications for user: ${userId}`);
    const offset = (page - 1) * limit;

    const [notificationsList, [{ total }]] = await Promise.all([
      db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(limit).offset(offset),
      db.select({ total: sql<number>`count(*)` }).from(notifications).where(eq(notifications.userId, userId)),
    ]);

    return { notifications: notificationsList, total: Number(total) };
  }

  async findUnread(userId: string): Promise<Notification[]> {
    this.logger.debug(`Finding unread notifications for user: ${userId}`);
    return db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.isRead, false))).orderBy(desc(notifications.createdAt));
  }

  async create(data: CreateNotificationInput): Promise<Notification> {
    this.logger.info(`Creating notification for user: ${data.userId}`);
    const [notification] = await db.insert(notifications).values(data).returning();
    return notification;
  }

  async markAsRead(id: string): Promise<Notification> {
    this.logger.debug(`Marking notification as read: ${id}`);
    const [notification] = await db.update(notifications).set({ isRead: true, readAt: new Date() }).where(eq(notifications.id, id)).returning();
    return notification;
  }

  async markAllAsRead(userId: string): Promise<void> {
    this.logger.info(`Marking all notifications as read for user: ${userId}`);
    await db.update(notifications).set({ isRead: true, readAt: new Date() }).where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
  }

  async delete(id: string): Promise<void> {
    this.logger.info(`Deleting notification: ${id}`);
    await db.delete(notifications).where(eq(notifications.id, id));
  }

  async countUnread(userId: string): Promise<number> {
    const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    return Number(total);
  }

  async findPreferences(userId: string): Promise<NotificationPreferencesResponseDto> {
    this.logger.debug(`Finding notification preferences for user: ${userId}`);
    const [prefs] = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)).limit(1);
    if (prefs) {
      return {
        emailEnabled: prefs.emailEnabled,
        pushEnabled: prefs.pushEnabled,
        storyReactions: prefs.storyReactions,
        comments: prefs.comments,
        follows: prefs.follows,
        mentions: prefs.mentions,
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
      system: true,
    };
  }

  async upsertPreferences(userId: string, data: UpsertNotificationPreferencesInput): Promise<NotificationPreferencesResponseDto> {
    this.logger.debug(`Upserting notification preferences for user: ${userId}`);
    const [prefs] = await db.insert(notificationPreferences)
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
      system: prefs.system,
    };
  }
}