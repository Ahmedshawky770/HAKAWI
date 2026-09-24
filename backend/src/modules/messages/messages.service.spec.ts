import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MessagesService } from './messages.service.js';
import type { IConversationsRepository } from './interfaces/messages-repository.interface.js';
import type { IMessagesRepository } from './interfaces/messages-repository.interface.js';
import { CONVERSATIONS_REPOSITORY } from './interfaces/messages-repository.interface.js';
import { MESSAGES_REPOSITORY } from './interfaces/messages-repository.interface.js';
import { WinstonLoggerService } from '../../common/services/winston-logger.service.js';
import { EventEmitter2 } from '@nestjs/event-emitter';

type MockConversationsRepository = Partial<IConversationsRepository>;
type MockMessagesRepository = Partial<IMessagesRepository>;
type MockWinstonLoggerService = {
  info: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  verbose: ReturnType<typeof vi.fn>;
};
type MockEventEmitter = { emit: ReturnType<typeof vi.fn> };

describe('MessagesService', () => {
  let messagesService: MessagesService;
  let conversationsRepository: MockConversationsRepository;
  let messagesRepository: MockMessagesRepository;
  let logger: MockWinstonLoggerService;
  let eventEmitter: MockEventEmitter;

  beforeEach(() => {
    conversationsRepository = {
      findByParticipants: vi.fn(),
      create: vi.fn(),
      findById: vi.fn(),
      findByUser: vi.fn(),
      updateLastMessage: vi.fn(),
    };

    messagesRepository = {
      findById: vi.fn(),
      findByConversation: vi.fn(),
      create: vi.fn(),
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
      countUnread: vi.fn(),
    };

    logger = {
      info: vi.fn(), log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), verbose: vi.fn(),
    };

    eventEmitter = { emit: vi.fn() };

    messagesService = new MessagesService(
      conversationsRepository as unknown as IConversationsRepository,
      messagesRepository as unknown as IMessagesRepository,
      logger as unknown as WinstonLoggerService,
      eventEmitter as unknown as EventEmitter2,
    );
  });

  describe('getOrCreateConversation', () => {
    it('should create a new conversation if not exists', async () => {
      vi.mocked(conversationsRepository.findByParticipants).mockResolvedValue(null);
      vi.mocked(conversationsRepository.create).mockResolvedValue({
        id: 'conv-123', participant1Id: 'user-1', participant2Id: 'user-2', lastMessageAt: null, createdAt: new Date(),
      });

      const result = await messagesService.getOrCreateConversation('user-1', 'user-2');

      expect(result.id).toBe('conv-123');
      expect(conversationsRepository.create).toHaveBeenCalledWith({ participant1Id: 'user-1', participant2Id: 'user-2' });
    });
  });

  describe('sendMessage', () => {
    it('should send a message', async () => {
      vi.mocked(conversationsRepository.findById).mockResolvedValue({
        id: 'conv-123', participant1Id: 'user-1', participant2Id: 'user-2', lastMessageAt: null, createdAt: new Date(),
      });
      vi.mocked(messagesRepository.create).mockResolvedValue({
        id: 'msg-123', conversationId: 'conv-123', senderId: 'user-1', content: 'Hello!', isRead: false, readAt: null, createdAt: new Date(),
      });

      const result = await messagesService.sendMessage('conv-123', 'user-1', 'Hello!');

      expect(result.content).toBe('Hello!');
      expect(conversationsRepository.updateLastMessage).toHaveBeenCalledWith('conv-123');
      expect(eventEmitter.emit).toHaveBeenCalledWith('message.sent', { messageId: 'msg-123', conversationId: 'conv-123', senderId: 'user-1' });
    });
  });
});
