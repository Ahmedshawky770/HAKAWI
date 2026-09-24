import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotificationsService } from './notifications.service.js';
import type { INotificationsRepository } from './interfaces/notifications-repository.interface.js';
import { NOTIFICATIONS_REPOSITORY } from './interfaces/notifications-repository.interface.js';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.js';
import { EventEmitter2 } from '@nestjs/event-emitter';

type MockNotificationsRepository = Partial<INotificationsRepository>;
type MockWinstonLoggerService = {
  info: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  verbose: ReturnType<typeof vi.fn>;
};
type MockEventEmitter = { emit: ReturnType<typeof vi.fn> };

describe('NotificationsService', () => {
  let notificationsService: NotificationsService;
  let notificationsRepository: MockNotificationsRepository;
  let logger: MockWinstonLoggerService;
  let eventEmitter: MockEventEmitter;

  beforeEach(() => {
    notificationsRepository = {
      findById: vi.fn(),
      findByUser: vi.fn(),
      findUnread: vi.fn(),
      create: vi.fn(),
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
      delete: vi.fn(),
      countUnread: vi.fn(),
    };

    logger = {
      info: vi.fn(), log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), verbose: vi.fn(),
    };

    eventEmitter = { emit: vi.fn() };

    notificationsService = new NotificationsService(
      notificationsRepository as unknown as INotificationsRepository,
      logger as unknown as WinstonLoggerService,
      eventEmitter as unknown as EventEmitter2,
    );
  });

  describe('create', () => {
    it('should create a notification', async () => {
      vi.mocked(notificationsRepository.create).mockResolvedValue({
        id: 'notif-123', userId: 'user-1', type: 'follow', title: 'New Follower', message: 'Someone followed you', data: null, isRead: false, readAt: null, createdAt: new Date(),
      });

      const result = await notificationsService.create({ userId: 'user-1', type: 'follow', title: 'New Follower', message: 'Someone followed you' });

      expect(result.title).toBe('New Follower');
      expect(eventEmitter.emit).toHaveBeenCalledWith('notification.created', { notificationId: 'notif-123', userId: 'user-1', type: 'follow' });
    });
  });

  describe('markAsRead', () => {
    it('should mark notification as read', async () => {
      vi.mocked(notificationsRepository.findById).mockResolvedValue({
        id: 'notif-123', userId: 'user-1', type: 'follow', title: 'New Follower', message: 'Someone followed you', data: null, isRead: false, readAt: null, createdAt: new Date(),
      });
      vi.mocked(notificationsRepository.markAsRead).mockResolvedValue({
        id: 'notif-123', userId: 'user-1', type: 'follow', title: 'New Follower', message: 'Someone followed you', data: null, isRead: true, readAt: new Date(), createdAt: new Date(),
      });

      const result = await notificationsService.markAsRead('notif-123', 'user-1');

      expect(result.isRead).toBe(true);
    });

    it('should throw NotFoundException for non-existent notification', async () => {
      vi.mocked(notificationsRepository.findById).mockResolvedValue(null);

      await expect(notificationsService.markAsRead('notif-999', 'user-1')).rejects.toThrow('Notification not found');
    });
  });

  describe('countUnread', () => {
    it('should count unread notifications', async () => {
      vi.mocked(notificationsRepository.countUnread).mockResolvedValue(5);

      const result = await notificationsService.countUnread('user-1');

      expect(result).toBe(5);
    });
  });
});
