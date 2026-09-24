import { Injectable, NotFoundException, Inject } from '@nestjs/common';

import { EventValidatorService } from '../../common/events/event-validator.service.ts';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import type { NotificationCreatedEvent } from '../../common/events/social.events.ts';

import type { INotificationsRepository } from './interfaces/notifications-repository.interface.ts';
import { NOTIFICATIONS_REPOSITORY } from './interfaces/notifications-repository.interface.ts';
import type { Notification, CreateNotificationInput, NotificationResponse, NotificationPreferences } from './types.ts';
import type { NotificationPreferencesResponseDto, NotificationPreferencesDto } from './dto/preferences.dto.ts';

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(NOTIFICATIONS_REPOSITORY) private readonly notificationsRepository: INotificationsRepository,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
    @Inject(EventValidatorService) private readonly eventBus: EventValidatorService,
  ) {}

  async findByUser(userId: string, page = 1, limit = 20): Promise<{ notifications: NotificationResponse[]; total: number }> {
    const result = await this.notificationsRepository.findByUser(userId, page, limit);
    return {
      notifications: result.notifications.map((notification: Notification) => this.toNotificationResponse(notification)),
      total: result.total,
    };
  }

  async findUnread(userId: string): Promise<NotificationResponse[]> {
    const notifications = await this.notificationsRepository.findUnread(userId);
    return notifications.map((notification: Notification) => this.toNotificationResponse(notification));
  }

  async create(input: CreateNotificationInput): Promise<Notification> {
    const notification = await this.notificationsRepository.create(input);
    await this.eventBus.emit('notification.created', { notificationId: notification.id, userId: notification.userId, type: notification.type } as NotificationCreatedEvent);
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

  async updatePreferences(userId: string, dto: NotificationPreferencesDto): Promise<NotificationPreferencesResponseDto> {
    const existing = await this.notificationsRepository.findPreferences(userId);
    const updated = await this.notificationsRepository.upsertPreferences(userId, {
      emailEnabled: dto.emailEnabled ?? existing.emailEnabled,
      pushEnabled: dto.pushEnabled ?? existing.pushEnabled,
      storyReactions: dto.storyReactions ?? existing.storyReactions,
      comments: dto.comments ?? existing.comments,
      follows: dto.follows ?? existing.follows,
      mentions: dto.mentions ?? existing.mentions,
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
      data: notification.data ? JSON.parse(notification.data) : null,
      isRead: notification.isRead,
      readAt: notification.readAt?.toISOString() || null,
      createdAt: notification.createdAt.toISOString(),
    };
  }
}
