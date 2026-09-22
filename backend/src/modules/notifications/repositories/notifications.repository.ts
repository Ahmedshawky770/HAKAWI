import { Injectable, Logger } from '@nestjs/common';
import { eq, and, desc, sql } from 'drizzle-orm';
import { notifications } from '../../../db/schema/notifications.schema.js';
import { db } from '../../../db/index.js';
import type {
  INotificationsRepository,
  Notification,
  CreateNotificationData,
  NotificationType,
} from '../interfaces/notifications-repository.interface.js';

@Injectable()
export class NotificationsRepository implements INotificationsRepository {
  private readonly logger = new Logger(NotificationsRepository.name);

  private castNotification = (notification: Record<string, unknown>): Notification => ({
    ...notification,
    data: notification.data as Record<string, unknown> | null,
  }) as Notification;

  async findById(id: string): Promise<Notification | null> {
    this.logger.debug(`Finding notification by id: ${id}`);
    const [notification] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, id))
      .limit(1);
    return notification ? this.castNotification({ ...notification, type: notification.type as NotificationType }) : null;
  }

  async findByUserId(userId: string): Promise<Notification[]> {
    this.logger.debug(`Finding notifications by user: ${userId}`);
    const results = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));
    return results.map(n => this.castNotification({ ...n, type: n.type as NotificationType }));
  }

  async markAsRead(id: string): Promise<void> {
    this.logger.debug(`Marking notification as read: ${id}`);
    await db
      .update(notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(eq(notifications.id, id));
  }

  async markAllAsRead(userId: string): Promise<void> {
    this.logger.debug(`Marking all notifications as read for user: ${userId}`);
    await db
      .update(notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(eq(notifications.userId, userId));
  }

  async delete(id: string): Promise<void> {
    this.logger.debug(`Deleting notification: ${id}`);
    await db.delete(notifications).where(eq(notifications.id, id));
  }

  async deleteAll(userId: string): Promise<void> {
    this.logger.debug(`Deleting all notifications for user: ${userId}`);
    await db.delete(notifications).where(eq(notifications.userId, userId));
  }

  async getUnreadCount(userId: string): Promise<number> {
    this.logger.debug(`Getting unread count for user: ${userId}`);
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(
        and(eq(notifications.userId, userId), eq(notifications.isRead, false)),
      );
    return Number(count);
  }

  async findByUserAndType(
    userId: string,
    type: NotificationType,
  ): Promise<Notification[]> {
    this.logger.debug(
      `Finding notifications by user and type: ${userId} / ${type}`,
    );
    const results = await db
      .select()
      .from(notifications)
      .where(
        and(eq(notifications.userId, userId), eq(notifications.type, type)),
      )
      .orderBy(desc(notifications.createdAt));
    return results.map(n => this.castNotification({ ...n, type: n.type as NotificationType }));
  }

  async create(data: CreateNotificationData): Promise<Notification> {
    this.logger.info(`Creating notification for user: ${data.userId}`);
    const [notification] = await db
      .insert(notifications)
      .values(data)
      .returning();
    return this.castNotification({ ...notification, type: notification.type as NotificationType });
  }
}
