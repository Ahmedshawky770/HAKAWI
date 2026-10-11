import type { Server } from 'node:http';

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';

import { ValkeyService } from '../../../common/services/valkey.service.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { NotificationsService } from '../notifications.service.ts';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import type { NotificationPreferencesResponseDto } from '../interfaces/notifications-repository.interface.ts';
import type { NotificationPreferencesDto } from '../dto/preferences.dto.ts';
import type { Notification, NotificationResponse } from '../types.ts';

import { NotificationsController } from './notifications.controller.ts';

const JWT_SECRET = 'test-jwt-secret-for-controller-specs';

async function generateToken(sub = 'user-1', email = 'test@example.com', accountType = 'reader'): Promise<string> {
  return new JwtService({ secret: JWT_SECRET }).signAsync({ sub, email, accountType });
}

type NotificationListResponse = {
  notifications: NotificationResponse[];
  total: number;
  page: number;
  limit: number;
};

const ALL_PREFERENCES: NotificationPreferencesResponseDto = {
  emailEnabled: true,
  pushEnabled: true,
  storyReactions: true,
  comments: true,
  follows: true,
  mentions: true,
  messages: true,
  system: true,
};

type MockNotificationsService = {
  findByUser: ReturnType<typeof vi.fn<(userId: string, page: number, limit: number) => Promise<NotificationListResponse>>>;
  findUnread: ReturnType<typeof vi.fn<(userId: string, limit: number) => Promise<NotificationResponse[]>>>;
  countUnread: ReturnType<typeof vi.fn<(userId: string) => Promise<number>>>;
  markAsRead: ReturnType<typeof vi.fn<(id: string, userId: string) => Promise<Notification>>>;
  markAllAsRead: ReturnType<typeof vi.fn<(userId: string) => Promise<void>>>;
  delete: ReturnType<typeof vi.fn<(id: string, userId: string) => Promise<void>>>;
  getPreferences: ReturnType<typeof vi.fn<(userId: string) => Promise<NotificationPreferencesResponseDto>>>;
  updatePreferences: ReturnType<
    typeof vi.fn<(userId: string, dto: NotificationPreferencesDto) => Promise<NotificationPreferencesResponseDto>>
  >;
};

