import type { Server } from 'http';

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ValkeyService } from '../../../common/services/valkey.service.ts';
import { WinstonLoggerService } from '../../../common/services/winston-logger.service.ts';
import { JwtService } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';

import { MessagesService } from '../messages.service.ts';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';

import { MessagesController } from './messages.controller.ts';

// vi.mocked() returns `any` when the mock property is typed ReturnType<typeof vi.fn> (= any).
// This is a vitest typing limitation — mocks are correctly typed and tests pass.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

const JWT_SECRET = 'test-jwt-secret-for-controller-specs';

async function generateToken(sub = 'user-1', email = 'test@example.com', accountType = 'reader'): Promise<string> {
  return new JwtService({ secret: JWT_SECRET }).signAsync({ sub, email, accountType });
}

type MockMessagesService = {
  getOrCreateConversation: ReturnType<typeof vi.fn>;
  getConversations: ReturnType<typeof vi.fn>;
  getMessages: ReturnType<typeof vi.fn>;
  sendMessage: ReturnType<typeof vi.fn>;
  markAsRead: ReturnType<typeof vi.fn>;
  markAllAsRead: ReturnType<typeof vi.fn>;
  getUnreadCount: ReturnType<typeof vi.fn>;
};

describe('MessagesController', () => {
  let app: INestApplication;
  let httpServer: Server;
  let messagesService: MockMessagesService;

  beforeAll(async () => {
    messagesService = {
      getOrCreateConversation: vi.fn(),
      getConversations: vi.fn(),
      getMessages: vi.fn(),
      sendMessage: vi.fn(),
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
      getUnreadCount: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [] })],
      controllers: [MessagesController],
      providers: [
        {
          provide: MessagesService,
          useValue: messagesService,
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

  describe('POST /messages/conversations', () => {
    it('should create or get a conversation', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(messagesService.getOrCreateConversation).mockResolvedValue({
        id: '11111111-1111-4111-8111-111111111111',
        participant1Id: 'user-1',
        participant2Id: 'user-2',
        lastMessageAt: null,
        createdAt: new Date(),
      });

      const res = await request(httpServer)
        .post('/messages/conversations')
        .set('Authorization', `Bearer ${token}`)
        .send({ recipientId: '00000000-0000-0000-0000-000000000002' })
        .expect(201);

      expect(res.body).toHaveProperty('id', '11111111-1111-4111-8111-111111111111');
      expect(res.body).toHaveProperty('participant1Id', 'user-1');
      expect(res.body).toHaveProperty('participant2Id', 'user-2');
      expect(messagesService.getOrCreateConversation).toHaveBeenCalledWith(
        'user-1',
        '00000000-0000-0000-0000-000000000002',
      );
    });
  });

  describe('GET /messages/conversations', () => {
    it('should return list of conversations', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(messagesService.getConversations).mockResolvedValue({
        conversations: [],
        total: 0,
      });

      const res = await request(httpServer)
        .get('/messages/conversations')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('conversations');
      expect(res.body).toHaveProperty('total', 0);
      expect(messagesService.getConversations).toHaveBeenCalledWith('user-1', 1, 20);
    });
  });

  describe('GET /messages/conversations/:conversationId/messages', () => {
    it('should return messages for a conversation', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(messagesService.getMessages).mockResolvedValue({
        messages: [],
        total: 0,
      });

      const res = await request(httpServer)
        .get('/messages/conversations/11111111-1111-4111-8111-111111111111/messages')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('messages');
      expect(res.body).toHaveProperty('total', 0);
      expect(messagesService.getMessages).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', 'user-1', 1, 50);
    });
  });

  describe('POST /messages/conversations/:conversationId/messages', () => {
    it('should send a message in a conversation', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(messagesService.sendMessage).mockResolvedValue({
        id: '22222222-2222-4222-8222-222222222222',
        conversationId: '11111111-1111-4111-8111-111111111111',
        senderId: 'user-1',
        content: 'Hello!',
        isRead: false,
        readAt: null,
        createdAt: new Date(),
      });

      const res = await request(httpServer)
        .post('/messages/conversations/11111111-1111-4111-8111-111111111111/messages')
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Hello!' })
        .expect(201);

      expect(res.body).toHaveProperty('id', '22222222-2222-4222-8222-222222222222');
      expect(res.body).toHaveProperty('content', 'Hello!');
      expect(messagesService.sendMessage).toHaveBeenCalledWith(
        '11111111-1111-4111-8111-111111111111',
        'user-1',
        'Hello!',
      );
    });
  });

  // Regression guard for the doubled-segment route. `@Controller('messages')` +
  // `@Patch('messages/:messageId/read')` only ever resolved `PATCH /messages/messages/:messageId/read`,
  // which no client would guess, so the natural path answered 404. The two cases below pin both
  // halves of the fix: the natural path resolves, and the doubled one no longer does.
  describe('PATCH /messages/:messageId/read', () => {
    it('should mark a message as read', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(messagesService.markAsRead).mockResolvedValue({
        id: '22222222-2222-4222-8222-222222222222',
        conversationId: '11111111-1111-4111-8111-111111111111',
        senderId: 'user-2',
        content: 'Hello!',
        isRead: true,
        readAt: new Date(),
        createdAt: new Date(),
      });

      const res = await request(httpServer)
        .patch('/messages/22222222-2222-4222-8222-222222222222/read')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('isRead', true);
      expect(messagesService.markAsRead).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222', 'user-1');
    });

    it('should no longer resolve the doubled messages/messages path', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      await request(httpServer)
        .patch('/messages/messages/22222222-2222-4222-8222-222222222222/read')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(messagesService.markAsRead).not.toHaveBeenCalled();
      expect(messagesService.markAllAsRead).not.toHaveBeenCalled();
    });

    it('should reject a non-UUID in the messageId position instead of falling through', async () => {
      // `ParseUUIDPipe` is the last line of defence against `:messageId` absorbing a literal path
      // segment such as `conversations`; without it such a caller would reach the service.
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      await request(httpServer)
        .patch('/messages/conversations/read')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);

      expect(messagesService.markAsRead).not.toHaveBeenCalled();
    });
  });

  // The two `read` routes are disjoint by segment count (two after `messages` versus three), so this
  // case is what proves `:messageId` is not swallowed by — and cannot swallow — the conversation route.
  describe('PATCH /messages/conversations/:conversationId/read', () => {
    it('should mark all messages in conversation as read', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(messagesService.markAllAsRead).mockResolvedValue(undefined);

      const res = await request(httpServer)
        .patch('/messages/conversations/11111111-1111-4111-8111-111111111111/read')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual({ message: 'All messages marked as read' });
      expect(messagesService.markAllAsRead).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', 'user-1');
      expect(messagesService.markAsRead).not.toHaveBeenCalled();
    });
  });

  describe('GET /messages/conversations/:conversationId/unread', () => {
    it('should return unread count for a conversation', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(messagesService.getUnreadCount).mockResolvedValue(5);

      const res = await request(httpServer)
        .get('/messages/conversations/11111111-1111-4111-8111-111111111111/unread')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual({ count: 5 });
      expect(messagesService.getUnreadCount).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', 'user-1');
    });
  });
});
