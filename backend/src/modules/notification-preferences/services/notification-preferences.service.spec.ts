import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotificationPreferencesService } from './notification-preferences.service.js';
import type { NotificationPreferencesRepository } from '../repositories/notification-preferences.repository.js';
import { NotFoundException } from '@nestjs/common';

type MockNotificationPreferencesRepository = Partial<NotificationPreferencesRepository>;

const createMockNotificationPreference = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'pref-123',
  userId: 'user-123',
  emailEnabled: true,
  pushEnabled: true,
  inAppEnabled: true,
  types: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('NotificationPreferencesService', () => {
  let notificationPreferencesService: NotificationPreferencesService;
  let notificationPreferencesRepository: MockNotificationPreferencesRepository;

  beforeEach(() => {
    notificationPreferencesRepository = {
      findByUserId: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    };

    notificationPreferencesService = new NotificationPreferencesService(
      notificationPreferencesRepository as NotificationPreferencesRepository,
    );
  });

  describe('findByUserId', () => {
    it('should return preferences when found', async () => {
      const prefs = createMockNotificationPreference();
      vi.mocked(notificationPreferencesRepository.findByUserId).mockResolvedValue(prefs as any);

      const result = await notificationPreferencesService.findByUserId('user-123');

      expect(result).toEqual(prefs);
    });

    it('should create default preferences when not found', async () => {
      const prefs = createMockNotificationPreference();
      vi.mocked(notificationPreferencesRepository.findByUserId).mockResolvedValue(null);
      vi.mocked(notificationPreferencesRepository.create).mockResolvedValue(prefs as any);

      const result = await notificationPreferencesService.findByUserId('user-123');

      expect(result).toEqual(prefs);
      expect(notificationPreferencesRepository.create).toHaveBeenCalledWith({
        userId: 'user-123',
        emailEnabled: true,
        pushEnabled: true,
        inAppEnabled: true,
        types: null,
      });
    });
  });

  describe('update', () => {
    it('should update preferences when found', async () => {
      const prefs = createMockNotificationPreference();
      const updatedPrefs = createMockNotificationPreference({ emailEnabled: false });
      vi.mocked(notificationPreferencesRepository.findByUserId).mockResolvedValue(prefs as any);
      vi.mocked(notificationPreferencesRepository.update).mockResolvedValue(updatedPrefs as any);

      const result = await notificationPreferencesService.update('user-123', { emailEnabled: false } as any);

      expect(result).toEqual(updatedPrefs);
    });

    it('should throw NotFoundException when preferences not found', async () => {
      vi.mocked(notificationPreferencesRepository.findByUserId).mockResolvedValue(null);

      await expect(notificationPreferencesService.update('user-123', { emailEnabled: false } as any))
        .rejects.toThrow('Notification preferences not found');
    });
  });
});