describe('NotificationsController', () => {
  let app: INestApplication<Server>;
  let notificationsService: MockNotificationsService;

  beforeAll(async () => {
    notificationsService = {
      findByUser: vi.fn<(userId: string, page: number, limit: number) => Promise<NotificationListResponse>>(),
      findUnread: vi.fn<(userId: string, limit: number) => Promise<NotificationResponse[]>>(),
      countUnread: vi.fn<(userId: string) => Promise<number>>(),
      markAsRead: vi.fn<(id: string, userId: string) => Promise<Notification>>(),
      markAllAsRead: vi.fn<(userId: string) => Promise<void>>(),
      delete: vi.fn<(id: string, userId: string) => Promise<void>>(),
      getPreferences: vi.fn<(userId: string) => Promise<NotificationPreferencesResponseDto>>(),
      updatePreferences:
        vi.fn<(userId: string, dto: NotificationPreferencesDto) => Promise<NotificationPreferencesResponseDto>>(),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [] })],
      controllers: [NotificationsController],
      providers: [
        {
          provide: NotificationsService,
          useValue: notificationsService,
        },
        JwtAuthGuard,
        {
          provide: JwtService,
          useValue: new JwtService({ secret: JWT_SECRET }),
        },
        // `@Secured` composes `RestrictionGuard`, which injects `ValkeyService` and the logger.
        // This module is hand-built rather than importing `CommonModule`, so both must be provided
        // here or Nest fails at DI resolution before any assertion runs.
        { provide: ValkeyService, useValue: { exists: vi.fn().mockResolvedValue(false), get: vi.fn(), set: vi.fn() } },
        {
          provide: WinstonLoggerService,
          useValue: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), log: vi.fn(), verbose: vi.fn() },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /notifications', () => {
    it('should return paginated notifications', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(notificationsService.findByUser).mockResolvedValue({
        notifications: [],
        total: 0,
        page: 1,
        limit: 20,
      });

      const res = await request(app.getHttpServer()).get('/notifications').set('Authorization', `Bearer ${token}`).expect(200);

      expect(res.body).toHaveProperty('notifications');
      expect(res.body).toHaveProperty('total', 0);
      expect(notificationsService.findByUser).toHaveBeenCalledWith('user-1', 1, 20);
    });
  });

  describe('GET /notifications/unread', () => {
    it('should return unread notifications', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(notificationsService.findUnread).mockResolvedValue([]);

      const res = await request(app.getHttpServer())
        .get('/notifications/unread')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual([]);
      expect(notificationsService.findUnread).toHaveBeenCalledWith('user-1', 50);
    });
  });

  // `GET unread/count` and `GET unread-count` were the same handler registered twice. `unread-count` is
  // the one every caller uses (`frontend/src/lib/api.ts:422` and the integration suite), so it is the
  // survivor; the cases below pin that it resolves and that the removed spelling no longer does.
  describe('GET /notifications/unread-count', () => {
    it('should return unread notification count', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(notificationsService.countUnread).mockResolvedValue(3);

      const res = await request(app.getHttpServer())
        .get('/notifications/unread-count')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual({ count: 3 });
      expect(notificationsService.countUnread).toHaveBeenCalledWith('user-1');
    });

    it('should no longer resolve the removed unread/count spelling', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      await request(app.getHttpServer()).get('/notifications/unread/count').set('Authorization', `Bearer ${token}`).expect(404);

      expect(notificationsService.countUnread).not.toHaveBeenCalled();
    });
  });

  describe('GET /notifications/preferences', () => {
    it('should return notification preferences', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(notificationsService.getPreferences).mockResolvedValue(ALL_PREFERENCES);

      const res = await request(app.getHttpServer())
        .get('/notifications/preferences')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('emailEnabled', true);
      expect(res.body).toHaveProperty('pushEnabled', true);
      expect(notificationsService.getPreferences).toHaveBeenCalledWith('user-1');
    });
  });

  describe('PATCH /notifications/preferences', () => {
    it('should update notification preferences', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(notificationsService.getPreferences).mockResolvedValue(ALL_PREFERENCES);

      vi.mocked(notificationsService.updatePreferences).mockResolvedValue({
        ...ALL_PREFERENCES,
        emailEnabled: false,
        comments: false,
      });

      const res = await request(app.getHttpServer())
        .patch('/notifications/preferences')
        .set('Authorization', `Bearer ${token}`)
        .send({ emailEnabled: false, comments: false })
        .expect(200);

      expect(res.body).toHaveProperty('emailEnabled', false);
      expect(res.body).toHaveProperty('comments', false);
      expect(notificationsService.updatePreferences).toHaveBeenCalledWith('user-1', {
        emailEnabled: false,
        comments: false,
      });
    });
  });

  describe('PATCH /notifications/:id/read', () => {
    it('should mark a notification as read', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(notificationsService.markAsRead).mockResolvedValue({
        id: 'notification-1',
        userId: 'user-1',
        type: 'comment',
        title: 'New comment',
        message: 'Someone commented',
        data: null,
        isRead: true,
        readAt: new Date(),
        createdAt: new Date(),
      });

      const res = await request(app.getHttpServer())
        .patch('/notifications/notification-1/read')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('isRead', true);
      expect(notificationsService.markAsRead).toHaveBeenCalledWith('notification-1', 'user-1');
    });
  });

  // `PATCH read-all` and `PUT read-all` were the same handler registered under two verbs. Only PATCH
  // has a caller, so PATCH is the contract and PUT is gone; the 404 below is what stops it creeping
  // back in as a second spelling.
  describe('PATCH /notifications/read-all', () => {
    it('should mark all notifications as read', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(notificationsService.markAllAsRead).mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .patch('/notifications/read-all')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual({ message: 'All notifications marked as read' });
      expect(notificationsService.markAllAsRead).toHaveBeenCalledWith('user-1');
    });

    it('should no longer answer the same path under PUT', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      await request(app.getHttpServer()).put('/notifications/read-all').set('Authorization', `Bearer ${token}`).expect(404);

      expect(notificationsService.markAllAsRead).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /notifications/:id', () => {
    it('should delete a notification', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(notificationsService.delete).mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .delete('/notifications/notification-1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual({ message: 'Notification deleted' });
      expect(notificationsService.delete).toHaveBeenCalledWith('notification-1', 'user-1');
    });
  });
});
