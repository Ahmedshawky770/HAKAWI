import { describe, it, expect, beforeEach, vi } from 'vitest';

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { EventValidatorService } from '../../common/events/event-validator.service.ts';

import { NotificationsService } from './notifications.service.ts';
import type { INotificationsRepository, Notification, CreateNotificationInput } from './interfaces/notifications-repository.interface.ts';

// vi.mocked() returns `any` when the mock property is typed ReturnType<typeof vi.fn> (= any).
// This is a vitest typing limitation — mocks are correctly typed and tests pass.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

type MockNotificationsRepository = {
  findById: ReturnType<typeof vi.fn<(id: string) => Promise<Notification | null>>>;
  findByUser: ReturnType<typeof vi.fn<(userId: string, page: number, limit: number) => Promise<{ notifications: Notification[]; total: number }>>>;
  findUnread: ReturnType<typeof vi.fn<(userId: string) => Promise<Notification[]>>>;
  create: ReturnType<typeof vi.fn<(data: CreateNotificationInput) => Promise<Notification>>>;
  markAsRead: ReturnType<typeof vi.fn<(id: string) => Promise<Notification>>>;
  markAllAsRead: ReturnType<typeof vi.fn<(userId: string) => Promise<void>>>;
  delete: ReturnType<typeof vi.fn<(id: string) => Promise<void>>>;
  countUnread: ReturnType<typeof vi.fn<(userId: string) => Promise<number>>>;
  findPreferences: ReturnType<typeof vi.fn<(userId: string) => Promise<{ emailEnabled: boolean; pushEnabled: boolean; storyReactions: boolean; comments: boolean; follows: boolean; mentions: boolean; system: boolean }>>>;
  upsertPreferences: ReturnType<typeof vi.fn<(userId: string, data: { emailEnabled: boolean; pushEnabled: boolean; storyReactions: boolean; comments: boolean; follows: boolean; mentions: boolean; system: boolean }) => Promise<{ emailEnabled: boolean; pushEnabled: boolean; storyReactions: boolean; comments: boolean; follows: boolean; mentions: boolean; system: boolean }>>>;
};
type MockWinstonLoggerService = {
  info: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  verbose: ReturnType<typeof vi.fn>;
};
type MockEventValidatorService = { emit: ReturnType<typeof vi.fn>; validateEvent: ReturnType<typeof vi.fn> };

describe('NotificationsService', () => {
  let notificationsService: NotificationsService;
  let notificationsRepository: MockNotificationsRepository;
  let logger: MockWinstonLoggerService;
  let eventValidatorService: MockEventValidatorService;

  beforeEach(() => {
    notificationsRepository = {
      findById: vi.fn<(id: string) => Promise<Notification | null>>(),
      findByUser: vi.fn<(userId: string, page: number, limit: number) => Promise<{ notifications: Notification[]; total: number }>>(),
      findUnread: vi.fn<(userId: string) => Promise<Notification[]>>(),
      create: vi.fn<(data: CreateNotificationInput) => Promise<Notification>>(),
      markAsRead: vi.fn<(id: string) => Promise<Notification>>(),
      markAllAsRead: vi.fn<(userId: string) => Promise<void>>(),
      delete: vi.fn<(id: string) => Promise<void>>(),
      countUnread: vi.fn<(userId: string) => Promise<number>>(),
      findPreferences: vi.fn<(userId: string) => Promise<{ emailEnabled: boolean; pushEnabled: boolean; storyReactions: boolean; comments: boolean; follows: boolean; mentions: boolean; system: boolean }>>(),
      upsertPreferences: vi.fn<(userId: string, data: { emailEnabled: boolean; pushEnabled: boolean; storyReactions: boolean; comments: boolean; follows: boolean; mentions: boolean; system: boolean }) => Promise<{ emailEnabled: boolean; pushEnabled: boolean; storyReactions: boolean; comments: boolean; follows: boolean; mentions: boolean; system: boolean }>>(),
    };

    logger = {
      info: vi.fn(), log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), verbose: vi.fn(),
    };

    eventValidatorService = { emit: vi.fn(), validateEvent: vi.fn() };

    notificationsService = new NotificationsService(
      notificationsRepository,
      logger as unknown as WinstonLoggerService,
      eventValidatorService as unknown as EventValidatorService,
    );
  });

  describe('create', () => {
    it('should create a notification', async () => {
      vi.mocked(notificationsRepository.create).mockResolvedValue({
        id: 'notif-123', userId: 'user-1', type: 'follow', title: 'New Follower', message: 'Someone followed you', data: null, isRead: false, readAt: null, createdAt: new Date(),
      });

      const result = await notificationsService.create({ userId: 'user-1', type: 'follow', title: 'New Follower', message: 'Someone followed you' });

      expect(result.title).toBe('New Follower');
      expect(eventValidatorService.emit).toHaveBeenCalledWith('notification.created', { notificationId: 'notif-123', userId: 'user-1', type: 'follow' });
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
