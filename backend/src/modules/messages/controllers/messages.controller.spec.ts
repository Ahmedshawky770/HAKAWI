import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';

import { MessagesController } from './messages.controller.ts';
import { MessagesService } from '../messages.service.ts';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.ts';
import { ConfigModule } from '@nestjs/config';

const JWT_SECRET = 'test-jwt-secret-for-controller-specs';

async function generateToken(sub = 'user-1', email = 'test@example.com', accountType = 'reader'): Promise<string> {
  return new JwtService({ secret: JWT_SECRET } as any).signAsync({ sub, email, accountType } as any);
}

describe('MessagesController', () => {
  let app: INestApplication;
  let httpServer: Server;
  let messagesService: Partial<MessagesService>;

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
          useValue: new JwtService({ secret: JWT_SECRET } as any),
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
        id: 'conv-1',
        participant1Id: 'user-1',
        participant2Id: 'user-2',
        lastMessageAt: null,
        createdAt: new Date(),
      } as any);

      const res = await request(httpServer)
        .post('/messages/conversations')
        .set('Authorization', `Bearer ${token}`)
        .send({ recipientId: '00000000-0000-0000-0000-000000000002' })
        .expect(201);

      expect(res.body).toHaveProperty('id', 'conv-1');
      expect(res.body).toHaveProperty('participant1Id', 'user-1');
      expect(res.body).toHaveProperty('participant2Id', 'user-2');
      expect(messagesService.getOrCreateConversation).toHaveBeenCalledWith('user-1', '00000000-0000-0000-0000-000000000002');
    });
  });

  describe('GET /messages/conversations', () => {
    it('should return list of conversations', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(messagesService.getConversations).mockResolvedValue({
        conversations: [],
        total: 0,
      } as any);

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
      } as any);

      const res = await request(httpServer)
        .get('/messages/conversations/conv-1/messages')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('messages');
      expect(res.body).toHaveProperty('total', 0);
      expect(messagesService.getMessages).toHaveBeenCalledWith('conv-1', 'user-1', 1, 50);
    });
  });

  describe('POST /messages/conversations/:conversationId/messages', () => {
    it('should send a message in a conversation', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(messagesService.sendMessage).mockResolvedValue({
        id: 'msg-1',
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: 'Hello!',
        isRead: false,
        readAt: null,
        createdAt: new Date(),
      } as any);

      const res = await request(httpServer)
        .post('/messages/conversations/conv-1/messages')
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Hello!' })
        .expect(201);

      expect(res.body).toHaveProperty('id', 'msg-1');
      expect(res.body).toHaveProperty('content', 'Hello!');
      expect(messagesService.sendMessage).toHaveBeenCalledWith('conv-1', 'user-1', 'Hello!');
    });
  });

  describe('PATCH /messages/messages/:messageId/read', () => {
    it('should mark a message as read', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(messagesService.markAsRead).mockResolvedValue({
        id: 'msg-1',
        conversationId: 'conv-1',
        senderId: 'user-2',
        content: 'Hello!',
        isRead: true,
        readAt: new Date(),
        createdAt: new Date(),
      } as any);

      const res = await request(httpServer)
        .patch('/messages/messages/msg-1/read')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('isRead', true);
      expect(messagesService.markAsRead).toHaveBeenCalledWith('msg-1', 'user-1');
    });
  });

  describe('PATCH /messages/conversations/:conversationId/read', () => {
    it('should mark all messages in conversation as read', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(messagesService.markAllAsRead).mockResolvedValue(undefined);

      const res = await request(httpServer)
        .patch('/messages/conversations/conv-1/read')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual({ message: 'All messages marked as read' });
      expect(messagesService.markAllAsRead).toHaveBeenCalledWith('conv-1', 'user-1');
    });
  });

  describe('GET /messages/conversations/:conversationId/unread', () => {
    it('should return unread count for a conversation', async () => {
      const token = await generateToken('user-1', 'test@example.com', 'reader');

      vi.mocked(messagesService.getUnreadCount).mockResolvedValue(5);

      const res = await request(httpServer)
        .get('/messages/conversations/conv-1/unread')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual({ count: 5 });
      expect(messagesService.getUnreadCount).toHaveBeenCalledWith('conv-1', 'user-1');
    });
  });
});
