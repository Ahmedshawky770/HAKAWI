import { Injectable, Logger } from '@nestjs/common';
import { eq, and, desc } from 'drizzle-orm';
import { notificationPreferences } from '../../../db/schema/notification-preferences.schema.js';
import { db } from '../../../db/index.js';
import type {
  INotificationPreferencesRepository,
  NotificationPreferences,
  CreateNotificationPreferencesData,
  UpdateNotificationPreferencesData,
} from '../interfaces/notification-preferences-repository.interface.js';

@Injectable()
export class NotificationPreferencesRepository implements INotificationPreferencesRepository {
  private readonly logger = new Logger(NotificationPreferencesRepository.name);

  async findById(id: string): Promise<NotificationPreferences | null> {
    this.logger.debug(`Finding notification preferences by id: ${id}`);
    const [prefs] = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.id, id))
      .limit(1);
    return prefs ?? null;
  }

  async findByUserId(userId: string): Promise<NotificationPreferences | null> {
    this.logger.debug(`Finding notification preferences by user: ${userId}`);
    const [prefs] = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId))
      .limit(1);
    return prefs ?? null;
  }

  async create(
    data: CreateNotificationPreferencesData,
  ): Promise<NotificationPreferences> {
    this.logger.log(
      `Creating notification preferences for user: ${data.userId}`,
    );
    const [prefs] = await db
      .insert(notificationPreferences)
      .values(data)
      .returning();
    return prefs;
  }

  async update(
    id: string,
    data: Partial<UpdateNotificationPreferencesData>,
  ): Promise<NotificationPreferences> {
    this.logger.debug(`Updating notification preferences: ${id}`);
    const [prefs] = await db
      .update(notificationPreferences)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(notificationPreferences.id, id))
      .returning();
    return prefs;
  }

  async upsert(
    data: CreateNotificationPreferencesData,
  ): Promise<NotificationPreferences> {
    this.logger.debug(
      `Upserting notification preferences for user: ${data.userId}`,
    );
    const existing = await this.findByUserId(data.userId);
    if (existing) {
      return this.update(existing.id, data);
    }
    return this.create(data);
  }
}
