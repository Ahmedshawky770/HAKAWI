import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { INotificationsRepository, CreateNotificationData, NotificationType } from '../interfaces/notifications-repository.interface.js';
import { NOTIFICATIONS_REPOSITORY } from '../interfaces/notifications-repository.interface.js';
import { NotificationsRepository } from '../repositories/notifications.repository.js';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(NOTIFICATIONS_REPOSITORY) private readonly notificationsRepository: NotificationsRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findById(id: string): Promise<CreateNotificationData> {
    const notification = await this.notificationsRepository.findById(id);
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    return notification;
  }

  async findByUserId(userId: string): Promise<CreateNotificationData[]> {
    return this.notificationsRepository.findByUserId(userId);
  }

  async markAsRead(id: string): Promise<void> {
    await this.notificationsRepository.markAsRead(id);
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.notificationsRepository.markAllAsRead(userId);
  }

  async delete(id: string): Promise<void> {
    await this.notificationsRepository.delete(id);
  }

  async deleteAll(userId: string): Promise<void> {
    await this.notificationsRepository.deleteAll(userId);
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationsRepository.getUnreadCount(userId);
  }

  async create(userId: string, type: NotificationType, title: string, message: string, actorId?: string, entityId?: string, data?: unknown): Promise<CreateNotificationData> {
    const notification = await this.notificationsRepository.create({
      userId,
      type,
      title,
      message,
      actorId,
      entityId: entityId ?? null,
      data: data as Record<string, unknown> | null,
      isRead: false,
    });
    this.eventEmitter.emit('notification.created', { notificationId: notification.id, userId, type, actorId, entityId });
    return notification;
  }
}
