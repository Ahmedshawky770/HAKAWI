import { Injectable, NotFoundException, Inject, Optional } from '@nestjs/common';

import { EventValidatorService } from '../../common/events/event-validator.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import type { NotificationCreatedEvent } from '../../common/events/social.events.ts';

import type { INotificationsRepository } from './interfaces/notifications-repository.interface.ts';
import { NOTIFICATIONS_REPOSITORY } from './interfaces/notifications-repository.interface.ts';
import type { NotificationPreferencesResponseDto } from './interfaces/notifications-repository.interface.ts';
import type { Notification, CreateNotificationInput, NotificationResponse } from './types.ts';
import type { NotificationPreferencesDto } from './dto/preferences.dto.ts';
import { preferenceForType } from './preference-family.ts';
import { NotificationsEmailService } from './email/notifications-email.service.ts';

/**
 * The type → preference-family mapping lives in `./preference-family.ts`, not here, because
 * `NotificationsEmailService` used to keep a second copy of it that had already drifted. Both call
 * sites now read the same resolver, so a new notification type cannot be governed by one delivery path
 * and ignored by the other.
 */
@Injectable()
export class NotificationsService {
  constructor(
    @Inject(NOTIFICATIONS_REPOSITORY) private readonly notificationsRepository: INotificationsRepository,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Inject(EventValidatorService) private readonly eventBus: EventValidatorService,
    @Optional() @Inject(NotificationsEmailService) private readonly emailService?: NotificationsEmailService,
  ) {}

  async findByUser(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<{ notifications: NotificationResponse[]; total: number; page: number; limit: number }> {
    const result = await this.notificationsRepository.findByUser(userId, page, limit);
    return {
      notifications: result.notifications.map((notification: Notification) =>
        this.toNotificationResponse(notification),
      ),
      total: result.total,
      page,
      limit,
    };
  }

  /**
   * Capped, and the cap is the contract: the query had no `LIMIT` at all, so a user with
   * thousands of unread rows downloaded every one of them on every poll. The badge count comes
   * from `countUnread` and is unaffected — the two numbers are different things.
   */
  async findUnread(userId: string, limit = 50): Promise<NotificationResponse[]> {
    const notifications = await this.notificationsRepository.findUnread(userId, limit);
    return notifications.map((notification: Notification) => this.toNotificationResponse(notification));
  }

  /**
   * Writes a notification, unless the recipient has turned this family off.
   *
   * Returns `null` when the notification was suppressed. That is the honest return for "nothing was
   * written" — fabricating a `Notification` would claim a row exists when it does not, and the
   * callers that would be tempted to trust such a value are exactly the ones that then build a
   * response from it.
   */
  async create(input: CreateNotificationInput): Promise<Notification | null> {
    const preference = preferenceForType(input.type);
    if (preference !== undefined) {
      const preferences = await this.notificationsRepository.findPreferences(input.userId);
      if (preferences !== undefined && preferences !== null && preferences[preference] === false) {
        this.logger.debug(
          `Suppressed ${input.type} notification for user ${input.userId}: ${preference} is off`,
          'NotificationsService',
        );
        return null;
      }
    }

    const notification = await this.notificationsRepository.create(input);
    await this.eventBus.emit('notification.created', {
      notificationId: notification.id,
      userId: notification.userId,
      type: notification.type,
    } as NotificationCreatedEvent);
    if (this.emailService) {
      void this.emailService.sendNotificationEmail(
        notification.userId,
        notification.type,
        notification.title,
        notification.message,
      );
    }
    return notification;
  }

  async markAsRead(id: string, userId: string): Promise<Notification> {
    const notification = await this.notificationsRepository.findById(id);
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    if (notification.userId !== userId) {
      throw new NotFoundException('Notification not found');
    }

    const updated = await this.notificationsRepository.markAsRead(id);
    return updated;
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.notificationsRepository.markAllAsRead(userId);
  }

  async countUnread(userId: string): Promise<number> {
    return this.notificationsRepository.countUnread(userId);
  }

  async delete(id: string, userId: string): Promise<void> {
    const notification = await this.notificationsRepository.findById(id);
    if (!notification || notification.userId !== userId) {
      throw new NotFoundException('Notification not found');
    }

    await this.notificationsRepository.delete(id);
  }

  async getPreferences(userId: string): Promise<NotificationPreferencesResponseDto> {
    return this.notificationsRepository.findPreferences(userId);
  }

  async updatePreferences(
    userId: string,
    dto: NotificationPreferencesDto,
  ): Promise<NotificationPreferencesResponseDto> {
    const existing = await this.notificationsRepository.findPreferences(userId);
    const updated = await this.notificationsRepository.upsertPreferences(userId, {
      emailEnabled: dto.emailEnabled ?? existing.emailEnabled,
      pushEnabled: dto.pushEnabled ?? existing.pushEnabled,
      storyReactions: dto.storyReactions ?? existing.storyReactions,
      comments: dto.comments ?? existing.comments,
      follows: dto.follows ?? existing.follows,
      mentions: dto.mentions ?? existing.mentions,
      messages: dto.messages ?? existing.messages,
      system: dto.system ?? existing.system,
    });
    return updated;
  }

  private toNotificationResponse(notification: Notification): NotificationResponse {
    return {
      id: notification.id,
      userId: notification.userId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      data: notification.data ? (JSON.parse(notification.data) as Record<string, unknown>) : null,
      isRead: notification.isRead,
      readAt: notification.readAt?.toISOString() || null,
      createdAt: notification.createdAt.toISOString(),
    };
  }
}
