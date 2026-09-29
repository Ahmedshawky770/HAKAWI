import { describe, it, expect, beforeEach, vi } from 'vitest';

import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import type { INotificationsRepository, Notification, CreateNotificationInput } from '../interfaces/notifications-repository.interface.ts';
import type { IUsersRepository, User, CreateUserInput } from '../../../common/users/users-repository.interface.ts';

import { NotificationsEmailService } from './notifications-email.service.ts';

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

type MockUsersRepository = {
  findById: ReturnType<typeof vi.fn<(id: string) => Promise<User | null>>>;
  findByEmail: ReturnType<typeof vi.fn<(email: string) => Promise<User | null>>>;
  findByUsername: ReturnType<typeof vi.fn<(username: string) => Promise<User | null>>>;
  create: ReturnType<typeof vi.fn<(data: CreateUserInput) => Promise<User>>>;
  update: ReturnType<typeof vi.fn<(id: string, data: Partial<User>) => Promise<User>>>;
  findByGoogleId: ReturnType<typeof vi.fn<(googleId: string) => Promise<User | null>>>;
  findByFacebookId: ReturnType<typeof vi.fn<(facebookId: string) => Promise<User | null>>>;
  findByTwitterId: ReturnType<typeof vi.fn<(twitterId: string) => Promise<User | null>>>;
  findByGithubId: ReturnType<typeof vi.fn<(githubId: string) => Promise<User | null>>>;
  findByAppleId: ReturnType<typeof vi.fn<(appleId: string) => Promise<User | null>>>;
  findByTiktokId: ReturnType<typeof vi.fn<(tiktokId: string) => Promise<User | null>>>;
  softDelete: ReturnType<typeof vi.fn<(id: string) => Promise<void>>>;
};

type MockWinstonLoggerService = {
  info: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  verbose: ReturnType<typeof vi.fn>;
};

type MockEmailTransporter = {
  sendMail: ReturnType<typeof vi.fn<(options: { from: string; to: string; subject: string; text: string; html?: string }) => Promise<{ accepted: string[]; rejected: string[]; pending: string[]; envelope: { from: string; to: string[] } }>>>;
};

// vi.mocked() returns `any` when the mock property is typed ReturnType<typeof vi.fn> (= any).
// This is a vitest typing limitation — mocks are correctly typed and tests pass.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

describe('NotificationsEmailService', () => {
  let service: NotificationsEmailService;
  let notificationsRepository: MockNotificationsRepository;
  let usersRepository: MockUsersRepository;
  let logger: MockWinstonLoggerService;
  let transporter: MockEmailTransporter;

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

    usersRepository = {
      findById: vi.fn<(id: string) => Promise<User | null>>(),
      findByEmail: vi.fn<(email: string) => Promise<User | null>>(),
      findByUsername: vi.fn<(username: string) => Promise<User | null>>(),
      create: vi.fn<(data: CreateUserInput) => Promise<User>>(),
      update: vi.fn<(id: string, data: Partial<User>) => Promise<User>>(),
      findByGoogleId: vi.fn<(googleId: string) => Promise<User | null>>(),
      findByFacebookId: vi.fn<(facebookId: string) => Promise<User | null>>(),
      findByTwitterId: vi.fn<(twitterId: string) => Promise<User | null>>(),
      findByGithubId: vi.fn<(githubId: string) => Promise<User | null>>(),
      findByAppleId: vi.fn<(appleId: string) => Promise<User | null>>(),
      findByTiktokId: vi.fn<(tiktokId: string) => Promise<User | null>>(),
      softDelete: vi.fn<(id: string) => Promise<void>>(),
    };

    logger = {
      info: vi.fn(),
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      verbose: vi.fn(),
    };

    transporter = {
      sendMail: vi.fn().mockResolvedValue({ accepted: ['user-1@example.com'], rejected: [], pending: [], envelope: { from: 'noreply@hakawi.com', to: ['user-1@example.com'] } }),
    };

    service = new NotificationsEmailService(
      logger as unknown as WinstonLoggerService,
      notificationsRepository,
      usersRepository,
      transporter,
    );
  });

  describe('sendNotificationEmail', () => {
    it('should send email when emailEnabled is true and no type preference', async () => {
      vi.mocked(notificationsRepository.findPreferences).mockResolvedValue({
        emailEnabled: true,
        pushEnabled: true,
        storyReactions: true,
        comments: true,
        follows: true,
        mentions: true,
        system: true,
      });

      vi.mocked(usersRepository.findById).mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        name: 'User',
        username: 'user',
        accountType: 'reader',
        passwordHash: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as User);

      const result = await service.sendNotificationEmail('user-1', 'system', 'Test Subject', 'Test message');

      expect(result).toBe(true);
      expect(transporter.sendMail).toHaveBeenCalled();
    });

    it('should not send email when emailEnabled is false', async () => {
      vi.mocked(notificationsRepository.findPreferences).mockResolvedValue({
        emailEnabled: false,
        pushEnabled: true,
        storyReactions: true,
        comments: true,
        follows: true,
        mentions: true,
        system: true,
      });

      const result = await service.sendNotificationEmail('user-1', 'system', 'Test Subject', 'Test message');

      expect(result).toBe(false);
      expect(transporter.sendMail).not.toHaveBeenCalled();
    });

    it('should not send email when type-specific preference is false', async () => {
      vi.mocked(notificationsRepository.findPreferences).mockResolvedValue({
        emailEnabled: true,
        pushEnabled: true,
        storyReactions: false,
        comments: true,
        follows: true,
        mentions: true,
        system: true,
      });

      const result = await service.sendNotificationEmail('user-1', 'story_reaction', 'Test Subject', 'Test message');

      expect(result).toBe(false);
      expect(transporter.sendMail).not.toHaveBeenCalled();
    });

    it('should not send email when user not found', async () => {
      vi.mocked(notificationsRepository.findPreferences).mockResolvedValue({
        emailEnabled: true,
        pushEnabled: true,
        storyReactions: true,
        comments: true,
        follows: true,
        mentions: true,
        system: true,
      });

      vi.mocked(usersRepository.findById).mockResolvedValue(null);

      const result = await service.sendNotificationEmail('user-1', 'system', 'Test Subject', 'Test message');

      expect(result).toBe(false);
    });
  });
});
