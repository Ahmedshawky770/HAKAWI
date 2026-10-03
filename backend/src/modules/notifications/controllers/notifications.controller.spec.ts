import type { Server } from 'http';

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ValkeyService } from '../../../common/services/valkey.service.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { JwtService } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';

import { NotificationsService } from '../notifications.service.ts';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';

import { NotificationsController } from './notifications.controller.ts';

// vi.mocked() returns `any` when the mock property is typed ReturnType<typeof vi.fn> (= any).
// This is a vitest typing limitation — mocks are correctly typed and tests pass.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

const JWT_SECRET = 'test-jwt-secret-for-controller-specs';

async function generateToken(sub = 'user-1', email = 'test@example.com', accountType = 'reader'): Promise<string> {
  return new JwtService({ secret: JWT_SECRET }).signAsync({ sub, email, accountType });
}

type MockNotificationsService = {
  findByUser: ReturnType<typeof vi.fn>;
  findUnread: ReturnType<typeof vi.fn>;
  countUnread: ReturnType<typeof vi.fn>;
  markAsRead: ReturnType<typeof vi.fn>;
  markAllAsRead: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  getPreferences: ReturnType<typeof vi.fn>;
  updatePreferences: ReturnType<typeof vi.fn>;
};

describe('NotificationsController', () => {
  let app: INestApplication;
  let httpServer: Server;
  let notificationsService: MockNotificationsService;

  beforeAll(async () => {
    notificationsService = {
      findByUser: vi.fn(),
      findUnread: vi.fn(),
      countUnread: vi.fn(),
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
      delete: vi.fn(),
      getPreferences: vi.fn(),
      updatePreferences: vi.fn(),
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
    httpServer = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
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
      });

      const res = await request(httpServer).get('/notifications').set('Authorization', `Bearer ${token}`).expect(200);

      expect(res.body).toHaveProperty('notifications');
      expect(res.body).toHaveProperty('total', 0);
      expect(notificationsService.findByUser).toHaveBeenCalledWith('user-1', 1, 20);
    });
  });

  describe('GET /notifications/unread', () => {
    it('should return unread notifications', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(notificationsService.findUnread).mockResolvedValue([]);

      const res = await request(httpServer)
        .get('/notifications/unread')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual([]);
      expect(notificationsService.findUnread).toHaveBeenCalledWith('user-1');
    });
  });

  describe('GET /notifications/unread/count', () => {
    it('should return unread notification count', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(notificationsService.countUnread).mockResolvedValue(3);

      const res = await request(httpServer)
        .get('/notifications/unread/count')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual({ count: 3 });
      expect(notificationsService.countUnread).toHaveBeenCalledWith('user-1');
    });
  });

  describe('GET /notifications/preferences', () => {
    it('should return notification preferences', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(notificationsService.getPreferences).mockResolvedValue({
        emailEnabled: true,
        pushEnabled: true,
        storyReactions: true,
        comments: true,
        follows: true,
        mentions: true,
        system: true,
      });

      const res = await request(httpServer)
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

      vi.mocked(notificationsService.getPreferences).mockResolvedValue({
        emailEnabled: true,
        pushEnabled: true,
        storyReactions: true,
        comments: true,
        follows: true,
        mentions: true,
        system: true,
      });

      vi.mocked(notificationsService.updatePreferences).mockResolvedValue({
        emailEnabled: false,
        pushEnabled: true,
        storyReactions: true,
        comments: false,
        follows: true,
        mentions: true,
        system: true,
      });

      const res = await request(httpServer)
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

      const res = await request(httpServer)
        .patch('/notifications/notification-1/read')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('isRead', true);
      expect(notificationsService.markAsRead).toHaveBeenCalledWith('notification-1', 'user-1');
    });
  });

  describe('PATCH /notifications/read-all', () => {
    it('should mark all notifications as read', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(notificationsService.markAllAsRead).mockResolvedValue(undefined);

      const res = await request(httpServer)
        .patch('/notifications/read-all')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual({ message: 'All notifications marked as read' });
      expect(notificationsService.markAllAsRead).toHaveBeenCalledWith('user-1');
    });
  });

  describe('DELETE /notifications/:id', () => {
    it('should delete a notification', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(notificationsService.delete).mockResolvedValue(undefined);

      const res = await request(httpServer)
        .delete('/notifications/notification-1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual({ message: 'Notification deleted' });
      expect(notificationsService.delete).toHaveBeenCalledWith('notification-1', 'user-1');
    });
  });
});
