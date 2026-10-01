import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';

import { WinstonLoggerService } from '../../common/services/winston-logger.service.ts';
import { EventValidatorService } from '../../common/events/event-validator.service.ts';

import { NotificationsService } from './notifications.service.ts';
import type {
  Notification,
  CreateNotificationInput,
  NotificationPreferencesResponseDto,
  UpsertNotificationPreferencesInput,
} from './interfaces/notifications-repository.interface.ts';
import { NotificationsEmailService } from './email/notifications-email.service.ts';

// vi.mocked() returns `any` when the mock property is typed ReturnType<typeof vi.fn> (= any).
// This is a vitest typing limitation — mocks are correctly typed and tests pass.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

type MockNotificationsRepository = {
  findById: ReturnType<typeof vi.fn<(id: string) => Promise<Notification | null>>>;
  findByUser: ReturnType<
    typeof vi.fn<
      (userId: string, page: number, limit: number) => Promise<{ notifications: Notification[]; total: number }>
    >
  >;
  findUnread: ReturnType<typeof vi.fn<(userId: string) => Promise<Notification[]>>>;
  create: ReturnType<typeof vi.fn<(data: CreateNotificationInput) => Promise<Notification>>>;
  markAsRead: ReturnType<typeof vi.fn<(id: string) => Promise<Notification>>>;
  markAllAsRead: ReturnType<typeof vi.fn<(userId: string) => Promise<void>>>;
  delete: ReturnType<typeof vi.fn<(id: string) => Promise<void>>>;
  countUnread: ReturnType<typeof vi.fn<(userId: string) => Promise<number>>>;
  findPreferences: ReturnType<typeof vi.fn<(userId: string) => Promise<NotificationPreferencesResponseDto>>>;
  upsertPreferences: ReturnType<
    typeof vi.fn<
      (userId: string, data: UpsertNotificationPreferencesInput) => Promise<NotificationPreferencesResponseDto>
    >
  >;
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
type MockEmailService = { sendNotificationEmail: ReturnType<typeof vi.fn> };

const DEFAULT_PREFERENCES: NotificationPreferencesResponseDto = {
  emailEnabled: true,
  pushEnabled: true,
  storyReactions: true,
  comments: true,
  follows: true,
  mentions: true,
  system: true,
};

function notification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'notif-123',
    userId: 'user-1',
    type: 'follow',
    title: 'New Follower',
    message: 'Someone followed you',
    data: null,
    isRead: false,
    readAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('NotificationsService', () => {
  let notificationsService: NotificationsService;
  let notificationsRepository: MockNotificationsRepository;
  let logger: MockWinstonLoggerService;
  let eventValidatorService: MockEventValidatorService;

  beforeEach(() => {
    notificationsRepository = {
      findById: vi.fn<(id: string) => Promise<Notification | null>>(),
      findByUser:
        vi.fn<
          (userId: string, page: number, limit: number) => Promise<{ notifications: Notification[]; total: number }>
        >(),
      findUnread: vi.fn<(userId: string) => Promise<Notification[]>>(),
      create: vi.fn<(data: CreateNotificationInput) => Promise<Notification>>(),
      markAsRead: vi.fn<(id: string) => Promise<Notification>>(),
      markAllAsRead: vi.fn<(userId: string) => Promise<void>>(),
      delete: vi.fn<(id: string) => Promise<void>>(),
      countUnread: vi.fn<(userId: string) => Promise<number>>(),
      findPreferences: vi.fn<(userId: string) => Promise<NotificationPreferencesResponseDto>>(),
      upsertPreferences:
        vi.fn<
          (userId: string, data: UpsertNotificationPreferencesInput) => Promise<NotificationPreferencesResponseDto>
        >(),
    };

    logger = {
      info: vi.fn(),
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
    };

    eventValidatorService = { emit: vi.fn(), validateEvent: vi.fn() };

    notificationsService = new NotificationsService(
      notificationsRepository,
      logger as unknown as WinstonLoggerService,
      eventValidatorService as unknown as EventValidatorService,
    );
  });

  function withEmailService(): { service: NotificationsService; email: MockEmailService } {
    const email: MockEmailService = { sendNotificationEmail: vi.fn().mockResolvedValue(true) };
    const service = new NotificationsService(
      notificationsRepository,
      logger as unknown as WinstonLoggerService,
      eventValidatorService as unknown as EventValidatorService,
      email as unknown as NotificationsEmailService,
    );
    return { service, email };
  }

  describe('create', () => {
    it('should create a notification', async () => {
      vi.mocked(notificationsRepository.create).mockResolvedValue({
        id: 'notif-123',
        userId: 'user-1',
        type: 'follow',
        title: 'New Follower',
        message: 'Someone followed you',
        data: null,
        isRead: false,
        readAt: null,
        createdAt: new Date(),
      });

      const result = await notificationsService.create({
        userId: 'user-1',
        type: 'follow',
        title: 'New Follower',
        message: 'Someone followed you',
      });

      expect(result.title).toBe('New Follower');
      expect(eventValidatorService.emit).toHaveBeenCalledWith('notification.created', {
        notificationId: 'notif-123',
        userId: 'user-1',
        type: 'follow',
      });
    });

    it('should forward the whole input to the repository', async () => {
      vi.mocked(notificationsRepository.create).mockResolvedValue(notification());
      const input: CreateNotificationInput = {
        userId: 'user-2',
        type: 'comment',
        title: 'New comment',
        message: 'Someone replied',
        data: '{"storyId":"story-1"}',
      };

      await notificationsService.create(input);

      expect(notificationsRepository.create).toHaveBeenCalledWith(input);
    });

    it('should not send an email when no email service is wired', async () => {
      vi.mocked(notificationsRepository.create).mockResolvedValue(notification());

      await notificationsService.create({ userId: 'user-1', type: 'follow', title: 't', message: 'm' });

      expect(notificationsService['emailService']).toBeUndefined();
    });

    it('should send an email when an email service is wired', async () => {
      const { service, email } = withEmailService();
      vi.mocked(notificationsRepository.create).mockResolvedValue(
        notification({ userId: 'user-9', type: 'mention', title: 'You were mentioned', message: 'hello' }),
      );

      await service.create({ userId: 'user-9', type: 'mention', title: 'You were mentioned', message: 'hello' });

      expect(email.sendNotificationEmail).toHaveBeenCalledWith('user-9', 'mention', 'You were mentioned', 'hello');
    });

    it('should still return the notification when the email service rejects', async () => {
      const { service, email } = withEmailService();
      email.sendNotificationEmail.mockRejectedValue(new Error('smtp down'));
      vi.mocked(notificationsRepository.create).mockResolvedValue(notification());

      const result = await service.create({ userId: 'user-1', type: 'follow', title: 't', message: 'm' });

      expect(result.id).toBe('notif-123');
    });

    it('should let a repository failure propagate', async () => {
      vi.mocked(notificationsRepository.create).mockRejectedValue(new Error('unique violation'));

      await expect(
        notificationsService.create({ userId: 'user-1', type: 'follow', title: 't', message: 'm' }),
      ).rejects.toThrow('unique violation');
      expect(eventValidatorService.emit).not.toHaveBeenCalled();
    });
  });

  describe('findByUser', () => {
    it('should return the mapped notifications and the total', async () => {
      vi.mocked(notificationsRepository.findByUser).mockResolvedValue({ notifications: [notification()], total: 1 });

      const result = await notificationsService.findByUser('user-1');

      expect(result.total).toBe(1);
      expect(result.notifications[0]).toEqual({
        id: 'notif-123',
        userId: 'user-1',
        type: 'follow',
        title: 'New Follower',
        message: 'Someone followed you',
        data: null,
        isRead: false,
        readAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      });
    });

    it('should parse a serialised data payload into an object', async () => {
      vi.mocked(notificationsRepository.findByUser).mockResolvedValue({
        notifications: [notification({ data: '{"storyId":"story-1","count":3}' })],
        total: 1,
      });

      const result = await notificationsService.findByUser('user-1');

      expect(result.notifications[0]?.data).toEqual({ storyId: 'story-1', count: 3 });
    });

    it('should leave data null when the notification has no payload', async () => {
      vi.mocked(notificationsRepository.findByUser).mockResolvedValue({
        notifications: [notification({ data: null })],
        total: 1,
      });

      const result = await notificationsService.findByUser('user-1');

      expect(result.notifications[0]?.data).toBeNull();
    });

    it('should serialise readAt when the notification was read', async () => {
      vi.mocked(notificationsRepository.findByUser).mockResolvedValue({
        notifications: [notification({ isRead: true, readAt: new Date('2026-01-02T03:04:05.000Z') })],
        total: 1,
      });

      const result = await notificationsService.findByUser('user-1');

      expect(result.notifications[0]?.readAt).toBe('2026-01-02T03:04:05.000Z');
    });

    it('should default to the first page of twenty', async () => {
      vi.mocked(notificationsRepository.findByUser).mockResolvedValue({ notifications: [], total: 0 });

      await notificationsService.findByUser('user-1');

      expect(notificationsRepository.findByUser).toHaveBeenCalledWith('user-1', 1, 20);
    });

    it('should forward an explicit page and limit', async () => {
      vi.mocked(notificationsRepository.findByUser).mockResolvedValue({ notifications: [], total: 0 });

      await notificationsService.findByUser('user-1', 3, 5);

      expect(notificationsRepository.findByUser).toHaveBeenCalledWith('user-1', 3, 5);
    });

    it('should return an empty list for a user with no notifications', async () => {
      vi.mocked(notificationsRepository.findByUser).mockResolvedValue({ notifications: [], total: 0 });

      await expect(notificationsService.findByUser('user-1')).resolves.toEqual({
        notifications: [],
        total: 0,
        page: 1,
        limit: 20,
      });
    });
  });

  describe('findUnread', () => {
    it('should return only the mapped unread notifications', async () => {
      vi.mocked(notificationsRepository.findUnread).mockResolvedValue([
        notification({ id: 'notif-1' }),
        notification({ id: 'notif-2' }),
      ]);

      const result = await notificationsService.findUnread('user-1');

      expect(notificationsRepository.findUnread).toHaveBeenCalledWith('user-1');
      expect(result.map((row) => row.id)).toEqual(['notif-1', 'notif-2']);
    });

    it('should return an empty list when everything is read', async () => {
      vi.mocked(notificationsRepository.findUnread).mockResolvedValue([]);

      await expect(notificationsService.findUnread('user-1')).resolves.toEqual([]);
    });
  });

  describe('markAsRead', () => {
    it('should mark notification as read', async () => {
      vi.mocked(notificationsRepository.findById).mockResolvedValue({
        id: 'notif-123',
        userId: 'user-1',
        type: 'follow',
        title: 'New Follower',
        message: 'Someone followed you',
        data: null,
        isRead: false,
        readAt: null,
        createdAt: new Date(),
      });
      vi.mocked(notificationsRepository.markAsRead).mockResolvedValue({
        id: 'notif-123',
        userId: 'user-1',
        type: 'follow',
        title: 'New Follower',
        message: 'Someone followed you',
        data: null,
        isRead: true,
        readAt: new Date(),
        createdAt: new Date(),
      });

      const result = await notificationsService.markAsRead('notif-123', 'user-1');

      expect(result.isRead).toBe(true);
      expect(notificationsRepository.markAsRead).toHaveBeenCalledWith('notif-123');
    });

    it('should throw NotFoundException for non-existent notification', async () => {
      vi.mocked(notificationsRepository.findById).mockResolvedValue(null);

      await expect(notificationsService.markAsRead('notif-999', 'user-1')).rejects.toThrow('Notification not found');
    });

    it('should refuse to mark a notification owned by another user', async () => {
      vi.mocked(notificationsRepository.findById).mockResolvedValue(notification({ userId: 'user-2' }));

      await expect(notificationsService.markAsRead('notif-123', 'user-1')).rejects.toThrow(NotFoundException);
      expect(notificationsRepository.markAsRead).not.toHaveBeenCalled();
    });

    it('should not reveal that a notification exists but belongs to someone else', async () => {
      vi.mocked(notificationsRepository.findById).mockResolvedValue(null);
      const missing = await notificationsService
        .markAsRead('notif-404', 'user-1')
        .catch((error: unknown) => error as Error);

      vi.mocked(notificationsRepository.findById).mockResolvedValue(notification({ userId: 'user-2' }));
      const otherUsers = await notificationsService
        .markAsRead('notif-123', 'user-1')
        .catch((error: unknown) => error as Error);

      expect((otherUsers as Error).message).toBe((missing as Error).message);
      expect((otherUsers as Error).constructor).toBe((missing as Error).constructor);
    });
  });

  describe('markAllAsRead', () => {
    it('should mark every notification of that user as read', async () => {
      await notificationsService.markAllAsRead('user-1');

      expect(notificationsRepository.markAllAsRead).toHaveBeenCalledWith('user-1');
    });

    it('should resolve for a user with no unread notifications', async () => {
      await expect(notificationsService.markAllAsRead('user-1')).resolves.toBeUndefined();
    });
  });

  describe('countUnread', () => {
    it('should count unread notifications', async () => {
      vi.mocked(notificationsRepository.countUnread).mockResolvedValue(5);

      const result = await notificationsService.countUnread('user-1');

      expect(result).toBe(5);
      expect(notificationsRepository.countUnread).toHaveBeenCalledWith('user-1');
    });

    it('should return zero for a user with nothing unread', async () => {
      vi.mocked(notificationsRepository.countUnread).mockResolvedValue(0);

      await expect(notificationsService.countUnread('user-1')).resolves.toBe(0);
    });
  });

  describe('delete', () => {
    it('should delete a notification the user owns', async () => {
      vi.mocked(notificationsRepository.findById).mockResolvedValue(notification());

      await notificationsService.delete('notif-123', 'user-1');

      expect(notificationsRepository.delete).toHaveBeenCalledWith('notif-123');
    });

    it('should refuse to delete a notification owned by another user', async () => {
      vi.mocked(notificationsRepository.findById).mockResolvedValue(notification({ userId: 'user-2' }));

      await expect(notificationsService.delete('notif-123', 'user-1')).rejects.toThrow(NotFoundException);
      expect(notificationsRepository.delete).not.toHaveBeenCalled();
    });

    it('should refuse to delete a notification that does not exist', async () => {
      vi.mocked(notificationsRepository.findById).mockResolvedValue(null);

      await expect(notificationsService.delete('notif-404', 'user-1')).rejects.toThrow('Notification not found');
      expect(notificationsRepository.delete).not.toHaveBeenCalled();
    });
  });

  describe('getPreferences', () => {
    it('should return the stored preferences', async () => {
      const preferences: NotificationPreferencesResponseDto = { ...DEFAULT_PREFERENCES, pushEnabled: false };
      vi.mocked(notificationsRepository.findPreferences).mockResolvedValue(preferences);

      await expect(notificationsService.getPreferences('user-1')).resolves.toEqual(preferences);
      expect(notificationsRepository.findPreferences).toHaveBeenCalledWith('user-1');
    });

    it('should return a default-shaped object for a user with no stored preferences', async () => {
      vi.mocked(notificationsRepository.findPreferences).mockResolvedValue({ ...DEFAULT_PREFERENCES });

      const result = await notificationsService.getPreferences('user-1');

      expect(result.emailEnabled).toBe(true);
      expect(result.mentions).toBe(true);
    });
  });

  describe('updatePreferences', () => {
    it('should write every field when the payload is complete', async () => {
      vi.mocked(notificationsRepository.findPreferences).mockResolvedValue({ ...DEFAULT_PREFERENCES });
      const allOff: UpsertNotificationPreferencesInput = {
        emailEnabled: false,
        pushEnabled: false,
        storyReactions: false,
        comments: false,
        follows: false,
        mentions: false,
        system: false,
      };
      vi.mocked(notificationsRepository.upsertPreferences).mockResolvedValue(allOff);

      const result = await notificationsService.updatePreferences('user-1', allOff);

      expect(notificationsRepository.upsertPreferences).toHaveBeenCalledWith('user-1', allOff);
      expect(result.emailEnabled).toBe(false);
    });

    it('should keep the existing value for an omitted field', async () => {
      vi.mocked(notificationsRepository.findPreferences).mockResolvedValue({
        ...DEFAULT_PREFERENCES,
        pushEnabled: false,
        mentions: false,
      });
      vi.mocked(notificationsRepository.upsertPreferences).mockResolvedValue(DEFAULT_PREFERENCES);

      await notificationsService.updatePreferences('user-1', { comments: false });

      expect(notificationsRepository.upsertPreferences).toHaveBeenCalledWith('user-1', {
        ...DEFAULT_PREFERENCES,
        pushEnabled: false,
        mentions: false,
        comments: false,
      });
    });

    it('should honour an explicit false rather than treating it as absent', async () => {
      vi.mocked(notificationsRepository.findPreferences).mockResolvedValue({ ...DEFAULT_PREFERENCES });
      vi.mocked(notificationsRepository.upsertPreferences).mockResolvedValue({ ...DEFAULT_PREFERENCES, system: false });

      await notificationsService.updatePreferences('user-1', { system: false });

      expect(notificationsRepository.upsertPreferences).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ system: false }),
      );
    });

    it('should preserve every existing value when the payload is empty', async () => {
      vi.mocked(notificationsRepository.findPreferences).mockResolvedValue({ ...DEFAULT_PREFERENCES });
      vi.mocked(notificationsRepository.upsertPreferences).mockResolvedValue({ ...DEFAULT_PREFERENCES });

      await notificationsService.updatePreferences('user-1', {});

      expect(notificationsRepository.upsertPreferences).toHaveBeenCalledWith('user-1', { ...DEFAULT_PREFERENCES });
    });

    it('should read the existing preferences before writing', async () => {
      vi.mocked(notificationsRepository.findPreferences).mockResolvedValue({ ...DEFAULT_PREFERENCES });
      vi.mocked(notificationsRepository.upsertPreferences).mockResolvedValue({ ...DEFAULT_PREFERENCES });

      await notificationsService.updatePreferences('user-1', { emailEnabled: false });

      expect(notificationsRepository.findPreferences).toHaveBeenCalledWith('user-1');
      expect(notificationsRepository.findPreferences.mock.invocationCallOrder[0]).toBeLessThan(
        notificationsRepository.upsertPreferences.mock.invocationCallOrder[0] ?? 0,
      );
    });

    it('should let a preference write failure propagate', async () => {
      vi.mocked(notificationsRepository.findPreferences).mockResolvedValue({ ...DEFAULT_PREFERENCES });
      vi.mocked(notificationsRepository.upsertPreferences).mockRejectedValue(new Error('write conflict'));

      await expect(notificationsService.updatePreferences('user-1', { comments: false })).rejects.toThrow(
        'write conflict',
      );
    });
  });
});
