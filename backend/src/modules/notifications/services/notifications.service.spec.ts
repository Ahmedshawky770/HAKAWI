import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotificationsService } from './notifications.service.js';
import type { NotificationsRepository } from '../repositories/notifications.repository.js';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '@nestjs/common';
import type { NotificationType } from '../interfaces/notifications-repository.interface.js';

type MockNotificationsRepository = Partial<NotificationsRepository>;
type MockEventEmitter2 = Partial<EventEmitter2>;

const createMockNotification = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'notification-123',
  userId: 'user-123',
  type: 'info',
  title: 'Test Notification',
  message: 'Test message',
  isRead: false,
  readAt: null,
  actorId: null,
  entityId: null,
  data: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('NotificationsService', () => {
  let notificationsService: NotificationsService;
  let notificationsRepository: MockNotificationsRepository;
  let eventEmitter: MockEventEmitter2;

  beforeEach(() => {
    notificationsRepository = {
      findById: vi.fn(),
      findByUserId: vi.fn(),
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
      delete: vi.fn(),
      deleteAll: vi.fn(),
      getUnreadCount: vi.fn(),
      create: vi.fn(),
    };

    eventEmitter = {
      emit: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
    };

    notificationsService = new NotificationsService(
      notificationsRepository as NotificationsRepository,
      eventEmitter as EventEmitter2,
    );
  });

  describe('findById', () => {
    it('should return notification when found', async () => {
      const notification = createMockNotification();
      vi.mocked(notificationsRepository.findById).mockResolvedValue(notification as any);

      const result = await notificationsService.findById('notification-123');

      expect(result).toEqual(notification);
    });

    it('should throw NotFoundException when notification not found', async () => {
      vi.mocked(notificationsRepository.findById).mockResolvedValue(null);

      await expect(notificationsService.findById('notification-123')).rejects.toThrow('Notification not found');
    });
  });

  describe('findByUserId', () => {
    it('should return notifications by user', async () => {
      const notifications = [createMockNotification()];
      vi.mocked(notificationsRepository.findByUserId).mockResolvedValue(notifications as any);

      const result = await notificationsService.findByUserId('user-123');

      expect(result).toEqual(notifications);
    });
  });

  describe('markAsRead', () => {
    it('should mark notification as read', async () => {
      vi.mocked(notificationsRepository.markAsRead).mockResolvedValue(undefined as any);

      await notificationsService.markAsRead('notification-123');

      expect(notificationsRepository.markAsRead).toHaveBeenCalledWith('notification-123');
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all notifications as read for user', async () => {
      vi.mocked(notificationsRepository.markAllAsRead).mockResolvedValue(undefined as any);

      await notificationsService.markAllAsRead('user-123');

      expect(notificationsRepository.markAllAsRead).toHaveBeenCalledWith('user-123');
    });
  });

  describe('delete', () => {
    it('should delete notification', async () => {
      vi.mocked(notificationsRepository.delete).mockResolvedValue(undefined as any);

      await notificationsService.delete('notification-123');

      expect(notificationsRepository.delete).toHaveBeenCalledWith('notification-123');
    });
  });

  describe('deleteAll', () => {
    it('should delete all notifications for user', async () => {
      vi.mocked(notificationsRepository.deleteAll).mockResolvedValue(undefined as any);

      await notificationsService.deleteAll('user-123');

      expect(notificationsRepository.deleteAll).toHaveBeenCalledWith('user-123');
    });
  });

  describe('getUnreadCount', () => {
    it('should return unread count', async () => {
      vi.mocked(notificationsRepository.getUnreadCount).mockResolvedValue(5);

      const result = await notificationsService.getUnreadCount('user-123');

      expect(result).toBe(5);
    });
  });

  describe('create', () => {
    it('should create notification and emit event', async () => {
      const notification = createMockNotification();
      vi.mocked(notificationsRepository.create).mockResolvedValue(notification as any);

      const result = await notificationsService.create(
        'user-123',
        'info' as NotificationType,
        'Test Title',
        'Test Message',
        'actor-123',
        'entity-123',
        { key: 'value' },
      );

      expect(result).toEqual(notification);
      expect(eventEmitter.emit).toHaveBeenCalledWith('notification.created', {
        notificationId: 'notification-123',
        userId: 'user-123',
        type: 'info',
        actorId: 'actor-123',
        entityId: 'entity-123',
      });
    });

    it('should create notification without optional fields', async () => {
      const notification = createMockNotification();
      vi.mocked(notificationsRepository.create).mockResolvedValue(notification as any);

      const result = await notificationsService.create(
        'user-123',
        'info' as NotificationType,
        'Test Title',
        'Test Message',
      );

      expect(result).toEqual(notification);
      expect(eventEmitter.emit).toHaveBeenCalledWith('notification.created', {
        notificationId: 'notification-123',
        userId: 'user-123',
        type: 'info',
        actorId: undefined,
        entityId: undefined,
      });
    });
  });
});
